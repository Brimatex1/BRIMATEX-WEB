/**
 * The Google Ads tag (gtag.js), as Google gives it for the account's ads -
 * an advertising tag like the Meta Pixel (lib/pixel.ts), not an analytics
 * tool: no Google Analytics property is configured. On the shop's own
 * address only, like the Pixel; a page view per screen of the single-page
 * shop, so Google's audiences see the products a visitor opened.
 *
 * Its domains are allowed in the site's CSP (src/server.js SHELL_CSP), and
 * the privacy policy names Google (web/src/shop/legal.ts and the app's
 * LegalScreen).
 */
import { isLiveHost } from './pixel';

/** The Brimatex Google Ads account's tag ID. */
const GOOGLE_ADS_ID = 'AW-18540087008';

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let started = false;

/** Loads gtag.js once and configures the Ads tag - Google's own snippet, in code. */
export function initGoogleAds() {
  if (started || typeof window === 'undefined' || !isLiveHost(window.location.hostname)) return;
  started = true;
  window.dataLayer = window.dataLayer || [];
  // gtag must push the arguments object itself, as Google's snippet does.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  // The first page view goes with config; later screens send their own (below).
  window.gtag('config', GOOGLE_ADS_ID);
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;
  document.head.appendChild(script);
}

/** A new screen of the shop: gtag only counts the first page load by itself. */
export function googleAdsPageView() {
  if (!started || !window.gtag) return;
  window.gtag('event', 'page_view', { send_to: GOOGLE_ADS_ID, page_location: window.location.href, page_title: document.title });
}
