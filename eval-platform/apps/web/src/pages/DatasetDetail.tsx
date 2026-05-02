import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { PageHeader } from "../components/Common";

export function DatasetDetailPage() {
  const { id = "" } = useParams();
  const ds = useFetch(() => api.getDataset(id), [id]);
  const items = useFetch(() => api.listItems(id), [id]);
  const [jsonl, setJsonl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = async () => {
    setBusy(true); setErr(null);
    try {
      const lines = jsonl.split("\n").map(l => l.trim()).filter(Boolean);
      const parsed = lines.map(l => JSON.parse(l));
      await api.bulkUploadItems(id, parsed);
      setJsonl("");
      items.reload(); ds.reload();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={ds.data?.name ?? id} />
      <div className="card">
        <h3 className="font-semibold mb-2">批量上传 (JSONL)</h3>
        <p className="text-xs text-slate-400 mb-2">
          每行一个 JSON，字段：<code>{`{"input": "...", "reference": "...", "meta": {...}}`}</code>。
          <code>reference</code> 也可以是 JSON 串：<code>{`{"success_keywords":["..."], "expected_tools":["..."]}`}</code>。
        </p>
        <textarea className="textarea font-mono text-xs" rows={6}
                  value={jsonl} onChange={(e) => setJsonl(e.target.value)}
                  placeholder='{"input": "北京 2 天", "reference": "{\\"success_keywords\\":[\\"北京\\"]}"}' />
        {err && <p className="text-rose-400 text-xs mt-2">{err}</p>}
        <div className="mt-2">
          <button className="btn" onClick={upload} disabled={busy || !jsonl.trim()}>
            {busy ? "上传中…" : "上传"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-2">items（{items.data?.length ?? 0}）</h3>
        {items.data && items.data.length === 0 && (
          <p className="text-sm text-slate-400">暂无 item</p>
        )}
        <ul className="space-y-2">
          {(items.data ?? []).map(it => (
            <li key={it.id} className="text-sm border border-slate-800 rounded p-2">
              <div className="font-mono text-xs text-slate-500 mb-1">{it.id}</div>
              <div className="whitespace-pre-wrap">{it.input}</div>
              {it.reference && (
                <pre className="text-[10px] mt-1 text-slate-400">ref: {it.reference}</pre>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
