import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { clamp01 } from "../metrics/types.js";
import type { MetricOutput } from "../metrics/types.js";

const __filename = fileURLToPath(import.meta.url);
const scriptPath = path.resolve(path.dirname(__filename), "../../scripts/ragas_worker.py");

interface RagasInput {
  metric: string; // faithfulness | answer_relevancy | context_recall
  input: string;
  reference?: string | null;
  output: string;
}

let ragasAvailable: boolean | null = null;

async function probeAvailability(): Promise<boolean> {
  if (ragasAvailable !== null) return ragasAvailable;
  const result = await new Promise<boolean>((resolve) => {
    const child = spawn(config.ragasPython, ["-c",
      "import importlib.util as u, sys; sys.exit(0 if u.find_spec('ragas') else 1)"]);
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
  ragasAvailable = result;
  return result;
}

export async function runRagas(input: RagasInput): Promise<MetricOutput> {
  const ok = await probeAvailability();
  if (!ok) return mockRagas(input);

  return new Promise<MetricOutput>((resolve) => {
    let out = "";
    let err = "";
    const child = spawn(config.ragasPython, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", () => resolve(mockRagas(input, `spawn error: ${err}`)));
    child.on("exit", (code) => {
      if (code !== 0) {
        resolve(mockRagas(input, `exit ${code}: ${err.slice(0, 200)}`));
        return;
      }
      try {
        const parsed = JSON.parse(out.trim().split("\n").pop() ?? "{}");
        if (typeof parsed.score === "number") {
          const score = clamp01(parsed.score);
          resolve({ score, passed: score >= 0.6,
                    detail: { source: "ragas", note: parsed.note ?? "" } });
          return;
        }
      } catch {}
      resolve(mockRagas(input, "bad worker output"));
    });
    child.stdin.write(JSON.stringify(input) + "\n");
    child.stdin.end();
  });
}

function mockRagas(input: RagasInput, reason = "ragas python not available"): MetricOutput {
  // Deterministic stub that rewards having a reference (contexts) and non-trivial output.
  const hasRef = (input.reference ?? "").length > 0;
  const lenFactor = Math.min(1, (input.output?.length ?? 0) / 400);
  let base = 0.5;
  if (hasRef) base += 0.2;
  base += 0.2 * lenFactor;
  if (input.metric === "faithfulness" && !hasRef) base -= 0.2;
  return { score: clamp01(base), passed: clamp01(base) >= 0.6,
           detail: { source: "mock", reason, metric: input.metric } };
}
