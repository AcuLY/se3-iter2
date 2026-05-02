// Shared DTO / enum types between Express api and React web.

export type ID = string;

export type TaskStatus = "draft" | "queued" | "running" | "done" | "failed";
export type RunStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type MetricCategory = "result" | "process";
export type MetricMode = "explicit" | "fuzzy";
export type MetricDimension = "quality" | "safety" | "perf";

export interface Agent {
  id: ID;
  name: string;
  version: string;
  endpoint: string; // POST {input} → {output, trace, tool_calls, latency_ms, token_usage}
  authHeader?: string | null;
  createdAt: string;
}

export interface DatasetItem {
  id: ID;
  datasetId: ID;
  input: string;
  reference?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface Dataset {
  id: ID;
  name: string;
  description?: string | null;
  itemCount: number;
  createdAt: string;
}

export interface Metric {
  id: ID;
  key: string; // e.g. "token_cost", "ragas.faithfulness", "custom.my_metric"
  name: string;
  category: MetricCategory;
  mode: MetricMode;
  dimension: MetricDimension;
  description?: string | null;
  config?: Record<string, unknown>;
  isBuiltin: boolean;
  createdAt: string;
}

export interface Strategy {
  weights?: Record<string, number>; // metricKey → weight
  failIf?: Array<{ metric: string; lt?: number; gt?: number; eq?: number | string }>;
}

export interface Task {
  id: ID;
  name: string;
  agentId: ID;
  datasetId: ID;
  metricIds: ID[];
  strategy: Strategy;
  status: TaskStatus;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunItem {
  id: ID;
  runId: ID;
  datasetItemId: ID;
  input: string;
  reference?: string | null;
  agentOutput?: string | null;
  trace?: unknown;
  toolCalls?: Array<{ name: string; args?: unknown; result?: unknown }>;
  latencyMs: number;
  tokenUsage?: { prompt?: number; completion?: number; total?: number };
  error?: string | null;
}

export interface MetricResult {
  metricKey: string;
  metricName: string;
  score: number; // normalized to 0..1 where applicable
  raw?: number | string | null; // original value (e.g. tokens, ms)
  passed?: boolean;
  detail?: Record<string, unknown>;
}

export interface RunSummary {
  totalItems: number;
  okItems: number;
  failedItems: number;
  totalTokens: number;
  totalLatencyMs: number;
  passRate?: number;
  weightedScore?: number;
  failures?: string[];
}

export interface MetricAggregate {
  metricKey: string;
  metricName: string;
  mean: number;
  p50: number;
  p95: number;
  passRate: number;
  unit?: string;
}

export interface Run {
  id: ID;
  taskId: ID;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string | null;
  summary?: RunSummary | null;
  aggregates: MetricAggregate[];
  error?: string | null;
}

export interface CompareRow {
  metricKey: string;
  metricName: string;
  values: Record<ID /* runId */, number | null>; // mean per run
}

export interface CompareResponse {
  runs: Array<Pick<Run, "id" | "taskId" | "status" | "startedAt" | "summary">>;
  rows: CompareRow[];
}

// Wire shape used when an agent endpoint responds — also documented in
// travel-agent/src/travel_agent/server.py.
export interface AgentRunResponse {
  output: string;
  trace?: unknown;
  tool_calls?: Array<{ name: string; args?: unknown; result?: unknown }>;
  latency_ms?: number;
  token_usage?: { prompt?: number; completion?: number; total?: number };
}

export const BUILTIN_METRIC_KEYS = [
  "token_cost",
  "latency",
  "tool_accuracy",
  "success_rate",
  "reasoning_quality",
  "hallucination",
  "safety",
  "interaction_ux",
  "ragas.faithfulness",
  "ragas.answer_relevancy",
  "ragas.context_recall",
] as const;

export type BuiltinMetricKey = (typeof BUILTIN_METRIC_KEYS)[number];
