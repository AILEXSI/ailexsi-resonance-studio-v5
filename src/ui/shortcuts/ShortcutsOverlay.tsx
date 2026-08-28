interface Props {
  open: boolean;
}

const ROWS: { key: string; action: string }[] = [
  { key: "Space", action: "Play / Pause" },
  { key: "V", action: "Split (cut)" },
  { key: "I", action: "Set IN" },
  { key: "O", action: "Set OUT" },
  { key: "X", action: "Clear IN/OUT" },
  { key: "M", action: "Add marker" },
  { key: "Del", action: "Delete clip" },
  { key: "← / →", action: "Step ±1 frame" },
  { key: "Ctrl+Z", action: "Undo" },
  { key: "Ctrl+Y", action: "Redo" },
  { key: "Ctrl+C", action: "Copy" },
  { key: "Ctrl+V", action: "Paste" },
  { key: "?", action: "Toggle this sheet" },
];

export function ShortcutsOverlay({ open }: Props) {
  if (!open) return null;
  return (
    <div className="shortcuts-overlay" data-testid="shortcuts">
      <div className="shortcuts-card">
        <header>
          <h2>Shortcuts</h2>
          <p>Cut is V. C is free for copy.</p>
        </header>
        <dl>
          {ROWS.map((row) => (
            <div key={row.key}>
              <dt>
                <kbd>{row.key}</kbd>
              </dt>
              <dd>{row.action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
