import { Router } from "express";
import { getDb } from "../db/index.js";
import type { CompareResponse, CompareRow } from "@ep/shared";

export const compareRouter = Router();

compareRouter.get("/", (req, res) => {
  const raw = String(req.query.runIds ?? "").trim();
  if (!raw) return res.status(400).json({ error: "runIds is required" });
  const ids = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return res.status(400).json({ error: "runIds is empty" });

  const db = getDb();
  const runs = db.prepare(
    `SELECT * FROM runs WHERE id IN (${ids.map(() => "?").join(",")})`,
  ).all(...ids) as any[];
  const byId = new Map(runs.map(r => [r.id, r]));

  const aggs = db.prepare(
    `SELECT a.run_id, a.metric_key, a.mean, m.name
     FROM run_metric_aggregates a JOIN metrics m ON m.id = a.metric_id
     WHERE a.run_id IN (${ids.map(() => "?").join(",")})`,
  ).all(...ids) as any[];

  // union of metric keys
  const keyMap = new Map<string, string>();
  for (const a of aggs) {
    keyMap.set(a.metric_key, a.name);
  }

  const rows: CompareRow[] = [];
  for (const [key, name] of keyMap) {
    const row: CompareRow = { metricKey: key, metricName: name, values: {} };
    for (const rid of ids) row.values[rid] = null;
    for (const a of aggs) {
      if (a.metric_key === key) row.values[a.run_id] = a.mean;
    }
    rows.push(row);
  }

  const payload: CompareResponse = {
    runs: ids.map(id => {
      const r: any = byId.get(id);
      if (!r) return { id, taskId: "", status: "failed" as const,
                       startedAt: "", summary: null };
      return {
        id: r.id,
        taskId: r.task_id,
        status: r.status,
        startedAt: r.started_at,
        summary: r.summary_json ? JSON.parse(r.summary_json) : null,
      };
    }),
    rows,
  };
  res.json(payload);
});
