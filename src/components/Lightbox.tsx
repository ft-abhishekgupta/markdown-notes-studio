import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { IconX, IconMinus, IconPlus, IconDownload } from './Icons';

interface LightboxState {
  src: string;
  alt: string;
}

interface LightboxCtx {
  open: (src: string, alt?: string) => void;
}

const Ctx = createContext<LightboxCtx | null>(null);

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [shot, setShot] = useState<LightboxState | null>(null);
  const [zoom, setZoom] = useState(1);

  const open = useCallback((src: string, alt = '') => {
    setZoom(1);
    setShot({ src, alt });
  }, []);

  useEffect(() => {
    if (!shot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShot(null);
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(6, z + 0.25));
      if (e.key === '-') setZoom((z) => Math.max(0.25, z - 0.25));
      if (e.key === '0') setZoom(1);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [shot]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {shot && (
        <div className="lightbox" onClick={() => setShot(null)} role="dialog" aria-modal="true" aria-label={shot.alt || 'Image preview'}>
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <span className="lightbox-title">{shot.alt || 'Image'}</span>
            <span className="lightbox-zoom">{Math.round(zoom * 100)}%</span>
            <button className="btn btn-ghost btn-icon" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} title="Zoom out" type="button">
              <IconMinus size={16} />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => setZoom((z) => Math.min(6, z + 0.25))} title="Zoom in" type="button">
              <IconPlus size={16} />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => setZoom(1)} title="Reset zoom (0)" type="button">
              1:1
            </button>
            <a className="btn btn-ghost btn-icon" href={shot.src} download title="Download image">
              <IconDownload size={16} />
            </a>
            <button className="btn btn-ghost btn-icon" onClick={() => setShot(null)} title="Close (Esc)" type="button">
              <IconX size={16} />
            </button>
          </div>
          <div className="lightbox-stage" onClick={() => setShot(null)}>
            <img
              src={shot.src}
              alt={shot.alt}
              style={{ transform: `scale(${zoom})` }}
              onClick={(e) => {
                e.stopPropagation();
                setZoom((z) => (z >= 3 ? 1 : z + 0.5));
              }}
            />
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useLightbox(): LightboxCtx {
  return useContext(Ctx) ?? { open: () => undefined };
}
