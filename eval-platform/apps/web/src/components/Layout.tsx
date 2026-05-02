import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/tasks", label: "评测任务" },
  { to: "/datasets", label: "数据集" },
  { to: "/agents", label: "Agents" },
  { to: "/metrics", label: "指标" },
  { to: "/compare", label: "对比" },
];

export function Layout() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-panel border-r border-slate-800 p-4 space-y-2">
        <div className="text-lg font-bold mb-4">
          <span className="text-accent">Eval</span> Platform
        </div>
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              `block rounded px-2 py-1.5 text-sm hover:bg-slate-800 ${
                isActive ? "bg-slate-800 text-accent" : "text-slate-300"
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
        <div className="pt-6 text-[10px] text-slate-500">
          API: <code>/api</code>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
