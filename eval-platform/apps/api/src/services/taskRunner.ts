import { getDb } from "../db/index.js";
import { resolveRunner } from "../metrics/registry.js";
import type { MetricContext, MetricOutput } from "../metrics/types.js";
import type { AgentRunResponse, RunSummary, Strategy } from "@ep/shared";

/** In-memory FIFO of runs to execute.  Persisted status lives in the DB. */
const queue: string[] = [];
let draining = false;

export function enqueueRun(runId: string): void {
  queue.push(runId);
  void drain();
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      const id = queue.shift()!;
      try {
        await executeRun(id);
      } catch (e: any) {
        markRunFailed(id, String(e?.message ?? e));
      }
    }
  } finally {
    draining = false;
  }
}

function markRunFailed(runId: string, error: string) {
  const db = getDb();
  db.prepare(`UPDATE runs SET status = 'failed', finished_at = datetime('now'),
              error = ? WHERE id = ?`).run(error, runId);
  const row: any = db.prepare("SELECT task_id FROM runs WHERE id = ?").get(runId);
  if (row) {
    db.prepare(`UPDATE tasks SET status = 'failed', updated_at = datetime('now')
                WHERE id = ?`).run(row.task_id);
  }
}

async function executeRun(runId: string) {
  const db = getDb();
  const run: any = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId);
  if (!run) throw new Error("run not found");
  const task: any = db.prepare("SELECT * FROM tasks WHERE id = ?").get(run.task_id);
  if (!task) throw new Error("task not found");
  const agent: any = db.prepare("SELECT * FROM agents WHERE id = ?").get(task.agent_id);
  if (!agent) throw new Error("agent not found");

  const metricIds: string[] = JSON.parse(task.metric_ids_json);
  const metricRows = metricIds.map(mid => {
    const m: any = db.prepare("SELECT * FROM metrics WHERE id = ?").get(mid);
    if (!m) throw new Error(`metric ${mid} not found`);
    return {
      id: m.id,
      key: m.key,
      name: m.name,
      config: m.config_json ? JSON.parse(m.config_json) : {},
    };
  });
  const strategy: Strategy = task.strategy_json ? JSON.parse(task.strategy_json) : {};

  const items: any[] = db.prepare(`SELECT * FROM dataset_items WHERE dataset_id = ?
                                   ORDER BY rowid ASC`).all(task.dataset_id);
  if (items.length === 0) throw new Error("dataset has no items");

  db.prepare(`UPDATE runs SET status = 'running' WHERE id = ?`).run(runId);
  db.prepare(`UPDATE tasks SET status = 'running', updated_at = datetime('now')
              WHERE id = ?`).run(task.id);

  let okItems = 0;
  let failedItems = 0;
  let totalTokens = 0;
  let totalLatency = 0;
  const failures: string[] = [];

  const scoresByMetric = new Map<string, { id: string; key: string; name: string; scores: number[]; passes: number }>();
  for (const m of metricRows) scoresByMetric.set(m.id,
    { id: m.id, key: m.key, name: m.name, scores: [], passes: 0 });

  const insertItem = db.prepare(`INSERT INTO run_items
    (id, run_id, dataset_item_id, input, reference, agent_output, trace_json,
     tool_calls_json, latency_ms, token_usage_json, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertResult = db.prepare(`INSERT INTO run_metric_results
    (id, run_item_id, metric_id, metric_key, score, raw, passed, detail_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  for (const it of items) {
    const runItemId = "ri_" + cryptoId();
    let agentResponse: AgentRunResponse | null = null;
    let agentError: string | null = null;
    const t0 = Date.now();

    try {
      const resp = await fetch(agent.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(agent.auth_header ? { authorization: agent.auth_header } : {}),
        },
        body: JSON.stringify({ input: it.input }),
        // a 10-minute ceiling; agent loops can be long
        signal: AbortSignal.timeout(10 * 60_000),
      });
      const body = await resp.text();
      if (!resp.ok) {
        agentError = `agent HTTP ${resp.status}: ${body.slice(0, 300)}`;
      } else {
        try {
          agentResponse = JSON.parse(body) as AgentRunResponse;
        } catch (e: any) {
          agentError = `invalid agent JSON: ${String(e?.message ?? e)}`;
        }
      }
    } catch (e: any) {
      agentError = String(e?.message ?? e);
    }
    const latency = agentResponse?.latency_ms ?? Date.now() - t0;

    insertItem.run(
      runItemId,
      runId,
      it.id,
      it.input,
      it.reference ?? null,
      agentResponse?.output ?? null,
      agentResponse?.trace ? JSON.stringify(agentResponse.trace) : null,
      agentResponse?.tool_calls ? JSON.stringify(agentResponse.tool_calls) : null,
      latency,
      agentResponse?.token_usage ? JSON.stringify(agentResponse.token_usage) : null,
      agentError,
    );

    if (agentError) {
      failedItems++;
      failures.push(`${it.id}: ${agentError}`);
      // still score the item on explicit metrics so dashboards aren't empty
    } else {
      okItems++;
    }

    totalTokens += agentResponse?.token_usage?.total ?? 0;
    totalLatency += latency;

    const ctxBase: Omit<MetricContext, "metricKey" | "metricName" | "metricConfig"> = {
      input: it.input,
      reference: it.reference,
      meta: it.meta_json ? JSON.parse(it.meta_json) : null,
      output: agentResponse?.output ?? "",
      trace: agentResponse?.trace ?? null,
      toolCalls: agentResponse?.tool_calls ?? [],
      latencyMs: latency,
      tokenUsage: agentResponse?.token_usage,
    };

    for (const m of metricRows) {
      const runner = resolveRunner(m);
      let output: MetricOutput;
      try {
        output = await runner({ ...ctxBase, metricKey: m.key, metricName: m.name,
                                metricConfig: m.config });
      } catch (e: any) {
        output = { score: 0, passed: false,
                   detail: { error: String(e?.message ?? e) } };
      }
      insertResult.run(
        "rr_" + cryptoId(),
        runItemId,
        m.id,
        m.key,
        output.score,
        output.raw !== undefined && output.raw !== null ? String(output.raw) : null,
        output.passed === undefined || output.passed === null ? null : output.passed ? 1 : 0,
        JSON.stringify(output.detail ?? {}),
      );
      const agg = scoresByMetric.get(m.id)!;
      agg.scores.push(output.score);
      if (output.passed) agg.passes++;
    }
  }

  // -- aggregates ------------------------------------------------------
  const insertAgg = db.prepare(`INSERT INTO run_metric_aggregates
    (run_id, metric_id, metric_key, mean, p50, p95, pass_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const agg of scoresByMetric.values()) {
    const { mean, p50, p95 } = summarize(agg.scores);
    const passRate = agg.scores.length === 0 ? 0 : agg.passes / agg.scores.length;
    insertAgg.run(runId, agg.id, agg.key, mean, p50, p95, passRate);
  }

  // -- strategy: weighted score + fail_if ------------------------------
  const weighted = computeWeightedScore(strategy, scoresByMetric);
  const strategyFailures: string[] = [];
  for (const rule of strategy.failIf ?? []) {
    const agg = [...scoresByMetric.values()].find(a => a.key === rule.metric);
    if (!agg) continue;
    const mean = agg.scores.length === 0 ? 0 :
      agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length;
    if (typeof rule.lt === "number" && mean < rule.lt) {
      strategyFailures.push(`${rule.metric} mean ${mean.toFixed(2)} < ${rule.lt}`);
    }
    if (typeof rule.gt === "number" && mean > rule.gt) {
      strategyFailures.push(`${rule.metric} mean ${mean.toFixed(2)} > ${rule.gt}`);
    }
  }

  const summary: RunSummary = {
    totalItems: items.length,
    okItems,
    failedItems,
    totalTokens,
    totalLatencyMs: totalLatency,
    passRate: okItems / Math.max(1, items.length),
    weightedScore: weighted,
    failures: failures.concat(strategyFailures),
  };

  const finalStatus = strategyFailures.length > 0 || failedItems === items.length
    ? "failed" : "done";
  db.prepare(`UPDATE runs SET status = ?, finished_at = datetime('now'),
              summary_json = ? WHERE id = ?`)
    .run(finalStatus, JSON.stringify(summary), runId);
  db.prepare(`UPDATE tasks SET status = ?, updated_at = datetime('now')
              WHERE id = ?`).run(finalStatus, task.id);
}

function summarize(xs: number[]): { mean: number; p50: number; p95: number } {
  if (xs.length === 0) return { mean: 0, p50: 0, p95: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  return { mean, p50, p95 };
}

function computeWeightedScore(strategy: Strategy,
    scoresByMetric: Map<string, { key: string; scores: number[] }>): number | undefined {
  const weights = strategy.weights;
  if (!weights) return undefined;
  let num = 0;
  let den = 0;
  for (const [key, w] of Object.entries(weights)) {
    const agg = [...scoresByMetric.values()].find(a => a.key === key);
    if (!agg || agg.scores.length === 0) continue;
    const mean = agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length;
    num += mean * w;
    den += w;
  }
  return den === 0 ? undefined : num / den;
}

function cryptoId(): string {
  // Compact id — sufficient for intra-run uniqueness.
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Resume any runs left in queued/running on boot (after a crash). */
export function resumeOrphanedRuns(): void {
  const db = getDb();
  const rows = db.prepare(`SELECT id FROM runs WHERE status IN ('queued','running')
                           ORDER BY started_at ASC`).all() as any[];
  for (const r of rows) queue.push(r.id);
  if (rows.length) void drain();
}

export function _queueForTests(): string[] {
  return queue.slice();
}
