#!/bin/bash
# ============================================================
#  SE-3 Iter2 完整演示视频主控脚本
#  功能：启动服务 → 录制各段落 → 剪辑合成最终视频
#  时长目标：5-8 分钟
# ============================================================

set -e
PROJECT_ROOT="/Users/luca/se3-iter2"
DEMO_DIR="$PROJECT_ROOT/demo"
RECORDINGS_DIR="$DEMO_DIR/recordings"
FINAL_DIR="$DEMO_DIR/final"
ASSETS_DIR="$DEMO_DIR/assets"

mkdir -p "$RECORDINGS_DIR" "$FINAL_DIR" "$ASSETS_DIR"

# ============================================================
#  Color output helpers
# ============================================================
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ============================================================
#  Step 1: 生成片头片尾（ffmpeg 文字卡片）
# ============================================================
info "=== Step 1: 生成片头片尾卡片 ==="
ffmpeg -y -f lavfi -i color=c=0x1a1a2e:size=1920x1080:d=5 \
  -vf "drawtext=text='SE-3 Iter2 项目演示':fontcolor=white:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2-60:fontfile=/System/Library/Fonts/STHeiti Medium.ttc,
       drawtext=text='旅行规划 Agent + 评估平台':fontcolor=0x4ecdc4:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2+40:fontfile=/System/Library/Fonts/STHeiti Medium.ttc,
       drawtext=text='Python LangGraph + React Vite + SQLite':fontcolor=0xcccccc:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2+120:fontfile=/System/Library/Fonts/STHeiti Medium.ttc" \
  "$ASSETS_DIR/intro.mp4" 2>/dev/null

ffmpeg -y -f lavfi -i color=c=0x1a1a2e:size=1920x1080:d=5 \
  -vf "drawtext=text='感谢观看':fontcolor=white:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2-40:fontfile=/System/Library/Fonts/STHeiti Medium.ttc,
       drawtext=text='github.com/AcuLY/se3-iter2':fontcolor=0x4ecdc4:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2+60:fontfile=/System/Library/Fonts/STHeiti Medium.ttc" \
  "$ASSETS_DIR/outro.mp4" 2>/dev/null

info "片头片尾已生成: $ASSETS_DIR/intro.mp4 $ASSETS_DIR/outro.mp4"

# ============================================================
#  Step 2: 启动 Travel Agent (MOCK 模式)
# ============================================================
info "=== Step 2: 启动 Travel Agent 服务 (MOCK 模式) ==="
cd "$PROJECT_ROOT/travel-agent"
source .venv/bin/activate

# 确保 .env 存在且为 MOCK 模式（不填 API KEY）
if [ ! -f .env ]; then cp .env.example .env; fi
# 清空 API KEY 以强制 MOCK 模式
sed -i '' 's/^OPENAI_API_KEY=.*/OPENAI_API_KEY=/' .env 2>/dev/null || true

# 启动 Gradio 服务（后台）
info "启动 Gradio 服务 (http://localhost:7860)..."
python -m travel_agent.app_web --server-port 7860 &
GRADIO_PID=$!
sleep 8

# 检查服务是否启动
if ! curl -s http://localhost:7860 > /dev/null; then
  warn "Gradio 服务可能未成功启动，继续尝试..."
fi

# ============================================================
#  Step 3: 录制 Travel Agent Gradio 演示
# ============================================================
info "=== Step 3: 录制 Travel Agent Gradio Web 演示 ==="
cd "$DEMO_DIR"
if command -v npx &> /dev/null; then
  npx playwright install chromium 2>/dev/null || true
  npx playwright execute playwright-travel-agent.js 2>&1 || \
  node playwright-travel-agent.js 2>&1 || \
  echo "Playwright 脚本执行失败，请手动运行: node playwright-travel-agent.js"
else
  warn "Playwright 不可用，跳过 Gradio 录制"
fi
sleep 3

# ============================================================
#  Step 4: 录制 Travel Agent CLI 演示 (MOCK 模式)
# ============================================================
info "=== Step 4: 录制 Travel Agent CLI 演示 (MOCK 模式) ==="
cd "$PROJECT_ROOT/travel-agent"
source .venv/bin/activate

# 用 script 命令录制终端输出，然后用 ffmpeg 转成视频
# 也可以用 asciinema，但这里用 ffmpeg 直接录屏
info "请在另一个终端手动运行: python -m travel_agent.main --goal '杭州 3 天'"
info "录制完成后按回车继续..."
read

# ============================================================
#  Step 5: 启动 Eval Platform
# ============================================================
info "=== Step 5: 启动 Eval Platform 服务 ==="
cd "$PROJECT_ROOT/eval-platform"

# 启动 API 服务（后台）
info "启动 Eval Platform API (http://localhost:3001)..."
npm run api:dev &
API_PID=$!
sleep 5

# 启动 Web 服务（后台）
info "启动 Eval Platform Web (http://localhost:5173)..."
npm run web:dev &
WEB_PID=$!
sleep 8

# ============================================================
#  Step 6: 录制 Eval Platform 演示
# ============================================================
info "=== Step 6: 录制 Eval Platform Web 演示 ==="
cd "$DEMO_DIR"
npx playwright execute playwright-eval-platform.js 2>&1 || \
node playwright-eval-platform.js 2>&1 || \
echo "Playwright 脚本执行失败，请手动运行: node playwright-eval-platform.js"
sleep 3

# ============================================================
#  Step 7: 停止所有服务
# ============================================================
info "=== Step 7: 停止所有服务 ==="
kill $GRADIO_PID $API_PID $WEB_PID 2>/dev/null || true
pkill -f "travel_agent" 2>/dev/null || true
pkill -f "eval-platform" 2>/dev/null || true

# ============================================================
#  Step 8: 收集 Playwright 录制的视频，合成最终视频
# ============================================================
info "=== Step 8: 合成最终演示视频 ==="
bash "$DEMO_DIR/edit-video.sh"

info "=============================================="
info "演示视频制作完成！"
info "最终视频: $FINAL_DIR/se3-iter2-demo-final.mp4"
info "=============================================="
