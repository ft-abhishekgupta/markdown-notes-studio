import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';
export type Accent = 'violet' | 'ocean' | 'emerald' | 'amber' | 'rose';

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'violet', label: 'Violet', swatch: '#7c5cff' },
  { id: 'ocean', label: 'Ocean', swatch: '#0ea5e9' },
  { id: 'emerald', label: 'Emerald', swatch: '#10b981' },
  { id: 'amber', label: 'Amber', swatch: '#f59e0b' },
  { id: 'rose', label: 'Rose', swatch: '#f43f5e' },
];

interface ThemeCtx {
  theme: Theme;
  accent: Accent;
  toggleTheme: () => void;
  setAccent: (a: Accent) => void;
  font: 'comfortable' | 'compact';
  setFont: (f: 'comfortable' | 'compact') => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function initialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [accent, setAccentState] = useState<Accent>(() => {
    const stored = localStorage.getItem('ns:accent');
    return (stored as Accent) || 'violet';
  });
  const [font, setFontState] = useState<'comfortable' | 'compact'>(() => {
    return (localStorage.getItem('ns:density') as 'comfortable' | 'compact') || 'comfortable';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ns:theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('ns:accent', accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', font);
    localStorage.setItem('ns:density', font);
  }, [font]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const setAccent = useCallback((a: Accent) => setAccentState(a), []);
  const setFont = useCallback((f: 'comfortable' | 'compact') => setFontState(f), []);

  const value = useMemo(
    () => ({ theme, accent, toggleTheme, setAccent, font, setFont }),
    [theme, accent, toggleTheme, setAccent, font, setFont],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
