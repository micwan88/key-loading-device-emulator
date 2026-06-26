// In-memory keypair store — a module singleton that lives for the whole app
// session. The keypair persists across SPA navigation but is intentionally NOT
// written to browser storage, so it is lost on page reload (req 9).

import type { ECKeyPair } from "./ec.ts";

let currentKeyPair: ECKeyPair | null = null;

export function getKeyPair(): ECKeyPair | null {
  return currentKeyPair;
}

export function setKeyPair(pair: ECKeyPair | null): void {
  currentKeyPair = pair;
}
