import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DirectionProvider } from '@radix-ui/react-direction';

import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// Radix primitives (Select, Slider, ...) default to LTR internally and
// ignore the page's own dir="rtl" unless told otherwise — without this,
// their layout/positioning silently mirrors backwards for Arabic.
createRoot(container).render(
  <StrictMode>
    <DirectionProvider dir="rtl">
      <App />
    </DirectionProvider>
  </StrictMode>
);
