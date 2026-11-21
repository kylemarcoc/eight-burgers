import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { ThemeProvider } from './app/providers/ThemeProvider';
import './app/styles/globals.css';

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
