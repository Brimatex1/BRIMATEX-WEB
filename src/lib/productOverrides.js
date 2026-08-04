// Per-product admin overrides — feature icons, a description override, and
// an enabled/disabled toggle — independent of the product's own source
// (demo catalogue or Odoo). Backed by Postgres when DATABASE_URL is set
// (store/pg-product-overrides.js), otherwise by a local JSON file
// (store/file-product-overrides.js).

const db = require('./db');
const backend = db.isConfigured()
  ? require('./store/pg-product-overrides')
  : require('./store/file-product-overrides');

module.exports = backend;
