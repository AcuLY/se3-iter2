import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { PageHeader } from "../components/Common";

export function NewTaskPage() {
  const nav = useNavigate();
  const agents = useFetch(() => api.listAgents());
  const datasets = useFetch(() => api.listDatasets());
  const metrics = useFetch(() => api.listMetrics());

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    description: "",
    agentId: "",
    datasetId: "",
    metricIds: [] as string[],
    weights: {} as Record<string, number>,
    failIfMetric: "",
    failIfLt: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setF = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const submit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const strategy: any = {};
      if (Object.keys(form.weights).length > 0) strategy.weights = form.weights;
      if (form.failIfMetric && form.failIfLt) {
        strategy.failIf = [{ metric: form.failIfMetric, lt: Number(form.failIfLt) }];
      }
      const t = await api.createTask({
        name: form.name,
        description: form.description || null,
        agentId: form.agentId,
        datasetId: form.datasetId,
        metricIds: form.metricIds,
        strategy,
      });
      nav(`/tasks/${t.id}`);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  const stepValid = [
    !!form.name && !!form.agentId,
    !!form.datasetId,
    form.metricIds.length > 0,
    true,
  ];

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="新建评测任务" />
      <Stepper step={step} labels={["基本信息", "数据集", "指标", "策略"]} />

      <div className="card space-y-4">
        {step === 0 && (
          <>
            <Field label="任务名称">
              <input className="input" value={form.name}
                     onChange={(e) => setF({ name: e.target.value })}
                     placeholder="例如 北京-旅行-baseline" />
            </Field>
            <Field label="描述（可选）">
              <textarea className="textarea" rows={2}
                        value={form.description}
                        onChange={(e) => setF({ description: e.target.value })} />
            </Field>
            <Field label="Agent">
              <select className="select" value={form.agentId}
                      onChange={(e) => setF({ agentId: e.target.value })}>
                <option value="">— 选择 —</option>
                {(agents.data ?? []).map(a => (
                  <option key={a.id} value={a.id}>{a.name}（{a.version}）</option>
                ))}
              </select>
            </Field>
          </>
        )}

        {step === 1 && (
          <Field label="数据集">
            <select className="select" value={form.datasetId}
                    onChange={(e) => setF({ datasetId: e.target.value })}>
              <option value="">— 选择 —</option>
              {(datasets.data ?? []).map(d => (
                <option key={d.id} value={d.id}>{d.name}（{d.itemCount} items）</option>
              ))}
            </select>
          </Field>
        )}

        {step === 2 && (
          <Field label="指标">
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-auto">
              {(metrics.data ?? []).map(m => {
                const checked = form.metricIds.includes(m.id);
                return (
                  <label key={m.id}
                         className={`flex items-start gap-2 p-2 rounded border ${
                           checked ? "border-accent bg-slate-900" : "border-slate-800"
                         }`}>
                    <input type="checkbox" checked={checked} onChange={(e) => {
                      const next = e.target.checked
                        ? [...form.metricIds, m.id]
                        : form.metricIds.filter(id => id !== m.id);
                      setF({ metricIds: next });
                    }} />
                    <span>
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-slate-500 ml-2">{m.key}</span>
                      <div className="text-xs text-slate-400">{m.description}</div>
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>
        )}

        {step === 3 && (
          <>
            <p className="text-xs text-slate-400">
              加权评分会作为 run summary 的 weightedScore；fail-if 触发时 run 标记 failed。
            </p>
            <Field label="加权权重（可选）">
              <div className="space-y-1">
                {form.metricIds.map(id => {
                  const m = (metrics.data ?? []).find(x => x.id === id);
                  if (!m) return null;
                  const v = form.weights[m.key] ?? 0;
                  return (
                    <div key={id} className="flex items-center gap-2 text-sm">
                      <span className="w-48 truncate">{m.name}</span>
                      <input type="number" min={0} step={0.1}
                             className="input w-32" value={v}
                             onChange={(e) => setF({
                               weights: { ...form.weights,
                                          [m.key]: Number(e.target.value) },
                             })} />
                    </div>
                  );
                })}
              </div>
            </Field>
            <Field label="fail-if（可选）">
              <div className="flex gap-2 text-sm items-center">
                <select className="select" value={form.failIfMetric}
                        onChange={(e) => setF({ failIfMetric: e.target.value })}>
                  <option value="">— metric —</option>
                  {form.metricIds.map(id => {
                    const m = (metrics.data ?? []).find(x => x.id === id);
                    if (!m) return null;
                    return <option key={id} value={m.key}>{m.name}</option>;
                  })}
                </select>
                <span>mean &lt;</span>
                <input type="number" step={0.05} className="input w-24"
                       value={form.failIfLt}
                       onChange={(e) => setF({ failIfLt: e.target.value })} />
              </div>
            </Field>
          </>
        )}

        {err && <div className="text-sm text-rose-400">{err}</div>}

        <div className="flex justify-between pt-2">
          <button className="btn-ghost"
                  disabled={step === 0}
                  onClick={() => setStep(step - 1)}>上一步</button>
          {step < 3 ? (
            <button className="btn"
                    disabled={!stepValid[step]}
                    onClick={() => setStep(step + 1)}>下一步</button>
          ) : (
            <button className="btn"
                    disabled={submitting || form.metricIds.length === 0}
                    onClick={submit}>{submitting ? "提交中…" : "创建"}</button>
          )}
        </div>
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

function Stepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {labels.map((l, i) => (
        <div key={i}
             className={`flex items-center gap-2 ${i === step ? "text-accent" : "text-slate-500"}`}>
          <div className={`w-5 h-5 rounded-full grid place-content-center ${
            i <= step ? "bg-accent text-white" : "bg-slate-800 text-slate-400"
          }`}>{i + 1}</div>
          <span>{l}</span>
          {i < labels.length - 1 && <span className="text-slate-700 mx-2">→</span>}
        </div>
      ))}
    </div>
  );
}
