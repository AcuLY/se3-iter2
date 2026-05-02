import { useState } from "react";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { PageHeader } from "../components/Common";

export function MetricsPage() {
  const ms = useFetch(() => api.listMetrics());
  const [showNew, setShowNew] = useState(false);
  return (
    <div className="space-y-4">
      <PageHeader
        title="指标"
        action={<button className="btn" onClick={() => setShowNew(!showNew)}>+ 自定义指标</button>}
      />
      {showNew && <NewMetricForm onCreated={() => { ms.reload(); setShowNew(false); }} />}
      <div className="card">
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left py-1">key</th>
              <th className="text-left py-1">名称</th>
              <th className="text-left py-1">category</th>
              <th className="text-left py-1">mode</th>
              <th className="text-left py-1">维度</th>
              <th className="text-left py-1">说明</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(ms.data ?? []).map(m => (
              <tr key={m.id} className="border-t border-slate-800">
                <td className="py-2 font-mono text-xs">{m.key}</td>
                <td>{m.name}{m.isBuiltin && <span className="badge bg-slate-700/60 text-slate-200 ml-1">builtin</span>}</td>
                <td>{m.category}</td>
                <td>{m.mode}</td>
                <td>{m.dimension}</td>
                <td className="text-slate-400">{m.description}</td>
                <td className="text-right">
                  {!m.isBuiltin && (
                    <button className="btn-ghost text-rose-300" onClick={async () => {
                      if (!confirm(`删除指标 ${m.name}？`)) return;
                      await api.deleteMetric(m.id);
                      ms.reload();
                    }}>删除</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewMetricForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    key: "", name: "", category: "result", mode: "fuzzy", dimension: "quality",
    description: "", kind: "llm_judge",
    prompt: "Rate the agent output 0..1 against the input. JSON {score, note}.",
    code: "var __result = { score: ctx.output.length > 100 ? 1 : 0 }",
  });
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    try {
      const config: any = { kind: form.kind };
      if (form.kind === "llm_judge") config.prompt = form.prompt;
      if (form.kind === "js") config.code = form.code;
      await api.createMetric({
        key: form.key,
        name: form.name,
        category: form.category,
        mode: form.mode,
        dimension: form.dimension,
        description: form.description,
        config,
      });
      onCreated();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  return (
    <div className="card space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Field label="key (会自动加 custom. 前缀)">
          <input className="input" value={form.key}
                 onChange={(e) => setForm({ ...form, key: e.target.value })} />
        </Field>
        <Field label="名称">
          <input className="input" value={form.name}
                 onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="说明">
          <input className="input" value={form.description}
                 onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="category">
          <select className="select" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="result">result</option>
            <option value="process">process</option>
          </select>
        </Field>
        <Field label="mode">
          <select className="select" value={form.mode}
                  onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="explicit">explicit</option>
            <option value="fuzzy">fuzzy</option>
          </select>
        </Field>
        <Field label="dimension">
          <select className="select" value={form.dimension}
                  onChange={(e) => setForm({ ...form, dimension: e.target.value })}>
            <option value="quality">quality</option>
            <option value="safety">safety</option>
            <option value="perf">perf</option>
          </select>
        </Field>
      </div>
      <Field label="实现">
        <select className="select" value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          <option value="llm_judge">LLM judge</option>
          <option value="js">JS 沙箱</option>
        </select>
      </Field>
      {form.kind === "llm_judge" && (
        <Field label="judge prompt">
          <textarea className="textarea font-mono text-xs" rows={4}
                    value={form.prompt}
                    onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
        </Field>
      )}
      {form.kind === "js" && (
        <Field label="JS 片段（沙箱内访问 ctx，需要赋值 __result 或定义 score(ctx)）">
          <textarea className="textarea font-mono text-xs" rows={6}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </Field>
      )}
      {err && <p className="text-rose-400 text-xs">{err}</p>}
      <button className="btn" onClick={submit}
              disabled={!form.key || !form.name}>创建</button>
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
