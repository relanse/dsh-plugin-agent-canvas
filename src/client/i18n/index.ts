/**
 * 轻量 i18n 运行时：词表查值 + 语言订阅，无第三方依赖。
 *
 * - t(key, params) 在组件渲染期同步取词，缺 key 时回退默认语言，再回退 key 本身
 * - useI18n() 基于 useSyncExternalStore 订阅语言切换，setLocale 后整棵组件树自动重渲染
 * - 语言优先级：用户手动选择（localStorage）> DSH 平台 locale 服务 > 浏览器语言 > zh-CN
 * - DSH 平台侧在插件激活时调用 initI18n(platformLocale)，优先级高于浏览器检测
 */

import { useSyncExternalStore } from 'react'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'
import type { MessageKey, Messages } from './locales/en-US'

export type Locale = 'zh-CN' | 'en-US'
export type { MessageKey, Messages }

export const LOCALES: readonly Locale[] = ['zh-CN', 'en-US'] as const

const DEFAULT_LOCALE: Locale = 'zh-CN'
const STORAGE_KEY = 'agent-canvas-locale'

const catalogs: Record<Locale, Messages> = { 'zh-CN': zhCN, 'en-US': enUS }

const listeners = new Set<() => void>()
let currentLocale: Locale = detectLocale()

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** 把任意 BCP-47 标签（'zh'、'en-US'、'en_us'…）归一到受支持的 Locale */
export function normalizeLocale(tag: string | undefined | null): Locale | undefined {
  if (!tag) return undefined
  const lower = tag.toLowerCase()
  if (isLocale(lower)) return lower as Locale
  if (lower.startsWith('zh')) return 'zh-CN'
  if (lower.startsWith('en')) return 'en-US'
  return undefined
}

function detectLocale(): Locale {
  try {
    const normalized = normalizeLocale(localStorage.getItem(STORAGE_KEY))
    if (normalized) return normalized
  } catch {
    // 沙箱环境可能禁用 localStorage，静默降级
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : undefined
  return normalizeLocale(nav) ?? DEFAULT_LOCALE
}

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getLocale(): Locale {
  return currentLocale
}

/** 切换语言。persist=false 供平台 locale 服务驱动时使用（不写 localStorage） */
export function setLocale(locale: Locale, options?: { persist?: boolean }): void {
  if (!isLocale(locale) || locale === currentLocale) return
  currentLocale = locale
  if (options?.persist !== false) {
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // 同上，静默降级
    }
  }
  notify()
}

/** 插件激活时由入口调用，platformLocale 来自 DSH locale 服务（可为空） */
export function initI18n(platformLocale?: string | null): Locale {
  let stored: Locale | undefined
  try {
    stored = normalizeLocale(localStorage.getItem(STORAGE_KEY))
  } catch {
    stored = undefined
  }
  // 用户在面板里手动选过的语言优先于平台默认
  const fromPlatform = normalizeLocale(platformLocale)
  const fromBrowser = normalizeLocale(typeof navigator !== 'undefined' ? navigator.language : undefined)
  currentLocale = stored ?? fromPlatform ?? fromBrowser ?? DEFAULT_LOCALE
  notify()
  return currentLocale
}

/** 取词并做 {name} 插值；缺 key 时先回退默认语言，再回退 key 本身便于排查 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template =
    catalogs[currentLocale][key] ?? catalogs[DEFAULT_LOCALE][key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  )
}

/** 组件内订阅语言变化：const { t, locale, setLocale } = useI18n() */
export function useI18n(): {
  t: typeof t
  locale: Locale
  setLocale: typeof setLocale
} {
  const locale = useSyncExternalStore(subscribe, getLocale)
  return { t, locale, setLocale }
}
