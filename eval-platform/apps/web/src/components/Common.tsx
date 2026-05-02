import { ReactNode } from "react";

const COLORS: Record<string, string> = {
  done: "bg-emerald-700/40 text-emerald-200",
  draft: "bg-slate-700/60 text-slate-200",
  queued: "bg-amber-700/40 text-amber-200",
  running: "bg-blue-700/40 text-blue-200",
  failed: "bg-rose-700/40 text-rose-200",
  cancelled: "bg-slate-700/40 text-slate-200",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = COLORS[status] ?? "bg-slate-700/40 text-slate-200";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export function PageHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}
