// In-memory ZMK list — lives for the whole app session (lost on reload).

import type { ZmkType } from "./zmk.ts";

export interface Zmk {
  id: string; // internal record key (UUID)
  zmkId: string; // user-facing ZMK ID, 1-5 digits, value >= 1
  type: ZmkType;
  keyHex: string; // cleartext key, uppercase HEX
  kcv: string; // uppercase
  emvKcv?: string; // uppercase; AES keys only
}

let zmks: Zmk[] = [];

export function listZmks(): Zmk[] {
  return zmks;
}

export function getZmk(id: string): Zmk | undefined {
  return zmks.find((z) => z.id === id);
}

export function hasZmkId(zmkId: string): boolean {
  return zmks.some((z) => z.zmkId === zmkId);
}

// Next ZMK ID = max existing numeric ID + 1 (starts at 1 when empty).
export function nextZmkId(): number {
  const max = zmks.reduce((m, z) => Math.max(m, Number(z.zmkId)), 0);
  return max + 1;
}

export function addZmk(zmk: Omit<Zmk, "id">): Zmk {
  const item: Zmk = { ...zmk, id: crypto.randomUUID() };
  zmks = [...zmks, item];
  return item;
}

export function deleteZmk(id: string): void {
  zmks = zmks.filter((z) => z.id !== id);
}
