import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTreeActions, useWorkspace } from '../lib/workspace';
import { KIND_LABEL, canHoldChildren, canHoldSection, type TreeNode } from '../lib/types';
import { useToast } from '../components/Toast';
import { IconChevronRight, IconFilePlus, IconFolderPlus, SectionIcon } from '../components/Icons';

function countPages(node: TreeNode): number {
  return node.kind === 'page' ? 1 : node.children.reduce((n, c) => n + countPages(c), 0);
}

export function ChildCard({ node }: { node: TreeNode }) {
  const pages = countPages(node);
  return (
    <Link
      className="node-card"
      to={node.kind === 'page' ? `/p/${node.key}` : `/f/${node.key}`}
      style={{ ['--sec-hue' as string]: node.hue } as React.CSSProperties}
    >
      <span className="node-card-icon">
        <SectionIcon name={node.icon} size={16} />
      </span>
      <span className="node-card-body">
        <span className="node-card-title">{node.title}</span>
        <span className="node-card-sub">
          {node.kind === 'page'
            ? node.description || `${node.minutes} min read`
            : `${pages} page${pages === 1 ? '' : 's'}${node.description ? ` · ${node.description}` : ''}`}
        </span>
      </span>
      <IconChevronRight size={15} className="node-card-arrow" />
    </Link>
  );
}

export function FolderPage() {
  const params = useParams();
  const key = decodeURIComponent(params['*'] ?? '');
  const { byKey, parentsOf, editMode } = useWorkspace();
  const actions = useTreeActions();
  const navigate = useNavigate();
  const toast = useToast();
  const node = byKey.get(key);

  if (!node || node.kind === 'page') {
    return (
      <div className="wrap">
        <div className="empty">
          <h3>Nothing here</h3>
          <p>
            No section matches <code>{key || '/'}</code>.
          </p>
        </div>
      </div>
    );
  }

  const trail = parentsOf(node.key);

  const add = async (kind: 'section' | 'page') => {
    try {
      const created = await actions.create(node.key, kind, kind === 'page' ? 'New page' : 'New section');
      navigate(kind === 'page' ? `/p/${created}` : `/f/${created}`);
    } catch (error) {
      toast((error as Error).message || 'Could not create');
    }
  };

  return (
    <div className="wrap page">
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        {trail.map((p) => (
          <span key={p.key} style={{ display: 'contents' }}>
            <IconChevronRight size={12} />
            <Link to={`/f/${p.key}`}>{p.title}</Link>
          </span>
        ))}
      </div>

      <header className="folder-head" style={{ ['--sec-hue' as string]: node.hue } as React.CSSProperties}>
        <span className="folder-icon">
          <SectionIcon name={node.icon} size={22} />
        </span>
        <div>
          <span className="chip">{KIND_LABEL[node.kind]}</span>
          <h1 className="topic-title">{node.title}</h1>
          {node.description && <p className="topic-desc">{node.description}</p>}
        </div>
      </header>

      {node.children.length === 0 ? (
        <div className="empty">
          <h3>This section is empty</h3>
          {editMode ? <p>Add something below, or use the sidebar.</p> : <p>Run the dev server to add content.</p>}
        </div>
      ) : (
        <div className="node-grid">
          {node.children.map((child) => (
            <ChildCard key={child.key} node={child} />
          ))}
        </div>
      )}

      {editMode && canHoldChildren(node.key) && (
        <div className="folder-actions">
          <button className="btn" type="button" onClick={() => void add('page')}>
            <IconFilePlus size={14} /> New page
          </button>
          {canHoldSection(node.key) && (
            <button className="btn" type="button" onClick={() => void add('section')}>
              <IconFolderPlus size={14} /> New section
            </button>
          )}
        </div>
      )}
    </div>
  );
}
