import { useI18n } from '../i18n'
import type { CallState } from '../types/toolview'

interface CallBannerProps {
  /** 仅有可导入内容（AI 真实调用过）时显示 */
  visible: boolean
  state: CallState
  nodeCount: number
  userInput: string
  output: string | null
}

const STATE_KEY = {
  running: 'toolview.running',
  ok: 'toolview.ok',
  error: 'toolview.error',
  stopped: 'toolview.stopped',
} as const

/** DSH 调用卡片顶部信息条：导入摘要 + 调用生命周期状态 + 可展开的调用输出 */
export function CallBanner({ visible, state, nodeCount, userInput, output }: CallBannerProps): JSX.Element | null {
  const { t } = useI18n()
  if (!visible) return null
  return (
    <div className={`call-banner call-${state}`}>
      <span className="call-dot" aria-hidden />
      <span className="call-import">{t('toolview.imported', { count: nodeCount })}</span>
      {userInput !== '' && (
        <span className="call-input">
          {t('toolview.userInput')}：{userInput}
        </span>
      )}
      <span className={`call-state st-${state}`}>{t(STATE_KEY[state])}</span>
      {output !== null && (
        <details className="call-output">
          <summary>{t('toolview.output')}</summary>
          <pre>{output}</pre>
        </details>
      )}
    </div>
  )
}
