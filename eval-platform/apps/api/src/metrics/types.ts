import type { RunItem } from "@ep/shared";

/** Context passed to each metric runner. */
export interface MetricContext {
  input: string;
  reference?: string | null;
  meta?: Record<string, unknown> | null;
  output: string;
  trace?: unknown;
  toolCalls?: Array<{ name: string; args?: unknown; result?: unknown }>;
  latencyMs: number;
  tokenUsage?: { prompt?: number; completion?: number; total?: number };
  metricConfig?: Record<string, unknown>;
  metricKey: string;
  metricName: string;
}

/** Envelope every metric produces. */
export interface MetricOutput {
  score: number; // normalized 0..1 where higher is better
  raw?: number | string | null;
  passed?: boolean;
  detail?: Record<string, unknown>;
}

export type MetricRunner = (ctx: MetricContext) => Promise<MetricOutput> | MetricOutput;

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
