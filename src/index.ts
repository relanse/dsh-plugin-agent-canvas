/**
 * Host 端插件入口：向 DSH 的 tools 服务注册 run_workflow 工具。
 *
 * 依赖链：inject: ['tools'] 让 Cordis 等待工具注册表就绪后才激活本插件。
 * 工具调用链路：LLM → Function Calling → dsh-tools dispatcher → execute() → Go 后端
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'agent-canvas'
export const inject = ['tools']

interface DAGNode {
  id: string
  type: 'llm' | 'tool' | 'condition' | 'rag'
  data: Record<string, unknown>
}

interface DAGEdge {
  source: string
  target: string
}

interface WorkflowArgs {
  nodes: DAGNode[]
  edges: DAGEdge[]
  userInput?: string
}

export function apply(ctx: Context): void {
  ctx.tools.register(
    defineTool({
      name: 'run_workflow',
      description:
        '执行一个可视化 Agent 工作流（DAG 按拓扑序调度，返回最后输出）。' +
        '构造规则：① 用最少的节点完成任务——简单计算只需 1 个 tool 节点，不要加 LLM/条件节点；' +
        '② tool 节点 data 必填 {toolName: string, staticArgs: object}；' +
        '③ llm 节点 data 可选 {model?, systemPrompt?, maxSteps?, temperature?}，model 省略时用后端默认模型；' +
        '④ condition 节点 data 填 {condition: "len <op> N"}（op: > >= < <= ==）。' +
        '内置工具：calculator{expression:"A op B"}（op: + - * /，空格可有可无）、' +
        'string_transform{text, operation: uppercase|lowercase|reverse|word_count}、web_search{query}。' +
        'staticArgs 的值支持 "{{nodeId}}" 或 "{{__input__}}" 模板引用上游输出。',
      parameters: {
        nodes: {
          type: 'array',
          required: true,
          // items 省略 = 接受任意 JSON 元素；显式声明对齐官方工具写法
          items: { type: 'json' },
          description:
            'DAG 节点列表 [{id, type, data}]。type: "tool"（data 需 toolName + staticArgs）| ' +
            '"llm"（data 可选 systemPrompt/model 等）| "condition"（data.condition）| "rag"',
        },
        edges: {
          type: 'array',
          required: true,
          items: { type: 'json' },
          description: '节点连接边列表 [{source, target}]，source/target 为节点 id，不得成环',
        },
        userInput: {
          type: 'string',
          // 可选参数不写 required：DSL 约束为 required?: true，
          // 写 false 会让 defineTool 的 schema 投影直接失败
          description: '注入工作流的用户输入：LLM 节点未配置提示词时作为其输入，模板 {{__input__}} 可引用',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value as string }],
      },
      async execute(args) {
        const { nodes, edges, userInput } = args as WorkflowArgs
        const backendUrl =
          process.env['AGENT_CANVAS_BACKEND'] ?? 'http://localhost:8080'

        const res = await fetch(`${backendUrl}/api/execute-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodes, edges, userInput }),
        })

        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: `HTTP ${res.status}` }))
          throw new Error((err as { error: string }).error)
        }

        const result = (await res.json()) as { output: string }
        return result.output
      },
    }),
  )
}
