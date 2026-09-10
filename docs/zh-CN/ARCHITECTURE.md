# 架构深入解析

[English](../ARCHITECTURE.md) | 简体中文

本文档解释系统中最有趣的两部分背后的设计决策：DAG 执行引擎和 GenUI 流式协议。

---

## DAG 执行引擎

### 为什么用 DAG？

简单的线性节点链已经足以应付「搜索 → 总结」这类工作流。但真实的 Agent 任务需要分支（条件节点），并且最终需要并行（两个独立的研究步骤同时运行）。DAG 是能同时处理这两者、且无需为任何一方做特殊处理的最小结构。

### 环路检测 —— Kahn 算法

在任何节点运行之前，`executor/dag.go` 会先执行 Kahn 拓扑排序。该算法为每个节点维护一个入度计数器，入度为 0 的节点进入队列。每处理一个节点，就将其所有后继节点的入度减一；入度减到 0 的节点加入队列。当队列清空时，如果已处理节点数少于总数，说明至少有一个节点永远不可达 —— 即它处在一个环里。

一次遍历换来两样东西：环检测**和**一个合法的执行顺序。时间复杂度 O(V + E)。

```
输入图:        node-2 → node-1 → node-3
入度:          node-2:0, node-1:1, node-3:1
队列种子:      [node-2]
第 1 步:       处理 node-2，node-1 入度减 1 → 0，队列=[node-1]
第 2 步:       处理 node-1，node-3 入度减 1 → 0，队列=[node-3]
第 3 步:       处理 node-3，队列=[]
已处理=3 == 总数=3 ✓  顺序=[node-2, node-1, node-3]
```

### 运行时循环防护

Kahn 算法阻止的是图中的结构性环路。但 LLM 节点在运行时仍可能陷入循环 —— 反复调用一个总返回不满意结果的工具。`executeLLMNode` 中的 `maxSteps` 计数器是第二道防线：每次工具调用使计数器加一，达到上限时节点返回错误而不是挂死。距上限还剩三步时会先发出 `step_limit_warning` 事件，让前端能在硬终止之前提醒用户。

### 节点间上下文传递

节点之间通过 `ExecutionContext` 通信 —— 一个以节点 ID 为键的 `map[string]string`。每个节点读取上游输出并写入自己的输出。模板替换（`{{nodeId}}`）发生在最后一刻，也就是 LLM 调用之前，因此像 `"总结：{{node-2}}"` 这样的系统提示词在运行时会拿到 node-2 的真实文本。

---

## GenUI 流式协议

### 为什么不用纯文本流？

标准 LLM 流式接口逐个发送文本 token，前端只能把它们拼接成一个字符串。这对聊天框来说没问题，但它丢掉了 Agent 运行的全部语义结构 —— 用户看不出哪个 token 来自哪次工具调用，也看不出 Agent 为什么决定再次搜索。

GenUI 的解法是让后端发送**带类型的事件**而不是原始文本。后端在每一步都知道自己在做什么，只需把它声明出来。前端将每个 `type` 映射到一个 React 组件。

```
后端发送:                          前端渲染:
{ type: "node_start", … }       →  NodeStartBadge
{ type: "tool_call", … }        →  ToolCallCard 加载中
{ type: "llm_chunk", text: "R" }→  LLMStreamCard 追加 "R"
{ type: "tool_result", … }      →  ToolCallCard 显示结果 + 毫秒数
{ type: "node_done", … }        →  NodeDoneBadge 显示耗时
```

`src/client/components/GenUIPanel` 中 `EventRenderer` 的 switch 是这一映射的唯一存在地。新增事件类型的方式：在 Go 中发送它，在 `EventRenderer` 中处理它，再写一个组件。

### 为什么用 fetch + ReadableStream 而不是 EventSource？

原生 `EventSource` API 只支持 GET 请求，而我们需要 POST 来在请求体中发送 DAG JSON。`fetch` 配合 `ReadableStream` reader 能提供相同的增量送达，同时保留完整的请求控制能力。

### 防止 nginx 缓冲

默认情况下，nginx 会先缓冲上游响应再转发。对 SSE 来说，这意味着事件会悄无声息地积压，直到缓冲区被填满。响应头 `X-Accel-Buffering: no` 可以告诉 nginx 对这个响应禁用缓冲。

---

## 工具注册表设计

注册表是一个由 `sync.RWMutex` 保护的 `map[string]*ToolDef`。工具在 `init()` 函数中注册，因此在第一个请求到来之前就已就绪。`Parameters` 字段是 `map[string]interface{}`，可以直接序列化成 OpenAI API 所期望的 JSON Schema 形状。

`GET /api/tools` 把同样的 schema 对象返回给前端，NodePalette 将其渲染为可拖拽目标。工具元数据只有一份事实来源，AI 和人类操作者共同消费它。
