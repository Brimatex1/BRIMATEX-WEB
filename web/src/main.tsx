import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { DirectionProvider } from '@radix-ui/react-direction';

import { ShopApp } from './shop/ShopApp';
import './index.css';

/** The dashboard is a separate download: customers never fetch it. */
const AdminApp = lazy(() => import('./AdminApp'));

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// Light or dark with the system: shadcn's .dark class, kept in step with
// prefers-color-scheme (design/docs/DESIGN.md - no separate dark pages).
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyScheme = () => document.documentElement.classList.toggle('dark', dark.matches);
applyScheme();
dark.addEventListener('change', applyScheme);

const isAdmin = /^\/admin(\/|$)/.test(window.location.pathname);

// Radix primitives (Select, Slider, ...) default to LTR internally and
// ignore the page's own dir="rtl" unless told otherwise - without this,
// their layout/positioning silently mirrors backwards for Arabic.
createRoot(container).render(
  <StrictMode>
    <DirectionProvider dir="rtl">
      {isAdmin ? (
        <Suspense fallback={null}>
          <AdminApp />
        </Suspense>
      ) : (
        <ShopApp />
      )}
    </DirectionProvider>
  </StrictMode>
);
