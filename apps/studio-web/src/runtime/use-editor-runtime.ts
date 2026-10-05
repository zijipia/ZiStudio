import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Project } from '../model';
import { EditorRuntime } from './editor-runtime';

/** Create one EditorRuntime for the component's lifetime and subscribe to its state. */
export function useEditorRuntime(createProject: () => Project) {
  const runtime = useMemo(() => new EditorRuntime(createProject()), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Only pause on unmount: React StrictMode runs effect cleanups and re-runs
  // them against the same instance, so a full dispose() here would break it.
  useEffect(() => () => runtime.playback.pause(), [runtime]);
  const state = useSyncExternalStore(runtime.subscribe, runtime.getState);
  return { runtime, state };
}
