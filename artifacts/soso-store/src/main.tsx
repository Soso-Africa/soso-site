import { createRoot } from 'react-dom/client';
import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={{
        variables: {
          colorPrimary: "#b8912f",
          colorBackground: "#100e0b",
          colorForeground: "#f6f1e7",
          colorMutedForeground: "#c8bea8",
          colorInput: "#201a13",
          colorInputForeground: "#f6f1e7",
          colorDanger: "#e56b6f",
          colorNeutral: "#c8bea8",
          fontFamily: "Plus Jakarta Sans, sans-serif",
          borderRadius: "0px",
        },
        elements: {
          cardBox: { background: "#17130e", border: "1px solid rgba(184,145,47,.35)", boxShadow: "0 22px 60px rgba(0,0,0,.3)" },
          card: { background: "transparent" },
          headerTitle: { color: "#f6f1e7", fontFamily: "Fraunces, serif" },
          headerSubtitle: { color: "#c8bea8" },
          formFieldLabel: { color: "#f6f1e7" },
          formFieldInput: { color: "#f6f1e7", backgroundColor: "#201a13", borderColor: "rgba(184,145,47,.35)" },
          formButtonPrimary: { backgroundColor: "#b8912f", color: "#100e0b" },
          footerActionText: { color: "#c8bea8" },
          footerActionLink: { color: "#d4b45a" },
        },
      }}
    >
      <App />
    </ClerkProvider>
  </ErrorBoundary>,
);
