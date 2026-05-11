#!/bin/bash
# ============================================================
#  SE-3 Iter2 视频剪辑合成脚本
#  将片头、各段录制视频、片尾合成为最终演示视频
# ============================================================

set -e
DEMO_DIR="/Users/luca/se3-iter2/demo"
ASSETS_DIR="$DEMO_DIR/assets"
RECORDINGS_DIR="$DEMO_DIR/recordings"
FINAL_DIR="$DEMO_DIR/final"
FINAL_VIDEO="$FINAL_DIR/se3-iter2-demo-final.mp4"

mkdir -p "$FINAL_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ============================================================
#  收集 Playwright 录制的视频文件
# ============================================================
info "收集 Playwright 录制视频..."
PLAYWRIGHT_VIDEOS=()
if [ -d "$RECORDINGS_DIR" ]; then
  while IFS= read -r -d '' file; do
    PLAYWRIGHT_VIDEOS+=("$file")
  done < <(find "$RECORDINGS_DIR" -name "*.webm" -print0 2>/dev/null | head -10)
fi

info "找到 ${#PLAYWRIGHT_VIDEOS[@]} 个 Playwright 录制文件:"
for f in "${PLAYWRIGHT_VIDEOS[@]}"; do echo "  - $f"; done

# ============================================================
#  将 webm 转为 mp4（统一格式）
# ============================================================
CONVERTED_VIDEOS=()
for vid in "${PLAYWRIGHT_VIDEOS[@]}"; do
  base=$(basename "$vid" .webm)
  out="$RECORDINGS_DIR/${base}.mp4"
  info "转换: ${base}.webm -> .mp4"
  ffmpeg -y -i "$vid" -c:v libx264 -crf 22 -c:a aac "$out" 2>/dev/null || \
    cp "$vid" "$out"
  CONVERTED_VIDEOS+=("$out")
done

# ============================================================
#  汇编所有视频片段列表
# ============================================================
MERGE_LIST="$DEMO_DIR/merge-list.txt"
> "$MERGE_LIST"

add_if_exists() {
  if [ -f "$1" ]; then
    echo "file '$1'" >> "$MERGE_LIST"
    info "添加片段: $1"
  else
    warn "文件不存在，跳过: $1"
  fi
}

add_if_exists "$ASSETS_DIR/intro.mp4"
for f in "${CONVERTED_VIDEOS[@]}"; do add_if_exists "$f"; done
if [ ${#CONVERTED_VIDEOS[@]} -eq 0 ]; then
  warn "没有找到 Playwright 录制，创建 placeholder..."
  ffmpeg -y -f lavfi -i "color=c=0x2d2d44:size=1920x1080:d=30" \
    -vf "drawtext=text='Demo Placeholder':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2" \
    "$ASSETS_DIR/placeholder.mp4" 2>/dev/null
  add_if_exists "$ASSETS_DIR/placeholder.mp4"
fi
add_if_exists "$ASSETS_DIR/outro.mp4"

# ============================================================
#  用 ffmpeg concat 合成最终视频
# ============================================================
if [ -s "$MERGE_LIST" ]; then
  info "合成最终视频: $FINAL_VIDEO"
  ffmpeg -y -f concat -safe 0 -i "$MERGE_LIST" \
    -c:v libx264 -crf 20 -preset medium -c:a aac -b:a 192k \
    "$FINAL_VIDEO" 2>/dev/null

  if [ -f "$FINAL_VIDEO" ]; then
    info "=========================================="
    info "最终视频生成成功！"
    info "路径: $FINAL_VIDEO"
    ffprobe -v quiet -print_format json -show_format -show_streams "$FINAL_VIDEO" 2>/dev/null | grep -E "duration|size" | head -5
    info "=========================================="
  else
    error "视频合成失败"
  fi
else
  error "没有可合成的视频片段"
fi

info "如需重新录制，请运行: bash $DEMO_DIR/master-demo.sh"
