import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Firebase App + Auth initialize on first import of ./firebase (pulled in by App).
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
