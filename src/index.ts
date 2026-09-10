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
        '执行一个可视化 Agent 工作流。将 DAG 节点图提交给后端按拓扑顺序调度，返回执行摘要。',
      parameters: {
        nodes: {
          type: 'array',
          required: true,
          // items 省略 = 接受任意 JSON 元素；显式声明对齐官方工具写法
          items: { type: 'json' },
          description:
            'DAG 节点列表，每个节点含 id、type（llm/tool/condition/rag）和 data 配置',
        },
        edges: {
          type: 'array',
          required: true,
          items: { type: 'json' },
          description: '节点连接边列表，每条边含 source 和 target 节点 id',
        },
        userInput: {
          type: 'string',
          // 可选参数不写 required：DSL 约束为 required?: true，
          // 写 false 会让 defineTool 的 schema 投影直接失败
          description: '注入到第一个 LLM 节点的用户输入（可选）',
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
