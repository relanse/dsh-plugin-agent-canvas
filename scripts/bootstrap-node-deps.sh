#!/usr/bin/env bash
# 开发环境 node_modules 引导（Windows Git Bash）。
#
# 背景：本仓库的 @deepseek-ai/* 依赖是 workspace:^ 协议，npm 无法直接安装；
# pnpm 对 junction 挂载的 workspace 包又不会物化 node_modules。
# 开发期方案：junction 指向本机 DSH harness 源码 + 类型桩 + npm --no-save 装公开依赖。
# 注意：任何 npm install 都可能清空 node_modules（全树对齐），重跑本脚本即可恢复。
#
# 用法：DSH_ROOT=/path/to/deepseek-harness bash scripts/bootstrap-node-deps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DSH_ROOT:?请先设置 DSH_ROOT 指向本机 deepseek-harness 检出目录}"

echo "→ 仓库：$ROOT"
echo "→ harness：$DSH_ROOT"

mkdir -p "$ROOT/node_modules/@deepseek-ai"

# ---------- 1. 公开依赖（--no-save，避免 workspace:^ 解析失败） ----------
# 必须最先执行：npm 会全树对齐、清掉它不认识的一切（包括 junction 和类型桩）
echo "→ npm --no-save 安装公开依赖…"
pushd "$ROOT" >/dev/null
mv package.json package.json.bootstrap-bak
npm install --no-save tsdown@0.22.2 typescript@5 @types/react react react-dom reactflow husky@9.1.7
mv package.json.bootstrap-bak package.json
popd >/dev/null

mkdir -p "$ROOT/node_modules/@deepseek-ai"

# ---------- 2. junction：真实包（cordis 提供类型，dsh-tools 提供 defineTool 实实现） ----------
link_junction() {
  local name="$1" target="$2"
  local dest="$ROOT/node_modules/@deepseek-ai/$name"
  if [ -e "$dest" ]; then
    echo "  = $name 已存在，跳过"
  else
    cmd //c mklink //J "$(cygpath -w "$dest")" "$(cygpath -w "$target")" >/dev/null
    echo "  + $name → $target"
  fi
}
link_junction cordis "$DSH_ROOT/vendor/cordis"
link_junction dsh-tools "$DSH_ROOT/packages/core/tools"

# ---------- 2. 类型桩：dsh-client-* 四件套（仅类型声明合并，无运行时） ----------
stub() {
  local name="$1" root_dts="$2" client_dts="$3"
  local dir="$ROOT/node_modules/@deepseek-ai/$name"
  mkdir -p "$dir"
  [ -n "$root_dts" ] && printf '%s\n' "$root_dts" > "$dir/index.d.ts"
  printf '%s\n' "$client_dts" > "$dir/client.d.ts"
  cat > "$dir/package.json" <<EOF
{
  "name": "@deepseek-ai/$name",
  "version": "0.0.0-dev-stub",
  "types": "./index.d.ts",
  "exports": {
    ".": { "types": "./index.d.ts" },
    "./client": { "types": "./client.d.ts" }
  }
}
EOF
  echo "  + $name（类型桩）"
}

stub dsh-client-ui-slots \
  'export type Translate = (key: string, params?: Record<string, string | number>) => string' \
  "import type { Translate } from './index'

export interface SlotConfig { name: string; key: string; locale?: string }

export interface SlotsService {
  inject(name: string, factory: () => unknown): () => void
  register(config: SlotConfig, component: unknown): unknown
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: SlotsService
  }
}"

stub dsh-client-locale \
  'export {}' \
  "export interface LocaleService {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  bind(ns: string): import('@deepseek-ai/dsh-client-ui-slots').Translate
  subscribe(fn: () => void): () => void
  getLocale(): { active: string; revision: number }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    locale: LocaleService
  }
}"

stub dsh-client-ui-renderer \
  'export {}' \
  'export {}'

stub dsh-client-ui-primitives \
  'export {}' \
  'export {}'

echo "✓ node_modules 引导完成（注意：npm 的全树对齐可能再次清空它，重跑本脚本即可）"
