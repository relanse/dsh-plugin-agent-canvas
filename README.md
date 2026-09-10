# dsh-plugin-agent-canvas

简体中文 | [English](README.en.md)

可视化 Agent 工作流编排插件：拖拽式 DAG 编辑器 + GenUI 流式执行面板。在 DeepSeek Shell（DSH）插件体系中运行，后端用 Go 实现 Kahn 拓扑排序调度与 SSE 事件流，前端用 React Flow 渲染画布、按事件类型驱动 GenUI 组件。前端全部使用 TypeScript，经 tsdown 构建为 `lib/client.js` 由 DSH 宿主加载。

## 功能特性

- **拖拽式 DAG 编辑** —— LLM / 工具 / 条件 / RAG 四类节点，自由连线成有向无环图
- **执行前环检测** —— Kahn 算法一次遍历同时完成环校验与拓扑排序，带环的图直接 HTTP 400
- **GenUI 流式面板** —— 后端推送带类型的 JSON 事件（`tool_call`、`llm_chunk`、`node_error`…），前端把每种 `type` 映射为专属 React 组件
- **双层循环防护** —— 静态环检测 + 运行时 `maxSteps` 工具调用上限，逼近上限前 3 步发出 `step_limit_warning`
- **统一工具注册表** —— 工具以 JSON Schema 注册一次，`GET /api/tools` 同时供 LLM Function Calling 与前端节点面板消费
- **国际化（i18n）** —— UI 文案与文档均支持中英双语，详见下文

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

健康检查：`GET http://localhost:8080/api/health`

### 2. 构建插件

```bash
npm install           # 需在 DSH workspace 内解析 @deepseek-ai/* 依赖
npm run bundle        # tsdown 打包，产出 lib/index.js 与 lib/client.js
npm run watch         # 开发时增量构建
```

Host 端工具调用后端地址可用 `AGENT_CANVAS_BACKEND` 环境变量覆盖（默认 `http://localhost:8080`）。

不在 DSH workspace 内时也可以做本地类型冒烟检查（`@deepseek-ai/*` 由 `typecheck-stubs.d.ts` 提供最小接口 stub）：

```bash
npm i --no-save typescript @types/react react react-dom reactflow
npx tsc -p typecheck.tsconfig.json
```

## 国际化（i18n）

UI 文案不写死在组件里，统一走词表：

- `src/client/i18n/locales/zh-CN.ts` —— 简体中文词表，同时是类型基准（`Messages` 结构由它推导）
- `src/client/i18n/locales/en-US.ts` —— 英文词表，结构强制对齐中文词表，漏译会在编译期报错
- 运行时通过 `t('key', params)` 取文案并做 `{name}` 插值；`useI18n()` 基于 `useSyncExternalStore` 订阅语言切换
- 语言优先级：用户手动选择（localStorage）> DSH 平台 `locale` 服务 > 浏览器语言 > zh-CN；插件激活时由 `src/client/index.ts` 读取平台语言初始化
- 新增语言：复制一份词表文件、在 `i18n/index.ts` 的 `catalogs` 中注册即可

文档双语：英文原文在 `docs/`，中文版在 `docs/zh-CN/`，各文件顶部有互相跳转链接。

## 文档

| 主题 | 中文 | English |
|---|---|---|
| 架构深入解析（DAG 引擎 / GenUI 协议） | [ARCHITECTURE](docs/zh-CN/ARCHITECTURE.md) | [ARCHITECTURE](docs/ARCHITECTURE.md) |
| 添加自定义工具 | [TOOLS](docs/zh-CN/TOOLS.md) | [TOOLS](docs/TOOLS.md) |

## License

MIT © relanse
