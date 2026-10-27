import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { enableMocks } from '@/shared/api';
import { env } from '@/shared/config';
import { initTheme } from '@/shared/lib/theme';

import { App } from './app';

initTheme();

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container #root is missing');
}

if (env.apiMocks) {
  await enableMocks();
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
