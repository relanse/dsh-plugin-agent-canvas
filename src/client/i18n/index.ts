/**
 * i18n 适配层：词表注册进 DSH 官方 locale 服务，组件侧 API（t / useI18n）不变。
 *
 * - attachI18n(ctx) 由插件入口调用：ctx.locale.register 注册 zh/en 双词典、
 *   bind 拿到稳定翻译函数、订阅平台快照驱动组件重渲染
 * - 无宿主环境（单测 / 独立运行）时 t 回退内置 zh 词表，组件照常工作
 * - 语言切换、持久化、浏览器检测、zh→en 回退链全部由平台 locale 服务负责，
 *   本模块不再自建这些机制
 */

import { useSyncExternalStore } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { zh, type MessageKey } from './locales/zh'
import { en } from './locales/en'

export { type MessageKey } from './locales/zh'
export type Messages = Record<MessageKey, string>

/** 注册进 ctx.locale 的命名空间 */
export const NS = 'agent-canvas'

export type Locale = 'zh' | 'en'

interface LocaleService {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  bind(ns: string): Translate
  subscribe(fn: () => void): () => void
  getLocale(): { active: string; revision: number }
}

let platformT: Translate | undefined
let getPlatformSnapshot: (() => { active: string; revision: number }) | undefined

const listeners = new Set<() => void>()
const STANDALONE_SNAPSHOT = { active: 'zh', revision: 0 }

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): { active: string; revision: number } {
  return getPlatformSnapshot?.() ?? STANDALONE_SNAPSHOT
}

/**
 * 插件激活时由入口调用，把词表挂到平台 locale 服务上。
 * 注册与订阅都放进 ctx.effect，插件卸载时自动注销。
 */
export function attachI18n(ctx: {
  effect(fn: () => unknown): unknown
  locale: LocaleService
}): void {
  const { locale } = ctx
  ctx.effect(() => locale.register(NS, { zh, en }))
  platformT = locale.bind(NS)
  getPlatformSnapshot = () => locale.getLocale()
  ctx.effect(() => locale.subscribe(() => notify()))
}

/** 取词并做 {name} 插值；平台缺失 key 时由其回退链兜底，独立模式回退 zh 词表 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  if (platformT) return platformT(key, params)
  const template = zh[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  )
}

/** 组件内订阅语言变化：const { t } = useI18n() */
export function useI18n(): {
  t: typeof t
  locale: Locale
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  return { t, locale: snapshot.active === 'en' ? 'en' : 'zh' }
}
