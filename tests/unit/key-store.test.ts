import { describe, it, expect, beforeEach } from "vitest";
import { listKeys, getKey, hasKeyId, nextKeyId, addKey, deleteKey } from "../../src/lib/key-store.ts";

function clear(): void {
  for (const k of [...listKeys()]) deleteKey(k.id);
}

describe("symmetric key store", () => {
  beforeEach(clear);

  it("adds, finds and deletes keys with a UUID record id", () => {
    const k = addKey({ keyId: "7", type: "AES128", keyHex: "00", kcv: "ABCDEF" });
    expect(k.id).toMatch(/[0-9a-f-]{36}/);
    expect(getKey(k.id)?.keyId).toBe("7");
    deleteKey(k.id);
    expect(listKeys()).toHaveLength(0);
  });

  it("hasKeyId reflects the stored Key IDs", () => {
    addKey({ keyId: "12", type: "DES2EDE", keyHex: "00", kcv: "ABCDEF" });
    expect(hasKeyId("12")).toBe(true);
    expect(hasKeyId("13")).toBe(false);
  });

  it("nextKeyId increments from the current max (1 when empty)", () => {
    expect(nextKeyId()).toBe(1);
    addKey({ keyId: "12", type: "AES128", keyHex: "00", kcv: "ABCDEF" });
    addKey({ keyId: "4", type: "AES128", keyHex: "00", kcv: "ABCDEF" });
    expect(nextKeyId()).toBe(13);
  });
});
