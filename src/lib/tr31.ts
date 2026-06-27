// TR-31 / ASC X9.143 key blocks — versions B (TDES) and D (AES).
//
// The construction mirrors the widely-used pyTR31 reference: a counter-mode CMAC
// key-derivation produces a Key Block Encryption Key (KBEK) and a MAC Key (KBMK)
// from the Key Block Protection Key (KBPK = the ZMK); the MAC over header+cleartext
// is used as the CBC IV. CMAC and the KDF are built here on crypto-js single-block
// ciphers because crypto-js has no CMAC and Web Crypto has no 3DES.

import CryptoJS from "crypto-js";
import { bytesToHex, hexToBytes } from "./ec.ts";
import { type ZmkType, ZMK_KEY_LEN } from "./zmk.ts";

export type Tr31Version = "B" | "D";

type CipherFamily = "TDES" | "AES";

// ---------------------------------------------------------------------------
// Header option lists (ASC X9.143). Symmetric key usages only — asymmetric
// codes (D1, E7, K2, K3, S0-S2) are intentionally excluded.
// ---------------------------------------------------------------------------

export interface CodeLabel {
  code: string;
  label: string;
}

export const KEY_USAGES: CodeLabel[] = [
  { code: "B0", label: "BDK Base Derivation Key" },
  { code: "B1", label: "Initial DUKPT Key" },
  { code: "B2", label: "Base Key Variant Key" },
  { code: "B3", label: "Key Derivation Key (non X9.24)" },
  { code: "C0", label: "CVK Card Verification Key" },
  { code: "D0", label: "Data Encryption Key (generic)" },
  { code: "D2", label: "Data Encryption Key for Decimalization Table" },
  { code: "D3", label: "Data Encryption Key for Sensitive Data" },
  { code: "E0", label: "EMV MK: Application Cryptograms (MKAC)" },
  { code: "E1", label: "EMV MK: Secure Messaging Confidentiality (MKSMC)" },
  { code: "E2", label: "EMV MK: Secure Messaging Integrity (MKSMI)" },
  { code: "E3", label: "EMV MK: Data Authentication Code (MKDAC)" },
  { code: "E4", label: "EMV MK: Dynamic Numbers (MKDN)" },
  { code: "E5", label: "EMV MK: Card Personalization" },
  { code: "E6", label: "EMV MK: Other" },
  { code: "I0", label: "Initialization Vector (IV)" },
  { code: "K0", label: "Key Encryption / Wrapping Key" },
  { code: "K1", label: "TR-31 Key Block Protection Key" },
  { code: "K4", label: "Key Block Protection Key (ISO 20038)" },
  { code: "M0", label: "ISO 16609 MAC Algorithm 1 (TDEA)" },
  { code: "M1", label: "ISO 9797-1 MAC Algorithm 1" },
  { code: "M2", label: "ISO 9797-1 MAC Algorithm 2" },
  { code: "M3", label: "ISO 9797-1 MAC Algorithm 3" },
  { code: "M4", label: "ISO 9797-1 MAC Algorithm 4" },
  { code: "M5", label: "ISO 9797-1:2011 MAC Algorithm 5" },
  { code: "M6", label: "ISO 9797-1:2011 MAC Algorithm 5 / CMAC" },
  { code: "M7", label: "HMAC" },
  { code: "M8", label: "ISO 9797-1:2011 MAC Algorithm 6" },
  { code: "P0", label: "PIN Encryption Key" },
  { code: "P1", label: "PIN Generation Key (PGK)" },
  { code: "V0", label: "PIN Verification, KPV / other" },
  { code: "V1", label: "PIN Verification, IBM 3624" },
  { code: "V2", label: "PIN Verification, VISA PVV" },
  { code: "V3", label: "PIN Verification, X9-132 Algorithm 1" },
  { code: "V4", label: "PIN Verification, X9-132 Algorithm 2" },
];

export const MODES_OF_USE: CodeLabel[] = [
  { code: "B", label: "Both Encrypt/Wrap and Decrypt/Unwrap" },
  { code: "C", label: "Both Generate and Verify" },
  { code: "D", label: "Decrypt / Unwrap Only" },
  { code: "E", label: "Encrypt / Wrap Only" },
  { code: "G", label: "Generate Only" },
  { code: "N", label: "No special restrictions" },
  { code: "S", label: "Signature Only" },
  { code: "T", label: "Both Sign and Decrypt" },
  { code: "V", label: "Verify Only" },
  { code: "X", label: "Key used to derive other keys" },
  { code: "Y", label: "Key used to create key variants" },
];

