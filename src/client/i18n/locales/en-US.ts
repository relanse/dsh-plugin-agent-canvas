/**
 * English (US) catalog. Record<MessageKey, string> forces this file to cover
 * every key in zh-CN.ts (the type baseline) — a missing key fails compilation.
 */

import type zhCN from './zh-CN'

export type MessageKey = keyof typeof zhCN
export type Messages = Record<MessageKey, string>

const enUS: Messages = {
  // Toolbar

  'toolbar.run': 'Run',
  'toolbar.stop': 'Stop',
  'toolbar.clear': 'Clear',

  // Node palette
  'palette.heading': 'Nodes',
  'palette.llm.label': 'LLM Node',
  'palette.llm.desc': 'DeepSeek chat + tool calls',
  'palette.tool.label': 'Tool Node',
  'palette.tool.desc': 'Invoke a registered tool',
  'palette.condition.label': 'Condition',
  'palette.condition.desc': 'Branch on output',
  'palette.rag.label': 'RAG Node',
  'palette.rag.desc': 'Vector retrieval & recall',

  // Canvas nodes: default titles and field labels
  'node.llmTitle': 'LLM Node',
  'node.toolTitle': 'Tool Node',
  'node.conditionTitle': 'Condition',
  'node.ragTitle': 'RAG Node',
  'node.model': 'Model',
  'node.systemPrompt': 'System prompt',
  'node.maxSteps': 'Max steps',
  'node.tool': 'Tool',
  'node.condition': 'Condition expression',
  'node.knowledgeBase': 'Knowledge base',
  'node.recallRerank': 'Recall / Rerank',
  'node.notConfigured': 'Not configured',
  'node.defaultPrompt': 'You are a helpful assistant.',

  // GenUI streaming panel
  'genui.llmOutput': 'LLM Output',
  'genui.calling': 'Calling…',
  'genui.retry': 'Retry {count}',
  'genui.done': 'Done',
  'genui.statusIdle': 'Ready',
  'genui.statusRunning': 'Executing…',
  'genui.statusDone': 'Done — {ms}ms',
  'genui.statusError': 'Error: {error}',
  'genui.unknownError': 'Unknown error',
  'genui.nodeFailed': 'Node {nodeId} failed',
  'genui.workflowError': 'Workflow error',
  'genui.stepLimitWarning': 'Step limit approaching ({current}/{max})',
  'genui.emptyHint': 'Drag nodes onto the canvas, connect them, then click "Run" to watch execution live.',
}

export default enUS
