import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../db/index.js";
import type { Dataset, DatasetItem } from "@ep/shared";

export const datasetsRouter = Router();

const DatasetIn = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
});

const ItemIn = z.object({
  input: z.string().min(1),
  reference: z.string().nullish(),
  meta: z.record(z.any()).optional(),
});

const BulkItemsIn = z.object({ items: z.array(ItemIn).min(1) });

function rowToDataset(r: any, count: number): Dataset {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    itemCount: count,
    createdAt: r.created_at,
  };
}

function rowToItem(r: any): DatasetItem {
  return {
    id: r.id,
    datasetId: r.dataset_id,
    input: r.input,
    reference: r.reference,
    meta: r.meta_json ? JSON.parse(r.meta_json) : null,
  };
}

datasetsRouter.get("/", (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM dataset_items i WHERE i.dataset_id = d.id) AS cnt
    FROM datasets d ORDER BY d.created_at DESC
  `).all() as any[];
  res.json(rows.map(r => rowToDataset(r, r.cnt)));
});

datasetsRouter.get("/:id", (req, res) => {
  const db = getDb();
  const r: any = db.prepare("SELECT * FROM datasets WHERE id = ?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  const cnt = (db.prepare("SELECT COUNT(*) AS c FROM dataset_items WHERE dataset_id = ?")
    .get(req.params.id) as any).c;
  res.json(rowToDataset(r, cnt));
});

datasetsRouter.post("/", (req, res) => {
  const parsed = DatasetIn.parse(req.body);
  const db = getDb();
  const id = "ds_" + nanoid(10);
  db.prepare("INSERT INTO datasets (id, name, description) VALUES (?, ?, ?)")
    .run(id, parsed.name, parsed.description ?? null);
  const row: any = db.prepare("SELECT * FROM datasets WHERE id = ?").get(id);
  res.status(201).json(rowToDataset(row, 0));
});

datasetsRouter.patch("/:id", (req, res) => {
  const partial = DatasetIn.partial().parse(req.body);
  const db = getDb();
  const r: any = db.prepare("SELECT * FROM datasets WHERE id = ?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  db.prepare(`UPDATE datasets SET name = COALESCE(?, name),
              description = COALESCE(?, description) WHERE id = ?`)
    .run(partial.name ?? null, partial.description ?? null, req.params.id);
  const row: any = db.prepare("SELECT * FROM datasets WHERE id = ?").get(req.params.id);
  const cnt = (db.prepare("SELECT COUNT(*) AS c FROM dataset_items WHERE dataset_id = ?")
    .get(req.params.id) as any).c;
  res.json(rowToDataset(row, cnt));
});

datasetsRouter.delete("/:id", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM datasets WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

datasetsRouter.get("/:id/items", (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM dataset_items WHERE dataset_id = ?
                           ORDER BY rowid ASC`).all(req.params.id);
  res.json(rows.map(rowToItem));
});

datasetsRouter.post("/:id/items", (req, res) => {
  const parsed = ItemIn.parse(req.body);
  const db = getDb();
  const id = "di_" + nanoid(10);
  db.prepare(`INSERT INTO dataset_items (id, dataset_id, input, reference, meta_json)
              VALUES (?, ?, ?, ?, ?)`).run(
    id, req.params.id, parsed.input, parsed.reference ?? null,
    parsed.meta ? JSON.stringify(parsed.meta) : null,
  );
  const row: any = db.prepare("SELECT * FROM dataset_items WHERE id = ?").get(id);
  res.status(201).json(rowToItem(row));
});

datasetsRouter.post("/:id/items:bulk", (req, res) => {
  const parsed = BulkItemsIn.parse(req.body);
  const db = getDb();
  const ins = db.prepare(`INSERT INTO dataset_items (id, dataset_id, input, reference, meta_json)
                          VALUES (?, ?, ?, ?, ?)`);
  const tx = db.transaction((items: any[]) => {
    const out: any[] = [];
    for (const it of items) {
      const id = "di_" + nanoid(10);
      ins.run(id, req.params.id, it.input, it.reference ?? null,
        it.meta ? JSON.stringify(it.meta) : null);
      out.push({ id });
    }
    return out;
  });
  const created = tx(parsed.items);
  res.status(201).json({ created: created.length, ids: created.map(c => c.id) });
});

datasetsRouter.delete("/:dsId/items/:itemId", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM dataset_items WHERE id = ? AND dataset_id = ?")
    .run(req.params.itemId, req.params.dsId);
  res.status(204).end();
});
