import { Link, useNavigate } from 'react-router-dom';
import { useTreeActions, useWorkspace } from '../lib/workspace';
import { useToast } from '../components/Toast';
import { ChildCard } from './FolderPage';
import { IconFolderPlus, IconSearch, IconPencil, IconArrowRight } from '../components/Icons';

export function HomePage({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { tree, pages, editMode, editable } = useWorkspace();
  const actions = useTreeActions();
  const navigate = useNavigate();
  const toast = useToast();

  const recent = [...pages]
    .filter((p) => p.updated)
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 6);

  const createSection = async () => {
    try {
      const key = await actions.create('', 'section', 'New section');
      navigate(`/f/${key}`);
    } catch (error) {
      toast((error as Error).message || 'Could not create');
    }
  };

  return (
    <div className="wrap page">
      <section className="hero">
        <h1>Your markdown workspace</h1>
        <p>
          Sections and pages, nested up to four levels — all backed by plain <code>.md</code>{' '}
          files on disk. {editable ? 'Edit anything in the browser; every change is written straight back to the folder.' : 'This is a read-only build.'}
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={onOpenPalette} type="button">
            <IconSearch size={15} /> Search pages
          </button>
          {editMode && (
            <button className="btn" onClick={() => void createSection()} type="button">
              <IconFolderPlus size={15} /> New section
            </button>
          )}
          {pages[0] && (
            <Link className="btn" to={`/p/${pages[0].key}`}>
              <IconArrowRight size={15} /> Start reading
            </Link>
          )}
        </div>
        <div className="hero-stats">
          <span>
            <strong>{tree.length}</strong> sections
          </span>
          <span>
            <strong>{pages.length}</strong> pages
          </span>
          <span>
            <strong>{pages.reduce((n, p) => n + p.minutes, 0)}</strong> min of reading
          </span>
        </div>
      </section>

      {tree.length === 0 ? (
        <div className="empty">
          <h3>Nothing here yet</h3>
          <p>
            {editable
              ? 'Create your first section to get started — folders and markdown files are written under content/.'
              : 'Add markdown files under content/ and rebuild.'}
          </p>
          {editable && (
            <button className="btn btn-primary" onClick={() => void createSection()} type="button">
              <IconFolderPlus size={15} /> Create a section
            </button>
          )}
        </div>
      ) : (
        <>
          <h2 className="section-heading">Sections</h2>
          <div className="node-grid">
            {tree.map((node) => (
              <ChildCard key={node.key} node={node} />
            ))}
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="section-heading">Recently updated</h2>
          <div className="node-grid">
            {recent.map((node) => (
              <ChildCard key={node.key} node={node} />
            ))}
          </div>
        </>
      )}

      {editable && !editMode && (
        <p className="faint" style={{ marginTop: 28, fontSize: '0.84rem' }}>
          <IconPencil size={13} /> Switch the header toggle to <strong>Editing</strong> to add, reorder and write pages.
        </p>
      )}
    </div>
  );
}
