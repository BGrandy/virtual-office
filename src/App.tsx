import { Component, Suspense, lazy, type ReactNode } from 'react';
import { Dialogs } from './ui/Dialogs';
import { Inspector } from './ui/Inspector';
import { SceneLabels } from './ui/SceneLabels';
import { Tour } from './ui/Tour';

// three.js is most of the download, so the 3D office loads in its own chunk
// while the panels and welcome screen appear straight away.
const Scene = lazy(() => import('./scene/Scene'));
import { AttentionBar, LeftPanel, TopBar } from './ui/Panels';

/** If WebGL is unavailable the panels still work, so the workflow stays usable. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="no-webgl">
          <p><strong>The 3D office could not start.</strong> Your browser or device has WebGL turned off. The request list, details and controls still work.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <div className="app">
      <div className="stage">
        <SceneBoundary>
          <Suspense fallback={<div className="scene-loading"><i className="spinner" />Building the office</div>}>
            <Scene />
          </Suspense>
        </SceneBoundary>
        <SceneLabels />
      </div>
      <TopBar />
      <LeftPanel />
      <Inspector />
      <AttentionBar />
      <Tour />
      <Dialogs />
    </div>
  );
}
