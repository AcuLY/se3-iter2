import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { PageHeader, StatusBadge } from "../components/Common";

export function TasksPage() {
  const tasks = useFetch(() => api.listTasks());
  const agents = useFetch(() => api.listAgents());
  const datasets = useFetch(() => api.listDatasets());

  const agentsById = new Map((agents.data ?? []).map(a => [a.id, a]));
  const datasetsById = new Map((datasets.data ?? []).map(d => [d.id, d]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="评测任务"
        action={<Link to="/tasks/new" className="btn">+ 新建任务</Link>}
      />
      <div className="card">
        {tasks.loading && <p className="text-slate-400 text-sm">加载中…</p>}
        {tasks.error && <p className="text-rose-400 text-sm">{tasks.error}</p>}
        {tasks.data && tasks.data.length === 0 && (
          <p className="text-slate-400 text-sm">还没有任务。点击右上角创建一个。</p>
        )}
        {tasks.data && tasks.data.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-1">名称</th>
                <th className="text-left py-1">Agent</th>
                <th className="text-left py-1">数据集</th>
                <th className="text-left py-1">指标数</th>
                <th className="text-left py-1">状态</th>
                <th className="text-left py-1">更新时间</th>
                <th className="text-right py-1">操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.data.map(t => (
                <tr key={t.id} className="border-t border-slate-800">
                  <td className="py-2">
                    <Link to={`/tasks/${t.id}`} className="text-accent">{t.name}</Link>
                  </td>
                  <td className="py-2">{agentsById.get(t.agentId)?.name ?? t.agentId}</td>
                  <td className="py-2">{datasetsById.get(t.datasetId)?.name ?? t.datasetId}</td>
                  <td className="py-2">{t.metricIds.length}</td>
                  <td className="py-2"><StatusBadge status={t.status} /></td>
                  <td className="py-2 text-slate-400">{t.updatedAt}</td>
                  <td className="py-2 text-right">
                    <button
                      className="btn-ghost text-rose-300"
                      onClick={async () => {
                        if (!confirm(`确认删除任务「${t.name}」？`)) return;
                        await api.deleteTask(t.id);
                        tasks.reload();
                      }}
                    >删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
