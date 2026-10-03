// Preloaded into a test server (NODE_OPTIONS=--require) to stop its clock:
// Date.now() and new Date() always give FROZEN_NOW, so every request lands in
// the same millisecond - what a fast CI runner does now and then.
'use strict';

const frozen = Date.parse(process.env.FROZEN_NOW || '2026-10-02T23:45:50.899Z');
const RealDate = Date;

class FrozenDate extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(frozen);
  }

  static now() {
    return frozen;
  }
}

global.Date = FrozenDate;
