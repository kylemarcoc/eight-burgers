import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { ThemeProvider } from './app/providers/ThemeProvider';
import './app/styles/globals.css';

const PRELOAD_RETRY_KEY = 'eight-burgers:preload-retried';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    if (!window.sessionStorage.getItem(PRELOAD_RETRY_KEY)) {
      window.sessionStorage.setItem(PRELOAD_RETRY_KEY, '1');
      window.location.reload();
    }
  } catch {
    // Let the route error boundary handle recovery if sessionStorage is unavailable.
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
