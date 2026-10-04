import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Workspace = 'Edit' | 'Motion' | 'VFX' | '3D' | 'Color' | 'Audio';

const workspaces: Workspace[] = ['Edit', 'Motion', 'VFX', '3D', 'Color', 'Audio'];

function App() {
  return (
    <main className="studio">
      <header className="topbar">
        <strong>ZiStudio</strong>
        <nav>{workspaces.map((workspace) => <button key={workspace}>{workspace}</button>)}</nav>
      </header>
      <section className="workspace">
        <aside className="panel assets"><h2>Project</h2><div className="empty">No assets</div></aside>
        <section className="center">
          <div className="viewer"><span>Viewer</span><small>WebGPU viewport will be connected here.</small></div>
          <div className="timeline">
            <div className="timeline-header"><span>Timeline</span><span>00:00:00:00</span></div>
            {['V1', 'V2', 'V3', 'A1'].map((track) => <div className="track" key={track}><b>{track}</b><div className="track-content" /></div>)}
          </div>
        </section>
        <aside className="panel inspector"><h2>Inspector</h2><div className="property"><span>Position</span><span>0, 0, 0</span></div><div className="property"><span>Scale</span><span>100%</span></div><div className="property"><span>Opacity</span><span>100%</span></div></aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
