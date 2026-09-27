import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../lib/theme';
import { copyText, downloadText } from '../lib/utils';
import { IconCopy, IconCheck, IconDownload } from './Icons';

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
let currentTheme = '';
let renderSeq = 0;
/** Mermaid mutates shared DOM while rendering, so renders are serialised. */
let renderQueue: Promise<unknown> = Promise.resolve();

async function getMermaid(theme: 'light' | 'dark') {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default);
  }
  const mermaid = await mermaidPromise;
  if (currentTheme !== theme) {
    currentTheme = theme;
    const dark = theme === 'dark';
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      fontFamily: "'Inter Variable', Inter, system-ui, sans-serif",
      fontSize: 14,
      flowchart: { curve: 'basis', htmlLabels: true, padding: 14, useMaxWidth: true },
      sequence: { useMaxWidth: true, actorMargin: 42, boxMargin: 8, mirrorActors: false },
      themeVariables: dark
        ? {
            background: '#141824',
            primaryColor: '#1e2433',
            primaryTextColor: '#e6e9f2',
            primaryBorderColor: '#8b7bff',
            lineColor: '#7d8aa5',
            secondaryColor: '#1a2a3d',
            tertiaryColor: '#22283a',
            mainBkg: '#1c2231',
            secondBkg: '#1a2233',
            nodeBorder: '#8b7bff',
            clusterBkg: '#12161f',
            clusterBorder: '#2c3446',
            titleColor: '#f7f9ff',
            edgeLabelBackground: '#141824',
            textColor: '#d7dcea',
            noteBkgColor: '#2a2440',
            noteTextColor: '#e6e9f2',
            noteBorderColor: '#6d5cc4',
            actorBkg: '#1c2231',
            actorBorder: '#8b7bff',
            actorTextColor: '#e6e9f2',
            actorLineColor: '#4a5468',
            signalColor: '#b9c2d6',
            signalTextColor: '#d7dcea',
            labelBoxBkgColor: '#1c2231',
            labelBoxBorderColor: '#8b7bff',
            labelTextColor: '#e6e9f2',
            loopTextColor: '#d7dcea',
            sectionBkgColor: '#1a1f2d',
            altSectionBkgColor: '#141824',
            gridColor: '#2c3446',
            todayLineColor: '#f87171',
            taskTextColor: '#e6e9f2',
            taskTextOutsideColor: '#d7dcea',
            activationBkgColor: '#2a2440',
            activationBorderColor: '#8b7bff',
            classText: '#e6e9f2',
            pie1: '#8b7bff',
            pie2: '#38bdf8',
            pie3: '#34d399',
            pie4: '#fbbf24',
            pie5: '#f87171',
          }
        : {
            background: '#ffffff',
            primaryColor: '#f2f0ff',
            primaryTextColor: '#1f2437',
            primaryBorderColor: '#6d5cc4',
            lineColor: '#77809a',
            secondaryColor: '#e8f3fd',
            tertiaryColor: '#f4f5f9',
            mainBkg: '#f4f2ff',
            secondBkg: '#eef3fb',
            nodeBorder: '#6d5cc4',
            clusterBkg: '#f7f8fc',
            clusterBorder: '#d6dae6',
            titleColor: '#0d1220',
            edgeLabelBackground: '#ffffff',
            textColor: '#2c3345',
            noteBkgColor: '#fff7e0',
            noteTextColor: '#3a3320',
            noteBorderColor: '#e0c069',
            actorBkg: '#f4f2ff',
            actorBorder: '#6d5cc4',
            actorTextColor: '#1f2437',
            actorLineColor: '#b6bcca',
            signalColor: '#4a5468',
            signalTextColor: '#2c3345',
            labelBoxBkgColor: '#f4f2ff',
            labelBoxBorderColor: '#6d5cc4',
            labelTextColor: '#1f2437',
            loopTextColor: '#2c3345',
            sectionBkgColor: '#f4f5f9',
            altSectionBkgColor: '#ffffff',
            gridColor: '#dfe3ec',
            taskTextColor: '#1f2437',
            activationBkgColor: '#ece8ff',
            activationBorderColor: '#6d5cc4',
            classText: '#1f2437',
            pie1: '#6d5cc4',
            pie2: '#0284c7',
            pie3: '#059669',
            pie4: '#d97706',
            pie5: '#dc2626',
          },
    });
  }
  return mermaid;
}

/** Rejects if mermaid never settles, so one bad diagram cannot block the queue. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('mermaid render timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Serialised, uniquely-identified render so concurrent effects cannot collide. */
async function renderDiagram(theme: 'light' | 'dark', code: string): Promise<string> {
  const run = renderQueue.then(async () => {
    const mermaid = await getMermaid(theme);
    const id = `mmd-${++renderSeq}`;
    try {
      const { svg } = await withTimeout(mermaid.render(id, code.trim()), 15000);
      return svg;
    } finally {
      // Mermaid leaves a measurement node behind when rendering fails.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  // The chain must always advance, even when a render throws or times out.
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function Mermaid({ code }: { code: string }) {
  const { theme } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setSvg('');
    renderDiagram(theme, code)
      .then((out) => {
        if (cancelled) return;
        setSvg(out);
        setState('ok');
      })
      .catch(() => {
        if (cancelled) return;
        setSvg('');
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [code, theme]);

  const onCopy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const onDownload = () => {
    const el = hostRef.current?.querySelector('svg');
    if (!el) return;
    downloadText('diagram.svg', new XMLSerializer().serializeToString(el), 'image/svg+xml');
  };

  // If the diagram cannot be rendered, show the source as a readable code block
  // rather than a broken box — the reader still gets the information.
  if (state === 'error') {
    return (
      <div className="code-block">
        <div className="code-block-head">
          <span className="code-lang">Diagram source</span>
          <button className={`code-copy${copied ? ' copied' : ''}`} onClick={onCopy} type="button">
            {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre>
          <code>{code.trim()}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className={`mermaid-block${state === 'loading' ? ' loading' : ''}`}>
      <div className="mermaid-tools">
        <button className="code-copy" onClick={onCopy} title="Copy diagram source" type="button">
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
          {copied ? 'Copied' : 'Source'}
        </button>
        {state === 'ok' && (
          <button className="code-copy" onClick={onDownload} title="Download as SVG" type="button">
            <IconDownload size={13} /> SVG
          </button>
        )}
      </div>
      {state === 'loading' ? (
        <div className="mermaid-placeholder">Rendering diagram…</div>
      ) : (
        // Mermaid returns a complete SVG string; React must own this subtree,
        // otherwise a later re-render wipes the injected markup.
        <div className="mermaid-canvas" ref={hostRef} dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );
}
