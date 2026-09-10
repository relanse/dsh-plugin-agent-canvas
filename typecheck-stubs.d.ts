// 类型冒烟检查用的 stub 声明：@deepseek-ai/* 只在 DSH workspace 内可用，
// 本地无依赖时以最小接口形态替代，仅用于 tsc 语法/类型验证。
declare module '@deepseek-ai/cordis' {
  export interface Context {
    tools: { register(tool: unknown): void }
    slots: {
      inject(slot: string, factory: () => unknown): unknown
      register(info: { name: string; key: string; locale?: string }, component: unknown): unknown
    }
    locale: {
      register(ns: string, dicts: Record<string, Record<string, string>>): () => void
      bind(ns: string): (key: string, params?: Record<string, unknown>) => string
      subscribe(fn: () => void): () => void
      getLocale(): { active: string; revision: number }
    }
    effect(fn: () => unknown): unknown
    on(event: string, fn: (...args: unknown[]) => void): void
  }
}
declare module '@deepseek-ai/dsh-tools' {
  // 最小形状 stub：仅为让 defineTool 的回调参数获得上下文类型，
  // 真实包在 DSH workspace 内提供完整类型
  export interface ToolDefinition {
    name: string
    description: string
    parameters: Record<string, unknown>
    output: {
      schema: unknown
      render: (args: unknown, value: unknown) => Array<{ type: string; text?: string }>
    }
    execute(args: unknown): Promise<unknown>
  }
  export function defineTool<T extends ToolDefinition>(tool: T): T
}
declare module '@deepseek-ai/dsh-client-ui-renderer/client' {}
declare module '@deepseek-ai/dsh-client-ui-slots/client' {}
declare module '@deepseek-ai/dsh-client-ui-locale/client'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  export type Translate = (key: string, params?: Record<string, unknown>) => string
}
declare module '*.css'
declare const process: { env: Record<string, string | undefined> }
