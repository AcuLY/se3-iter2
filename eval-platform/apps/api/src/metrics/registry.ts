import type { MetricContext, MetricOutput, MetricRunner } from "./types.js";
import { clamp01 } from "./types.js";
import { runLlmJudge } from "../services/llmJudge.js";
import { runRagas } from "../services/ragasBridge.js";
import { runCustomJs } from "../services/customSandbox.js";

/** token_cost — normalized so fewer tokens = higher score.
 * raw = total tokens.  score = 1 - min(1, total / budget). */
const tokenCost: MetricRunner = (ctx) => {
  const total = ctx.tokenUsage?.total ?? 0;
  const budget = Number((ctx.metricConfig?.budget as number) ?? 5000);
  const score = clamp01(1 - total / budget);
  return { score, raw: total, passed: total <= budget, detail: { budget } };
};

/** latency — score = 1 - min(1, ms / budget_ms). */
const latency: MetricRunner = (ctx) => {
  const ms = ctx.latencyMs;
  const budget = Number((ctx.metricConfig?.budgetMs as number) ?? 10000);
  const score = clamp01(1 - ms / budget);
  return { score, raw: ms, passed: ms <= budget, detail: { budgetMs: budget } };
};

/** tool_accuracy — Jaccard between trace tools and reference.expected_tools. */
const toolAccuracy: MetricRunner = (ctx) => {
  const expected = extractExpectedTools(ctx);
  const actual = new Set((ctx.toolCalls ?? []).map(t => t.name));
  if (expected.size === 0) {
    // without a reference we fall back to a boolean "any tool was used"
    const score = actual.size > 0 ? 1 : 0;
    return { score, raw: [...actual].join(","), passed: score > 0,
             detail: { note: "no expected_tools reference, counted any tool use",
                       actual: [...actual] } };
  }
  const inter = [...expected].filter(t => actual.has(t)).length;
  const union = new Set([...expected, ...actual]).size;
  const jaccard = union === 0 ? 0 : inter / union;
  return {
    score: jaccard,
    raw: `${inter}/${union}`,
    passed: jaccard >= 0.5,
    detail: { expected: [...expected], actual: [...actual] },
  };
};

function extractExpectedTools(ctx: MetricContext): Set<string> {
  const set = new Set<string>();
  // reference may be a JSON blob with expected_tools / expected_keywords
  const refParsed = parseMaybeJson(ctx.reference);
  const expected: unknown =
    (refParsed && typeof refParsed === "object" && "expected_tools" in refParsed
      ? (refParsed as any).expected_tools
      : (ctx.meta as any)?.expected_tools);
  if (Array.isArray(expected)) {
    for (const t of expected) if (typeof t === "string") set.add(t);
  }
  return set;
}

function parseMaybeJson(x: unknown): unknown {
  if (typeof x !== "string") return x;
  const s = x.trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return null;
  try { return JSON.parse(s); } catch { return null; }
}

/** success_rate — binary metric: output contains any success_keywords from reference. */
const successRate: MetricRunner = (ctx) => {
  const keywords = extractSuccessKeywords(ctx);
  if (keywords.length === 0) {
    const hasOutput = !!(ctx.output && ctx.output.trim().length > 10);
    return { score: hasOutput ? 1 : 0, passed: hasOutput,
             raw: hasOutput ? "ok" : "empty",
             detail: { note: "no success_keywords reference; counted non-empty output" } };
  }
  const out = ctx.output.toLowerCase();
  const hit = keywords.find(k => out.includes(k.toLowerCase()));
  return {
    score: hit ? 1 : 0,
    raw: hit ?? "-",
    passed: !!hit,
    detail: { keywords, hit: hit ?? null },
  };
};

function extractSuccessKeywords(ctx: MetricContext): string[] {
  const refParsed = parseMaybeJson(ctx.reference);
  const fromRef = (refParsed && typeof refParsed === "object" && "success_keywords" in refParsed
    ? (refParsed as any).success_keywords
    : undefined);
  const fromMeta = (ctx.meta as any)?.success_keywords;
  const raw: any = fromRef ?? fromMeta;
  if (Array.isArray(raw)) return raw.filter(s => typeof s === "string");
  if (typeof raw === "string") return [raw];
  // if reference is a plain string, treat it as one keyword
  if (typeof ctx.reference === "string" && ctx.reference.trim() && !refParsed) {
    return [ctx.reference.trim()];
  }
  return [];
}

/** LLM-as-a-judge runners.  All of these share the same implementation and
 * differ only in the prompt template applied. */
const llmJudge = (metricKey: string): MetricRunner => async (ctx) => {
  return runLlmJudge({
    metricKey,
    metricName: ctx.metricName,
    prompt: (ctx.metricConfig?.prompt as string) ?? undefined,
    input: ctx.input,
    reference: ctx.reference,
    output: ctx.output,
  });
};

/** RAGAS runner.  Delegates to ragasBridge which runs a python worker. */
const ragasMetric = (sub: string): MetricRunner => async (ctx) => {
  return runRagas({
    metric: sub, // "faithfulness" | "answer_relevancy" | "context_recall"
    input: ctx.input,
    reference: ctx.reference,
    output: ctx.output,
  });
};

export function defaultRegistry(): Record<string, MetricRunner> {
  return {
    token_cost: tokenCost,
    latency,
    tool_accuracy: toolAccuracy,
    success_rate: successRate,
    reasoning_quality: llmJudge("reasoning_quality"),
    hallucination: llmJudge("hallucination"),
    safety: llmJudge("safety"),
    interaction_ux: llmJudge("interaction_ux"),
    "ragas.faithfulness": ragasMetric("faithfulness"),
    "ragas.answer_relevancy": ragasMetric("answer_relevancy"),
    "ragas.context_recall": ragasMetric("context_recall"),
  };
}

/** Resolve a runner for a given metric row (handles custom metrics too). */
export function resolveRunner(metricRow: { key: string; config: Record<string, unknown> },
                              registry = defaultRegistry()): MetricRunner {
  const direct = registry[metricRow.key];
  if (direct) return direct;
  // custom.* metrics
  if (metricRow.key.startsWith("custom.")) {
    const kind = metricRow.config?.kind ?? "llm_judge";
    if (kind === "llm_judge") {
      return llmJudge(metricRow.key);
    }
    if (kind === "js") {
      return async (ctx) => runCustomJs({
        code: String(metricRow.config?.code ?? ""),
        ctx,
      });
    }
  }
  // unknown — emit zero with explanation
  return async () => ({ score: 0, passed: false,
    detail: { error: `no runner for metric ${metricRow.key}` } } satisfies MetricOutput);
}
