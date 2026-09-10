/**
 * Client 端插件入口：向 DSH 的 slots 注册 AgentCanvas 面板组件。
 *
 * 依赖链：inject: ['slots', 'locale'] 让 Cordis 等待槽注册表和国际化服务就绪。
 * 渲染链路：DSH tool.call.toolview slot → AgentCanvasPanel → Canvas + GenUIPanel
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 以下 type-only import 触发 ctx.slots / ctx.locale 的声明合并
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { AgentCanvasPanel } from './AgentCanvasPanel.tsx'

export const name = 'agent-canvas-client'

// Cordis 在这两个服务就绪前将本插件保持 PENDING 状态
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  // 向 tool.call.toolview slot 注册 AgentCanvas 面板
  // ctx.slots.inject 返回的 disposer 由 Cordis effect 在插件卸载时自动调用
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register(
      {
        name: 'tool.call.toolview',
        // key 与 host 端注册的工具名对应，DSH 据此路由到本组件
        key: 'run_workflow',
      },
      AgentCanvasPanel,
    ),
  )
}
