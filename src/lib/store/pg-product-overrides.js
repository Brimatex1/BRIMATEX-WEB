// Postgres-backed product overrides (icons, description, enabled, image).
// Used when DATABASE_URL is set — see src/lib/productOverrides.js, which
// picks this or store/file-product-overrides.js.

const db = require('../db');

function toOverrides(row) {
  return {
    iconKeys: row?.icon_keys || [],
    description: row?.description ?? null,
    enabled: row?.enabled ?? true,
    imageUrl: row?.image_url ?? null,
  };
}

async function getOverridesForProduct(productId) {
  const { rows } = await db.query(
    'select icon_keys, description, enabled, image_url from product_overrides where product_id = $1',
    [productId]
  );
  return toOverrides(rows[0]);
}

async function getAllOverrides() {
  const { rows } = await db.query(
    'select product_id, icon_keys, description, enabled, image_url from product_overrides'
  );
  const map = {};
  for (const row of rows) map[String(row.product_id)] = toOverrides(row);
  return map;
}

async function setOverridesForProduct(productId, changes) {
  const current = await getOverridesForProduct(productId);
  const next = { ...current, ...changes };
  await db.query(
    `insert into product_overrides (product_id, icon_keys, description, enabled, image_url, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (product_id) do update
       set icon_keys = $2, description = $3, enabled = $4, image_url = $5, updated_at = now()`,
    [productId, JSON.stringify(next.iconKeys), next.description, next.enabled, next.imageUrl]
  );
  return next;
}

module.exports = { getOverridesForProduct, getAllOverrides, setOverridesForProduct };
