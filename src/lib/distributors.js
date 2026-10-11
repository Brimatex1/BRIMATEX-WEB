/**
 * Authorized distributors - where a customer outside Tripoli collects an
 * order, free (the owner's delivery rule: home delivery is inside Tripoli
 * only). They are Odoo contacts tagged «موزّع معتمد», each with a city and
 * an address; the owner keeps that list in Odoo. Read-only here.
 *
 * Without Odoo, or before any contact carries the tag, the list is empty: the
 * customer still chooses «استلام من موزّع معتمد», and the team calls them to
 * name the nearest one (the order's note says so).
 */
'use strict';

const odoo = require('./odoo');

/** The Odoo tag (res.partner.category) that marks a pickup point. */
const TAG = 'موزّع معتمد';
const TTL_MS = 10 * 60 * 1000;

let cache = { at: 0, list: [] };

/** «طرابلس» and «طرابلس » and «Tripoli» compare alike enough: trimmed, without diacritics or tatweel. */
function cityKey(city) {
  return String(city || '')
    .replace(/[ً-ٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .trim()
    .toLowerCase();
}

/** Every authorized distributor: [{ id, name, city, address, phone }]. Never throws. */
async function list() {
  if (!odoo.isConfigured()) return [];
  if (Date.now() - cache.at < TTL_MS) return cache.list;
  try {
    const rows = await odoo.call('res.partner', 'search_read', [[['category_id.name', '=', TAG], ['active', '=', true]]], {
      fields: ['id', 'name', 'city', 'street', 'phone'],
      order: 'city, name',
    });
    cache = {
      at: Date.now(),
      list: rows.map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city || '',
        address: r.street || '',
        phone: r.phone || null,
      })),
    };
  } catch (err) {
    console.error('[distributors]', err.message);
    // Keep serving the last good list rather than none.
    cache.at = Date.now() - TTL_MS + 60_000;
  }
  return cache.list;
}

/** The distributors in a city (all of them when no city is given). */
async function forCity(city) {
  const all = await list();
  if (!city) return all;
  const key = cityKey(city);
  return all.filter((d) => cityKey(d.city) === key);
}

/** One distributor by its Odoo id, or null. */
async function byId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return (await list()).find((d) => d.id === n) || null;
}

/** Whether a city is Tripoli - the only city with home delivery. */
function isTripoli(city) {
  const key = cityKey(city);
  return key === cityKey('طرابلس') || key === 'tripoli';
}

module.exports = { list, forCity, byId, isTripoli, cityKey, TAG };
