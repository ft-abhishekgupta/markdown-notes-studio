import { useLayoutEffect, useRef } from 'react';
import { parseTable, serializeTable, type Align, type TableModel } from './blockTypes';
import { IconPlus, IconTrash, IconX } from '../Icons';

function AutoCell({
  value,
  onChange,
  onKeyDown,
  header,
  align,
  placeholder,
  cellRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  header?: boolean;
  align: Align;
  placeholder?: string;
  cellRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        cellRef?.(el);
      }}
      className={`tbl-cell${header ? ' tbl-head' : ''}`}
      style={{ textAlign: align === 'center' ? 'center' : align === 'right' ? 'right' : 'left' }}
      value={value}
      placeholder={placeholder}
      rows={1}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={onKeyDown}
    />
  );
}

const ALIGN_CYCLE: Align[] = ['', 'left', 'center', 'right'];
const ALIGN_LABEL: Record<Align, string> = { '': '↔', left: '⇤', center: '↔', right: '⇥' };

/**
 * Edits a markdown table as a real grid. Everything round-trips through
 * standard GFM pipe syntax, so the file stays plain markdown.
 */
export function TableEditor({
  markdown,
  onChange,
  onExit,
}: {
  markdown: string;
  onChange: (next: string) => void;
  onExit?: () => void;
}) {
  const model = parseTable(markdown);
  const cells = useRef(new Map<string, HTMLTextAreaElement>());

  const commit = (next: TableModel) => onChange(serializeTable(next));
  const clone = (): TableModel => ({
    header: [...model.header],
    align: [...model.align],
    rows: model.rows.map((r) => [...r]),
  });

  const setHeader = (index: number, value: string) => {
    const next = clone();
    next.header[index] = value;
    commit(next);
  };

  const setCell = (row: number, column: number, value: string) => {
    const next = clone();
    next.rows[row][column] = value;
    commit(next);
  };

  const addColumn = (at: number) => {
    const next = clone();
    next.header.splice(at, 0, `Column ${String.fromCharCode(65 + next.header.length)}`);
    next.align.splice(at, 0, '');
    next.rows.forEach((r) => r.splice(at, 0, ''));
    commit(next);
  };

  const removeColumn = (at: number) => {
    if (model.header.length <= 1) return;
    const next = clone();
    next.header.splice(at, 1);
    next.align.splice(at, 1);
    next.rows.forEach((r) => r.splice(at, 1));
    commit(next);
  };

  const addRow = (at: number) => {
    const next = clone();
    next.rows.splice(at, 0, Array.from({ length: next.header.length }, () => ''));
    commit(next);
    requestAnimationFrame(() => cells.current.get(`${at}:0`)?.focus());
  };

  const removeRow = (at: number) => {
    const next = clone();
    next.rows.splice(at, 1);
    if (!next.rows.length) next.rows.push(Array.from({ length: next.header.length }, () => ''));
    commit(next);
  };

  const cycleAlign = (index: number) => {
    const next = clone();
    const current = ALIGN_CYCLE.indexOf(next.align[index] ?? '');
    next.align[index] = ALIGN_CYCLE[(current + 1) % ALIGN_CYCLE.length];
    commit(next);
  };

  const focusCell = (row: number, column: number) => {
    const key = row < 0 ? `h:${column}` : `${row}:${column}`;
    requestAnimationFrame(() => {
      const el = cells.current.get(key);
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const onCellKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, row: number, column: number) => {
    const columns = model.header.length;
    if (e.key === 'Tab') {
      e.preventDefault();
      const flat = (row + 1) * columns + column + (e.shiftKey ? -1 : 1);
      const nextRow = Math.floor(flat / columns) - 1;
      const nextColumn = ((flat % columns) + columns) % columns;
      if (nextRow > model.rows.length - 1) {
        addRow(model.rows.length);
        return;
      }
      focusCell(Math.max(-1, nextRow), nextColumn);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (row === model.rows.length - 1) addRow(model.rows.length);
      else focusCell(row + 1, column);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onExit?.();
    }
  };

  return (
    <div className="tbl-editor">
      <div className="tbl-scroll">
        <table className="tbl-grid">
          <thead>
            <tr>
              {model.header.map((cell, i) => (
                <th key={i}>
                  <div className="tbl-colbar">
                    <button type="button" title="Cycle column alignment" onClick={() => cycleAlign(i)}>
                      {ALIGN_LABEL[model.align[i] ?? '']}
                    </button>
                    <button type="button" title="Insert column before" onClick={() => addColumn(i)}>
                      <IconPlus size={11} />
                    </button>
                    <button type="button" title="Delete column" onClick={() => removeColumn(i)}>
                      <IconX size={11} />
                    </button>
                  </div>
                  <AutoCell
                    header
                    align={model.align[i] ?? ''}
                    value={cell}
                    placeholder="Heading"
                    cellRef={(el) => (el ? cells.current.set(`h:${i}`, el) : cells.current.delete(`h:${i}`))}
                    onChange={(v) => setHeader(i, v)}
                    onKeyDown={(e) => onCellKey(e, -1, i)}
                  />
                </th>
              ))}
              <th className="tbl-add-col">
                <button type="button" title="Add column" onClick={() => addColumn(model.header.length)}>
                  <IconPlus size={13} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>
                    <AutoCell
                      align={model.align[c] ?? ''}
                      value={cell}
                      cellRef={(el) => (el ? cells.current.set(`${r}:${c}`, el) : cells.current.delete(`${r}:${c}`))}
                      onChange={(v) => setCell(r, c, v)}
                      onKeyDown={(e) => onCellKey(e, r, c)}
                    />
                  </td>
                ))}
                <td className="tbl-row-tools">
                  <button type="button" title="Insert row below" onClick={() => addRow(r + 1)}>
                    <IconPlus size={12} />
                  </button>
                  <button type="button" title="Delete row" onClick={() => removeRow(r)}>
                    <IconTrash size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tbl-foot">
        <button className="btn btn-ghost" type="button" onClick={() => addRow(model.rows.length)}>
          <IconPlus size={13} /> Row
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => addColumn(model.header.length)}>
          <IconPlus size={13} /> Column
        </button>
        <span className="faint" style={{ fontSize: '0.72rem' }}>
          Tab moves across · Enter moves down · Esc leaves the table
        </span>
      </div>
    </div>
  );
}
