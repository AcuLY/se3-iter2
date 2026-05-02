import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/Dashboard";
import { TasksPage } from "./pages/Tasks";
import { TaskDetailPage } from "./pages/TaskDetail";
import { NewTaskPage } from "./pages/NewTask";
import { RunDetailPage } from "./pages/RunDetail";
import { ComparePage } from "./pages/Compare";
import { DatasetsPage } from "./pages/Datasets";
import { DatasetDetailPage } from "./pages/DatasetDetail";
import { AgentsPage } from "./pages/Agents";
import { MetricsPage } from "./pages/Metrics";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "tasks/new", element: <NewTaskPage /> },
      { path: "tasks/:id", element: <TaskDetailPage /> },
      { path: "runs/:id", element: <RunDetailPage /> },
      { path: "compare", element: <ComparePage /> },
      { path: "datasets", element: <DatasetsPage /> },
      { path: "datasets/:id", element: <DatasetDetailPage /> },
      { path: "agents", element: <AgentsPage /> },
      { path: "metrics", element: <MetricsPage /> },
    ],
  },
]);
