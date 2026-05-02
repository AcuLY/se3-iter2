# SE-3 Iter2 — 旅行规划 Agent + 评估平台

本仓库交付两个独立子系统：

| 子项目 | 技术栈 | 职责 |
|---|---|---|
| [`travel-agent/`](./travel-agent) | Python + LangGraph | 任务一：面向旅行规划的自主 Agent（Plan-and-Execute + ReAct + Reflexion 融合） |
| [`eval-platform/`](./eval-platform) | Node/Express + React/Vite + SQLite | 任务二：Agent 应用评估平台（前后端分离） |

详见各子目录的 README。

## 快速开始

### 旅行规划 Agent

```bash
cd travel-agent
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -e ".[dev]"
cp .env.example .env          # 填写 API keys；留空则使用内置 MOCK
python -m travel_agent.main --goal "杭州 3 天"
python -m travel_agent.app_web   # Gradio 可视化
pytest
```

### 评估平台

```bash
cd eval-platform
npm install
npm run build                 # 所有 workspace 类型检查 & 产物
npm run test
npm run dev                   # 同时拉起 api(3001) 与 web(5173)
```

## 提交约定

仓库假定有 6 位开发者（成员 A..F）共同维护。所有 commit 必须以成员前缀开头：

```
成员 A - feat(agent): add plan-and-execute skeleton
```

剥离 `成员 X - ` 前缀后，剩余部分遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

分工：

- **成员 A** — Task1 LangGraph 图与推理融合
- **成员 B** — Task1 工具集、错误处理、可视化
- **成员 C** — Task2 后端地基（DB、CRUD、shared types）
- **成员 D** — Task2 评估引擎与指标
- **成员 E** — Task2 前端骨架与任务管理
- **成员 F** — Task2 前端结果/对比可视化

## 关键文档

- [`AGENTS.md`](./AGENTS.md) — 作业原始说明
- [`travel-agent/README.md`](./travel-agent/README.md) — Agent 设计与 API 使用
- [`eval-platform/README.md`](./eval-platform/README.md) — 平台架构与 API 列表
