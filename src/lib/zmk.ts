// Zone Master Key (ZMK) operations: KCV, ANSI X9.63 KDF, ECDH derivation, and
// the Thales payShield TMD "MZMKdata" CSV.
//
// ECDH + X9.63 KDF use native Web Crypto. KCV uses crypto-js because native Web
// Crypto has no 3DES and rejects AES-192.

import CryptoJS from "crypto-js";
import { type CurveName, type ECKeyPair, bytesToHex, hexToBytes, exportPublicSpki } from "./ec.ts";

export type ZmkType = "DES2EDE" | "DES3EDE" | "AES128" | "AES192" | "AES256";

export const ZMK_TYPES: ZmkType[] = ["DES2EDE", "DES3EDE", "AES128", "AES192", "AES256"];

export const ZMK_KEY_LEN: Record<ZmkType, number> = {
  DES2EDE: 16,
  DES3EDE: 24,
  AES128: 16,
  AES192: 24,
  AES256: 32,
};

// CSV "MZMK KEY SCHEME" labels.
export const ZMK_SCHEME: Record<ZmkType, string> = {
  DES2EDE: "Double Length 3DES",
  DES3EDE: "Triple Length 3DES",
  AES128: "128-bit AES",
  AES192: "192-bit AES",
  AES256: "256-bit AES",
};

const SCHEME_TO_TYPE: Record<string, ZmkType> = Object.fromEntries(
  Object.entries(ZMK_SCHEME).map(([t, s]) => [s, t as ZmkType]),
) as Record<string, ZmkType>;

// ---------------------------------------------------------------------------
// KCV — first 3 bytes of ECB-encrypting an all-zero block with the key.
// ---------------------------------------------------------------------------

function toWordArray(bytes: Uint8Array): CryptoJS.lib.WordArray {
  return CryptoJS.enc.Hex.parse(bytesToHex(bytes));
}

export function computeKcv(type: ZmkType, key: Uint8Array): string {
  const opts = { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding };
  let cipher: CryptoJS.lib.CipherParams;

  if (type.startsWith("AES")) {
    cipher = CryptoJS.AES.encrypt(CryptoJS.enc.Hex.parse("00".repeat(16)), toWordArray(key), opts);
  } else {
    // crypto-js TripleDES needs a 24-byte key. Expand 2-key (16-byte) to K1|K2|K1.
    let k = key;
    if (type === "DES2EDE") {
      k = new Uint8Array(24);
      k.set(key);
      k.set(key.slice(0, 8), 16);
    }
    cipher = CryptoJS.TripleDES.encrypt(CryptoJS.enc.Hex.parse("00".repeat(8)), toWordArray(k), opts);
  }
  return cipher.ciphertext.toString(CryptoJS.enc.Hex).slice(0, 6).toUpperCase();
}

// ---------------------------------------------------------------------------
// ANSI X9.63 KDF (SHA-256):
//   K = Hash(Z ‖ Counter ‖ SharedInfo) ‖ Hash(Z ‖ Counter+1 ‖ SharedInfo) ‖ ...
//   Counter is a 4-byte big-endian integer starting at 0x00000001.
// ---------------------------------------------------------------------------

export async function x963Kdf(
  z: Uint8Array,
  sharedInfo: Uint8Array,
  keyLen: number,
): Promise<Uint8Array> {
  const out = new Uint8Array(keyLen);
  let offset = 0;
  let counter = 1;
  while (offset < keyLen) {
    const ctr = new Uint8Array(4);
    new DataView(ctr.buffer).setUint32(0, counter, false); // big-endian
    const block = new Uint8Array(z.length + 4 + sharedInfo.length);
    block.set(z, 0);
    block.set(ctr, z.length);
    block.set(sharedInfo, z.length + 4);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", block));
    const take = Math.min(digest.length, keyLen - offset);
    out.set(digest.subarray(0, take), offset);
    offset += take;
    counter++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// ECDH — re-import our keypair (stored as ECDSA) and their public key as ECDH.
// ---------------------------------------------------------------------------

async function toEcdhPrivate(pair: ECKeyPair): Promise<CryptoKey> {
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: pair.curve, d: jwk.d, x: jwk.x, y: jwk.y, ext: true },
    { name: "ECDH", namedCurve: pair.curve },
    false,
    ["deriveBits"],
  );
}

