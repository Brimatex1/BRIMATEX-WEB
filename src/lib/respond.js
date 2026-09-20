/**
 * أدوات HTTP مشتركة — الردّ وقراءة الجسم.
 *
 * كانتا في src/server.js فتُحقَنان في كل وحدة مسارات. وهما دالتان نقيتان
 * بلا حالة ولا اعتماد على شيء في الخادم — فالحقن كان ضريبة موضِع لا ضرورة
 * تصميم. صارتا وحدةً تُستورد مباشرةً.
 *
 * ترويسات الأمان في sendJson تلزم كل ردّ JSON لا بعضه، ووجودها في مكان
 * واحد هو ما يضمن ذلك.
 */
'use strict';

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req, maxBytes = 100_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    const onData = (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        req.destroy();
        reject(new Error('حجم الطلب كبير جداً'));
      }
    };
    const onEnd = () => resolve(data);
    const onError = reject;
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

module.exports = { sendJson, readBody };
