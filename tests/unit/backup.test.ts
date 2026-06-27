import { describe, it, expect, beforeEach } from "vitest";
import { buildBackupZip, restoreBackupZip } from "../../src/lib/backup.ts";
import { generateKeyPair } from "../../src/lib/ec.ts";
import { getKeyPair, setKeyPair } from "../../src/lib/store.ts";
import { listZmks, addZmk, clearZmks } from "../../src/lib/zmk-store.ts";
import { listKeys, addKey, clearKeys } from "../../src/lib/key-store.ts";
import { computeKcv } from "../../src/lib/zmk.ts";
import { bytesToHex } from "../../src/lib/ec.ts";

function reset(): void {
  clearZmks();
  clearKeys();
  setKeyPair(null);
}

// A valid key + its real KCV (so restore's KCV check passes).
function realKey(byte: number, type: "AES128" = "AES128") {
  const bytes = new Uint8Array(16).fill(byte);
  return { keyHex: bytesToHex(bytes).toUpperCase(), kcv: computeKcv(type, bytes) };
}

describe("Backup / Restore", () => {
  beforeEach(reset);

  it("round-trips keypair, ZMKs and keys (replace-all)", async () => {
    setKeyPair(await generateKeyPair("P-256"));
    const z = realKey(0x11);
    addZmk({ zmkId: "1", type: "AES128", keyHex: z.keyHex, kcv: z.kcv });
    const k = realKey(0x22);
    addKey({ keyId: "5", type: "AES128", keyHex: k.keyHex, kcv: k.kcv });

    const zip = await buildBackupZip();

    // Wipe everything, then restore from the archive.
    reset();
    expect(listZmks()).toHaveLength(0);
    const summary = await restoreBackupZip(zip);

    expect(summary).toMatchObject({ keypair: true, zmks: 1, keys: 1, skipped: [] });
    expect(getKeyPair()?.curve).toBe("P-256");
    expect(listZmks()[0]).toMatchObject({ zmkId: "1", type: "AES128", keyHex: z.keyHex, kcv: z.kcv });
    expect(listKeys()[0]).toMatchObject({ keyId: "5", type: "AES128", keyHex: k.keyHex, kcv: k.kcv });
    // EMV KCV recomputed for AES on restore.
    expect(listKeys()[0].emvKcv).toBeTruthy();
  });

  it("skips rows whose stored KCV does not match the key value", async () => {
    const good = realKey(0x33);
    addKey({ keyId: "1", type: "AES128", keyHex: good.keyHex, kcv: good.kcv });
    addKey({ keyId: "2", type: "AES128", keyHex: good.keyHex, kcv: "BADBAD" }); // tampered KCV

    const zip = await buildBackupZip();
    reset();
    const summary = await restoreBackupZip(zip);

    expect(summary.keys).toBe(1);
    expect(summary.skipped).toHaveLength(1);
    expect(summary.skipped[0]).toMatch(/KCV mismatch/);
    expect(listKeys().map((k) => k.keyId)).toEqual(["1"]);
  });

  it("restore replaces existing in-memory data", async () => {
    addKey({ keyId: "99", ...realKey(0x44), type: "AES128" });
    const zip = await buildBackupZip(); // contains key 99
    // Mutate state after the snapshot.
    addKey({ keyId: "100", ...realKey(0x55), type: "AES128" });
    expect(listKeys()).toHaveLength(2);

    await restoreBackupZip(zip);
    expect(listKeys().map((k) => k.keyId)).toEqual(["99"]);
  });
});
