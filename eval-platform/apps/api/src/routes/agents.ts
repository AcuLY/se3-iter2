import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../db/index.js";
import type { Agent } from "@ep/shared";

export const agentsRouter = Router();

const AgentIn = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  endpoint: z.string().url(),
  authHeader: z.string().nullish(),
});

function rowToAgent(r: any): Agent {
  return {
    id: r.id, name: r.name, version: r.version,
    endpoint: r.endpoint, authHeader: r.auth_header ?? null,
    createdAt: r.created_at,
  };
}

agentsRouter.get("/", (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM agents ORDER BY created_at DESC").all();
  res.json(rows.map(rowToAgent));
});

agentsRouter.get("/:id", (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(rowToAgent(row));
});

agentsRouter.post("/", (req, res) => {
  const parsed = AgentIn.parse(req.body);
  const db = getDb();
  const id = "ag_" + nanoid(10);
  db.prepare(`INSERT INTO agents (id, name, version, endpoint, auth_header)
              VALUES (?, ?, ?, ?, ?)`).run(
    id, parsed.name, parsed.version, parsed.endpoint, parsed.authHeader ?? null,
  );
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
  res.status(201).json(rowToAgent(row));
});

agentsRouter.patch("/:id", (req, res) => {
  const partial = AgentIn.partial().parse(req.body);
  const db = getDb();
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  db.prepare(`UPDATE agents SET
              name = COALESCE(?, name),
              version = COALESCE(?, version),
              endpoint = COALESCE(?, endpoint),
              auth_header = COALESCE(?, auth_header)
              WHERE id = ?`).run(
    partial.name ?? null,
    partial.version ?? null,
    partial.endpoint ?? null,
    partial.authHeader ?? null,
    req.params.id,
  );
  const updated = db.prepare("SELECT * FROM agents WHERE id = ?").get(req.params.id);
  res.json(rowToAgent(updated));
});

agentsRouter.delete("/:id", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM agents WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

agentsRouter.post("/:id/ping", async (req, res) => {
  const db = getDb();
  const row: any = db.prepare("SELECT * FROM agents WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  try {
    const t0 = Date.now();
    const r = await fetch(row.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(row.auth_header ? { Authorization: row.auth_header } : {}),
      },
      body: JSON.stringify({ input: req.body?.input ?? "hello" }),
    });
    const data = await r.json().catch(() => ({}));
    res.json({ ok: r.ok, status: r.status, latencyMs: Date.now() - t0, sample: data });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: String(e?.message ?? e) });
  }
});
