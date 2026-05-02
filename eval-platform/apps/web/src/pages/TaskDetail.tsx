import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { PageHeader, StatusBadge } from "../components/Common";
import { useState } from "react";

export function TaskDetailPage() {
  const { id = "" } = useParams();
  const task = useFetch(() => api.getTask(id), [id]);
  const runs = useFetch(() => api.listRunsByTask(id), [id]);
  const agents = useFetch(() => api.listAgents());
  const datasets = useFetch(() => api.listDatasets());
  const metrics = useFetch(() => api.listMetrics());
  const [running, setRunning] = useState(false);

  if (task.error) return <p className="text-rose-400">{task.error}</p>;
  if (!task.data) return <p className="text-slate-400">加载中…</p>;
  const t = task.data;
  const agent = agents.data?.find(a => a.id === t.agentId);
  const ds = datasets.data?.find(d => d.id === t.datasetId);
  const ms = (metrics.data ?? []).filter(m => t.metricIds.includes(m.id));

  return (
    <div className="space-y-4">
      <PageHeader
        title={<>{t.name} <StatusBadge status={t.status} /></>}
        action={
          <button className="btn" disabled={running} onClick={async () => {
            setRunning(true);
            try {
              await api.triggerRun(t.id);
              setTimeout(() => { runs.reload(); task.reload(); setRunning(false); }, 600);
            } catch (e) {
              setRunning(false);
              alert(String(e));
            }
          }}>{running ? "已入队…" : "▶ 运行一次"}</button>
        }
      />
      {t.description && <p className="text-slate-400 text-sm">{t.description}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-2">配置</h2>
          <dl className="text-sm space-y-1">
            <div><dt className="inline text-slate-400 mr-2">Agent:</dt>
                 <dd className="inline">{agent?.name ?? t.agentId}</dd></div>
            <div><dt className="inline text-slate-400 mr-2">数据集:</dt>
                 <dd className="inline">{ds?.name ?? t.datasetId}（{ds?.itemCount ?? "?"} items）</dd></div>
            <div><dt className="inline text-slate-400 mr-2">创建:</dt>
                 <dd className="inline text-slate-400">{t.createdAt}</dd></div>
            <div className="pt-2"><dt className="text-slate-400">指标:</dt>
              <dd className="space-y-0.5 mt-1">
                {ms.map(m => (
                  <div key={m.id} className="text-xs text-slate-300">
                    · <span className="font-mono">{m.key}</span> ({m.mode}, {m.dimension})
                  </div>
                ))}
              </dd>
            </div>
            {t.strategy && (
              <div className="pt-2">
                <dt className="text-slate-400">策略:</dt>
                <dd>
                  <pre className="text-[10px] bg-slate-900 rounded p-2 mt-1 overflow-auto">
                    {JSON.stringify(t.strategy, null, 2)}
                  </pre>
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-2">历史运行</h2>
          {(!runs.data || runs.data.length === 0) ? (
            <p className="text-sm text-slate-400">暂无运行记录。</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-xs">
                <tr>
                  <th className="text-left py-1">Run</th>
                  <th className="text-left py-1">状态</th>
                  <th className="text-left py-1">通过率</th>
                  <th className="text-left py-1">加权分</th>
                  <th className="text-left py-1">触发</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map(r => (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td className="py-1.5">
                      <Link className="text-accent" to={`/runs/${r.id}`}>{r.id}</Link>
                    </td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{r.summary?.passRate != null
                      ? `${Math.round(r.summary.passRate * 100)}%` : "-"}</td>
                    <td>{r.summary?.weightedScore?.toFixed(2) ?? "-"}</td>
                    <td className="text-slate-400">{r.startedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
