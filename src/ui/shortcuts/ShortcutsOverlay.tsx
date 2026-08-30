import { SHORTCUT_ROWS } from "./labels";

interface Props {
  open: boolean;
}

export function ShortcutsOverlay({ open }: Props) {
  if (!open) return null;
  return (
    <div className="shortcuts-overlay" data-testid="shortcuts">
      <div className="shortcuts-card">
        <header>
          <h2>Shortcuts</h2>
          <p>Split is S. Save is Ctrl+S. Cut is Ctrl+X. Copy is Ctrl+C. Paste is Ctrl+V.</p>
        </header>
        <dl>
          {SHORTCUT_ROWS.map((row) => (
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
