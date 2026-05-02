import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../db/index.js";
import type { Task, TaskStatus } from "@ep/shared";
import { enqueueRun } from "../services/taskRunner.js";

export const tasksRouter = Router();

const TaskIn = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  agentId: z.string().min(1),
  datasetId: z.string().min(1),
  metricIds: z.array(z.string()).min(1),
  strategy: z
    .object({
      weights: z.record(z.number()).optional(),
      failIf: z.array(z.object({
        metric: z.string(),
        lt: z.number().optional(),
        gt: z.number().optional(),
        eq: z.union([z.number(), z.string()]).optional(),
      })).optional(),
    })
    .optional(),
});

function rowToTask(r: any): Task {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    agentId: r.agent_id,
    datasetId: r.dataset_id,
    metricIds: JSON.parse(r.metric_ids_json),
    strategy: JSON.parse(r.strategy_json),
    status: r.status as TaskStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

tasksRouter.get("/", (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all();
  res.json(rows.map(rowToTask));
});

tasksRouter.get("/:id", (req, res) => {
  const db = getDb();
  const r = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  res.json(rowToTask(r));
});

tasksRouter.post("/", (req, res) => {
  const parsed = TaskIn.parse(req.body);
  const db = getDb();
  // integrity checks
  const agent = db.prepare("SELECT id FROM agents WHERE id = ?").get(parsed.agentId);
  if (!agent) return res.status(400).json({ error: "agentId not found" });
  const ds = db.prepare("SELECT id FROM datasets WHERE id = ?").get(parsed.datasetId);
  if (!ds) return res.status(400).json({ error: "datasetId not found" });
  const mrows = db.prepare(
    `SELECT id FROM metrics WHERE id IN (${parsed.metricIds.map(() => "?").join(",")})`,
  ).all(...parsed.metricIds) as any[];
  if (mrows.length !== parsed.metricIds.length) {
    return res.status(400).json({ error: "some metricIds not found" });
  }

  const id = "tk_" + nanoid(10);
  db.prepare(`INSERT INTO tasks (id, name, description, agent_id, dataset_id,
              metric_ids_json, strategy_json, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`).run(
    id, parsed.name, parsed.description ?? null,
    parsed.agentId, parsed.datasetId,
    JSON.stringify(parsed.metricIds),
    JSON.stringify(parsed.strategy ?? {}),
  );
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  res.status(201).json(rowToTask(row));
});

tasksRouter.patch("/:id", (req, res) => {
  const partial = TaskIn.partial().parse(req.body);
  const db = getDb();
  const r = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  db.prepare(`UPDATE tasks SET
              name = COALESCE(?, name),
              description = COALESCE(?, description),
              agent_id = COALESCE(?, agent_id),
              dataset_id = COALESCE(?, dataset_id),
              metric_ids_json = COALESCE(?, metric_ids_json),
              strategy_json = COALESCE(?, strategy_json),
              updated_at = datetime('now')
              WHERE id = ?`).run(
    partial.name ?? null,
    partial.description ?? null,
    partial.agentId ?? null,
    partial.datasetId ?? null,
    partial.metricIds ? JSON.stringify(partial.metricIds) : null,
    partial.strategy ? JSON.stringify(partial.strategy) : null,
    req.params.id,
  );
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  res.json(rowToTask(row));
});

tasksRouter.delete("/:id", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

tasksRouter.post("/:id/run", async (req, res) => {
  const db = getDb();
  const task: any = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });

  const runId = "rn_" + nanoid(10);
  db.prepare(`INSERT INTO runs (id, task_id, status) VALUES (?, ?, 'queued')`)
    .run(runId, task.id);
  db.prepare("UPDATE tasks SET status = 'queued', updated_at = datetime('now') WHERE id = ?")
    .run(task.id);

  // fire-and-forget — runner loop will pick it up
  enqueueRun(runId);
  res.status(202).json({ runId, status: "queued" });
});
