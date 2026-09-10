/**
 * tsdown 双入口构建，对齐 DSH 官方 clientBundle 预设（packages/client/tsdown.client.ts）：
 *
 * - Host 半（lib/index.js）：ESM / Node。生产依赖（peer: @deepseek-ai/cordis）保持
 *   external 由宿主解析，其余依赖（dsh-tools 的 defineTool）内联——独立安装也能跑
 * - Client 半（lib/client.js）：CJS / 浏览器，由 window.__ModuleLoader__.load 的
 *   factory 包装；平台模块（react 家族 / cordis / ui-slots 等）external，
 *   经注入的 require 从宿主模块表解析，reactflow 等其余依赖全部内联
 * - 全局 CSS 不走 tsdown 样式管线：自定义插件转成运行时注入 <style> 的模块，
 *   与官方 dsh-css-global-inline 行为一致（未压缩版）
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import { defineConfig } from 'tsdown'

const PKG_ID = '@relanse/dsh-plugin-agent-canvas'

/** 与 DSH 平台共享的模块表（官方 PLATFORM_MODULES），require 由宿主注入 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const HOST_EXTERNALS = [/^@deepseek-ai\/cordis(?:\/|$)/]

/** 全局 CSS → 幂等注入 <style data-plugin-css> 的 ES 模块（复刻官方预设行为） */
function dshCssGlobalInline(id: string) {
  const PREFIX = '\0dsh-global-css:'
  const SUFFIX = '.mjs'
  return {
    name: 'dsh-css-global-inline',
    resolveId(source: string, importer: string | undefined) {
      if (importer === undefined || !source.endsWith('.css') || source.endsWith('.module.css')) {
        return null
      }
      let file: string
      if (source.startsWith('.')) {
        // 插件自己的样式：相对导入
        file = resolvePath(dirname(importer), source)
      } else {
        // 依赖包携带的样式（如 reactflow/dist/style.css）：走 Node 解析
        try {
          file = createRequire(importer).resolve(source)
        } catch {
          return null
        }
      }
      return PREFIX + file + SUFFIX
    },
    load(this: { addWatchFile(file: string): void }, virtualId: string) {
      if (!virtualId.startsWith(PREFIX)) return null
      const fileId = virtualId.slice(PREFIX.length, -SUFFIX.length)
      this.addWatchFile(fileId)
      const css = readFileSync(fileId, 'utf8')
      const tagId = `${id}/${basename(fileId)}`
      const source = [
        `const css = ${JSON.stringify(css)};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
        "  const tag = document.createElement('style');",
        `  tag.dataset.plugin = ${JSON.stringify(id)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        'export {};',
      ].join('\n')
      return source
    },
  }
}

export default defineConfig([
  // Host 半：Node 加载，产出 lib/index.js + lib/index.d.ts
  {
    name: PKG_ID,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: (specifier: string) => HOST_EXTERNALS.some((re) => re.test(specifier)),
      alwaysBundle: (specifier: string) => !HOST_EXTERNALS.some((re) => re.test(specifier)),
    },
  },
  // Client 半：浏览器 CJS 工厂包，产出 lib/client.js（类型不在此生成：
  // banner 会被包进 .d.cts 导致解析失败，同官方预设置 dts: false）
  {
    name: `${PKG_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: (specifier: string) => PLATFORM_MODULES.includes(specifier),
      alwaysBundle: (specifier: string) => !PLATFORM_MODULES.includes(specifier),
    },
    plugins: [dshCssGlobalInline(PKG_ID)],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PKG_ID)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
