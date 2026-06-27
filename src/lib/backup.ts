// App backup / restore — bundle the keypair (PKCS#8 PEM) and the in-memory ZMK and
// working-key lists into a single ZIP (the ".bak" file), and restore them back.
//
// Restore is REPLACE-ALL: existing keypair, ZMKs and keys are cleared first. Every
// key row's KCV is re-verified against the stored key value; mismatched rows are skipped.

import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { hexToBytes } from "./ec.ts";
import { exportKeyPairPkcs8Pem, importKeyPairFromPkcs8Pem } from "./ec.ts";
import { getKeyPair, setKeyPair } from "./store.ts";
import { type ZmkType, ZMK_TYPES, computeKcv, computeEmvKcv } from "./zmk.ts";
import { listZmks, addZmk, clearZmks } from "./zmk-store.ts";
import { listKeys, addKey, clearKeys } from "./key-store.ts";

const CSV_HEADER = "ID,Type,KeyValue,KCV";

interface KeyRow {
  id: string;
  type: ZmkType;
  keyHex: string;
  kcv: string;
}

function buildCsv(rows: { id: string; type: ZmkType; keyHex: string; kcv: string }[]): string {
  const body = rows.map((r) => [r.id, r.type, r.keyHex, r.kcv].join(",")).join("\n");
  return rows.length ? `${CSV_HEADER}\n${body}\n` : `${CSV_HEADER}\n`;
}

function parseCsv(text: string): KeyRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((s) => s.trim());
  const idx = {
    id: header.indexOf("ID"),
    type: header.indexOf("Type"),
    keyHex: header.indexOf("KeyValue"),
    kcv: header.indexOf("KCV"),
  };
  if (Object.values(idx).some((i) => i < 0)) throw new Error("Invalid backup CSV header");
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((s) => s.trim());
    return {
      id: cols[idx.id],
      type: cols[idx.type] as ZmkType,
      keyHex: cols[idx.keyHex].toUpperCase(),
      kcv: cols[idx.kcv].toUpperCase(),
    };
  });
}

export async function buildBackupZip(): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};

  const pair = getKeyPair();
  if (pair) {
    files["keypair.pem"] = strToU8(await exportKeyPairPkcs8Pem(pair));
  }

  files["zmks.csv"] = strToU8(
    buildCsv(listZmks().map((z) => ({ id: z.zmkId, type: z.type, keyHex: z.keyHex, kcv: z.kcv }))),
  );
  files["keys.csv"] = strToU8(
    buildCsv(listKeys().map((k) => ({ id: k.keyId, type: k.type, keyHex: k.keyHex, kcv: k.kcv }))),
  );

  return zipSync(files);
}

export interface RestoreSummary {
  keypair: boolean; // a keypair was restored
  zmks: number; // ZMKs restored
  keys: number; // keys restored
  skipped: string[]; // human-readable reasons for skipped rows
}

// Validate a row, recompute its KCV, and return the saveable record or a skip reason.
function verifyRow(label: string, row: KeyRow): { ok: true; emvKcv?: string } | { ok: false; reason: string } {
  if (!ZMK_TYPES.includes(row.type)) {
    return { ok: false, reason: `${label} ${row.id}: unknown type "${row.type}"` };
  }
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(row.keyHex);
  } catch {
    return { ok: false, reason: `${label} ${row.id}: invalid key value` };
  }
  const kcv = computeKcv(row.type, bytes);
  if (kcv !== row.kcv) {
    return { ok: false, reason: `${label} ${row.id}: KCV mismatch (backup ${row.kcv}, computed ${kcv})` };
  }
  return { ok: true, emvKcv: row.type.startsWith("AES") ? computeEmvKcv(bytes) : undefined };
}

export async function restoreBackupZip(bytes: Uint8Array): Promise<RestoreSummary> {
  const files = unzipSync(bytes);
  const summary: RestoreSummary = { keypair: false, zmks: 0, keys: 0, skipped: [] };

  // Parse + verify everything BEFORE mutating state, so a malformed archive doesn't
  // wipe the app's current data.
  const zmkRows = files["zmks.csv"] ? parseCsv(strFromU8(files["zmks.csv"])) : [];
  const keyRows = files["keys.csv"] ? parseCsv(strFromU8(files["keys.csv"])) : [];

  const pemText = files["keypair.pem"] ? strFromU8(files["keypair.pem"]) : null;
  const pair = pemText ? await importKeyPairFromPkcs8Pem(pemText) : null;

  // Replace-all.
  clearZmks();
  clearKeys();
  setKeyPair(pair);
  summary.keypair = pair !== null;

  for (const row of zmkRows) {
    const v = verifyRow("ZMK", row);
    if (!v.ok) summary.skipped.push(v.reason);
    else {
      addZmk({ zmkId: row.id, type: row.type, keyHex: row.keyHex, kcv: row.kcv, emvKcv: v.emvKcv });
      summary.zmks++;
    }
  }
  for (const row of keyRows) {
    const v = verifyRow("Key", row);
    if (!v.ok) summary.skipped.push(v.reason);
    else {
      addKey({ keyId: row.id, type: row.type, keyHex: row.keyHex, kcv: row.kcv, emvKcv: v.emvKcv });
      summary.keys++;
    }
  }

  return summary;
}
