// WhatsApp Cloud API (Meta) — used to deliver one-time password codes.
//
// Distinct from src/lib/whatsapp.js, which sends invoices through Twilio: this
// talks to Meta's Graph API directly and only ever sends an *authentication*
// template, the one category Meta allows for OTP delivery.
//
// Configure:
//   WHATSAPP_TOKEN            permanent system-user token (not a 24h test one)
//   WHATSAPP_PHONE_NUMBER_ID  the number's id in the WhatsApp Business Account
//   WHATSAPP_OTP_TEMPLATE     approved authentication template name
//   WHATSAPP_OTP_LANG         template language code (default: ar)
//
// The number registered here leaves the ordinary WhatsApp app for good, so it
// must not be the sales line customers chat with.
//
// Outbound HTTP goes through src/lib/http.js (node:https) — never fetch. See
// src/lib/no-undici.js for why that is fatal on this host.

const http = require('./http');

const GRAPH_VERSION = 'v21.0';

const TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const TEMPLATE = process.env.WHATSAPP_OTP_TEMPLATE || 'brimatex_otp';
const LANG = process.env.WHATSAPP_OTP_LANG || 'ar';

function isConfigured() {
  return Boolean(TOKEN && PHONE_NUMBER_ID);
}

/**
 * Libyan numbers to the international form Meta expects, digits only.
 *
 *   0912345678  ->  218912345678
 *   +218912345678 / 00218912345678 -> 218912345678
 */
function toInternational(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('00218')) return digits.slice(2);
  if (digits.startsWith('218')) return digits;
  if (digits.startsWith('0')) return `218${digits.slice(1)}`;
  return `218${digits}`;
}

/**
 * Sends `code` as an authentication template.
 *
 * Meta's authentication templates carry the code twice: once in the body and
 * once in the copy-code button. Sending only the body is rejected with
 * "number of parameters does not match", which is the single most common
 * first-time failure here.
 *
 * Resolves { sent: true } or { sent: false, reason } — never throws, because a
 * delivery failure must not take down the request that triggered it.
 */
async function sendOtp(phone, code) {
  const to = toInternational(phone);

  if (!isConfigured()) {
    // Demo mode keeps the whole flow testable without a WABA: the code goes to
    // the log instead of the customer.
    console.log(`[WhatsApp OTP demo] ${to} -> ${code}`);
    return { sent: true, mode: 'demo' };
  }

  try {
    await http.postJson(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: TEMPLATE,
          language: { code: LANG },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: code }],
            },
          ],
        },
      },
      { Authorization: `Bearer ${TOKEN}` }
    );
    return { sent: true, mode: 'cloud' };
  } catch (err) {
    // The Graph error body carries the real cause (template not approved,
    // number not opted in, token expired); keep it in the log, never in the
    // HTTP response — it would tell an attacker whether the number exists.
    console.error('[WhatsApp OTP] send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { isConfigured, sendOtp, toInternational };
