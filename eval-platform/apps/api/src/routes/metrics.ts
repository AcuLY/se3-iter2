import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../db/index.js";
import type { Metric, MetricCategory, MetricDimension, MetricMode } from "@ep/shared";
import { runLlmJudge } from "../services/llmJudge.js";

export const metricsRouter = Router();

const MetricIn = z.object({
  key: z.string().regex(/^[a-z0-9_.]+$/, "key must be [a-z0-9_.]"),
  name: z.string().min(1),
  category: z.enum(["result", "process"]),
  mode: z.enum(["explicit", "fuzzy"]),
  dimension: z.enum(["quality", "safety", "perf"]),
  description: z.string().nullish(),
  config: z.record(z.any()).optional(),
});

function rowToMetric(r: any): Metric {
  return {
    id: r.id, key: r.key, name: r.name,
    category: r.category as MetricCategory,
    mode: r.mode as MetricMode,
    dimension: r.dimension as MetricDimension,
    description: r.description,
    config: r.config_json ? JSON.parse(r.config_json) : {},
    isBuiltin: !!r.is_builtin,
    createdAt: r.created_at,
  };
}

metricsRouter.get("/", (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM metrics ORDER BY is_builtin DESC, key ASC").all();
  res.json(rows.map(rowToMetric));
});

metricsRouter.get("/:id", (req, res) => {
  const db = getDb();
  const r = db.prepare("SELECT * FROM metrics WHERE id = ?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  res.json(rowToMetric(r));
});

metricsRouter.post("/", (req, res) => {
  const parsed = MetricIn.parse(req.body);
  const db = getDb();
  const id = "mt_" + nanoid(10);
  const key = parsed.key.startsWith("custom.") ? parsed.key : `custom.${parsed.key}`;
  try {
    db.prepare(`INSERT INTO metrics
                (id, key, name, category, mode, dimension, description, config_json, is_builtin)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
      id, key, parsed.name, parsed.category, parsed.mode, parsed.dimension,
      parsed.description ?? null, JSON.stringify(parsed.config ?? {}),
    );
  } catch (e: any) {
    return res.status(409).json({ error: "metric key already exists", detail: String(e?.message) });
  }
  const row = db.prepare("SELECT * FROM metrics WHERE id = ?").get(id);
  res.status(201).json(rowToMetric(row));
});

metricsRouter.patch("/:id", (req, res) => {
  const partial = MetricIn.partial().parse(req.body);
  const db = getDb();
  const r: any = db.prepare("SELECT * FROM metrics WHERE id = ?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  if (r.is_builtin) return res.status(400).json({ error: "builtin metrics are immutable" });
  db.prepare(`UPDATE metrics SET
              name = COALESCE(?, name),
              category = COALESCE(?, category),
              mode = COALESCE(?, mode),
              dimension = COALESCE(?, dimension),
              description = COALESCE(?, description),
              config_json = COALESCE(?, config_json)
              WHERE id = ?`).run(
    partial.name ?? null,
    partial.category ?? null,
    partial.mode ?? null,
    partial.dimension ?? null,
    partial.description ?? null,
    partial.config ? JSON.stringify(partial.config) : null,
    req.params.id,
  );
  const row = db.prepare("SELECT * FROM metrics WHERE id = ?").get(req.params.id);
  res.json(rowToMetric(row));
});

metricsRouter.delete("/:id", (req, res) => {
  const db = getDb();
  const r: any = db.prepare("SELECT * FROM metrics WHERE id = ?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  if (r.is_builtin) return res.status(400).json({ error: "builtin metrics are immutable" });
  db.prepare("DELETE FROM metrics WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

const PreviewIn = z.object({
  input: z.string(),
  reference: z.string().nullish(),
  output: z.string(),
});

metricsRouter.post("/:id/preview", async (req, res) => {
  const db = getDb();
  const m: any = db.prepare("SELECT * FROM metrics WHERE id = ?").get(req.params.id);
  if (!m) return res.status(404).json({ error: "not found" });
  const parsed = PreviewIn.parse(req.body);
  const config = m.config_json ? JSON.parse(m.config_json) : {};
  try {
    const judged = await runLlmJudge({
      metricKey: m.key,
      metricName: m.name,
      prompt: config.prompt,
      input: parsed.input,
      reference: parsed.reference ?? null,
      output: parsed.output,
    });
    res.json(judged);
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});
