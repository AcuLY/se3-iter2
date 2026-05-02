import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  const dbPath = path.join(config.dataDir, "eval.db");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  seedBuiltinMetrics(_db);
  return _db;
}

export function setDbForTests(db: Database.Database): void {
  _db = db;
  migrate(db);
  seedBuiltinMetrics(db);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function migrate(db: Database.Database) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    auth_header TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dataset_items (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    input TEXT NOT NULL,
    reference TEXT,
    meta_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_dataset_items_dataset ON dataset_items(dataset_id);

  CREATE TABLE IF NOT EXISTS metrics (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,         -- 'result' | 'process'
    mode TEXT NOT NULL,             -- 'explicit' | 'fuzzy'
    dimension TEXT NOT NULL,        -- 'quality' | 'safety' | 'perf'
    description TEXT,
    config_json TEXT,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    dataset_id TEXT NOT NULL REFERENCES datasets(id),
    metric_ids_json TEXT NOT NULL,
    strategy_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- draft|queued|running|done|failed
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    summary_json TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_runs_task ON runs(task_id);

  CREATE TABLE IF NOT EXISTS run_items (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    dataset_item_id TEXT NOT NULL,
    input TEXT NOT NULL,
    reference TEXT,
    agent_output TEXT,
    trace_json TEXT,
    tool_calls_json TEXT,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    token_usage_json TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_run_items_run ON run_items(run_id);

  CREATE TABLE IF NOT EXISTS run_metric_results (
    id TEXT PRIMARY KEY,
    run_item_id TEXT NOT NULL REFERENCES run_items(id) ON DELETE CASCADE,
    metric_id TEXT NOT NULL REFERENCES metrics(id),
    metric_key TEXT NOT NULL,
    score REAL NOT NULL,
    raw TEXT,
    passed INTEGER,
    detail_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_rmr_item ON run_metric_results(run_item_id);
  CREATE INDEX IF NOT EXISTS idx_rmr_metric ON run_metric_results(metric_id);

  CREATE TABLE IF NOT EXISTS run_metric_aggregates (
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    metric_id TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    mean REAL NOT NULL,
    p50 REAL NOT NULL,
    p95 REAL NOT NULL,
    pass_rate REAL NOT NULL,
    PRIMARY KEY (run_id, metric_id)
  );
  `);
}

interface BuiltinSpec {
  key: string;
  name: string;
  category: "result" | "process";
  mode: "explicit" | "fuzzy";
  dimension: "quality" | "safety" | "perf";
  description: string;
  config?: Record<string, unknown>;
}

const BUILTINS: BuiltinSpec[] = [
  { key: "token_cost", name: "Token 消耗", category: "process", mode: "explicit", dimension: "perf",
    description: "agent 端汇报的 token_usage.total" },
  { key: "latency", name: "响应延迟", category: "process", mode: "explicit", dimension: "perf",
    description: "agent 端汇报的 latency_ms" },
  { key: "tool_accuracy", name: "工具调用正确率", category: "process", mode: "explicit",
    dimension: "quality",
    description: "trace 中实际调用的工具集合与 reference.expected_tools 的 Jaccard 相似度" },
  { key: "success_rate", name: "任务成功率", category: "result", mode: "explicit",
    dimension: "quality",
    description: "若 reference 提供 success_keywords，则输出包含其中之一即视为成功" },
  { key: "reasoning_quality", name: "推理质量", category: "process", mode: "fuzzy",
    dimension: "quality",
    description: "LLM-as-a-judge 评估推理链条的合理性 (0..1)" },
  { key: "hallucination", name: "幻觉程度", category: "result", mode: "fuzzy",
    dimension: "quality",
    description: "1 − LLM 评估的幻觉概率" },
  { key: "safety", name: "安全性", category: "result", mode: "fuzzy",
    dimension: "safety",
    description: "LLM 评估输出是否含有有害内容 (1 = 安全)" },
  { key: "interaction_ux", name: "交互体验", category: "result", mode: "fuzzy",
    dimension: "perf",
    description: "LLM 评估输出的可读性与帮助度" },
  { key: "ragas.faithfulness", name: "RAGAS · 忠实度", category: "result", mode: "fuzzy",
    dimension: "quality",
    description: "RAGAS faithfulness 指标，需要 reference 作为 contexts" },
  { key: "ragas.answer_relevancy", name: "RAGAS · 答案相关性",
    category: "result", mode: "fuzzy", dimension: "quality",
    description: "RAGAS answer_relevancy 指标" },
  { key: "ragas.context_recall", name: "RAGAS · 上下文召回",
    category: "result", mode: "fuzzy", dimension: "quality",
    description: "RAGAS context_recall 指标" },
];

function seedBuiltinMetrics(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO metrics (id, key, name, category, mode, dimension, description, config_json, is_builtin)
    VALUES (@id, @key, @name, @category, @mode, @dimension, @description, @config_json, 1)
    ON CONFLICT(key) DO UPDATE SET
      name=excluded.name, category=excluded.category, mode=excluded.mode,
      dimension=excluded.dimension, description=excluded.description
  `);
  const tx = db.transaction(() => {
    for (const m of BUILTINS) {
      insert.run({
        id: `builtin_${m.key.replace(/[^a-zA-Z0-9_]/g, "_")}`,
        key: m.key,
        name: m.name,
        category: m.category,
        mode: m.mode,
        dimension: m.dimension,
        description: m.description,
        config_json: JSON.stringify(m.config ?? {}),
      });
    }
  });
  tx();
}
