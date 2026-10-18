import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/tinos/400.css';
import '@fontsource/tinos/700.css';
import '@fontsource/tinos/400-italic.css';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/600.css';
import './styles/app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
