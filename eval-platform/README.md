# Eval Platform

Agent 应用评估平台。前后端分离 monorepo（npm workspaces）：

```
eval-platform/
├─ apps/
│  ├─ api/         Express + better-sqlite3 + TypeScript
│  └─ web/         React + Vite + TS + Tailwind
└─ packages/
   └─ shared/      DTO/类型/枚举（前后端共享的事实源）
```

## 快速开始

```bash
# 安装依赖（workspaces 一次解析）
npm install

# 构建 / 类型检查 / 测试
npm run build
npm run typecheck
npm run test

# 同时启动 api(3001) + web(5173)
npm run dev
```

数据库使用 SQLite（默认 `apps/api/data/eval.db`，自动创建）。RAGAS 通过 Python 子进程桥接，需要安装额外依赖：

```bash
pip install ragas datasets   # 仅当评估任务勾选 ragas.* 指标时需要
```

## 端到端联调

如果还想跑一次"前后端 + agent 端"完整联调，先在两个独立终端启动 agent 与 api，再跑 smoke 脚本：

```bash
# Terminal 1 — 启动旅行 agent (默认 :8088)
cd ../travel-agent && python -m travel_agent.server

# Terminal 2 — 启动评估平台后端 (默认 :3001)
cd eval-platform && npm run build && node apps/api/dist/server.js

# Terminal 3 — 一次性跑通注册→数据集→任务→2 个 run→自定义指标→对比
cd eval-platform && node scripts/smoke.mjs
```

`scripts/smoke.mjs` 也是非交互式的"线上回归"。任何前后端改动都可以用它快速验证。

## 核心特性

- **任务管理**：CRUD + 状态机（draft → queued → running → done/failed）
- **执行引擎**：内置 worker 顺序消费 run，调用 agent endpoint，对每条 dataset_item 跑所有指标，写聚合
- **指标矩阵**：
  - 显式：`token_cost`、`latency`、`tool_accuracy`、`success_rate`
  - 模糊（LLM-judge）：`reasoning_quality`、`hallucination`、`safety`、`interaction_ux`
  - RAGAS：`ragas.faithfulness`、`ragas.answer_relevancy`、`ragas.context_recall`
  - 自定义：上传 JS 片段（vm 沙箱）或克隆 LLM-judge 自定义 prompt
- **结果展示**：单次 run（卡片 + 每 item 详情 + trace 展开）+ 多 run 对比（表格 + 折线 + 雷达）

## API 速览

| Method | Path | 用途 |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/agents` | Agent 注册 |
| GET/POST/PATCH/DELETE | `/api/datasets` | 数据集 |
| POST | `/api/datasets/:id/items:bulk` | 批量上传 dataset items |
| GET/POST/PATCH/DELETE | `/api/tasks` | 评测任务 CRUD |
| POST | `/api/tasks/:id/run` | 触发执行 |
| GET | `/api/runs/:id` | 查询 run + 聚合 |
| GET | `/api/runs/:id/items` | 分页查询 run_items |
| GET | `/api/compare?runIds=a,b,c` | 多 run 对比 |
| GET/POST/PATCH/DELETE | `/api/metrics` | 指标管理 |
| POST | `/api/metrics/:id/preview` | 在示例上预览指标输出 |

详细字段见 `packages/shared/src/types.ts`。
