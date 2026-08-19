// Keeps Node from ever loading undici. Must be required before anything else.
//
// Node exposes fetch, FormData, Headers, Request and Response as *lazy*
// globals: the first time any of them is touched — even by a
// `typeof fetch !== 'undefined'` feature check inside a dependency — Node
// loads its bundled undici, and undici compiles its HTTP parser (llhttp) to
// WebAssembly. The production host cannot instantiate WASM (CloudLinux/LVE
// address-space cap), so that single property access is fatal:
//
//   RangeError: WebAssembly.instantiate(): Out of memory:
//   Cannot allocate Wasm memory for new instance
//       at lazyllhttp (node:internal/deps/undici/undici)
//
// On Node 20 `require('pg')` alone is enough: pg's stream.js sniffs for the
// Cloudflare Workers runtime with `new Response(...)`, and that one touch
// loads undici. The globals are therefore *removed*, not stubbed — a stub
// still gets constructed by that check, while an absent global makes the
// `typeof Response === 'function'` test fail and pg move on.
//
// Outbound HTTP in this project goes through src/lib/http.js (node:https).

const UNDICI_GLOBALS = ['fetch', 'FormData', 'Headers', 'Request', 'Response'];

for (const name of UNDICI_GLOBALS) {
  // Never *read* the property first: reading FormData's descriptor — and even
  // redefining it in place — loads undici on some Node versions, which is the
  // exact crash being avoided. `delete` drops the lazy binding without
  // materialising it.
  try {
    delete globalThis[name];
  } catch {
    // Non-configurable on this runtime; fall through to the override below.
  }

  if (name in globalThis) {
    try {
      Object.defineProperty(globalThis, name, {
        value: undefined,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    } catch {
      // Nothing further to try — leave it as Node defined it.
    }
  }
}
