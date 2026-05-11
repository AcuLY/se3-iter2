# SE-3 Iter2 演示视频生成 — AI Agent 操作指南

> 本文档面向 AI Agent，提供从零生成项目演示视频的完整流程和脚本说明。

## 项目概览

SE-3 Iter2 包含两个核心模块：

1. **Travel Agent** — 基于 LangGraph 的旅行规划 Agent，融合 Plan-and-Execute + ReAct + Reflexion 三种推理范式
2. **Eval Platform** — Agent 评估平台，提供注册 Agent、管理数据集、创建评测任务、运行评测、对比分析等完整工作流

演示顺序：**先让 Agent 工作（CLI → Gradio Web）→ 再在评估平台评测**

## 前置条件

| 依赖 | 用途 | 安装 |
|------|------|------|
| Node.js ≥ 18 | Playwright + Eval Platform | 系统自带 |
| Python 3.10+ | Travel Agent | 系统自带 |
| ffmpeg | 视频转码/合成 | `brew install ffmpeg` |
| edge-tts | 中文 TTS 配音 | `pip install edge-tts` |
| Playwright | 浏览器自动化录制 | `npx playwright install chromium` |

## 服务端口映射

| 服务 | 端口 | 启动命令 |
|------|------|---------|
| Travel Agent Gradio | 7860 | `python -m travel_agent.app_web` |
| Travel Agent HTTP | 8088 | `python -m travel_agent.server` |
| Eval Platform 前端 | 5173 | `npm run dev`（apps/web） |
| Eval Platform 后端 | 3001 | `npm run dev`（apps/api） |

**MOCK 模式**：Travel Agent `.env` 中 `OPENAI_API_KEY=` 留空即可，无需真实 API Key。

## 核心脚本：full-demo.js

一站式脚本，完成 TTS 配音生成 → Playwright 录制 → 视频合成全流程。

```bash
cd demo && node full-demo.js
```

### 脚本内部流程

```
Step 1: 生成 TTS 配音 (edge-tts, zh-CN-YunxiNeural)
Step 2: 生成 SRT 字幕
Step 3: 生成片头/片尾纯色卡片视频
Step 4: 清理旧录制
Step 5: Playwright 录制三段视频
        ├─ CLI 终端模拟 (本地 HTML 模拟终端输出)
        ├─ Gradio Web 界面 (localhost:7860)
        └─ Eval Platform 完整流程 (localhost:5173)
Step 6: webm → mp4 转换
Step 7: 每段视频与配音合并 (stream_loop 补足短画面)
Step 8: concat 合成 + SRT 字幕烧入
```

### 旁白段落定义 (SEGMENTS 数组)

每段含 `id`、`narration`（中文旁白文案）、`duration`（预估秒数）：

| 序号 | id | 内容 | 预估时长 |
|------|----|------|---------|
| 0 | 01-intro | 项目概览介绍 | 22s |
| 1 | 02-cli | CLI 终端运行 Agent | 18s |
| 2 | 03-gradio | Gradio Web 界面 | 16s |
| 3 | 04-eval-overview | 评估平台概览 | 16s |
| 4 | 05-eval-agents | Agent 注册 & Ping | 14s |
| 5 | 06-eval-datasets | 数据集管理 | 14s |
| 6 | 07-eval-task-create | 创建评测任务（4步向导） | 22s |
| 7 | 08-eval-run | 运行评测 | 18s |
| 8 | 09-eval-results | 查看评测结果 & 对比 | 20s |
| 9 | 10-outro | 结束语 | 16s |

### 视频合成逻辑