export const EXPORTABILITIES: CodeLabel[] = [
  { code: "E", label: "Exportable under a KEK (TR-31 form)" },
  { code: "N", label: "Non-exportable" },
  { code: "S", label: "Sensitive (exportable in non-X9.143 form)" },
];

// ---------------------------------------------------------------------------
// crypto-js byte/word helpers and single-block / CBC primitives
// ---------------------------------------------------------------------------

type WA = CryptoJS.lib.WordArray;
const toWA = (b: Uint8Array): WA => CryptoJS.enc.Hex.parse(bytesToHex(b));
const fromWA = (w: WA): Uint8Array => hexToBytes(w.toString(CryptoJS.enc.Hex));

const BLOCK: Record<CipherFamily, number> = { TDES: 8, AES: 16 };
const RB: Record<CipherFamily, number> = { TDES: 0x1b, AES: 0x87 };

// crypto-js TripleDES needs a 24-byte key; expand a 2-key (16-byte) value to K1|K2|K1.
function expandKey(family: CipherFamily, key: Uint8Array): Uint8Array {
  if (family === "TDES" && key.length === 16) {
    const k = new Uint8Array(24);
    k.set(key);
    k.set(key.slice(0, 8), 16);
    return k;
  }
  return key;
}

function encryptBlock(family: CipherFamily, key: Uint8Array, block: Uint8Array): Uint8Array {
  const keyWA = toWA(expandKey(family, key));
  const opts = { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding };
  const enc =
    family === "AES"
      ? CryptoJS.AES.encrypt(toWA(block), keyWA, opts)
      : CryptoJS.TripleDES.encrypt(toWA(block), keyWA, opts);
  return fromWA(enc.ciphertext);
}

