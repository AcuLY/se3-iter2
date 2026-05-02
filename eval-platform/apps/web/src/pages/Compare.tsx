import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { PageHeader, StatusBadge } from "../components/Common";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";
import type { CompareResponse } from "@ep/shared";

export function ComparePage() {
  const [search, setSearch] = useSearchParams();
  const [selected, setSelected] = useState<string[]>(
    (search.get("runs") ?? "").split(",").filter(Boolean));
  const allRuns = useFetch(() => api.listRuns());
  const [data, setData] = useState<CompareResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (selected.length === 0) { setData(null); return; }
    setSearch({ runs: selected.join(",") }, { replace: true });
    api.compare(selected).then(setData, (e) => setErr(String(e)));
  }, [selected]);  // eslint-disable-line react-hooks/exhaustive-deps

  const chart = (data?.rows ?? []).map(r => {
    const obj: Record<string, any> = { metric: r.metricName };
    for (const id of selected) obj[id] = r.values[id] ?? 0;
    return obj;
  });

  return (
    <div className="space-y-4">
      <PageHeader title="多 run 对比" />
      <div className="card">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
          选择要对比的 runs（最少 2 个）
        </div>
        <div className="grid grid-cols-2 gap-2 max-h-72 overflow-auto">
          {(allRuns.data ?? []).map(r => {
            const ck = selected.includes(r.id);
            return (
              <label key={r.id} className={`p-2 rounded border text-sm flex gap-2 items-start ${
                ck ? "border-accent bg-slate-900" : "border-slate-800"
              }`}>
                <input type="checkbox" checked={ck} onChange={(e) => {
                  setSelected(e.target.checked
                    ? [...selected, r.id]
                    : selected.filter(x => x !== r.id));
                }} />
                <span>
                  <span className="font-mono">{r.id}</span>
                  <span className="ml-2"><StatusBadge status={r.status} /></span>
                  <div className="text-xs text-slate-400">
                    task {r.taskId} · {r.startedAt}
                  </div>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {err && <p className="text-rose-400 text-sm">{err}</p>}

      {data && data.rows.length > 0 && (
        <>
          <div className="card">
            <h3 className="font-semibold mb-3">指标均值对比</h3>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="metric" stroke="#94a3b8" angle={-15} textAnchor="end" height={70} />
                  <YAxis stroke="#94a3b8" domain={[0, 1]} />
                  <Tooltip contentStyle={{ background: "#0e1116", border: "1px solid #334155" }} />
                  <Legend />
                  {selected.map((id, i) => (
                    <Bar key={id} dataKey={id} name={id}
                         fill={["#5b8def", "#22c55e", "#f97316", "#ec4899", "#a855f7"][i % 5]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card overflow-auto">
            <table className="text-sm w-full">
              <thead>
                <tr>
                  <th className="text-left py-1">指标</th>
                  {data.runs.map(r => (
                    <th key={r.id} className="text-left py-1 font-mono">{r.id}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map(row => (
                  <tr key={row.metricKey} className="border-t border-slate-800">
                    <td className="py-1.5">{row.metricName}
                      <span className="text-xs text-slate-500 ml-2">{row.metricKey}</span>
                    </td>
                    {data.runs.map(r => (
                      <td key={r.id} className="py-1.5">
                        {row.values[r.id] != null ? (row.values[r.id] as number).toFixed(3) : "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
