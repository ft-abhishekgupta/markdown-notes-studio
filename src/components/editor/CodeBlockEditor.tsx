import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fenceBody, fenceLanguage, makeFence } from '../../lib/markdown';
import { Mermaid } from '../Mermaid';
import { IconCode, IconDiagram } from '../Icons';

const LANGUAGES = [
  'text', 'bash', 'shell', 'powershell', 'json', 'yaml', 'xml', 'html', 'css',
  'javascript', 'typescript', 'jsx', 'tsx', 'python', 'java', 'csharp', 'cpp',
  'c', 'go', 'rust', 'ruby', 'php', 'sql', 'diff', 'ini', 'dockerfile', 'markdown',
  'mermaid',
];

export function CodeBlockEditor({
  markdown,
  onChange,
  onExit,
  registerRef,
}: {
  markdown: string;
  onChange: (next: string) => void;
  onExit?: () => void;
  registerRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  const language = fenceLanguage(markdown);
  const body = fenceBody(markdown);
  const isMermaid = language.toLowerCase() === 'mermaid';
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [preview, setPreview] = useState(body);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(72, el.scrollHeight)}px`;
  }, [body]);

  // Mermaid is expensive to render, so the preview trails the keystrokes.
  useEffect(() => {
    const timer = setTimeout(() => setPreview(body), 420);
    return () => clearTimeout(timer);
  }, [body]);

  const setLanguage = (next: string) => onChange(makeFence(next.trim(), body));
  const setBody = (next: string) => onChange(makeFence(language, next));

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: t, value } = el;
      const next = `${value.slice(0, s)}  ${value.slice(t)}`;
      setBody(next);
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onExit?.();
    }
  };

  return (
    <div className={`code-editor${isMermaid ? ' is-mermaid' : ''}`}>
      <div className="code-editor-head">
        <span className="code-editor-icon">{isMermaid ? <IconDiagram size={14} /> : <IconCode size={14} />}</span>
        <input
          className="code-lang-input"
          value={language}
          list="ns-languages"
          placeholder="language"
          spellCheck={false}
          onChange={(e) => setLanguage(e.target.value)}
        />
        <datalist id="ns-languages">
          {LANGUAGES.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <button
          className={`btn btn-ghost${isMermaid ? ' is-active' : ''}`}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setLanguage(isMermaid ? '' : 'mermaid')}
          title="Toggle Mermaid diagram"
        >
          <IconDiagram size={13} /> Mermaid
        </button>
      </div>

      <div className="code-editor-body">
        <textarea
          ref={(el) => {
            ref.current = el;
            registerRef?.(el);
          }}
          className="code-editor-input"
          value={body}
          spellCheck={false}
          placeholder={isMermaid ? 'flowchart LR\n  A[Start] --> B[Finish]' : 'Write code…'}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {isMermaid && (
          <div className="code-editor-preview">
            {preview.trim() ? <Mermaid code={preview} /> : <div className="mermaid-placeholder">Diagram preview</div>}
          </div>
        )}
      </div>
    </div>
  );
}
