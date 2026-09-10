import { defineConfig } from 'tsdown'

export default defineConfig([
  // Host 端：注册 run_workflow 工具
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    outDir: 'lib',
    dts: { only: false },
    external: [/^@deepseek-ai\//],
    clean: false,
  },
  // Client 端：浏览器侧 UI 插件
  {
    entry: { client: 'src/client/index.ts' },
    format: ['esm'],
    outDir: 'lib',
    dts: { only: false },
    external: [/^@deepseek-ai\//, 'react', 'react-dom', 'reactflow'],
    clean: false,
  },
])
