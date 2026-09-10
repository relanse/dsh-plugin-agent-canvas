# dsh-plugin-agent-canvas

简体中文 | [English](README.en.md)

可视化 Agent 工作流编排插件：拖拽式 DAG 编辑器 + GenUI 流式执行面板。在 DeepSeek Shell（DSH）插件体系中运行，后端用 Go 实现 Kahn 拓扑排序调度与 SSE 事件流，前端用 React Flow 渲染画布、按事件类型驱动 GenUI 组件。前端全部使用 TypeScript，经 tsdown 构建为 `lib/client.js` 由 DSH 宿主加载。

## 功能特性

- **拖拽式 DAG 编辑** —— LLM / 工具 / 条件 / RAG 四类节点，自由连线成有向无环图
- **分层并发调度** —— Kahn 分层拓扑：同层互不依赖的节点以 goroutine 并发执行（`sync.WaitGroup`），任一节点失败即取消整层；事件流经 mutex 串行化保证单节点内顺序稳定
- **执行前环检测** —— 分层 Kahn 一次遍历同时完成环校验与分层排序，带环的图直接 HTTP 400
- **GenUI 流式面板** —— 后端推送带类型的 JSON 事件（`tool_call`、`llm_chunk`、`node_error`…），前端把每种 `type` 映射为专属 React 组件；同一 LLM 节点的流式 chunk 合并为一张连续输出卡片
- **toolview 调用上下文** —— 面板消费 DSH 注入的 `ToolCallOwnerProps`：AI 调用 `run_workflow` 提交的节点图自动水合进画布（分层自动布局 + fitView），调用状态与输出展示在信息条
- **画布编辑持久化** —— 每张调用卡按 `callId` 独立存储（localStorage 防抖写入），刷新后用户编辑优先于调用参数重新水合
- **双层循环防护** —— 静态环检测 + 运行时 `maxSteps` 工具调用上限，逼近上限前 3 步发出 `step_limit_warning`
- **统一工具注册表** —— 工具以 JSON Schema 注册一次，`GET /api/tools` 同时供 LLM Function Calling 与前端节点面板消费
- **国际化（i18n）** —— 中文词表为唯一事实来源，英文词表由 DeepSeek 自动翻译生成（`npm run i18n:sync`），pre-commit 校验双语同步

## 目录结构

```
├── src/                  # DSH 插件（TypeScript，Cordis 体系）
│   ├── index.ts          # Host 端入口：注册 run_workflow 工具
│   └── client/           # Client 端：AgentCanvas 面板（React + TS）
│       ├── components/   # Toolbar / NodePalette / Canvas 节点 / GenUIPanel
│       ├── hooks/        # useDAG / useSSE / useNodeStatus
│       ├── i18n/         # 国际化运行时与词表（zh-CN / en-US）
│       └── styles/       # tokens.css / app.css
├── backend/              # Go 后端：DAG 执行器 + 工具注册表
│   ├── executor/         # Kahn 排序、SSE 运行循环
│   └── tools/            # 工具定义与分发
├── docs/                 # 英文文档（架构 / 工具指南）
│   └── zh-CN/            # 中文文档
├── manifest.json         # DSH 插件清单
└── tsdown.config.ts      # 插件打包配置（产物 lib/index.js + lib/client.js）
```

## 快速开始

### 1. 启动 Go 后端

```bash
cd backend
go run main.go        # 默认监听 :8080，可用 PORT 环境变量覆盖
```

健康检查：`GET http://localhost:8080/api/health`；默认模型：`GET /api/config`。

LLM 节点需要真实模型调用，在 `backend/.env` 配置（该文件已 gitignore）：

```
DEEPSEEK_API_KEY=sk-xxx        # 必填（仅 LLM 节点需要）
DEEPSEEK_MODEL=deepseek-chat   # 可选，工作流引擎默认模型
DEEPSEEK_BASE_URL=             # 可选，默认 https://api.deepseek.com/v1
```

验证脚本：`bash backend/scripts/sse-smoke.sh`（三节点链事件序列 + TTFB 实测）、
`curl -X POST localhost:8080/api/execute -d @backend/scripts/llm-e2e.json`（真实 API 端到端）。

### 2. 构建插件

```bash
npm run bundle        # tsdown 打包 + 产物自检（schema 投影 / 依赖内联断言）
npm run watch         # 开发时增量构建
```

Host 端工具调用后端地址可用 `AGENT_CANVAS_BACKEND` 环境变量覆盖（默认 `http://localhost:8080`）。

仓库的 `@deepseek-ai/*` 依赖为 DSH workspace 协议：DSH 检出内用 pnpm 直接装；
独立环境下运行 `DSH_ROOT=/path/to/harness bash scripts/bootstrap-node-deps.sh`
引导开发依赖（junction + 类型桩 + 公开依赖）。

## 国际化（i18n）

UI 文案不写死在组件里，统一走词表：

- `src/client/i18n/locales/zh.ts` —— 简体中文词表，唯一事实来源（`MessageKey` 类型由它推导）
- `src/client/i18n/locales/en.ts` —— 英文词表，**自动生成**：新增/修改中文文案后运行
  `npm run i18n:sync`，缺失 key 由 DeepSeek（JSON 模式）翻译补齐，`{name}` 插值占位符强制保留
- 运行时经 `ctx.locale.register('agent-canvas', {zh, en})` 注册进 DSH 官方 locale 服务，
  语言切换与持久化由平台负责；独立渲染时回退内置中文词表
- `npm run i18n:check`（pre-commit 钩子内置）校验双语同步，缺失即拦截提交

文档双语：英文原文在 `docs/`，中文版在 `docs/zh-CN/`，各文件顶部有互相跳转链接。

## 文档

| 主题 | 中文 | English |
|---|---|---|
| 架构深入解析（DAG 引擎 / GenUI 协议） | [ARCHITECTURE](docs/zh-CN/ARCHITECTURE.md) | [ARCHITECTURE](docs/ARCHITECTURE.md) |
| 添加自定义工具 | [TOOLS](docs/zh-CN/TOOLS.md) | [TOOLS](docs/TOOLS.md) |

## License

MIT © relanse
