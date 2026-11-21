import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerSW } from './lib/push';
import './lib/install';
import './lib/theme';
import './index.css';
import { reloadForNewVersion } from './lib/reload';

// Chunk de versão antiga (aba aberta antes da publicação): recarrega para pegar a nova.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForNewVersion()) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if (import.meta.env.PROD) registerSW();
