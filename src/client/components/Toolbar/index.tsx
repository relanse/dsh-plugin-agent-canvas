import { useI18n } from '../../i18n'

export function Toolbar({ onRun, onStop, onClear, running }: { onRun: () => void; onStop: () => void; onClear: () => void; running: boolean }) {
  const { t } = useI18n()
  return (
    <header className="toolbar">
      <span className="toolbar__title">Agent Canvas</span>
      {!running
        ? <button className="btn btn--primary" onClick={onRun}>▶ {t('toolbar.run')}</button>
        : <button className="btn btn--ghost" onClick={onStop}>■ {t('toolbar.stop')}</button>
      }
      <button className="btn btn--ghost" onClick={onClear} disabled={running}>{t('toolbar.clear')}</button>
    </header>
  )
}
