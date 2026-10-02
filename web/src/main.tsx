import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { DirectionProvider } from '@radix-ui/react-direction';

import { ShopApp } from './shop/ShopApp';
import './index.css';

/** The admin apps are separate downloads: customers never fetch them. */
const AdminApp = lazy(() => import('./AdminApp'));
const PanelApp = lazy(() => import('./panel/PanelApp'));

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

/**
 * Which app this address opens:
 *   /admin/classic...  the classic dashboard (reviews, customers, Meta pixel, Odoo connection)
 *   /admin...          the admin panel (web/src/panel, the 2026 design)
 *   anything else      the storefront
 */
const path = window.location.pathname;
const app = /^\/admin\/classic(\/|$)/.test(path) ? 'classic' : /^\/admin(\/|$)/.test(path) ? 'panel' : 'shop';

// Light or dark with the system: shadcn's .dark class, kept in step with
// prefers-color-scheme (design/docs/DESIGN.md - no separate dark pages).
// The admin panel is light only (its design has no dark version).
if (app !== 'panel') {
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const applyScheme = () => document.documentElement.classList.toggle('dark', dark.matches);
  applyScheme();
  dark.addEventListener('change', applyScheme);
}

// Radix primitives (Select, Slider, ...) default to LTR internally and
// ignore the page's own dir="rtl" unless told otherwise - without this,
// their layout/positioning silently mirrors backwards for Arabic.
createRoot(container).render(
  <StrictMode>
    <DirectionProvider dir="rtl">
      {app === 'shop' ? (
        <ShopApp />
      ) : (
        <Suspense fallback={null}>{app === 'panel' ? <PanelApp /> : <AdminApp />}</Suspense>
      )}
    </DirectionProvider>
  </StrictMode>
);
