// In-memory symmetric working-key list — lives for the whole app session (lost on
// reload), same as the ZMK store. Independent of ZMKs; ZMKs only protect these keys
// during TR-31 import/export.

import type { ZmkType } from "./zmk.ts";

export interface SymKey {
  id: string; // internal record key (UUID)
  keyId: string; // user-facing Key ID, 1-5 digits, value >= 1
  type: ZmkType;
  keyHex: string; // cleartext key, uppercase HEX
  kcv: string; // uppercase
  emvKcv?: string; // uppercase; AES keys only
}

let keys: SymKey[] = [];

export function listKeys(): SymKey[] {
  return keys;
}

export function getKey(id: string): SymKey | undefined {
  return keys.find((k) => k.id === id);
}

export function hasKeyId(keyId: string): boolean {
  return keys.some((k) => k.keyId === keyId);
}

// Next Key ID = max existing numeric ID + 1 (starts at 1 when empty).
export function nextKeyId(): number {
  const max = keys.reduce((m, k) => Math.max(m, Number(k.keyId)), 0);
  return max + 1;
}

export function addKey(key: Omit<SymKey, "id">): SymKey {
  const item: SymKey = { ...key, id: crypto.randomUUID() };
  keys = [...keys, item];
  return item;
}

export function deleteKey(id: string): void {
  keys = keys.filter((k) => k.id !== id);
}