export async function importTheirPublic(
  der: Uint8Array<ArrayBuffer>,
  curve: CurveName,
): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", der, { name: "ECDH", namedCurve: curve }, true, []);
}

async function ecdhSharedSecret(ourPriv: CryptoKey, theirPub: CryptoKey): Promise<Uint8Array> {
  // length=null returns the full field-sized x-coordinate (correct for P-521).
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: theirPub },
    ourPriv,
    null as unknown as number,
  );
  return new Uint8Array(bits);
}

export interface DerivedZmk {
  keyBytes: Uint8Array;
  keyHex: string; // uppercase
  kcv: string; // uppercase
}

export async function deriveZmk(input: {
  ourKeyPair: ECKeyPair;
  theirPublicDer: Uint8Array<ArrayBuffer>;
  sharedInfo: Uint8Array;
  type: ZmkType;
}): Promise<DerivedZmk> {
  const ourPriv = await toEcdhPrivate(input.ourKeyPair);
  const theirPub = await importTheirPublic(input.theirPublicDer, input.ourKeyPair.curve);
  const z = await ecdhSharedSecret(ourPriv, theirPub);
  const keyBytes = await x963Kdf(z, input.sharedInfo, ZMK_KEY_LEN[input.type]);
  return {
    keyBytes,
    keyHex: bytesToHex(keyBytes).toUpperCase(),
    kcv: computeKcv(input.type, keyBytes),
  };
}

// ---------------------------------------------------------------------------
// Helpers for inputting the other party's public key.
// ---------------------------------------------------------------------------

export function randomSharedInfo(): Uint8Array {
  const b = new Uint8Array(128);
  crypto.getRandomValues(b);
  return b;
}

export function publicPemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Thales payShield TMD "MZMKdata" CSV (lowercase hex content).
// ---------------------------------------------------------------------------

const MZMK_HEADER =
  "VERSION,YEAR,MONTH,DAY,HOUR,MINUTE,SHARED INFORMATION,MZMK CHECK VALUE,MZMK KEY SCHEME,HSM PUBLIC KEY";

export async function buildMzmkCsv(input: {
  sharedInfo: Uint8Array;
  kcv: string;
  type: ZmkType;
  ourKeyPair: ECKeyPair;
  date?: Date;
}): Promise<string> {
  const d = input.date ?? new Date();
  const ourPublicDer = (await exportPublicSpki(input.ourKeyPair, "der")) as Uint8Array;
  const row = [
    "1",
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    bytesToHex(input.sharedInfo),
    input.kcv.toLowerCase(),
    ZMK_SCHEME[input.type],
    bytesToHex(ourPublicDer),
  ].join(",");
  return `${MZMK_HEADER}\n${row}\n`;
}

export interface ParsedMzmk {
  sharedInfo: Uint8Array;
  kcv: string; // uppercase
  type: ZmkType;
  theirPublicDer: Uint8Array<ArrayBuffer>;
}

export function parseMzmkCsv(text: string): ParsedMzmk {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV has no data row");
  const header = lines[0].split(",").map((s) => s.trim());
  const cols = lines[1].split(",").map((s) => s.trim());
  const get = (name: string): string => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Missing column: ${name}`);
    return cols[i];
  };
  const scheme = get("MZMK KEY SCHEME");
  const type = SCHEME_TO_TYPE[scheme];
  if (!type) throw new Error(`Unknown MZMK KEY SCHEME: ${scheme}`);
  return {
    sharedInfo: hexToBytes(get("SHARED INFORMATION")),
    kcv: get("MZMK CHECK VALUE").toUpperCase(),
    type,
    theirPublicDer: hexToBytes(get("HSM PUBLIC KEY")),
  };
}
