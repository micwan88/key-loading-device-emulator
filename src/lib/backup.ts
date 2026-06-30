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

// A KCV-mismatched row held back from restore until the user chooses Accept or Skip.
export interface PendingRow {
  store: "zmk" | "key";
  label: string; // "ZMK" | "Key" — for human-readable messages
  id: string;
  type: ZmkType;
  keyHex: string;
  backupKcv: string; // KCV recorded in the backup file
  computedKcv: string; // KCV computed from the key value
}

export interface RestoreSummary {
  keypair: boolean; // a keypair was restored
  zmks: number; // ZMKs restored (matching KCV)
  keys: number; // keys restored (matching KCV)
  skipped: string[]; // structurally-invalid rows that were dropped
  pending: PendingRow[]; // KCV-mismatched rows awaiting the user's Accept/Skip choice
}

type RowResult =
  | { kind: "ok"; emvKcv?: string }
  | { kind: "mismatch"; computed: string }
  | { kind: "invalid"; reason: string };

// Validate a row and recompute its KCV: ok (matches), mismatch (KCV differs), or
// invalid (structurally broken — unknown type or non-hex key value).
function classifyRow(label: string, row: KeyRow): RowResult {
  if (!ZMK_TYPES.includes(row.type)) {
    return { kind: "invalid", reason: `${label} ${row.id}: unknown type "${row.type}"` };
  }
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(row.keyHex);
  } catch {
    return { kind: "invalid", reason: `${label} ${row.id}: invalid key value` };
  }
  const kcv = computeKcv(row.type, bytes);
  if (kcv !== row.kcv) return { kind: "mismatch", computed: kcv };
  return { kind: "ok", emvKcv: row.type.startsWith("AES") ? computeEmvKcv(bytes) : undefined };
}

export async function restoreBackupZip(bytes: Uint8Array): Promise<RestoreSummary> {
  const files = unzipSync(bytes);
  const summary: RestoreSummary = { keypair: false, zmks: 0, keys: 0, skipped: [], pending: [] };

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

  const handle = (store: "zmk" | "key", label: string, row: KeyRow): void => {
    const v = classifyRow(label, row);
    if (v.kind === "invalid") {
      summary.skipped.push(v.reason);
    } else if (v.kind === "mismatch") {
      summary.pending.push({
        store,
        label,
        id: row.id,
        type: row.type,
        keyHex: row.keyHex,
        backupKcv: row.kcv,
        computedKcv: v.computed,
      });
    } else if (store === "zmk") {
      addZmk({ zmkId: row.id, type: row.type, keyHex: row.keyHex, kcv: row.kcv, emvKcv: v.emvKcv });
      summary.zmks++;
    } else {
      addKey({ keyId: row.id, type: row.type, keyHex: row.keyHex, kcv: row.kcv, emvKcv: v.emvKcv });
      summary.keys++;
    }
  };

  for (const row of zmkRows) handle("zmk", "ZMK", row);
  for (const row of keyRows) handle("key", "Key", row);

  return summary;
}

// Commit Accepted (KCV-mismatched) rows, storing a freshly recomputed correct KCV so
// the app's displayed values stay self-consistent with the key value.
export function commitPending(rows: PendingRow[]): { zmks: number; keys: number } {
  let zmks = 0;
  let keys = 0;
  for (const r of rows) {
    const bytes = hexToBytes(r.keyHex);
    const kcv = computeKcv(r.type, bytes);
    const emvKcv = r.type.startsWith("AES") ? computeEmvKcv(bytes) : undefined;
    if (r.store === "zmk") {
      addZmk({ zmkId: r.id, type: r.type, keyHex: r.keyHex, kcv, emvKcv });
      zmks++;
    } else {
      addKey({ keyId: r.id, type: r.type, keyHex: r.keyHex, kcv, emvKcv });
      keys++;
    }
  }
  return { zmks, keys };
}
