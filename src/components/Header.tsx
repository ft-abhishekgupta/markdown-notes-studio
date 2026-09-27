import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCENTS, useTheme } from '../lib/theme';
import { useWorkspace } from '../lib/workspace';
import { IconSearch, IconSun, IconMoon, IconSettings, IconX, IconPencil, IconEye, IconPanelLeft, IconPanelLeftClosed } from './Icons';

export function Header({
  onOpenPalette,
  onToggleSidebar,
  sidebarOpen,
  navCollapsed,
}: {
  onOpenPalette: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  navCollapsed: boolean;
}) {
  const { theme, toggleTheme, accent, setAccent, font, setFont } = useTheme();
  const { editable, editMode, setEditMode } = useWorkspace();
  const [settings, setSettings] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settings) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setSettings(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setSettings(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [settings]);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="header">
      <button
        className="btn btn-ghost btn-icon menu-btn"
        onClick={onToggleSidebar}
        aria-label={navCollapsed ? 'Show navigation' : 'Hide navigation'}
        aria-expanded={!navCollapsed}
        title={`${navCollapsed ? 'Show' : 'Hide'} navigation  (${isMac ? '⌘' : 'Ctrl'}+\\)`}
      >
        {sidebarOpen ? <IconX size={18} /> : navCollapsed ? <IconPanelLeftClosed size={18} /> : <IconPanelLeft size={18} />}
      </button>

      <Link to="/" className="brand">
        <span className="brand-mark">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v16H5.5A1.5 1.5 0 0 0 4 20.5Z" />
            <path d="M8.5 8h6M8.5 12h6" />
          </svg>
        </span>
        <span className="brand-text">
          <span style={{ display: 'block', lineHeight: 1.15 }}>Notes Studio</span>
          <span className="brand-sub">Markdown workspace</span>
        </span>
      </Link>

      <div className="header-spacer" />

      <button className="search-trigger" onClick={onOpenPalette} type="button" aria-label="Search pages">
        <IconSearch size={15} />
        <span className="st-label">Search everything…</span>
        <span className="st-kbd">
          <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd> <kbd>K</kbd>
        </span>
      </button>

      {editable && (
        <button
          className={`btn${editMode ? ' btn-primary' : ''}`}
          onClick={() => setEditMode(!editMode)}
          title={editMode ? 'Switch to reading' : 'Switch to editing'}
          type="button"
        >
          {editMode ? <IconPencil size={15} /> : <IconEye size={15} />}
          {editMode ? 'Editing' : 'Reading'}
        </button>
      )}

      <button
        className="btn btn-ghost btn-icon"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
      </button>

      <div style={{ position: 'relative' }} ref={popRef}>
        <button
          className={`btn btn-ghost btn-icon${settings ? ' is-active' : ''}`}
          onClick={() => setSettings((s) => !s)}
          aria-label="Appearance settings"
          aria-expanded={settings}
        >
          <IconSettings size={17} />
        </button>
        {settings && (
          <div className="popover">
            <div className="popover-row">
              <div className="popover-label">Accent colour</div>
              <div className="swatches">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    className={`swatch${accent === a.id ? ' active' : ''}`}
                    style={{ ['--sw' as string]: a.swatch }}
                    onClick={() => setAccent(a.id)}
                    title={a.label}
                    aria-label={a.label}
                    type="button"
                  />
                ))}
              </div>
            </div>
            <div className="popover-row">
              <div className="popover-label">Text density</div>
              <div className="seg">
                <button className={font === 'comfortable' ? 'active' : ''} onClick={() => setFont('comfortable')} type="button">
                  Comfortable
                </button>
                <button className={font === 'compact' ? 'active' : ''} onClick={() => setFont('compact')} type="button">
                  Compact
                </button>
              </div>
            </div>
            <div className="popover-row">
              <div className="popover-label">Theme</div>
              <div className="seg">
                <button className={theme === 'light' ? 'active' : ''} onClick={() => theme !== 'light' && toggleTheme()} type="button">
                  Light
                </button>
                <button className={theme === 'dark' ? 'active' : ''} onClick={() => theme !== 'dark' && toggleTheme()} type="button">
                  Dark
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
