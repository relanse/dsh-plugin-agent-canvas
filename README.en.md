# dsh-plugin-agent-canvas

English | [简体中文](README.md)

A visual Agent workflow orchestration plugin: drag-and-drop DAG editor with a GenUI streaming execution panel. It runs inside the DeepSeek Shell (DSH) plugin system — a Go backend handles Kahn topological scheduling and SSE event streams, while a React Flow frontend renders the canvas and drives GenUI components by event type. The frontend is pure TypeScript, bundled by tsdown into `lib/client.js` for the DSH host to load.

## Features

- **Drag-and-drop DAG editing** — four node types (LLM / Tool / Condition / RAG), connect freely into a directed acyclic graph
- **Pre-execution cycle detection** — Kahn's algorithm delivers cycle validation and a topological order in one traversal; cyclic graphs get an HTTP 400
- **GenUI streaming panel** — the backend emits typed JSON events (`tool_call`, `llm_chunk`, `node_error`, …) and the frontend maps each `type` to a dedicated React component
- **Two-layer loop guard** — static cycle detection plus a runtime `maxSteps` cap on tool calls, with a `step_limit_warning` event 3 steps before the cap
- **Unified tool registry** — tools register once with a JSON Schema; `GET /api/tools` serves both LLM Function Calling and the frontend node palette
- **Internationalization (i18n)** — UI strings and docs both ship in Chinese and English, see below

## Project Layout

```
├── src/                  # DSH plugin (TypeScript, Cordis-based)
│   ├── index.ts          # Host entry: registers the run_workflow tool
│   └── client/           # Client side: AgentCanvas panel (React + TS)
│       ├── components/   # Toolbar / NodePalette / Canvas nodes / GenUIPanel
│       ├── hooks/        # useDAG / useSSE / useNodeStatus
│       ├── i18n/         # i18n runtime and message catalogs (zh-CN / en-US)
│       └── styles/       # tokens.css / app.css
├── backend/              # Go backend: DAG executor + tool registry
│   ├── executor/         # Kahn's sort, SSE run loop
│   └── tools/            # Tool definitions and dispatch
├── docs/                 # English docs (architecture / tooling guide)
│   └── zh-CN/            # Chinese docs
├── manifest.json         # DSH plugin manifest
└── tsdown.config.ts      # Bundle config (outputs lib/index.js + lib/client.js)
```

## Quick Start

### 1. Start the Go backend

```bash
cd backend
go run main.go        # listens on :8080 by default; override with PORT
```

Health check: `GET http://localhost:8080/api/health`

### 2. Build the plugin

```bash
npm install           # requires the DSH workspace to resolve @deepseek-ai/* deps
npm run bundle        # tsdown bundles lib/index.js and lib/client.js
npm run watch         # incremental build during development
```

The host-side tool honors the `AGENT_CANVAS_BACKEND` env var (defaults to `http://localhost:8080`).

Outside the DSH workspace you can still run a local typecheck smoke test (`@deepseek-ai/*` is stubbed with minimal interfaces in `typecheck-stubs.d.ts`):

```bash
npm i --no-save typescript @types/react react react-dom reactflow
npx tsc -p typecheck.tsconfig.json
```

## Internationalization (i18n)

UI strings never live inside components — everything goes through message catalogs:

- `src/client/i18n/locales/zh-CN.ts` — Simplified Chinese catalog, also the type baseline (the `Messages` shape is derived from it)
- `src/client/i18n/locales/en-US.ts` — English catalog, structurally forced to match the Chinese one; a missing key fails at compile time
- The runtime resolves strings via `t('key', params)` with `{name}` interpolation; `useI18n()` subscribes to locale changes on top of `useSyncExternalStore`
- Locale priority: explicit user choice (localStorage) > the DSH platform `locale` service > browser language > zh-CN; `src/client/index.ts` initializes from the platform locale on plugin activation
- Adding a language: copy a catalog file and register it in the `catalogs` map in `i18n/index.ts`

Docs are bilingual: English originals live in `docs/`, Chinese translations in `docs/zh-CN/`, with cross-links at the top of every file.

## Documentation

| Topic | English | 简体中文 |
|---|---|---|
| Architecture deep-dive (DAG engine / GenUI protocol) | [ARCHITECTURE](docs/ARCHITECTURE.md) | [ARCHITECTURE](docs/zh-CN/ARCHITECTURE.md) |
| Adding custom tools | [TOOLS](docs/TOOLS.md) | [TOOLS](docs/zh-CN/TOOLS.md) |

## License

MIT © relanse
