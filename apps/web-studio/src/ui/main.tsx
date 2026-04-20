import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <div>web-studio</div>
    </StrictMode>,
  );
}
