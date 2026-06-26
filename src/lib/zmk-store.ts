// In-memory ZMK list — lives for the whole app session (lost on reload).

import type { ZmkType } from "./zmk.ts";

export interface Zmk {
  id: string;
  name: string;
  type: ZmkType;
  keyHex: string; // cleartext key, uppercase HEX
  kcv: string; // uppercase
}

let zmks: Zmk[] = [];

export function listZmks(): Zmk[] {
  return zmks;
}

export function getZmk(id: string): Zmk | undefined {
  return zmks.find((z) => z.id === id);
}

export function addZmk(zmk: Omit<Zmk, "id">): Zmk {
  const item: Zmk = { ...zmk, id: crypto.randomUUID() };
  zmks = [...zmks, item];
  return item;
}

export function deleteZmk(id: string): void {
  zmks = zmks.filter((z) => z.id !== id);
}
