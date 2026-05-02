#!/usr/bin/env node
// End-to-end smoke test: drive the eval platform against the travel-agent.
import assert from "node:assert/strict";

const API = "http://localhost:3001/api";
const AGENT_URL = "http://localhost:8088/v1/run";

async function j(path, init) {
  const res = await fetch(API + path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`);
  if (!text) return null;
  return JSON.parse(text);
}

function log(...args) { console.log("[smoke]", ...args); }

async function waitFor(pred, { timeoutMs = 180_000, label = "condition" } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await pred();
    if (v) return v;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  log("pinging api");
  const health = await j("/health");
  assert.equal(health.ok, true);

  log("registering agent");
  const agent = await j("/agents", {
    method: "POST",
    body: JSON.stringify({
      name: "travel-agent (local)",
      version: "0.1.0",
      endpoint: AGENT_URL,
    }),
  });
  log("  agent", agent.id);

  log("creating dataset + items");
  const ds = await j("/datasets", {
    method: "POST",
    body: JSON.stringify({ name: "smoke", description: "e2e smoke set" }),
  });
  await j(`/datasets/${ds.id}/items:bulk`, {
    method: "POST",
    body: JSON.stringify({
      items: [
        {
          input: "北京 2 天",
          reference: JSON.stringify({
            success_keywords: ["北京", "Day 1"],
            expected_tools: ["weather.get_forecast", "places.nearby",
                             "flights.search", "fx.convert"],
          }),
        },
        {
          input: "杭州 3 天，预算 3000，偏好美食",
          reference: JSON.stringify({
            success_keywords: ["西湖"],
            expected_tools: ["weather.get_forecast", "places.nearby"],
          }),
        },
      ],
    }),
  });

  log("loading metrics");
  const metrics = await j("/metrics");
  const want = ["token_cost", "latency", "tool_accuracy", "success_rate",
                "reasoning_quality", "safety", "interaction_ux"];
  const ids = want.map(k => metrics.find(m => m.key === k).id);
  assert.equal(ids.filter(Boolean).length, want.length, "all builtin metrics present");

  log("creating task");
  const task = await j("/tasks", {
    method: "POST",
    body: JSON.stringify({
      name: "travel smoke",
      agentId: agent.id,
      datasetId: ds.id,
      metricIds: ids,
      strategy: { weights: { success_rate: 1.0, reasoning_quality: 0.5 } },
    }),
  });
  log("  task", task.id);

  const runA = (await j(`/tasks/${task.id}/run`, {
    method: "POST", body: "{}",
  })).runId;
  log("  runA queued", runA);

  const doneA = await waitFor(async () => {
    const r = await j(`/runs/${runA}`);
    return ["done", "failed"].includes(r.status) ? r : null;
  }, { label: "runA", timeoutMs: 240_000 });

  log(`  runA ${doneA.status} — items=${doneA.summary?.totalItems} ` +
      `ok=${doneA.summary?.okItems} tokens=${doneA.summary?.totalTokens} ` +
      `passRate=${doneA.summary?.passRate} weighted=${doneA.summary?.weightedScore}`);
  assert.equal(doneA.status, "done", "runA should succeed");
  assert.ok(doneA.aggregates.length >= want.length);
  for (const k of want) {
    const a = doneA.aggregates.find(x => x.metricKey === k);
    assert.ok(a, `aggregate for ${k} exists`);
    assert.ok(Number.isFinite(a.mean), `aggregate ${k} mean is finite`);
  }

  const items = await j(`/runs/${runA}/items`);
  assert.equal(items.length, 2, "both dataset items run");
  assert.ok(items[0].agentOutput && items[0].agentOutput.length > 40,
            "agent produced non-trivial output");
  assert.ok((items[0].toolCalls ?? []).length > 0, "tool calls recorded");
  assert.ok(items[0].metrics.length === want.length, "per-item metric rows recorded");

  log("triggering runB for compare");
  const runB = (await j(`/tasks/${task.id}/run`, {
    method: "POST", body: "{}",
  })).runId;
  await waitFor(async () => {
    const r = await j(`/runs/${runB}`);
    return ["done", "failed"].includes(r.status) ? r : null;
  }, { label: "runB", timeoutMs: 240_000 });

  const cmp = await j(`/compare?runIds=${runA},${runB}`);
  assert.equal(cmp.runs.length, 2);
  assert.ok(cmp.rows.length >= want.length, "compare rows populated");

  log("creating a custom JS metric and re-running");
  const custom = await j("/metrics", {
    method: "POST",
    body: JSON.stringify({
      key: "has_day_one",
      name: "含有 Day 1",
      category: "result", mode: "explicit", dimension: "quality",
      description: "检测输出是否明确包含 Day 1",
      config: {
        kind: "js",
        code: "var __result = { score: /day\\s*1/i.test(ctx.output || '') ? 1 : 0 }",
      },
    }),
  });
  await j(`/tasks/${task.id}`, {
    method: "PATCH",
    body: JSON.stringify({ metricIds: [...ids, custom.id] }),
  });
  const runC = (await j(`/tasks/${task.id}/run`, {
    method: "POST", body: "{}",
  })).runId;
  const doneC = await waitFor(async () => {
    const r = await j(`/runs/${runC}`);
    return ["done", "failed"].includes(r.status) ? r : null;
  }, { label: "runC", timeoutMs: 240_000 });
  const hasDayOne = doneC.aggregates.find(a => a.metricKey === "custom.has_day_one");
  assert.ok(hasDayOne, "custom metric aggregate exists");
  log(`  runC custom.has_day_one mean = ${hasDayOne.mean}`);

  log("ALL CHECKS PASSED");
}

main().catch((e) => { console.error(e); process.exit(1); });