- 片头/片尾：纯色卡片 + SRT 烧字（`ffmpeg subtitles` filter），配音通过 `-stream_loop -1` 循环卡片画面
- CLI：本地 HTML 模拟终端（`assets/cli-terminal.html`），逐行滚动录制
- Gradio：Playwright 自动输入目标 → 提交 → 等待 Agent 输出 → 滚动浏览
- Eval：Playwright 完整操作 Dashboard → Agents(Ping) → Datasets(详情) → 新建任务(4步) → 运行评测 → 查看结果 → Compare → Metrics
- 每段视频与配音取 `max(视频时长, 音频时长)`，短画面通过 `stream_loop` 循环补足
- 最终 concat 所有片段 + SRT 字幕烧入

## 辅助脚本

| 文件 | 用途 |
|------|------|
| `playwright-travel-agent.js` | 单独录制 Gradio 界面 |
| `playwright-eval-platform.js` | 单独录制 Eval Platform（旧版，仅浏览） |
| `edit-video.sh` | 单独执行视频剪辑合成 |
| `master-demo.sh` | 旧版主控脚本（启动服务→录制→合成） |

## 修改指南

### 修改旁白文案
编辑 `full-demo.js` 中 `SEGMENTS` 数组的 `narration` 字段。

### 修改演示操作流程
编辑 `full-demo.js` 中对应的 `recordXxx()` 函数：
- `recordCLI()` — 终端模拟内容和滚动节奏
- `recordGradio()` — 输入文本、等待时间、滚动方式
- `recordEvalPlatform()` — 页面导航顺序、表单填写、按钮点击

### 调整视频时长
- 增加 `page.waitForTimeout()` 数值 → 录制更长
- 修改 `SEGMENTS` 的 `duration` → 调整配音预估时长
- 修改 `viewport` 和 `recordVideo.size` → 调整分辨率

### 修改 TTS 声音
替换 `edge-tts --voice` 参数，可用声音：
- `zh-CN-YunxiNeural` — 男声（默认）
- `zh-CN-XiaoxiaoNeural` — 女声
- `zh-CN-YunjianNeural` — 男声（更沉稳）

## 生成产物

| 路径 | 说明 |
|------|------|
| `recordings/*.webm` | Playwright 原始录制 |
| `recordings/*.mp4` | 转码后的录制 |
| `voiceover/*.mp3` | 每段旁白的 TTS 音频 |
| `subtitles/demo.srt` | 合并字幕文件 |
| `tmp_segments/seg-*.mp4` | 各段配音+视频合并片段 |
| `final/se3-iter2-demo-final.mp4` | **最终输出视频** |

## 已知限制

1. **ffmpeg drawtext 不支持中文**：macOS 默认编译的 ffmpeg 缺少 freetype，无法使用 drawtext 渲染中文。改用 `subtitles` filter 烧入 SRT。
2. **Eval 录制可能偏短**：Mock 模式下评测执行极快（<1s），需通过 `waitForTimeout` 人为拉长停留时间。
3. **Playwright strict mode**：Eval Platform Dashboard 上 Agent 卡片和侧边栏都有 `/agents` 链接，必须用 `aside a[href="/agents"]` 精确定位侧边栏链接。
4. **Gradio Mock 快速返回**：Agent 在 Mock 模式下约2秒即完成，需在提交后增加足够等待模拟"思考过程"。

## 端到端执行清单

```bash
# 1. 确保依赖就绪
cd /path/to/se3-iter2/demo
npm install
npx playwright install chromium
pip install edge-tts

# 2. 启动所有服务（4个终端窗口）
# Terminal 1: Travel Agent Gradio
cd ../travel-agent && source .venv/bin/activate && python -m travel_agent.app_web
# Terminal 2: Travel Agent HTTP Server
cd ../travel-agent && source .venv/bin/activate && python -m travel_agent.server
# Terminal 3: Eval Platform (前后端同时)
cd ../eval-platform && npm run dev

# 3. 预填充测试数据（首次需要）
cd ../eval-platform && node smoke.mjs

# 4. 运行录制
cd /path/to/se3-iter2/demo
node full-demo.js

# 5. 查看结果
open final/se3-iter2-demo-final.mp4
```
