// Order history — every order ever placed, whether it went to Odoo or ran in
// demo mode. Backed by Postgres when DATABASE_URL is set (store/pg-orders.js),
// otherwise by the local JSONL log (store/file-orders.js).

const db = require('./db');
const backend = db.isConfigured() ? require('./store/pg-orders') : require('./store/file-orders');

module.exports = backend;
