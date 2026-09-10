# Architecture Deep-Dive

This document explains the design decisions behind the two most interesting parts of the system: the DAG execution engine and the GenUI streaming protocol.

---

## DAG Execution Engine

### Why a DAG?

A simple linear chain of nodes would be enough for "search → summarise" workflows. But real Agent tasks need branching (condition nodes) and, eventually, parallelism (two independent research steps running concurrently). A DAG is the minimal structure that handles both without special-casing either.

### Cycle Detection — Kahn's Algorithm

Before any node runs, `executor/dag.go` runs Kahn's topological sort. The algorithm maintains an in-degree counter for every node. Nodes with in-degree 0 are added to a queue. Each time a node is processed, the in-degrees of its successors are decremented; any that reach 0 join the queue. When the queue empties, if the number of processed nodes is less than the total, at least one node was never reachable — which means it sits in a cycle.

This gives two things for the price of one traversal: a cycle check **and** a valid execution order. Time complexity O(V + E).

```
Input graph:   node-2 → node-1 → node-3
in-degrees:    node-2:0, node-1:1, node-3:1
queue seed:    [node-2]
step 1:        process node-2, decrement node-1 → 0, queue=[node-1]
step 2:        process node-1, decrement node-3 → 0, queue=[node-3]
step 3:        process node-3, queue=[]
processed=3 == total=3 ✓  order=[node-2, node-1, node-3]
```

### Runtime Loop Guard

Kahn prevents structural cycles in the graph. But an LLM node can still loop at runtime by repeatedly calling a tool that returns unsatisfying results. The `maxSteps` counter in `executeLLMNode` is the second line of defense: each tool call increments a counter, and when it hits the cap the node returns an error rather than hanging. Three steps before the cap a `step_limit_warning` event fires so the frontend can alert the user before hard termination.

### Node Context Passing

Nodes communicate via `ExecutionContext` — a `map[string]string` keyed by node ID. Each node reads upstream outputs and writes its own. Template substitution (`{{nodeId}}`) happens at the last moment, just before an LLM call, so a system prompt like `"Summarise: {{node-2}}"` receives the actual text from node-2 at runtime.

---

## GenUI Streaming Protocol

### Why Not Plain Text Streaming?

Standard LLM streaming sends text tokens one by one. The frontend can only append them into a single string. That's fine for a chat box, but it throws away all the semantic structure of an Agent run — the user can't see which token came from which tool call, or why the Agent decided to search again.

GenUI solves this by making the backend emit **typed events** instead of raw text. The backend knows what it's doing at each step; it just needs to declare it. The frontend maps each `type` to a React component.

```
Backend emits:                        Frontend renders:
{ type: "node_start", … }         →  NodeStartBadge
{ type: "tool_call", … }          →  ToolCallCard loading
{ type: "llm_chunk", text: "R" }  →  LLMStreamCard appends "R"
{ type: "tool_result", … }        →  ToolCallCard with result + ms
{ type: "node_done", … }          →  NodeDoneBadge with duration
```

The `EventRenderer` switch in `GenUIPanel/index.jsx` is the only place this mapping lives. Adding a new event type: emit it in Go, handle it in `EventRenderer`, write a component.

### Why fetch + ReadableStream instead of EventSource?

The native `EventSource` API only supports GET requests. We need POST to send the DAG JSON in the request body. `fetch` with a `ReadableStream` reader gives identical incremental delivery with full request control.

### Preventing nginx Buffering

By default, nginx buffers upstream responses before forwarding. For SSE this means events accumulate silently until the buffer fills. The `X-Accel-Buffering: no` response header tells nginx to disable buffering for this response.

---

## Tool Registry Design

The registry is a `map[string]*ToolDef` behind a `sync.RWMutex`. Tools register in `init()` functions so they're available before the first request. The `Parameters` field is a `map[string]interface{}` that serialises directly to the JSON Schema shape the OpenAI API expects.

`GET /api/tools` returns the same schema objects to the frontend. The NodePalette renders them as drag targets. One source of truth for tool metadata, consumed by both the AI and the human operator.
