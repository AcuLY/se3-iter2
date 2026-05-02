import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import request from "supertest";
import Database from "better-sqlite3";
import { setDbForTests, closeDb, getDb } from "../db/index.js";
import { buildApp } from "../server.js";

interface FakeAgentOpts {
  outputs?: string[];
  toolCalls?: Array<Array<{ name: string; args?: unknown; result?: unknown }>>;
  failureIndex?: number;
}

async function startFakeAgent(opts: FakeAgentOpts = {}): Promise<{ url: string; close: () => void; calls: number }> {
  let calls = 0;
  const outs = opts.outputs ?? [
    "# 北京 2 天\n- Day 1: 故宫\n- Day 2: 长城",
    "# 杭州 3 天\n- Day 1: 西湖\n- Day 2: 灵隐\n- Day 3: 西溪",
  ];
  const tc = opts.toolCalls ?? outs.map(() => ([
    { name: "weather.get_forecast", args: { city: "x" }, result: { ok: true } },
    { name: "places.nearby", args: { city: "x" }, result: { ok: true } },
  ]));
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const idx = calls;
      calls++;
      if (opts.failureIndex === idx) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "boom" }));
        return;
      }
      const out = outs[idx % outs.length] ?? "ok";
      const tools = tc[idx % tc.length] ?? [];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        output: out,
        trace: [{ node: "plan" }, { node: "compose" }],
        tool_calls: tools,
        latency_ms: 123 + idx * 10,
        token_usage: { prompt: 200, completion: 80 + idx * 5, total: 280 + idx * 5 },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (typeof addr === "string" || addr === null) throw new Error("bad addr");
  return {
    url: `http://127.0.0.1:${addr.port}/v1/run`,
    close: () => server.close(),
    calls: 0,
    get_calls() { return calls; }, // eslint-disable-line @typescript-eslint/method-signature-style
  } as any;
}

beforeEach(() => {
  setDbForTests(new Database(":memory:"));
});
afterEach(() => closeDb());

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("waitFor timed out");
}

describe("end-to-end run", () => {
  it("executes a task with explicit + fuzzy metrics and writes aggregates", async () => {
    const fake = await startFakeAgent({});
    const app = buildApp();

    const agent = await request(app).post("/api/agents").send({
      name: "fake",
      version: "0.1",
      endpoint: fake.url,
    });
    expect(agent.status).toBe(201);

    const ds = await request(app).post("/api/datasets").send({ name: "demo" });
    expect(ds.status).toBe(201);
    await request(app).post(`/api/datasets/${ds.body.id}/items:bulk`).send({
      items: [
        { input: "北京 2 天",
          reference: JSON.stringify({
            success_keywords: ["北京", "故宫"],
            expected_tools: ["weather.get_forecast", "places.nearby"],
          }) },
        { input: "杭州 3 天",
          reference: JSON.stringify({
            success_keywords: ["西湖"],
            expected_tools: ["weather.get_forecast", "places.nearby"],
          }) },
      ],
    });

    const metrics = await request(app).get("/api/metrics");
    const wanted = ["token_cost", "latency", "tool_accuracy", "success_rate",
                    "reasoning_quality", "safety"];
    const ids = wanted.map(k => metrics.body.find((m: any) => m.key === k).id);

    const task = await request(app).post("/api/tasks").send({
      name: "demo task",
      agentId: agent.body.id,
      datasetId: ds.body.id,
      metricIds: ids,
      strategy: { weights: { success_rate: 1, reasoning_quality: 0.5 } },
    });
    expect(task.status).toBe(201);

    const runResp = await request(app).post(`/api/tasks/${task.body.id}/run`).send({});
    expect(runResp.status).toBe(202);
    const runId = runResp.body.runId;

    await waitFor(() => {
      const row: any = getDb().prepare("SELECT status FROM runs WHERE id = ?").get(runId);
      return row?.status === "done" || row?.status === "failed";
    });

    const got = await request(app).get(`/api/runs/${runId}`);
    expect(got.status).toBe(200);
    expect(got.body.status).toBe("done");
    expect(got.body.summary.totalItems).toBe(2);
    expect(got.body.summary.okItems).toBe(2);
    expect(got.body.aggregates.length).toBeGreaterThanOrEqual(wanted.length);

    // sanity: success_rate aggregate should be 1.0 (both keywords match)
    const succ = got.body.aggregates.find((a: any) => a.metricKey === "success_rate");
    expect(succ.mean).toBe(1);

    // tool_accuracy should be 1.0 since fake agent reports the expected tools
    const toolAcc = got.body.aggregates.find((a: any) => a.metricKey === "tool_accuracy");
    expect(toolAcc.mean).toBe(1);

    const items = await request(app).get(`/api/runs/${runId}/items`);
    expect(items.status).toBe(200);
    expect(items.body).toHaveLength(2);
    expect(items.body[0].metrics.length).toBeGreaterThan(0);

    fake.close();
  });

  it("compare endpoint aggregates across runs", async () => {
    const fake = await startFakeAgent({});
    const app = buildApp();
    const agent = await request(app).post("/api/agents").send({
      name: "fake", version: "0.1", endpoint: fake.url,
    });
    const ds = await request(app).post("/api/datasets").send({ name: "demo" });
    await request(app).post(`/api/datasets/${ds.body.id}/items:bulk`).send({
      items: [{ input: "测试" }],
    });
    const metrics = await request(app).get("/api/metrics");
    const ids = ["latency", "success_rate"]
      .map(k => metrics.body.find((m: any) => m.key === k).id);
    const task = await request(app).post("/api/tasks").send({
      name: "t", agentId: agent.body.id, datasetId: ds.body.id, metricIds: ids,
    });

    const r1 = (await request(app).post(`/api/tasks/${task.body.id}/run`).send({})).body.runId;
    const r2 = (await request(app).post(`/api/tasks/${task.body.id}/run`).send({})).body.runId;
    await waitFor(() => {
      const rows = getDb().prepare(`SELECT status FROM runs WHERE id IN (?, ?)`).all(r1, r2) as any[];
      return rows.length === 2 && rows.every(r => r.status === "done");
    });

    const cmp = await request(app).get(`/api/compare?runIds=${r1},${r2}`);
    expect(cmp.status).toBe(200);
    expect(cmp.body.runs).toHaveLength(2);
    expect(cmp.body.rows.length).toBeGreaterThanOrEqual(1);
    fake.close();
  });
});
