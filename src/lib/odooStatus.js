// Last Odoo failure, surfaced to admins so a bad connection is diagnosable.
//
// This was `let lastOdooError` in src/server.js: mutable state written by the
// product fetch and the support route, read by the dashboard. That worked
// while everything lived in one file, but splitting the router exposed it —
// a mutable value cannot be handed to another module without freezing at
// whatever it held the moment it was passed.
//
// So the state got an explicit owner. No implicit sharing through file scope,
// and no reader function injected to paper over it.

let last = null;

/** Records a failure with its timestamp. */
function record(err) {
  last = { message: err.message, at: new Date().toISOString() };
}

/** Cleared on the first successful fetch — a stale failure must not keep showing. */
function clear() {
  last = null;
}

/** The last failure, or null if nothing has gone wrong since the last success. */
function get() {
  return last;
}

module.exports = { record, clear, get };
