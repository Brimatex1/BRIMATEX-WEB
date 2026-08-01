// WhatsApp integration for automatic invoice delivery (Twilio + Odoo).
// Supports Twilio WhatsApp API and demo mode.
// Configure: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155552671';

function isConfigured() {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN);
}

async function sendInvoiceViaWhatsApp(customerPhone, invoiceName, invoiceStatus, total, orderName) {
  if (!customerPhone || !customerPhone.trim()) {
    console.log('[WhatsApp] No customer phone, skipping');
    return { sent: false, reason: 'no_phone' };
  }

  let formattedPhone = customerPhone.replace(/\s+/g, '');
  if (!formattedPhone.startsWith('+')) {
    if (formattedPhone.startsWith('0')) formattedPhone = '+966' + formattedPhone.substring(1);
    else if (!formattedPhone.startsWith('966')) formattedPhone = '+966' + formattedPhone;
    else formattedPhone = '+' + formattedPhone;
  }

  const message = `
🧾 *الفاتورة الخاصة بك من بريماتكس*

*رقم الطلب:* ${orderName}
*رقم الفاتورة:* ${invoiceName}
*الحالة:* ${invoiceStatus === 'posted' ? '✅ منشورة' : invoiceStatus === 'paid' ? '✅ مدفوعة' : '📋 مسودة'}
*المبلغ:* ${total} د.ل

شكراً لاختيارك بريماتكس 🛏️
للمزيد من المعلومات، يرجى زيارة موقعنا أو التواصل معنا.

_تجربة 100 ليلة · توصيل مجاني · ضمان حتى 12 سنة_
  `.trim();

  if (!isConfigured()) {
    console.log(`[WhatsApp Demo] Would send to ${formattedPhone}: ${message}`);
    return { sent: true, mode: 'demo', phone: formattedPhone };
  }

  try {
    const response = await sendTwilioWhatsApp(formattedPhone, message);
    console.log(`[WhatsApp] Message sent to ${formattedPhone}: ${response.sid}`);
    return { sent: true, mode: 'twilio', messageSid: response.sid, phone: formattedPhone };
  } catch (err) {
    console.error(`[WhatsApp Error] Failed to send to ${formattedPhone}:`, err.message);
    return { sent: false, error: err.message, phone: formattedPhone };
  }
}

async function sendTwilioWhatsApp(toPhone, message) {
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

  const formData = new URLSearchParams();
  formData.append('From', TWILIO_WHATSAPP_FROM);
  formData.append('To', `whatsapp:${toPhone}`);
  formData.append('Body', message);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Twilio error ${res.status}: ${error}`);
  }

  return res.json();
}

module.exports = {
  isConfigured,
  sendInvoiceViaWhatsApp,
};
