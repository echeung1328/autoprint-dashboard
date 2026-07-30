#!/usr/bin/env bash
# =============================================================================
# verify_edge_function_ui.sh  —  Edge Function / 静态页 浏览器渲染验证脚本
#
# 用途（对应 AutoPrint 部署验证检查清单 v1.0 / Issue #38）：
#   任何返回 UI/HTML 的函数部署后，用真实浏览器验证「页面真的渲染了」，
#   而不是被 Supabase 网关 rewrite 成 text/plain 显示源码。
#
# 依赖：agent-browser（npm i -g agent-browser）
#
# 用法：
#   bash scripts/verify_edge_function_ui.sh "<URL>" [截图路径]
# 示例：
#   bash scripts/verify_edge_function_ui.sh \
#     "https://echeung1328.github.io/autoprint-dashboard/approval.html" \
#     ./verify_shot.png
#
# 退出码：0 = 渲染正常(PASS)   1 = 失败(FAIL)
# =============================================================================

set -u  # 未定义变量即报错（不使用 set -e，以便自行判定 PASS/FAIL）

URL="${1:-}"
SHOT="${2:-./verify_shot.png}"

if [ -z "$URL" ]; then
  echo "用法: bash scripts/verify_edge_function_ui.sh \"<URL>\" [截图路径]"
  exit 1
fi

# 确保 agent-browser 可用
if ! command -v agent-browser >/dev/null 2>&1; then
  echo "[FAIL] 未找到 agent-browser，请先安装：npm i -g agent-browser"
  exit 1
fi

echo "==> 验证目标: $URL"

# 1) 打开页面并等待加载
agent-browser open "$URL" >/dev/null 2>&1
agent-browser wait --load networkidle >/dev/null 2>&1

# 2) 抓取关键证据
TITLE=$(agent-browser get title 2>/dev/null | tr -d '\r')
CT=$(agent-browser eval 'document.contentType' 2>/dev/null | tr -d '"\r')
HAS_DOM=$(agent-browser eval 'String(!!document.querySelector("form,div,h1,h2,p,button"))' 2>/dev/null | tr -d '"\r')
FINAL_URL=$(agent-browser get url 2>/dev/null | tr -d '\r')

# 3) 截图留痕
#    agent-browser 截图固定存到自身临时目录并打印路径，--screenshot-dir 不可靠，
#    故捕获打印出的路径再 cp 到目标位置。
SHOT_DIR=$(cd "$(dirname "$SHOT")" 2>/dev/null && pwd)
SHOT_NAME=$(basename "$SHOT")
mkdir -p "$SHOT_DIR"
SNAP_OUT=$(agent-browser screenshot 2>&1)
SNAP_SRC=$(echo "$SNAP_OUT" | grep -oE '[A-Za-z]:\\.*\.png|/.*\.png' | head -1)
if [ -n "$SNAP_SRC" ] && [ -f "$SNAP_SRC" ]; then
  cp "$SNAP_SRC" "$SHOT_DIR/$SHOT_NAME"
else
  echo "[WARN] 未能定位截图文件，原始输出: $SNAP_OUT"
fi

# 4) 清理浏览器会话
agent-browser close >/dev/null 2>&1

# 5) 输出证据
echo "    最终 URL    : $FINAL_URL"
echo "    页面标题    : $TITLE"
echo "    Content-Type: $CT"
echo "    含可交互DOM : $HAS_DOM"
echo "    截图已保存  : $SHOT"

# 6) 判定
PASS=true
if [ "$CT" != "text/html" ]; then
  echo "[FAIL] Content-Type 不是 text/html（被网关 rewrite 或函数直出 HTML 于默认域名）"
  PASS=false
fi
if [ "$HAS_DOM" != "true" ]; then
  echo "[FAIL] 页面未渲染出 DOM（可能是 HTML 源码被当纯文本显示）"
  PASS=false
fi

if [ "$PASS" = "true" ]; then
  echo "==== RESULT: PASS ✅ 页面已正确渲染（非源码） ===="
  exit 0
else
  echo "==== RESULT: FAIL ❌ 请回到部署验证检查清单 §2 排查架构 ===="
  exit 1
fi
