# WhatsApp Integration Setup (Twilio)

This guide explains how to set up automatic invoice delivery via WhatsApp using Twilio.

## Overview

When a customer places an order, the system automatically sends their invoice details via WhatsApp. The message includes:
- Order number
- Invoice number  
- Invoice status (draft/posted/paid)
- Total amount
- Company information

## Configuration

### Option 1: Demo Mode (Free)

No configuration needed. The system will log WhatsApp messages to console without sending them.

```bash
node server.js
# Output: [WhatsApp Demo] Would send to +966501234567: 🧾 الفاتورة الخاصة بك من بريماتكس...
```

### Option 2: Twilio WhatsApp API (Production)

1. **Create a Twilio Account**
   - Go to https://www.twilio.com/console
   - Sign up and verify your phone number
   - Get your Account SID and Auth Token from the console dashboard

2. **Set Up WhatsApp Channel**
   - In Twilio Console: Messaging > Channels > WhatsApp
   - Choose "Sandbox" for free testing or "Production" for real messages
   - Sandbox mode requires customers to opt-in via template message first
   - Production requires WhatsApp Business Account approval (2-3 days)

3. **Configure Environment Variables**

```bash
export TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxx"
export TWILIO_AUTH_TOKEN="your_auth_token_here"
export TWILIO_WHATSAPP_FROM="whatsapp:+14155552671"  # Twilio sandbox number or your production number
```

For **Sandbox Testing** (no cost, instant):
- Default Sandbox number: `whatsapp:+14155552671`
- Customers receive welcome message with opt-in code
- Messages limited to 24-hour window per customer
- No rate limits

For **Production**:
- Get your own WhatsApp Business Number
- Requires WhatsApp Business Account setup
- Full message history available
- Higher rate limits

4. **Test the Integration**

```bash
# With demo mode
node server.js

# With Twilio (set env vars first)
export TWILIO_ACCOUNT_SID="your_sid"
export TWILIO_AUTH_TOKEN="your_token"
node server.js
```

Place a test order with a phone number. The invoice should be sent via WhatsApp within seconds.

## Sandbox Testing Flow

1. Join Twilio's WhatsApp Sandbox:
   - Go to https://www.twilio.com/console/sms/whatsapp/sandbox
   - Send "join <sandbox-code>" to sandbox number
   - You'll receive: "You successfully joined the WhatsApp Sandbox!"

2. Place an order with your phone number
3. Receive invoice via WhatsApp

## Message Format

```
🧾 الفاتورة الخاصة بك من بريماتكس

رقم الطلب: DEMO-851095
رقم الفاتورة: INV-851095
الحالة: ✅ منشورة
المبلغ: 5800 ر.س

شكراً لاختيارك بريماتكس 🛏️
للمزيد من المعلومات، يرجى زيارة موقعنا أو التواصل معنا.

تجربة 100 ليلة · توصيل مجاني · ضمان حتى 12 سنة
```

## Phone Number Formats

The system automatically formats phone numbers:
- `05xxxxxxxx` → `+966 5xxxxxxxx` (Saudi Arabia)
- `9665xxxxxxxx` → `+966 5xxxxxxxx`
- `+966xxxxxxxx` → `+966xxxxxxxx` (kept as-is)
- International: `+1234567890` → `+1234567890` (kept as-is)

## Error Handling

- **No phone number**: Message skipped, no error
- **Invalid Twilio credentials**: Logged to console, order still succeeds
- **Network error**: Logged, message may be retried in production
- **Customer not opted-in (Sandbox)**: Twilio returns error, logged to console

Errors do NOT block order completion—the invoice is still created in Odoo/demo mode.

## Monitoring

Check message delivery:
- **Console logs**: `[WhatsApp]` prefix shows all activity
- **Twilio Dashboard**: Messages > Logs shows delivery status
- **SMS log in Odoo**: If using Odoo SMS integration

## Costs

- **Demo/Sandbox**: Free (up to 100 messages)
- **Production**: $0.0079 USD per outbound message (estimate: ~₪0.03 per message)
- **Incoming messages**: Free

## Troubleshooting

**"No customer phone, skipping"**
- Customer didn't enter phone number in checkout form
- Check that form field is present in index.html

**"Message not received"**
- Sandbox: Customer didn't opt-in to sandbox
- Production: WhatsApp Business Account approval pending
- Network: Check Twilio dashboard for delivery status

**"Twilio error 400: Invalid phone"**
- Phone number format incorrect
- Check logs for formatted phone number
- Verify number starts with +

**"Twilio error 401: Unauthorized"**
- TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is wrong
- Check both values in Twilio Console
- Verify no extra spaces in env variables

## Integration with Odoo

When connected to real Odoo:
1. Order created → sale.order in Odoo
2. Sale order confirmed automatically
3. Invoice created (account.move)
4. WhatsApp message sent with invoice details
5. Customer receives message with order & invoice info

## Next Steps

- Set up SMS reminders for invoice payment
- Add customer chat handler for WhatsApp replies
- Implement delivery/payment status updates via WhatsApp
- Add order tracking link in WhatsApp message
