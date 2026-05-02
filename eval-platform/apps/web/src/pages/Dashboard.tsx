import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { PageHeader, StatusBadge } from "../components/Common";

export function DashboardPage() {
  const runs = useFetch(() => api.listRuns());
  const tasks = useFetch(() => api.listTasks());
  const agents = useFetch(() => api.listAgents());
  const datasets = useFetch(() => api.listDatasets());

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="任务" value={tasks.data?.length ?? "-"} to="/tasks" />
        <KpiCard label="数据集" value={datasets.data?.length ?? "-"} to="/datasets" />
        <KpiCard label="Agent" value={agents.data?.length ?? "-"} to="/agents" />
        <KpiCard label="近 200 次 run"
                 value={runs.data?.length ?? "-"}
                 to="/compare" />
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">最近的 run</h2>
        {runs.loading && <p className="text-slate-400 text-sm">加载中…</p>}
        {runs.error && <p className="text-rose-400 text-sm">{runs.error}</p>}
        {runs.data && runs.data.length === 0 && (
          <p className="text-slate-400 text-sm">还没有任何 run。先去
            <Link className="text-accent mx-1" to="/tasks">任务页</Link>
            创建并触发一个吧。
          </p>
        )}
        {runs.data && runs.data.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-1">Run</th>
                <th className="text-left py-1">Task</th>
                <th className="text-left py-1">状态</th>
                <th className="text-left py-1">通过率</th>
                <th className="text-left py-1">加权分</th>
                <th className="text-left py-1">触发时间</th>
              </tr>
            </thead>
            <tbody>
              {runs.data.slice(0, 12).map((r) => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="py-1.5">
                    <Link className="text-accent" to={`/runs/${r.id}`}>{r.id}</Link>
                  </td>
                  <td className="py-1.5">{r.taskId}</td>
                  <td className="py-1.5"><StatusBadge status={r.status} /></td>
                  <td className="py-1.5">
                    {r.summary?.passRate != null
                      ? `${Math.round(r.summary.passRate * 100)}%` : "-"}
                  </td>
                  <td className="py-1.5">
                    {r.summary?.weightedScore != null
                      ? r.summary.weightedScore.toFixed(2) : "-"}
                  </td>
                  <td className="py-1.5 text-slate-400">{r.startedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, to }:
                 { label: string; value: string | number; to: string }) {
  return (
    <Link to={to} className="card hover:border-accent transition block">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </Link>
  );
}
