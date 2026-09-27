import { useRef, useState } from 'react';
import { formatImage, parseImage, cssLength, type ImageInfo } from '../../lib/markdown';
import { resolveAssetUrl } from '../../lib/api';
import { useLightbox } from '../Lightbox';
import { useAssetDir } from '../Markdown';
import { IconExpand, IconImage } from '../Icons';

const PRESETS: { label: string; width: string }[] = [
  { label: '25%', width: '25%' },
  { label: '50%', width: '50%' },
  { label: '75%', width: '75%' },
  { label: 'Full', width: '' },
];

/**
 * An image that can be resized by dragging, sized with presets and opened
 * full screen. The size is persisted in the markdown title slot as `"=600x400"`,
 * which every other markdown tool simply treats as a title.
 */
export function ImageBlockEditor({
  markdown,
  onChange,
  onReplace,
}: {
  markdown: string;
  onChange: (next: string) => void;
  onReplace?: () => void;
}) {
  const dir = useAssetDir();
  const lightbox = useLightbox();
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const info = parseImage(markdown) ?? { alt: '', src: '', title: '', width: '', height: '' };
  const url = resolveAssetUrl(info.src, dir);

  const update = (patch: Partial<ImageInfo>) => onChange(formatImage({ ...info, ...patch }));

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap) return;
    const startX = event.clientX;
    const startWidth = img.getBoundingClientRect().width;
    const max = wrap.getBoundingClientRect().width;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const move = (e: PointerEvent) => {
      setDragWidth(Math.max(60, Math.min(max, Math.round(startWidth + (e.clientX - startX)))));
    };
    const end = (e: PointerEvent) => {
      const width = Math.max(60, Math.min(max, Math.round(startWidth + (e.clientX - startX))));
      setDragWidth(null);
      update({ width: String(width), height: '' });
      target.releasePointerCapture(event.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
  };

  const displayWidth = dragWidth !== null ? `${dragWidth}px` : cssLength(info.width);

  return (
    <div className="img-editor" ref={wrapRef}>
      <div className="img-stage" style={{ width: displayWidth }}>
        {info.src ? (
          <img ref={imgRef} src={url} alt={info.alt} style={{ width: displayWidth ? '100%' : undefined, height: cssLength(info.height) }} />
        ) : (
          <div className="img-missing">
            <IconImage size={18} /> No image source
          </div>
        )}
        <span className="img-handle" onPointerDown={startResize} title="Drag to resize" />
        <span className="img-size-badge">{dragWidth ?? (info.width || 'auto')}</span>
      </div>

      <div className="img-tools">
        <input
          className="img-alt"
          value={info.alt}
          placeholder="Alt text / caption"
          onChange={(e) => update({ alt: e.target.value })}
        />
        <div className="img-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`btn btn-ghost${(info.width || '') === p.width ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => update({ width: p.width, height: '' })}
            >
              {p.label}
            </button>
          ))}
          <input
            className="img-num"
            value={info.width}
            placeholder="px / %"
            title="Exact width — e.g. 480 or 60%"
            onChange={(e) => update({ width: e.target.value.trim(), height: '' })}
          />
          <button className="btn btn-ghost" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => lightbox.open(url, info.alt)}>
            <IconExpand size={13} /> Full screen
          </button>
          {onReplace && (
            <button className="btn btn-ghost" type="button" onMouseDown={(e) => e.preventDefault()} onClick={onReplace}>
              Replace
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
