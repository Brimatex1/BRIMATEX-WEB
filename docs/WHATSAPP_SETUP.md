# WhatsApp

The server talks to WhatsApp in two separate ways. Both are optional: left
unconfigured, the store works and nothing is sent.

| Purpose | Service | Code | Variables |
|---|---|---|---|
| One-time codes - opening an account, resetting a password | WhatsApp Cloud API (Meta) | `src/lib/whatsapp-cloud.js`, `src/lib/otp.js` | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_OTP_TEMPLATE`, `WHATSAPP_OTP_LANG` |
| An invoice message after each order | Twilio | `src/lib/whatsapp.js` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` |

The «chat with us» button is neither: it is a plain `wa.me` link to the
support line (`WHATSAPP_SUPPORT_PHONE`, or the dashboard).

## One-time codes (Cloud API)

Sign-in is phone number + password. A WhatsApp code is sent only to prove a
number: once when an account is opened (`/api/auth/signup/otp/*`), and when a
password is forgotten (`/api/auth/otp/*`). A code lives 5 minutes and allows 5
attempts (`src/lib/otp.js`).

**Without the variables** the code is printed to the server log instead
(`[WhatsApp OTP demo] 218… -> 123456`), so the whole flow can be tested locally.

To send for real:

1. In Meta Business Manager, add a phone number to a WhatsApp Business Account.
   That number leaves the ordinary WhatsApp app for good - it must **not** be
   the sales line customers chat with.
2. Create a message template of category **Authentication** (Meta allows no
   other category for codes), language Arabic, and wait for approval. Its name
   goes in `WHATSAPP_OTP_TEMPLATE` (default `brimatex_otp`).
3. Create a **system user** with a permanent token that has
   `whatsapp_business_messaging`. The token the App Dashboard shows by default
   expires after 24 hours.
4. In `.env` on the server:

   ```
   WHATSAPP_TOKEN=...
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_OTP_TEMPLATE=brimatex_otp
   WHATSAPP_OTP_LANG=ar
   ```

5. Restart the app. Numbers are sent in the international Libyan form
   (`0912345678` -> `218912345678`).

The token is a secret: only in `.env` on the server, never in the repository
or a chat.

## Invoice message (Twilio)

After an order is created in Odoo, `src/routes/orders.js` sends the customer a
short invoice message, fire-and-forget - a failure never affects the order.
Without the Twilio variables the message is only logged.

1. Create a Twilio account and enable the WhatsApp channel (the sandbox for
   testing, an approved WhatsApp sender for production).
2. In `.env`:

   ```
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_WHATSAPP_FROM=whatsapp:+218...
   ```

3. Restart the app. Numbers are sent as Libyan E.164, through the same
   `toInternational()` the one-time codes use (`0912345678`, `218912345678`,
   `+218 091…` -> `+218912345678`); covered by `tests/whatsapp.check.js`.
