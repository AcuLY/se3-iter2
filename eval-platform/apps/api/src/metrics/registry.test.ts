import { describe, it, expect } from "vitest";
import { defaultRegistry, resolveRunner } from "./registry.js";

const ctxBase = {
  input: "北京 2 天",
  reference: JSON.stringify({
    success_keywords: ["北京"],
    expected_tools: ["weather.get_forecast", "places.nearby"],
  }),
  meta: null,
  output: "# 北京 2 天\n- Day 1: 故宫\n- Day 2: 长城",
  trace: null,
  toolCalls: [
    { name: "weather.get_forecast", args: {}, result: { ok: true } },
    { name: "places.nearby", args: {}, result: { ok: true } },
  ],
  latencyMs: 1500,
  tokenUsage: { prompt: 100, completion: 50, total: 150 },
  metricKey: "x",
  metricName: "x",
  metricConfig: {},
};

describe("metric runners", () => {
  const reg = defaultRegistry();

  it("token_cost normalizes to 1 - total/budget", async () => {
    const out = await reg.token_cost!({ ...ctxBase, metricKey: "token_cost", metricConfig: { budget: 1000 } });
    expect(out.score).toBeCloseTo(1 - 150 / 1000, 3);
    expect(out.passed).toBe(true);
  });

  it("latency normalizes to 1 - ms/budgetMs", async () => {
    const out = await reg.latency!({ ...ctxBase, metricKey: "latency", metricConfig: { budgetMs: 2000 } });
    expect(out.score).toBeCloseTo(1 - 1500 / 2000, 3);
  });

  it("tool_accuracy uses jaccard against expected_tools", async () => {
    const out = await reg.tool_accuracy!({ ...ctxBase, metricKey: "tool_accuracy" });
    expect(out.score).toBe(1);
  });

  it("success_rate matches keywords", async () => {
    const out = await reg.success_rate!({ ...ctxBase, metricKey: "success_rate" });
    expect(out.score).toBe(1);
    const miss = await reg.success_rate!({ ...ctxBase, output: "no match",
                                           metricKey: "success_rate" });
    expect(miss.score).toBe(0);
  });

  it("custom.js runner executes sandboxed code", async () => {
    const runner = resolveRunner({
      key: "custom.has_day",
      config: {
        kind: "js",
        code: "var __result = { score: ctx.output.includes('Day 1') ? 1 : 0 }",
      },
    });
    const out = await runner({ ...ctxBase, metricKey: "custom.has_day" });
    expect(out.score).toBe(1);
  });
});
