import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/600.css';
import './styles/app.css';
import { App } from './App';
import { captureInstallPrompt, registerServiceWorker } from './pwa';

captureInstallPrompt(); registerServiceWorker();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
