import { Router } from "express";
import { getDb } from "../db/index.js";
import type { MetricAggregate, Run, RunItem, RunSummary, CompareResponse, CompareRow } from "@ep/shared";

export const runsRouter = Router();

function loadAggregates(runId: string): MetricAggregate[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT a.metric_key, a.mean, a.p50, a.p95, a.pass_rate, m.name
    FROM run_metric_aggregates a
    JOIN metrics m ON m.id = a.metric_id
    WHERE a.run_id = ?
    ORDER BY a.metric_key
  `).all(runId) as any[];
  return rows.map(r => ({
    metricKey: r.metric_key, metricName: r.name,
    mean: r.mean, p50: r.p50, p95: r.p95, passRate: r.pass_rate,
  }));
}

function rowToRun(r: any, aggregates: MetricAggregate[]): Run {
  const summary: RunSummary | null = r.summary_json ? JSON.parse(r.summary_json) : null;
  return {
    id: r.id, taskId: r.task_id,
    status: r.status,
    startedAt: r.started_at, finishedAt: r.finished_at,
    summary, aggregates,
    error: r.error,
  };
}

runsRouter.get("/", (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT 200").all() as any[];
  res.json(rows.map(r => rowToRun(r, loadAggregates(r.id))));
});

runsRouter.get("/:id", (req, res) => {
  const db = getDb();
  const r = db.prepare("SELECT * FROM runs WHERE id = ?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  res.json(rowToRun(r, loadAggregates(req.params.id)));
});

runsRouter.get("/:id/items", (req, res) => {
  const db = getDb();
  const items = db.prepare(`SELECT * FROM run_items WHERE run_id = ? ORDER BY rowid ASC`)
    .all(req.params.id) as any[];
  const results = db.prepare(`SELECT * FROM run_metric_results WHERE run_item_id IN
                              (${items.length ? items.map(() => "?").join(",") : "NULL"})`)
    .all(...items.map(i => i.id)) as any[];
  const metricRows = db.prepare(`SELECT id, key, name FROM metrics`).all() as any[];
  const metricById = new Map(metricRows.map(m => [m.id, { key: m.key, name: m.name }]));

  const metricsByItem = new Map<string, any[]>();
  for (const r of results) {
    const list = metricsByItem.get(r.run_item_id) ?? [];
    const meta = metricById.get(r.metric_id);
    list.push({
      metricKey: r.metric_key,
      metricName: meta?.name ?? r.metric_key,
      score: r.score,
      raw: r.raw,
      passed: r.passed === null ? null : !!r.passed,
      detail: r.detail_json ? JSON.parse(r.detail_json) : {},
    });
    metricsByItem.set(r.run_item_id, list);
  }

  const out: Array<RunItem & { metrics: any[] }> = items.map(it => ({
    id: it.id,
    runId: it.run_id,
    datasetItemId: it.dataset_item_id,
    input: it.input,
    reference: it.reference,
    agentOutput: it.agent_output,
    trace: it.trace_json ? JSON.parse(it.trace_json) : null,
    toolCalls: it.tool_calls_json ? JSON.parse(it.tool_calls_json) : [],
    latencyMs: it.latency_ms,
    tokenUsage: it.token_usage_json ? JSON.parse(it.token_usage_json) : undefined,
    error: it.error,
    metrics: metricsByItem.get(it.id) ?? [],
  }));
  res.json(out);
});

runsRouter.get("/by-task/:taskId", (req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM runs WHERE task_id = ? ORDER BY started_at DESC")
    .all(req.params.taskId) as any[];
  res.json(rows.map(r => rowToRun(r, loadAggregates(r.id))));
});
