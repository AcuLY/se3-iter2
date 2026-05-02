import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { PageHeader, StatusBadge } from "../components/Common";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from "recharts";
import { useState } from "react";

export function RunDetailPage() {
  const { id = "" } = useParams();
  const run = useFetch(() => api.getRun(id), [id]);
  const items = useFetch(() => api.listRunItems(id), [id]);

  if (run.error) return <p className="text-rose-400">{run.error}</p>;
  if (!run.data) return <p className="text-slate-400">加载中…</p>;
  const r = run.data;
  const aggData = r.aggregates.map(a => ({
    metric: a.metricName,
    mean: Number(a.mean.toFixed(3)),
    p95: Number(a.p95.toFixed(3)),
    passRate: Number(a.passRate.toFixed(3)),
  }));

  return (
    <div className="space-y-4">
      <PageHeader title={<>Run {r.id} <StatusBadge status={r.status} /></>} />

      <div className="grid grid-cols-4 gap-4">
        <Stat label="数据条目" value={r.summary?.totalItems ?? 0} />
        <Stat label="成功"
              value={`${r.summary?.okItems ?? 0} / ${r.summary?.totalItems ?? 0}`} />
        <Stat label="总 token" value={r.summary?.totalTokens ?? 0} />
        <Stat label="加权分"
              value={r.summary?.weightedScore != null
                ? r.summary.weightedScore.toFixed(2) : "-"} />
      </div>

      {r.summary?.failures && r.summary.failures.length > 0 && (
        <div className="card border-rose-700/50">
          <h3 className="font-semibold mb-2 text-rose-300">失败明细</h3>
          <ul className="text-xs space-y-1 text-rose-200">
            {r.summary.failures.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-3">指标均值</h3>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={aggData} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="metric" stroke="#94a3b8" angle={-20} textAnchor="end" height={50} />
                <YAxis stroke="#94a3b8" domain={[0, 1]} />
                <Tooltip contentStyle={{ background: "#0e1116", border: "1px solid #334155" }} />
                <Legend />
                <Bar dataKey="mean" fill="#5b8def" />
                <Bar dataKey="passRate" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-3">维度雷达</h3>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <RadarChart data={aggData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="metric" stroke="#94a3b8" />
                <PolarRadiusAxis domain={[0, 1]} stroke="#475569" />
                <Radar dataKey="mean" stroke="#5b8def" fill="#5b8def" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">逐条结果</h3>
        {items.loading && <p className="text-slate-400 text-sm">加载中…</p>}
        {items.data && (
          <div className="space-y-2">
            {items.data.map((it, i) => <ItemCard key={it.id} idx={i} it={it} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function ItemCard({ it, idx }: { it: any; idx: number }) {
  const [open, setOpen] = useState(idx === 0);
  return (
    <div className="border border-slate-800 rounded">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 py-2 flex justify-between items-center hover:bg-slate-900"
      >
        <div className="text-sm truncate flex-1">
          <span className="text-slate-400 mr-2">#{idx + 1}</span>{it.input}
        </div>
        <div className="flex gap-1 ml-2">
          {it.metrics?.slice(0, 5).map((m: any) => (
            <span key={m.metricKey}
                  className={`badge ${m.passed ? "bg-emerald-700/40 text-emerald-200"
                    : "bg-amber-700/40 text-amber-200"}`}>
              {m.metricKey.split(".").pop()}: {m.score.toFixed(2)}
            </span>
          ))}
          {it.error && <span className="badge bg-rose-700/40 text-rose-200">err</span>}
        </div>
      </button>
      {open && (
        <div className="p-3 border-t border-slate-800 space-y-3 text-sm">
          {it.reference && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400">Reference</div>
              <pre className="bg-slate-900 rounded p-2 text-xs overflow-auto">{it.reference}</pre>
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-400">Output</div>
            <pre className="bg-slate-900 rounded p-2 text-xs whitespace-pre-wrap">{
              it.agentOutput ?? <span className="text-rose-300">{it.error}</span>
            }</pre>
          </div>
          {it.toolCalls?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400">Tool calls</div>
              <ul className="text-xs space-y-0.5">
                {it.toolCalls.map((tc: any, i: number) => (
                  <li key={i}><span className="font-mono text-accent">{tc.name}</span></li>
                ))}
              </ul>
            </div>
          )}
          {it.trace && (
            <details>
              <summary className="text-xs uppercase tracking-wider text-slate-400 cursor-pointer">
                Full trace
              </summary>
              <pre className="bg-slate-900 rounded p-2 text-[10px] overflow-auto max-h-72">
                {JSON.stringify(it.trace, null, 2)}
              </pre>
            </details>
          )}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Metrics</div>
            <table className="text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="pr-3 text-left">key</th>
                  <th className="pr-3 text-left">score</th>
                  <th className="pr-3 text-left">raw</th>
                  <th className="pr-3 text-left">passed</th>
                  <th className="pr-3 text-left">detail</th>
                </tr>
              </thead>
              <tbody>
                {it.metrics?.map((m: any) => (
                  <tr key={m.metricKey} className="border-t border-slate-800">
                    <td className="pr-3 py-1 font-mono">{m.metricKey}</td>
                    <td className="pr-3">{m.score.toFixed(3)}</td>
                    <td className="pr-3">{m.raw ?? "-"}</td>
                    <td className="pr-3">{m.passed ? "✓" : m.passed === false ? "✗" : "-"}</td>
                    <td className="pr-3 text-slate-400">
                      {m.detail ? JSON.stringify(m.detail).slice(0, 80) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
