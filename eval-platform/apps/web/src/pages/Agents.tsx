import { useState } from "react";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { PageHeader } from "../components/Common";

export function AgentsPage() {
  const ag = useFetch(() => api.listAgents());
  const [form, setForm] = useState({ name: "", version: "", endpoint: "", authHeader: "" });
  const [pingResult, setPingResult] = useState<Record<string, string>>({});

  return (
    <div className="space-y-4">
      <PageHeader title="Agents" />

      <div className="card">
        <h3 className="font-semibold mb-2">注册新 Agent</h3>
        <div className="grid grid-cols-4 gap-2 items-end">
          <Field label="名称">
            <input className="input" value={form.name}
                   onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="版本">
            <input className="input" value={form.version}
                   onChange={(e) => setForm({ ...form, version: e.target.value })}
                   placeholder="0.1.0" />
          </Field>
          <Field label="Endpoint URL">
            <input className="input" value={form.endpoint}
                   onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                   placeholder="http://localhost:8088/v1/run" />
          </Field>
          <Field label="Auth header（可选）">
            <input className="input" value={form.authHeader}
                   onChange={(e) => setForm({ ...form, authHeader: e.target.value })}
                   placeholder="Bearer ..." />
          </Field>
        </div>
        <button className="btn mt-3"
                disabled={!form.name || !form.version || !form.endpoint}
                onClick={async () => {
          await api.createAgent({
            name: form.name, version: form.version, endpoint: form.endpoint,
            authHeader: form.authHeader || null,
          });
          setForm({ name: "", version: "", endpoint: "", authHeader: "" });
          ag.reload();
        }}>+ 添加</button>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left py-1">名称</th>
              <th className="text-left py-1">版本</th>
              <th className="text-left py-1">endpoint</th>
              <th className="text-left py-1">ping</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(ag.data ?? []).map(a => (
              <tr key={a.id} className="border-t border-slate-800">
                <td className="py-2">{a.name}</td>
                <td>{a.version}</td>
                <td className="font-mono text-xs">{a.endpoint}</td>
                <td>
                  <button className="btn-ghost" onClick={async () => {
                    setPingResult({ ...pingResult, [a.id]: "..." });
                    try {
                      const r = await api.pingAgent(a.id, "ping");
                      setPingResult({ ...pingResult, [a.id]:
                        r.ok ? `ok ${r.latencyMs}ms` : "fail" });
                    } catch (e: any) {
                      setPingResult({ ...pingResult, [a.id]: "err" });
                    }
                  }}>ping</button>
                  {pingResult[a.id] && (
                    <span className="ml-2 text-xs">{pingResult[a.id]}</span>
                  )}
                </td>
                <td className="text-right">
                  <button className="btn-ghost text-rose-300" onClick={async () => {
                    if (!confirm(`删除 agent ${a.name}？`)) return;
                    await api.deleteAgent(a.id);
                    ag.reload();
                  }}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