function cbcEncrypt(family: CipherFamily, key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const opts = { iv: toWA(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding };
  const keyWA = toWA(expandKey(family, key));
  const enc =
    family === "AES"
      ? CryptoJS.AES.encrypt(toWA(data), keyWA, opts)
      : CryptoJS.TripleDES.encrypt(toWA(data), keyWA, opts);
  return fromWA(enc.ciphertext);
}

function cbcDecrypt(family: CipherFamily, key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const opts = { iv: toWA(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding };
  const keyWA = toWA(expandKey(family, key));
  const params = CryptoJS.lib.CipherParams.create({ ciphertext: toWA(data) });
  const dec =
    family === "AES"
      ? CryptoJS.AES.decrypt(params, keyWA, opts)
      : CryptoJS.TripleDES.decrypt(params, keyWA, opts);
  return fromWA(dec);
}

// ---------------------------------------------------------------------------
// CMAC (NIST SP 800-38B / RFC 4493)
// ---------------------------------------------------------------------------

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

function shiftLeft1(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let carry = 0;
  for (let i = b.length - 1; i >= 0; i--) {
    out[i] = ((b[i] << 1) | carry) & 0xff;
    carry = b[i] & 0x80 ? 1 : 0;
  }
  return out;
}

function cmacSubkeys(family: CipherFamily, key: Uint8Array): { k1: Uint8Array; k2: Uint8Array } {
  const bs = BLOCK[family];
  const l = encryptBlock(family, key, new Uint8Array(bs));
  const k1 = shiftLeft1(l);
  if (l[0] & 0x80) k1[bs - 1] ^= RB[family];
  const k2 = shiftLeft1(k1);
  if (k1[0] & 0x80) k2[bs - 1] ^= RB[family];
  return { k1, k2 };
}

export function cmac(family: CipherFamily, key: Uint8Array, msg: Uint8Array): Uint8Array {
  const bs = BLOCK[family];
  const { k1, k2 } = cmacSubkeys(family, key);
  const n = Math.max(1, Math.ceil(msg.length / bs));
  const complete = msg.length > 0 && msg.length % bs === 0;

  let lastBlock: Uint8Array;
  if (complete) {
    lastBlock = xor(msg.slice((n - 1) * bs, n * bs), k1);
  } else {
    const tail = msg.slice((n - 1) * bs);
    const padded = new Uint8Array(bs);
    padded.set(tail);
    padded[tail.length] = 0x80;
    lastBlock = xor(padded, k2);
  }

  let x: Uint8Array = new Uint8Array(bs);
  for (let i = 0; i < n - 1; i++) {
    x = encryptBlock(family, key, xor(x, msg.slice(i * bs, (i + 1) * bs)));
  }
  return encryptBlock(family, key, xor(x, lastBlock));
}

// ---------------------------------------------------------------------------
// TR-31 key derivation (KBEK / KBMK) — counter-mode CMAC.
//   derivation data = counter(1) ‖ usage(2) ‖ 0x00 ‖ algorithm(2) ‖ keyLenBits(2)
//   usage: 0x0000 = encryption key, 0x0001 = MAC key
// ---------------------------------------------------------------------------

interface KbpkParams {
  family: CipherFamily;
  algoId: number; // derivation-data algorithm field for the KBPK
  bits: number; // KBPK length in bits (also the derived-key length)
}

function kbpkParams(kbpkType: ZmkType): KbpkParams {
  switch (kbpkType) {
    case "DES2EDE":
      return { family: "TDES", algoId: 0x0000, bits: 128 };
    case "DES3EDE":
      return { family: "TDES", algoId: 0x0001, bits: 192 };
    case "AES128":
      return { family: "AES", algoId: 0x0002, bits: 128 };
    case "AES192":
      return { family: "AES", algoId: 0x0003, bits: 192 };
    case "AES256":
      return { family: "AES", algoId: 0x0004, bits: 256 };
  }
}

function deriveSubkey(p: KbpkParams, kbpk: Uint8Array, usage: 0 | 1): Uint8Array {
  const bs = BLOCK[p.family];
  const keyBytes = p.bits / 8;
  const iterations = Math.ceil(keyBytes / bs);
  const out = new Uint8Array(iterations * bs);
  for (let i = 1; i <= iterations; i++) {
    const data = new Uint8Array([
      i,
      (usage >> 8) & 0xff,
      usage & 0xff,
      0x00,
      (p.algoId >> 8) & 0xff,
      p.algoId & 0xff,
      (p.bits >> 8) & 0xff,
      p.bits & 0xff,
    ]);
    out.set(cmac(p.family, kbpk, data), (i - 1) * bs);
  }
  return out.slice(0, keyBytes);
}

// ---------------------------------------------------------------------------
// Type ↔ version ↔ algorithm mapping
// ---------------------------------------------------------------------------

export function versionForKbpk(kbpkType: ZmkType): Tr31Version {
  return kbpkParams(kbpkType).family === "AES" ? "D" : "B";
}

// Header algorithm char for the WRAPPED key: 'T' = TDES, 'A' = AES.
function algoChar(keyType: ZmkType): "T" | "A" {
  return keyType.startsWith("AES") ? "A" : "T";
}

// Resolve a wrapped key's ZmkType from its header algorithm char + byte length.
function keyTypeFor(algorithm: string, byteLen: number): ZmkType {
  if (algorithm === "T") {
    if (byteLen === 16) return "DES2EDE";
    if (byteLen === 24) return "DES3EDE";
  } else if (algorithm === "A") {
    if (byteLen === 16) return "AES128";
    if (byteLen === 24) return "AES192";
    if (byteLen === 32) return "AES256";
  }
  throw new Error(`Unsupported key: algorithm '${algorithm}' with ${byteLen}-byte value`);
}

// ---------------------------------------------------------------------------
// Header (16 ASCII bytes)
// ---------------------------------------------------------------------------

export interface Tr31Header {
  version: Tr31Version;
  keyUsage: string; // 2 chars
  algorithm: string; // 1 char (wrapped key)
  modeOfUse: string; // 1 char
  keyVersion: string; // 2 chars
  exportability: string; // 1 char
}

function buildHeader(h: Tr31Header, blockLen: number): string {
  return (
    h.version +
    String(blockLen).padStart(4, "0") +
    h.keyUsage +
    h.algorithm +
    h.modeOfUse +
    h.keyVersion +
    h.exportability +
    "00" + // number of optional blocks
    "00" // reserved
  );
}

function parseHeader(block: string): { header: Tr31Header; blockLen: number } {
  if (block.length < 16) throw new Error("Key block too short for a TR-31 header");
  const version = block[0];
  if (version !== "B" && version !== "D") {
    throw new Error(`Unsupported TR-31 version '${version}'. Only B and D are supported.`);
  }
  const blockLen = Number(block.slice(1, 5));
  if (!/^\d{4}$/.test(block.slice(1, 5))) throw new Error("Invalid block length in header");
  return {
    header: {
      version,
      keyUsage: block.slice(5, 7),
      algorithm: block[7],
      modeOfUse: block[8],
      keyVersion: block.slice(9, 11),
      exportability: block[11],
    },
    blockLen,
  };
}

// ---------------------------------------------------------------------------
// Wrap / Unwrap
// ---------------------------------------------------------------------------

const asciiBytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

export interface WrapInput {
  kbpkType: ZmkType; // protecting ZMK type → version + KDF
  kbpk: Uint8Array; // ZMK key bytes
  keyType: ZmkType; // wrapped key type → header algorithm + length
  key: Uint8Array; // wrapped key bytes
  keyUsage: string;
  modeOfUse: string;
  exportability: string;
  keyVersion?: string;
}

export function wrapTr31(input: WrapInput): string {
  const p = kbpkParams(input.kbpkType);
  const bs = BLOCK[p.family];

  // Confidential data: keyLengthBits(2) ‖ key ‖ random pad to a block boundary.
  const bodyLen = 2 + input.key.length;
  const padLen = (bs - (bodyLen % bs)) % bs;
  const plaintext = new Uint8Array(bodyLen + padLen);
  new DataView(plaintext.buffer).setUint16(0, input.key.length * 8, false);
  plaintext.set(input.key, 2);
  if (padLen > 0) crypto.getRandomValues(plaintext.subarray(bodyLen));

  const macLen = bs; // CMAC output = one cipher block (8 for B, 16 for D)
  const blockLen = 16 + 2 * plaintext.length + 2 * macLen;
  const header = buildHeader(
    {
      version: versionForKbpk(input.kbpkType),
      keyUsage: input.keyUsage,
      algorithm: algoChar(input.keyType),
      modeOfUse: input.modeOfUse,
      keyVersion: input.keyVersion ?? "00",
      exportability: input.exportability,
    },
    blockLen,
  );

  const kbek = deriveSubkey(p, input.kbpk, 0);
  const kbmk = deriveSubkey(p, input.kbpk, 1);
  const mac = cmac(p.family, kbmk, new Uint8Array([...asciiBytes(header), ...plaintext]));
  const ciphertext = cbcEncrypt(p.family, kbek, mac, plaintext);

  return (header + bytesToHex(ciphertext) + bytesToHex(mac)).toUpperCase();
}

export interface Tr31Unwrapped {
  header: Tr31Header;
  keyType: ZmkType;
  key: Uint8Array;
  keyHex: string; // uppercase
}

export function unwrapTr31(block: string, kbpkType: ZmkType, kbpk: Uint8Array): Tr31Unwrapped {
  const clean = block.trim().toUpperCase();
  const { header, blockLen } = parseHeader(clean);

  if (blockLen !== clean.length) {
    throw new Error(`Block length mismatch: header says ${blockLen} but got ${clean.length} chars.`);
  }
  if (header.version !== versionForKbpk(kbpkType)) {
    throw new Error(
      `Version '${header.version}' does not match the chosen ZMK type ${kbpkType} (expected version ${versionForKbpk(kbpkType)}).`,
    );
  }
  if (header.algorithm !== "T" && header.algorithm !== "A") {
    throw new Error(
      `Unsupported key algorithm '${header.algorithm}'. Only symmetric TDES ('T') and AES ('A') keys are supported.`,
    );
  }

  const p = kbpkParams(kbpkType);
  const macLen = BLOCK[p.family];
  const macHex = clean.slice(clean.length - 2 * macLen);
  const cipherHex = clean.slice(16, clean.length - 2 * macLen);
  const mac = hexToBytes(macHex);
  const ciphertext = hexToBytes(cipherHex);
  if (ciphertext.length === 0 || ciphertext.length % macLen !== 0) {
    throw new Error("Encrypted data length is not a whole number of cipher blocks.");
  }

  const kbek = deriveSubkey(p, kbpk, 0);
  const kbmk = deriveSubkey(p, kbpk, 1);
  const plaintext = cbcDecrypt(p.family, kbek, mac, ciphertext);

  const expectedMac = cmac(
    p.family,
    kbmk,
    new Uint8Array([...asciiBytes(clean.slice(0, 16)), ...plaintext]),
  );
  if (bytesToHex(expectedMac) !== bytesToHex(mac)) {
    throw new Error("MAC verification failed — wrong ZMK or corrupted key block.");
  }

  const keyBits = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength).getUint16(0, false);
  const keyBytes = keyBits / 8;
  if (keyBits % 8 !== 0 || keyBytes > plaintext.length - 2) {
    throw new Error("Decoded key length is invalid.");
  }
  const key = plaintext.slice(2, 2 + keyBytes);
  const keyType = keyTypeFor(header.algorithm, keyBytes);
  // Defensive: the recovered length must match our supported type table.
  if (key.length !== ZMK_KEY_LEN[keyType]) throw new Error("Recovered key length mismatch.");

  return { header, keyType, key, keyHex: bytesToHex(key).toUpperCase() };
}
