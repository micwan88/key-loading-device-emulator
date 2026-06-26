// EC keypair operations built on the native Web Crypto API (SubtleCrypto).
// Supported curves: NIST P-256 / P-384 / P-521. No external crypto dependency.

export type CurveName = "P-256" | "P-384" | "P-521";

export const CURVES: CurveName[] = ["P-256", "P-384", "P-521"];

// Field element size in bytes for each curve (used to split the public point).
const FIELD_SIZE: Record<CurveName, number> = {
  "P-256": 32,
  "P-384": 48,
  "P-521": 66,
};

export interface ECKeyPair {
  curve: CurveName;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

const ALGORITHM = "ECDSA";

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/\s+/g, "").toLowerCase();
  if (clean.length === 0 || clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
    throw new Error("Invalid HEX string");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
}

function toPem(label: string, der: Uint8Array): string {
  const b64 = bytesToBase64(der);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function fromPem(label: string, pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(`-----BEGIN ${label}-----`, "")
    .replace(`-----END ${label}-----`, "")
    .replace(/\s+/g, "");
  return base64ToBytes(body);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export async function generateKeyPair(curve: CurveName): Promise<ECKeyPair> {
  const pair = (await crypto.subtle.generateKey(
    { name: ALGORITHM, namedCurve: curve },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  return { curve, privateKey: pair.privateKey, publicKey: pair.publicKey };
}

// ---------------------------------------------------------------------------
// HEX representation
//   private = raw scalar `d`
//   public  = uncompressed point  04 || x || y
// ---------------------------------------------------------------------------

export async function privateKeyToHex(pair: ECKeyPair): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!jwk.d) throw new Error("Private key has no scalar");
  return bytesToHex(base64UrlToBytes(jwk.d));
}

export async function publicKeyToHex(pair: ECKeyPair): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return bytesToHex(raw);
}

/**
 * Reconstruct a keypair from pasted HEX values. Native Web Crypto cannot derive
 * the public key from the private scalar alone, so BOTH values are required.
 */
export async function keyPairFromHex(
  privateHex: string,
  publicHex: string,
  curve: CurveName,
): Promise<ECKeyPair> {
  const size = FIELD_SIZE[curve];
  const priv = hexToBytes(privateHex);
  const pub = hexToBytes(publicHex);

  if (priv.length !== size) {
    throw new Error(`Private key for ${curve} must be ${size} bytes (${size * 2} hex chars)`);
  }
  if (pub.length !== 1 + size * 2 || pub[0] !== 0x04) {
    throw new Error(`Public key for ${curve} must be an uncompressed point (04 || x || y)`);
  }

  const x = pub.slice(1, 1 + size);
  const y = pub.slice(1 + size);

  const baseJwk = {
    kty: "EC",
    crv: curve,
    x: bytesToBase64Url(x),
    y: bytesToBase64Url(y),
    ext: true,
  };

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    baseJwk,
    { name: ALGORITHM, namedCurve: curve },
    true,
    ["verify"],
  );
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { ...baseJwk, d: bytesToBase64Url(priv) },
    { name: ALGORITHM, namedCurve: curve },
    true,
    ["sign"],
  );

  return { curve, privateKey, publicKey };
}

// ---------------------------------------------------------------------------
// Keypair file: PKCS#8 PEM (private key; public is recovered on import)
// ---------------------------------------------------------------------------

export async function exportKeyPairPkcs8Pem(pair: ECKeyPair): Promise<string> {
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return toPem("PRIVATE KEY", der);
}

export async function importKeyPairFromPkcs8Pem(pem: string): Promise<ECKeyPair> {
  const der = fromPem("PRIVATE KEY", pem);

  // The PKCS#8 carries the curve OID but not in a form we can read without a
  // parser, so try each supported curve until one imports cleanly.
  for (const curve of CURVES) {
    try {
      const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        der,
        { name: ALGORITHM, namedCurve: curve },
        true,
        ["sign"],
      );
      // Recover the public key via the JWK coordinates that Web Crypto exposes.
      const jwk = await crypto.subtle.exportKey("jwk", privateKey);
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: curve, x: jwk.x, y: jwk.y, ext: true },
        { name: ALGORITHM, namedCurve: curve },
        true,
        ["verify"],
      );
      return { curve, privateKey, publicKey };
    } catch {
      // Wrong curve — try the next one.
    }
  }
  throw new Error("Unsupported or invalid PKCS#8 EC private key");
}

// ---------------------------------------------------------------------------
// Public key export: X.509 SubjectPublicKeyInfo (SPKI), PEM or DER
// ---------------------------------------------------------------------------

export type SpkiFormat = "pem" | "der";

export async function exportPublicSpki(
  pair: ECKeyPair,
  format: SpkiFormat,
): Promise<string | Uint8Array> {
  const der = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return format === "pem" ? toPem("PUBLIC KEY", der) : der;
}
