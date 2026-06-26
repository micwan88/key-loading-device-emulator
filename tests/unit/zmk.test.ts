// @vitest-environment node
import { describe, it, expect } from "vitest";
import { generateKeyPair, exportPublicSpki, hexToBytes, bytesToHex } from "../../src/lib/ec.ts";
import {
  computeKcv,
  x963Kdf,
  deriveZmk,
  randomSharedInfo,
  buildMzmkCsv,
  parseMzmkCsv,
  publicPemToDer,
  ZMK_SCHEME,
} from "../../src/lib/zmk.ts";

describe("KCV known-answer vectors (encrypt zero block, first 3 bytes)", () => {
  it("AES-128 all-zero key → 66E94B", () => {
    expect(computeKcv("AES128", new Uint8Array(16))).toBe("66E94B");
  });
  it("AES-192 all-zero key → AAE069", () => {
    expect(computeKcv("AES192", new Uint8Array(24))).toBe("AAE069");
  });
  it("AES-256 all-zero key → DC95C0", () => {
    expect(computeKcv("AES256", new Uint8Array(32))).toBe("DC95C0");
  });
  it("3DES all-zero key → 8CA64D (DES2EDE and DES3EDE)", () => {
    expect(computeKcv("DES2EDE", new Uint8Array(16))).toBe("8CA64D");
    expect(computeKcv("DES3EDE", new Uint8Array(24))).toBe("8CA64D");
  });
});

describe("ANSI X9.63 KDF (SHA-256)", () => {
  // Independent reference: K_i = SHA-256(Z ‖ counter_be32 ‖ SharedInfo).
  async function block(z: Uint8Array, ctr: number, si: Uint8Array): Promise<Uint8Array> {
    const c = new Uint8Array(4);
    new DataView(c.buffer).setUint32(0, ctr, false);
    const buf = new Uint8Array([...z, ...c, ...si]);
    return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  }

  it("matches the spec for a single block", async () => {
    const z = hexToBytes("0102030405060708");
    const si = hexToBytes("aabbcc");
    const out = await x963Kdf(z, si, 32);
    expect(bytesToHex(out)).toBe(bytesToHex(await block(z, 1, si)));
  });

  it("concatenates blocks with an incrementing counter from 1", async () => {
    const z = hexToBytes("deadbeef");
    const si = hexToBytes("");
    const out = await x963Kdf(z, si, 48); // needs blocks 1 and 2
    const b1 = await block(z, 1, si);
    const b2 = await block(z, 2, si);
    expect(bytesToHex(out.subarray(0, 32))).toBe(bytesToHex(b1));
    expect(bytesToHex(out.subarray(32, 48))).toBe(bytesToHex(b2.subarray(0, 16)));
  });
});

describe("ECDH + X9.63 derivation interop", () => {
  it("both parties derive the identical ZMK", async () => {
    const alice = await generateKeyPair("P-256");
    const bob = await generateKeyPair("P-256");
    const aPub = (await exportPublicSpki(alice, "der")) as Uint8Array;
    const bPub = (await exportPublicSpki(bob, "der")) as Uint8Array;
    const sharedInfo = randomSharedInfo();

    const fromAlice = await deriveZmk({
      ourKeyPair: alice,
      theirPublicDer: bPub as Uint8Array<ArrayBuffer>,
      sharedInfo,
      type: "AES256",
    });
    const fromBob = await deriveZmk({
      ourKeyPair: bob,
      theirPublicDer: aPub as Uint8Array<ArrayBuffer>,
      sharedInfo,
      type: "AES256",
    });

    expect(fromAlice.keyHex).toBe(fromBob.keyHex);
    expect(fromAlice.kcv).toBe(fromBob.kcv);
    expect(fromAlice.keyHex).toMatch(/^[0-9A-F]+$/); // uppercase
  });
});

describe("MZMKdata CSV", () => {
  it("round-trips and re-derives a matching ZMK across parties", async () => {
    const us = await generateKeyPair("P-384");
    const them = await generateKeyPair("P-384");
    const theirPub = (await exportPublicSpki(them, "der")) as Uint8Array<ArrayBuffer>;
    const sharedInfo = randomSharedInfo();

    // We derive against their public key.
    const derived = await deriveZmk({
      ourKeyPair: us,
      theirPublicDer: theirPub,
      sharedInfo,
      type: "DES3EDE",
    });

    // They build the CSV (their HSM public key = ours from their side).
    const csv = await buildMzmkCsv({
      sharedInfo,
      kcv: derived.kcv,
      type: "DES3EDE",
      ourKeyPair: us, // HSM PUBLIC KEY = the key WE derive against on import
    });

    // Content is lowercase hex.
    expect(csv).toContain(bytesToHex(sharedInfo));
    expect(csv).toContain(ZMK_SCHEME.DES3EDE);
    expect(csv.split("\n")[1].split(",")[7]).toBe(derived.kcv.toLowerCase());

    const parsed = parseMzmkCsv(csv);
    expect(parsed.type).toBe("DES3EDE");
    expect(parsed.kcv).toBe(derived.kcv);
    expect(bytesToHex(parsed.sharedInfo)).toBe(bytesToHex(sharedInfo));

    // The other side re-derives using the parsed public key + shared info.
    const reDerived = await deriveZmk({
      ourKeyPair: them,
      theirPublicDer: parsed.theirPublicDer,
      sharedInfo: parsed.sharedInfo,
      type: parsed.type,
    });
    expect(reDerived.kcv).toBe(parsed.kcv);
  });

  it("parses public key via publicPemToDer equivalently to raw DER", async () => {
    const kp = await generateKeyPair("P-256");
    const der = (await exportPublicSpki(kp, "der")) as Uint8Array;
    const pem = (await exportPublicSpki(kp, "pem")) as string;
    expect(bytesToHex(publicPemToDer(pem))).toBe(bytesToHex(der));
  });
});
