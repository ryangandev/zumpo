import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/zumpo.css';
import './app.css';
import { App } from './app';
import { reloadForNewDeploy } from './net/stale-deploy';

// A deploy replaces the chunks a page loads on the way, Daily Word's among
// them; reloading fetches the new build instead of failing to load the old.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewDeploy()) event.preventDefault();
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
