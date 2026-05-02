import vm from "node:vm";
import { clamp01 } from "../metrics/types.js";
import type { MetricContext, MetricOutput } from "../metrics/types.js";

/** Run a user-provided JavaScript snippet inside a sandboxed vm.Context.
 *
 * The snippet has access to a frozen `ctx` object.  It must return a
 * `{ score, raw?, passed?, detail? }` object (or a number).  Execution is
 * time-boxed by vm.Script timeout, and no Node builtins are injected
 * into the sandbox.
 */
export async function runCustomJs(opts: {
  code: string;
  ctx: MetricContext;
  timeoutMs?: number;
}): Promise<MetricOutput> {
  const wrapper = `(function(ctx){ ${opts.code}\n; return (typeof score === 'function' ? score(ctx) : (typeof __result !== 'undefined' ? __result : undefined)); })(ctx)`;
  const context = vm.createContext({
    // strip dangerous bits; only expose ctx and a minimal console.
    ctx: Object.freeze(JSON.parse(JSON.stringify(opts.ctx))),
    console: { log: () => {} },
  }, { codeGeneration: { strings: false, wasm: false } });

  try {
    const script = new vm.Script(wrapper, { filename: "custom-metric.js" });
    const raw = script.runInContext(context, { timeout: opts.timeoutMs ?? 500 });
    if (typeof raw === "number") {
      const score = clamp01(raw);
      return { score, passed: score >= 0.6, detail: { source: "custom.js" } };
    }
    if (raw && typeof raw === "object") {
      const score = clamp01(Number((raw as any).score ?? 0));
      return {
        score,
        raw: (raw as any).raw ?? null,
        passed: typeof (raw as any).passed === "boolean" ? (raw as any).passed : score >= 0.6,
        detail: { source: "custom.js", ...(raw as any).detail },
      };
    }
    return { score: 0, passed: false, detail: { source: "custom.js", error: "no result" } };
  } catch (e: any) {
    return { score: 0, passed: false,
             detail: { source: "custom.js", error: String(e?.message ?? e) } };
  }
}
