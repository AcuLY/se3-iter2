import express from "express";
import cors from "cors";
import morgan from "morgan";
import { ZodError } from "zod";
import { config } from "./config.js";
import { getDb } from "./db/index.js";
import { agentsRouter } from "./routes/agents.js";
import { datasetsRouter } from "./routes/datasets.js";
import { metricsRouter } from "./routes/metrics.js";
import { tasksRouter } from "./routes/tasks.js";
import { runsRouter } from "./routes/runs.js";
import { compareRouter } from "./routes/compare.js";
import { resumeOrphanedRuns } from "./services/taskRunner.js";

export function buildApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  if (config.nodeEnv !== "test") {
    app.use(morgan("tiny"));
  }

  app.get("/api/health", (_req, res) => res.json({ ok: true, env: config.nodeEnv }));

  app.use("/api/agents", agentsRouter);
  app.use("/api/datasets", datasetsRouter);
  app.use("/api/metrics", metricsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/runs", runsRouter);
  app.use("/api/compare", compareRouter);

  app.use((err: any, _req: express.Request, res: express.Response,
           _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "validation_error", issues: err.issues });
    }
    console.error(err); // eslint-disable-line no-console
    res.status(500).json({ error: String(err?.message ?? err) });
  });

  return app;
}

export function startServer() {
  getDb(); // initialize schema
  resumeOrphanedRuns();
  const app = buildApp();
  app.listen(config.port, () => {
    console.log(`[eval-api] listening on http://localhost:${config.port}`); // eslint-disable-line no-console
  });
}

// auto-start when executed directly (not when imported from tests)
const isDirect = (() => {
  try {
    const url = new URL(`file://${process.argv[1] ?? ""}`).href;
    return url === import.meta.url;
  } catch {
    return false;
  }
})();

if (isDirect) {
  startServer();
}
