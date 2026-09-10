/**
 * English dictionary — 本文件由 scripts/i18n-sync.mjs 自动生成，请勿手工编辑。
 * 简体中文词表 locales/zh.ts 是唯一事实来源；新增或修改文案后运行：
 *   npm run i18n:sync   （缺失 key 由 DeepSeek 自动翻译补齐）
 */

import type { MessageKey } from './zh'

export type Messages = Record<MessageKey, string>

export const en: Messages = {
  // 工具栏
  "toolbar.run": "Run",

  "toolbar.stop": "Stop",
  "toolbar.clear": "Clear",

  // 节点面板
  "palette.heading": "Nodes",

  "palette.llm.label": "LLM Node",
  "palette.llm.desc": "DeepSeek chat + tool calls",
  "palette.tool.label": "Tool Node",
  "palette.tool.desc": "Invoke a registered tool",
  "palette.condition.label": "Condition",
  "palette.condition.desc": "Branch on output",
  "palette.rag.label": "RAG Node",
  "palette.rag.desc": "Vector retrieval & recall",

  // 画布节点：默认标题与字段名
  "node.llmTitle": "LLM Node",

  "node.toolTitle": "Tool Node",
  "node.conditionTitle": "Condition",
  "node.ragTitle": "RAG Node",
  "node.model": "Model",
  "node.modelDefault": "Default backend model",
  "node.systemPrompt": "System prompt",
  "node.maxSteps": "Max steps",
  "node.tool": "Tool",
  "node.condition": "Condition expression",
  "node.knowledgeBase": "Knowledge base",
  "node.recallRerank": "Recall / Rerank",
  "node.notConfigured": "Not configured",
  "node.defaultPrompt": "You are a helpful assistant.",

  // toolview 调用卡片
  "toolview.imported": "Imported AI workflow ({count} nodes)",

  "toolview.userInput": "User input",
  "toolview.running": "AI call in progress…",
  "toolview.ok": "AI call complete",
  "toolview.error": "AI call failed",
  "toolview.stopped": "AI call interrupted",
  "toolview.output": "Call output",

  // GenUI 流式面板
  "genui.llmOutput": "LLM Output",

  "genui.calling": "Calling…",
  "genui.retry": "Retry {count}",
  "genui.done": "Done",
  "genui.statusIdle": "Ready",
  "genui.statusRunning": "Executing…",
  "genui.statusDone": "Done — {ms}ms",
  "genui.statusError": "Error: {error}",
  "genui.unknownError": "Unknown error",
  "genui.nodeFailed": "Node {nodeId} failed",
  "genui.workflowError": "Workflow error",
  "genui.stepLimitWarning": "Step limit approaching ({current}/{max})",
  "genui.emptyHint": "Drag nodes onto the canvas, connect them, then click \"Run\" to watch execution live.",
}
