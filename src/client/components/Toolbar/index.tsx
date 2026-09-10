export function Toolbar({ onRun, onStop, onClear, running }: { onRun: () => void; onStop: () => void; onClear: () => void; running: boolean }) {
  return (
    <header className="toolbar">
      <span className="toolbar__title">Agent Canvas</span>
      {!running
        ? <button className="btn btn--primary" onClick={onRun}>▶ 运行</button>
        : <button className="btn btn--ghost" onClick={onStop}>■ 停止</button>
      }
      <button className="btn btn--ghost" onClick={onClear} disabled={running}>清空</button>
    </header>
  )
}
