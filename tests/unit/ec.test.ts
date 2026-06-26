// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  CURVES,
  type CurveName,
  generateKeyPair,
  privateKeyToHex,
  publicKeyToHex,
  keyPairFromHex,
  exportKeyPairPkcs8Pem,
  importKeyPairFromPkcs8Pem,
  exportPublicSpki,
  hexToBytes,
  bytesToHex,
} from "../../src/lib/ec.ts";

const FIELD_SIZE: Record<CurveName, number> = { "P-256": 32, "P-384": 48, "P-521": 66 };

describe("hex helpers", () => {
  it("round-trips bytes <-> hex", () => {
    const bytes = new Uint8Array([0x00, 0x0a, 0xff, 0x10]);
    expect(bytesToHex(bytes)).toBe("000aff10");
    expect(hexToBytes("000AFF10")).toEqual(bytes);
  });

  it("rejects malformed hex", () => {
    expect(() => hexToBytes("xyz")).toThrow();
    expect(() => hexToBytes("abc")).toThrow(); // odd length
  });
});

describe.each(CURVES)("EC operations for %s", (curve) => {
  it("generates a keypair with correctly sized hex", async () => {
    const pair = await generateKeyPair(curve);
    const privHex = await privateKeyToHex(pair);
    const pubHex = await publicKeyToHex(pair);
    expect(privHex.length).toBe(FIELD_SIZE[curve] * 2);
    expect(pubHex.startsWith("04")).toBe(true);
    expect(pubHex.length).toBe((1 + FIELD_SIZE[curve] * 2) * 2);
  });

  it("reconstructs an identical keypair from hex", async () => {
    const pair = await generateKeyPair(curve);
    const privHex = await privateKeyToHex(pair);
    const pubHex = await publicKeyToHex(pair);

    const restored = await keyPairFromHex(privHex, pubHex, curve);
    expect(await privateKeyToHex(restored)).toBe(privHex);
    expect(await publicKeyToHex(restored)).toBe(pubHex);
  });

  it("round-trips through PKCS#8 PEM and recovers the public key", async () => {
    const pair = await generateKeyPair(curve);
    const pem = await exportKeyPairPkcs8Pem(pair);
    expect(pem).toContain("-----BEGIN PRIVATE KEY-----");

    const restored = await importKeyPairFromPkcs8Pem(pem);
    expect(restored.curve).toBe(curve);
    expect(await privateKeyToHex(restored)).toBe(await privateKeyToHex(pair));
    expect(await publicKeyToHex(restored)).toBe(await publicKeyToHex(pair));
  });

  it("exports the public key as SPKI PEM, DER and HEX", async () => {
    const pair = await generateKeyPair(curve);
    const pem = await exportPublicSpki(pair, "pem");
    expect(typeof pem).toBe("string");
    expect(pem).toContain("-----BEGIN PUBLIC KEY-----");

    const der = await exportPublicSpki(pair, "der");
    expect(der).toBeInstanceOf(Uint8Array);
    expect((der as Uint8Array)[0]).toBe(0x30); // ASN.1 SEQUENCE

    const hex = (await exportPublicSpki(pair, "hex")) as string;
    expect(hex).toMatch(/^[0-9A-F]+$/); // uppercase HEX of the DER
    expect(hex).toBe(bytesToHex(der as Uint8Array).toUpperCase());
  });
});

describe("keyPairFromHex validation", () => {
  it("rejects a private scalar of the wrong size", async () => {
    const pair = await generateKeyPair("P-256");
    const pubHex = await publicKeyToHex(pair);
    await expect(keyPairFromHex("00".repeat(16), pubHex, "P-256")).rejects.toThrow();
  });

  it("rejects a public point that is not uncompressed", async () => {
    const pair = await generateKeyPair("P-256");
    const privHex = await privateKeyToHex(pair);
    await expect(keyPairFromHex(privHex, "02" + "00".repeat(32), "P-256")).rejects.toThrow();
  });
});
