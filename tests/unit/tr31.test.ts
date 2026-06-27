// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hexToBytes, bytesToHex } from "../../src/lib/ec.ts";
import { cmac, wrapTr31, unwrapTr31, versionForKbpk } from "../../src/lib/tr31.ts";
import { computeKcv, type ZmkType, ZMK_KEY_LEN } from "../../src/lib/zmk.ts";

describe("AES-CMAC known-answer vectors (RFC 4493)", () => {
  const key = hexToBytes("2b7e151628aed2a6abf7158809cf4f3c");
  const hex = (m: string) => bytesToHex(cmac("AES", key, hexToBytes(m)));

  it("empty message", () => {
    expect(hex("")).toBe("bb1d6929e95937287fa37d129b756746");
  });
  it("16-byte message (one full block)", () => {
    expect(hex("6bc1bee22e409f96e93d7e117393172a")).toBe("070a16b46b4d4144f79bdd9dd04a287c");
  });
  it("40-byte message (partial last block)", () => {
    expect(hex("6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411")).toBe(
      "dfa66747de9ae63030ca32611497c827",
    );
  });
});

describe("version mapping", () => {
  it("3DES → B, AES → D", () => {
    expect(versionForKbpk("DES2EDE")).toBe("B");
    expect(versionForKbpk("DES3EDE")).toBe("B");
    expect(versionForKbpk("AES128")).toBe("D");
    expect(versionForKbpk("AES256")).toBe("D");
  });
});

describe("TR-31 wrap → unwrap round trip", () => {
  const kbpks: ZmkType[] = ["DES2EDE", "DES3EDE", "AES128", "AES192", "AES256"];
  const keyTypes: ZmkType[] = ["DES2EDE", "DES3EDE", "AES128", "AES192", "AES256"];

  for (const kbpkType of kbpks) {
    for (const keyType of keyTypes) {
      it(`${kbpkType} (v${versionForKbpk(kbpkType)}) wrapping ${keyType}`, () => {
        const kbpk = new Uint8Array(ZMK_KEY_LEN[kbpkType]).map((_, i) => (i * 7 + 1) & 0xff);
        const key = new Uint8Array(ZMK_KEY_LEN[keyType]).map((_, i) => (i * 11 + 3) & 0xff);

        const block = wrapTr31({
          kbpkType,
          kbpk,
          keyType,
          key,
          keyUsage: "D0",
          modeOfUse: "B",
          exportability: "E",
        });

        expect(block).toMatch(/^[0-9A-Z]+$/); // ASCII header + uppercase hex body
        expect(block[0]).toBe(versionForKbpk(kbpkType));
        expect(Number(block.slice(1, 5))).toBe(block.length); // header length = total length

        const out = unwrapTr31(block, kbpkType, kbpk);
        expect(out.keyType).toBe(keyType);
        expect(bytesToHex(out.key)).toBe(bytesToHex(key));
        expect(out.header.keyUsage).toBe("D0");
        expect(out.header.modeOfUse).toBe("B");
        expect(out.header.exportability).toBe("E");
        // recovered key produces the same KCV as the original
        expect(computeKcv(keyType, out.key)).toBe(computeKcv(keyType, key));
      });
    }
  }
});

describe("TR-31 unwrap rejects tampering and mismatches", () => {
  const kbpk = hexToBytes("0123456789ABCDEF0123456789ABCDEF"); // AES-128 KBPK → version D
  const key = hexToBytes("00112233445566778899AABBCCDDEEFF");
  const block = wrapTr31({
    kbpkType: "AES128",
    kbpk,
    keyType: "AES128",
    key,
    keyUsage: "D0",
    modeOfUse: "B",
    exportability: "E",
  });

  it("flipped ciphertext byte → MAC failure", () => {
    const i = 20; // inside the ciphertext region
    const flipped = block.slice(0, i) + (block[i] === "0" ? "1" : "0") + block.slice(i + 1);
    expect(() => unwrapTr31(flipped, "AES128", kbpk)).toThrow(/MAC verification failed/i);
  });

  it("wrong KBPK → MAC failure", () => {
    const wrong = hexToBytes("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
    expect(() => unwrapTr31(block, "AES128", wrong)).toThrow(/MAC verification failed/i);
  });

  it("version / ZMK-type mismatch is rejected", () => {
    // The block is version D; unwrapping with a 3DES (version B) ZMK must fail.
    expect(() => unwrapTr31(block, "DES2EDE", hexToBytes("0123456789ABCDEF0123456789ABCDEF"))).toThrow(
      /does not match/i,
    );
  });

  it("unsupported version is rejected", () => {
    const vA = "A" + block.slice(1);
    expect(() => unwrapTr31(vA, "AES128", kbpk)).toThrow(/Only B and D/i);
  });
});
