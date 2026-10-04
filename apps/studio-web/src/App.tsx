import { useMemo, useState } from 'react';
import { createEditorState } from './editor';
import { createProject } from './model';
import './styles.css';

const project = createProject();

const tracks = [
  { name: 'V1', width: 78, color: 'video' },
  { name: 'V2', width: 54, color: 'video' },
  { name: 'Text', width: 42, color: 'text' },
  { name: 'A1', width: 82, color: 'audio' },
];

export function App() {
  const [time, setTime] = useState(0);
  const [workspace, setWorkspace] = useState('Edit');
  const state = useMemo(() => createEditorState(project), []);
  const composition = state.project.compositions[0];
  const playhead = `${Math.min(100, (time / composition.duration) * 100)}%`;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">ZiStudio</div>
        <nav className="menu">
          <span>File</span><span>Edit</span><span>View</span><span>Layer</span><span>Effect</span><span>Animation</span><span>Window</span>
        </nav>
        <div className="transport"><button onClick={() => setTime(0)}>◀</button><button onClick={() => setTime(time >= composition.duration ? 0 : time + 1 / composition.fps)}>▶</button></div>
      </header>

      <div className="workspace-tabs">
        {['Edit', 'Motion', 'VFX', '3D', 'Color', 'Audio'].map((item) => (
          <button key={item} className={workspace === item ? 'active' : ''} onClick={() => setWorkspace(item)}>{item}</button>
        ))}
      </div>

      <main className="main-grid">
        <aside className="panel project-panel">
          <PanelTitle title="Project" />
          <div className="asset-tree"><span>▾ {state.project.name}</span><span className="asset">▾ {composition.name}</span><span className="asset muted">Media</span><span className="asset muted">Effects</span></div>
        </aside>

        <section className="panel viewer-panel">
          <PanelTitle title="Viewer" right={`${composition.width} × ${composition.height} · ${composition.fps} FPS`} />
          <div className="viewer"><div className="viewer-placeholder"><div className="crosshair">+</div><strong>{composition.name}</strong><small>GPU viewport foundation</small></div></div>
        </section>

        <aside className="panel inspector-panel">
          <PanelTitle title="Inspector" />
          <PropertyRow name="Position" value="0, 0, 0" />
          <PropertyRow name="Scale" value="100, 100, 100" />
          <PropertyRow name="Rotation" value="0°" />
          <PropertyRow name="Opacity" value="100%" />
          <div className="inspector-note">Property + keyframe system is the next runtime milestone.</div>
        </aside>

        <section className="panel timeline-panel">
          <PanelTitle title="Timeline" right={`${time.toFixed(2)}s / ${composition.duration.toFixed(2)}s`} />
          <div className="timeline-toolbar"><button>＋ Layer</button><button>◇ Keyframe</button><button>Split</button><span className="spacer" /><span>Snap</span><span>60 FPS</span></div>
          <div className="timeline">
            <div className="ruler">{Array.from({ length: 11 }, (_, i) => <span key={i}>{i}s</span>)}</div>
            <div className="track-area">
              {tracks.map((track) => <div className="track" key={track.name}><div className="track-name">{track.name}</div><div className="track-lane"><div className={`clip ${track.color}`} style={{ width: `${track.width}%` }}>{track.name === 'V1' ? 'Main Media' : track.name}</div></div></div>)}
              <div className="playhead" style={{ left: playhead }} />
            </div>
          </div>
          <input className="scrubber" type="range" min="0" max={composition.duration} step={1 / composition.fps} value={time} onChange={(event) => setTime(Number(event.target.value))} aria-label="Timeline position" />
        </section>
      </main>

      <footer className="statusbar"><span>Ready</span><span>Web Runtime · Render Engine pending</span><span>{workspace} workspace</span></footer>
    </div>
  );
}

function PanelTitle({ title, right }: { title: string; right?: string }) {
  return <div className="panel-title"><strong>{title}</strong>{right && <span>{right}</span>}</div>;
}

function PropertyRow({ name, value }: { name: string; value: string }) {
  return <div className="property-row"><span>{name}</span><code>{value}</code></div>;
}
