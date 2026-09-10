/**
 * 简体中文词表 —— 类型基准（MessageKey 由本文件推导）。
 * key 采用扁平点路径，模板支持 {name} 插值，与 DSH locale 服务的
 * LocaleDict 约定一致；通过 ctx.locale.register('agent-canvas', {zh, en}) 注册。
 */

export const zh = {
  // 工具栏
  'toolbar.run': '运行',
  'toolbar.stop': '停止',
  'toolbar.clear': '清空',

  // 节点面板
  'palette.heading': '节点',
  'palette.llm.label': 'LLM 节点',
  'palette.llm.desc': 'DeepSeek 对话 + 工具调用',
  'palette.tool.label': '工具节点',
  'palette.tool.desc': '调用已注册工具',
  'palette.condition.label': '条件判断',
  'palette.condition.desc': '根据输出分支',
  'palette.rag.label': 'RAG 节点',
  'palette.rag.desc': '向量检索召回',

  // 画布节点：默认标题与字段名
  'node.llmTitle': 'LLM 节点',
  'node.toolTitle': '工具节点',
  'node.conditionTitle': '条件判断',
  'node.ragTitle': 'RAG 节点',
  'node.model': '模型',
  'node.modelDefault': '后端默认模型',
  'node.systemPrompt': '提示词',
  'node.maxSteps': '最大步数',
  'node.tool': '工具',
  'node.condition': '条件表达式',
  'node.knowledgeBase': '知识库',
  'node.recallRerank': '召回 / 重排',
  'node.notConfigured': '未配置',
  'node.defaultPrompt': '你是一个乐于助人的助手。',

  // toolview 调用卡片
  'toolview.imported': '已导入 AI 提交的工作流（{count} 个节点）',
  'toolview.userInput': '用户输入',
  'toolview.running': 'AI 调用执行中…',
  'toolview.ok': 'AI 调用完成',
  'toolview.error': 'AI 调用失败',
  'toolview.stopped': 'AI 调用已中断',
  'toolview.output': '调用输出',

  // GenUI 流式面板
  'genui.llmOutput': 'LLM 输出',
  'genui.calling': '调用中…',
  'genui.retry': '重试 {count}',
  'genui.done': '完成',
  'genui.statusIdle': '就绪',
  'genui.statusRunning': '执行中…',
  'genui.statusDone': '完成 — {ms}ms',
  'genui.statusError': '错误：{error}',
  'genui.unknownError': '未知错误',
  'genui.nodeFailed': '节点 {nodeId} 执行失败',
  'genui.workflowError': '工作流错误',
  'genui.stepLimitWarning': '步数即将耗尽（{current}/{max}）',
  'genui.emptyHint': '拖入节点并连线，点击"运行"查看实时执行过程。',
} as const

export type MessageKey = keyof typeof zh
