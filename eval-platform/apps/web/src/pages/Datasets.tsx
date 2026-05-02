import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { PageHeader } from "../components/Common";

export function DatasetsPage() {
  const ds = useFetch(() => api.listDatasets());
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  return (
    <div className="space-y-4">
      <PageHeader title="数据集" />
      <div className="card flex gap-2 items-end">
        <div className="flex-1">
          <label className="label">名称</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="label">描述</label>
          <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <button className="btn" disabled={!name} onClick={async () => {
          await api.createDataset({ name, description: desc || undefined });
          setName(""); setDesc("");
          ds.reload();
        }}>+ 新建</button>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left py-1">名称</th>
              <th className="text-left py-1">items</th>
              <th className="text-left py-1">创建时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(ds.data ?? []).map(d => (
              <tr key={d.id} className="border-t border-slate-800">
                <td className="py-2">
                  <Link className="text-accent" to={`/datasets/${d.id}`}>{d.name}</Link>
                  {d.description && <span className="text-xs text-slate-400 ml-2">{d.description}</span>}
                </td>
                <td>{d.itemCount}</td>
                <td className="text-slate-400">{d.createdAt}</td>
                <td className="text-right">
                  <button className="btn-ghost text-rose-300" onClick={async () => {
                    if (!confirm(`删除数据集 ${d.name}？`)) return;
                    await api.deleteDataset(d.id);
                    ds.reload();
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
