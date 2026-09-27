import { useCallback, useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { HomePage } from './pages/HomePage';
import { FolderPage } from './pages/FolderPage';
import { PagePage } from './pages/PagePage';

function NotFound() {
  return (
    <div className="wrap">
      <div className="empty">
        <h3>Page not found</h3>
        <p>
          That route does not exist. Press <kbd>Ctrl</kbd> <kbd>K</kbd> to search the workspace.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ns:nav') === 'collapsed';
    } catch {
      return false;
    }
  });
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem('ns:nav', navCollapsed ? 'collapsed' : 'open');
    } catch {
      /* private mode */
    }
  }, [navCollapsed]);

  /** Narrow screens use the overlay; wide screens collapse the column. */
  const toggleNav = useCallback(() => {
    const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
    if (narrow) setSidebarOpen((s) => !s);
    else setNavCollapsed((c) => !c);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleNav();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (typing) return; // Ctrl+K inserts a link while editing
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleNav]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  return (
    <div className="app">
      <Header
        onOpenPalette={openPalette}
        onToggleSidebar={toggleNav}
        sidebarOpen={sidebarOpen}
        navCollapsed={navCollapsed}
      />
      <div className={`shell${navCollapsed ? ' nav-collapsed' : ''}`}>
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        <main className="main">
          <Routes>
            <Route path="/" element={<HomePage onOpenPalette={openPalette} />} />
            <Route path="/p/*" element={<PagePage />} />
            <Route path="/f/*" element={<FolderPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
