#!/usr/bin/env bash
# SSE 冒烟测试：向 /api/execute 提交三节点工作流（tool → condition → tool），
# 校验事件序列完整性，并实测 TTFB（首字节到达耗时）。
# 用法：./backend/scripts/sse-smoke.sh [base-url]，默认 http://localhost:8080
set -euo pipefail

BASE="${1:-http://localhost:8080}"
BODY='{
  "userInput": "冒烟测试",
  "nodes": [
    {"id": "calc", "type": "tool",
     "data": {"toolName": "calculator", "staticArgs": {"expression": "12*12"}}},
    {"id": "cond", "type": "condition",
     "data": {"condition": "len == 3"}},
    {"id": "wc", "type": "tool",
     "data": {"toolName": "string_transform", "staticArgs": {"text": "{{__last__}}", "operation": "word_count"}}}
  ],
  "edges": [
    {"source": "calc", "target": "cond"},
    {"source": "cond", "target": "wc"}
  ]
}'

OUT=".sse-smoke.tmp.$$"
trap 'rm -f "$OUT"' EXIT
# -N 关闭 curl 缓冲，time_starttransfer 即 TTFB（收到响应首字节的时间）
# 注意：不用 mktemp——Git Bash 的 /tmp 路径与 Windows 原生 curl 不互通
TTFB=$(curl -sN -o "$OUT" -w "%{time_starttransfer}" \
  -X POST "$BASE/api/execute" \
  -H "Content-Type: application/json" \
  -d "$BODY")

echo "== SSE 事件流 =="
grep -o '"type":"[a-z_]*"' "$OUT" | sed 's/"type":"//;s/"$//' | nl

echo
echo "== TTFB（首字节）：${TTFB}s =="
echo "== 总耗时：$(curl -s -o /dev/null -w '%{time_total}' -X POST "$BASE/api/execute" -H 'Content-Type: application/json' -d "$BODY")s =="
echo "== 响应字节数：$(wc -c < "$OUT") =="

# 序列断言：calc(144,3字符→true) → cond(true,4字符) → wc(1)
EXPECTED='workflow_start
node_start
tool_call
tool_result
node_done
node_start
node_done
node_start
tool_call
tool_result
node_done
workflow_done'

ACTUAL="$(grep -o '"type":"[a-z_]*"' "$OUT" | sed 's/"type":"//;s/"$//')"
if [ "$ACTUAL" = "$EXPECTED" ]; then
  echo "== 事件序列校验：PASS（12 个事件，顺序正确） =="
else
  echo "== 事件序列校验：FAIL =="; echo "期望："; echo "$EXPECTED"; exit 1
fi
