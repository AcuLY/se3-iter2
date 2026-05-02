# Travel Agent

旅行规划 Agent，融合 **Plan-and-Execute**（任务分解）、**ReAct**（工具调用循环）、**Reflexion**（反思+重规划）三种推理框架。基于 [LangGraph](https://github.com/langchain-ai/langgraph) 实现的显式状态机，可以清晰地观察每一步的内部状态。

## 特性

- **多策略融合**：planner 产出有依赖关系的计划，每个步骤进入 ReAct 子循环执行工具调用，结果交给 reflector 评分；评分过低或步骤失败时触发 replan。
- **5 个真实工具**（OpenWeatherMap、Amadeus 航班、OpenTripMap 兴趣点、exchangerate.host 汇率、Tavily 搜索）。所有 HTTP 调用走统一 `errors.py` 装饰器：`tenacity` 指数退避重试 + 异常归一化为 `ToolExecutionError`。
- **MOCK 模式**：`.env` 中未配置 `OPENAI_API_KEY` 时，自动使用内置确定性 mock LLM，方便离线演示与 CI。工具同样在缺失 key 时返回结构化样例数据。
- **双可视化**：
  - CLI（`rich`）：实时分栏显示计划 / Thought-Action-Observation / 反思 / 工具耗时。
  - Web（`gradio`）：浏览器中流式查看完整 trace，最终行程渲染为 Markdown。
- **HTTP 服务**：`travel_agent.server` 暴露与评估平台对接的 OpenAI-style 端点 `POST /v1/run`，返回 `output + trace + token_usage + latency`。

## 快速开始

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env       # 至少留空所有 key 即可使用 MOCK 模式
python -m travel_agent.main --goal "杭州 3 天，预算 3000，偏好美食"
python -m travel_agent.app_web    # Gradio
python -m travel_agent.server     # 启动 HTTP 服务
pytest
```

## 架构

```
                    ┌─ planner ──────────────────────────┐
user_goal ────────► │  (Plan-and-Execute)                 │
                    │   produces JSON plan: [step, ...]   │
                    └────────┬────────────────────────────┘
                             ▼
                    ┌─ executor (ReAct) ─────────────────┐
                    │   loop: Thought → Action → Obs      │
                    │   tool_call → result | retry        │
                    └────────┬────────────────────────────┘
                             ▼
                    ┌─ reflector (Reflexion) ────────────┐
                    │   score step result, write note     │
                    │   if low score → replan remaining   │
                    └────────┬────────────────────────────┘
                             ▼
                    ┌─ compose ─────────────────────────┐
                    │   merge step drafts into itinerary │
                    └────────────────────────────────────┘
```

详细模块：

| 文件 | 职责 |
|---|---|
| `state.py` | Pydantic State |
| `planner.py` | 调用 LLM 输出结构化计划 |
| `executor.py` | ReAct 子循环 |
| `reflector.py` | 步骤评分 + replan 决策 |
| `graph.py` | LangGraph 编排 |
| `tools/*.py` | 5 个外部工具 |
| `errors.py` | 重试 + 异常归一化 |
| `tracing.py` | 事件总线（CLI/Web 订阅） |
| `llm.py` | OpenAI / MOCK 双模 |

## 评估平台对接

`POST /v1/run`：

```json
{ "input": "北京 2 天" }
```

响应：

```json
{
  "output": "<行程 markdown>",
  "trace": [{"node":"plan","data":{...}}, ...],
  "tool_calls": [{"name":"weather.get_forecast","args":{...},"result":{...}}],
  "latency_ms": 4321,
  "token_usage": {"prompt": 1200, "completion": 800}
}
```
