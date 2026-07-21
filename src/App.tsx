import { getCurrentWindow } from "@tauri-apps/api/window";
import { lazy, Suspense } from "react";

// Lazy per view, so each window parses only its own chunk (plus the shared
// vendor code): the popup never loads the settings editor, About never loads
// the popup. All windows start hidden, so the empty Suspense fallback is
// never actually seen.
const Popup = lazy(async () => {
  const view = await import("@/components/popup.tsx");
  return { default: view.Popup };
});
const Settings = lazy(async () => {
  const view = await import("@/components/settings.tsx");
  return { default: view.Settings };
});
const About = lazy(async () => {
  const view = await import("@/components/about.tsx");
  return { default: view.About };
});

function App(): React.JSX.Element {
  // One frontend, three windows: route by the Tauri window label.
  const view = ((): React.JSX.Element => {
    switch (getCurrentWindow().label) {
      case "popup": {
        return <Popup />;
      }
      case "about": {
        return <About />;
      }
      default: {
        return <Settings />;
      }
    }
  })();
  return <Suspense fallback={undefined}>{view}</Suspense>;
}

export default App;
