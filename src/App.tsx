import { Component, type ReactNode } from 'react';
import { Scene } from './scene/Scene';
import { Dialogs } from './ui/Dialogs';
import { Inspector } from './ui/Inspector';
import { SceneLabels } from './ui/SceneLabels';
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
          <Scene />
        </SceneBoundary>
        <SceneLabels />
      </div>
      <TopBar />
      <LeftPanel />
      <Inspector />
      <AttentionBar />
      <Dialogs />
    </div>
  );
}
