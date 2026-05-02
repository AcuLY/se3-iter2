import type {
  Agent, Dataset, DatasetItem, Metric, Task, Run, RunItem, CompareResponse,
} from "@ep/shared";

const BASE = "/api";

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => send<{ ok: boolean }>("/health"),

  // agents
  listAgents: () => send<Agent[]>("/agents"),
  createAgent: (b: Partial<Agent>) =>
    send<Agent>("/agents", { method: "POST", body: JSON.stringify(b) }),
  updateAgent: (id: string, b: Partial<Agent>) =>
    send<Agent>(`/agents/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteAgent: (id: string) => send<void>(`/agents/${id}`, { method: "DELETE" }),
  pingAgent: (id: string, input: string) =>
    send<{ ok: boolean; latencyMs: number; sample: any }>(
      `/agents/${id}/ping`, { method: "POST", body: JSON.stringify({ input }) }),

  // datasets
  listDatasets: () => send<Dataset[]>("/datasets"),
  getDataset: (id: string) => send<Dataset>(`/datasets/${id}`),
  createDataset: (b: { name: string; description?: string }) =>
    send<Dataset>("/datasets", { method: "POST", body: JSON.stringify(b) }),
  deleteDataset: (id: string) => send<void>(`/datasets/${id}`, { method: "DELETE" }),
  listItems: (id: string) => send<DatasetItem[]>(`/datasets/${id}/items`),
  bulkUploadItems: (id: string, items: Array<{ input: string; reference?: string;
                                                meta?: Record<string, unknown> }>) =>
    send<{ created: number }>(`/datasets/${id}/items:bulk`, {
      method: "POST", body: JSON.stringify({ items }) }),
  deleteItem: (dsId: string, itemId: string) =>
    send<void>(`/datasets/${dsId}/items/${itemId}`, { method: "DELETE" }),

  // metrics
  listMetrics: () => send<Metric[]>("/metrics"),
  createMetric: (b: any) => send<Metric>("/metrics",
    { method: "POST", body: JSON.stringify(b) }),
  deleteMetric: (id: string) => send<void>(`/metrics/${id}`, { method: "DELETE" }),
  previewMetric: (id: string, sample: { input: string; reference?: string; output: string }) =>
    send<any>(`/metrics/${id}/preview`,
      { method: "POST", body: JSON.stringify(sample) }),

  // tasks
  listTasks: () => send<Task[]>("/tasks"),
  getTask: (id: string) => send<Task>(`/tasks/${id}`),
  createTask: (b: any) => send<Task>("/tasks",
    { method: "POST", body: JSON.stringify(b) }),
  deleteTask: (id: string) => send<void>(`/tasks/${id}`, { method: "DELETE" }),
  triggerRun: (id: string) => send<{ runId: string; status: string }>(
    `/tasks/${id}/run`, { method: "POST", body: "{}" }),

  // runs
  listRuns: () => send<Run[]>("/runs"),
  getRun: (id: string) => send<Run>(`/runs/${id}`),
  listRunItems: (id: string) => send<Array<RunItem & { metrics: any[] }>>(
    `/runs/${id}/items`),
  listRunsByTask: (taskId: string) => send<Run[]>(`/runs/by-task/${taskId}`),

  compare: (runIds: string[]) =>
    send<CompareResponse>(`/compare?runIds=${encodeURIComponent(runIds.join(","))}`),
};
