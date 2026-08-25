import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

const rootElement = document.getElementById('root')!;
// Generated discovery pages contain safe crawler-readable markup in #root.
// This app is client-rendered rather than hydrated, so remove that snapshot
// before React mounts to guarantee there is never a duplicate storefront.
rootElement.replaceChildren();

createRoot(rootElement, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
