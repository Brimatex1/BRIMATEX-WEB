// The ad that brought a website customer, as the checkout sends it in
// `tracking.ad` (web/src/lib/pixel.ts captureClickId): the landing link's
// utm_source / utm_medium / utm_campaign, and fromAd for a click Meta tagged
// only with fbclid. Odoo puts it on the order's campaign and medium
// (src/lib/odoo.js createSaleOrder).
'use strict';

const text = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) : '') || undefined;

/** Short plain strings only, or null when the visit came from no ad. */
function adOrigin(tracking) {
  const ad = tracking && typeof tracking === 'object' && tracking.ad && typeof tracking.ad === 'object' ? tracking.ad : null;
  if (!ad) return null;
  const origin = { source: text(ad.source), medium: text(ad.medium), campaign: text(ad.campaign), fromAd: ad.fromAd === true };
  return origin.source || origin.medium || origin.campaign || origin.fromAd ? origin : null;
}

module.exports = { adOrigin };
