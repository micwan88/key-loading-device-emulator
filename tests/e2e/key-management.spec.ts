import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const HEX_UPPER = /^[0-9A-F]+$/;

test("Key Management: new key, TR-31 export, re-import round trip, delete", async ({ page }, testInfo) => {
  // 1) Keypair (default P-521) and our public key as HEX.
  await page.goto("#/ec-keypair");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("private-hex")).not.toHaveValue("");
  const pubDownload = page.waitForEvent("download");
  await page.getByTestId("spki-format").selectOption("hex");
  await page.getByTestId("export-public").click();
  const pubPath = testInfo.outputPath("pub.hex");
  await (await pubDownload).saveAs(pubPath);
  const ourPublicHex = (await readFile(pubPath, "utf8")).trim();

  // 2) Derive a ZMK (AES256) — this is the KBPK that will protect the key block.
  await page.goto("#/zmk/derive");
  await page.getByTestId("gen-zmk-id").click();
  await page.getByTestId("their-public").fill(ourPublicHex);
  await page.getByTestId("gen-shared").click();
  await page.getByTestId("zmk-type").selectOption("AES256");
  await page.getByTestId("derive").click();
  await expect(page.getByTestId("status")).toContainText(/derived and saved/i);

  // 3) Create a new working key (AES128).
  await page.goto("#/keys");
  await page.getByTestId("new-key").click();
  await page.getByTestId("gen-key-id").click();
  await page.getByTestId("key-type").selectOption("AES128");
  await page.getByTestId("gen-key").click();
  expect(await page.getByTestId("key-value").inputValue()).toMatch(/^[0-9A-F]{32}$/);
  await page.getByTestId("save-key").click();

  // Back on the list; capture the original KCV + key value.
  await expect(page.getByTestId("key-item")).toHaveCount(1);
  await page.getByTestId("key-item").first().click();
  await expect(page.getByTestId("key-item").first()).toContainText("AES128");
  const origKcv = (await page.getByTestId("detail-kcv").textContent())!;
  const origKey = (await page.getByTestId("detail-key").textContent())!;
  expect(origKey).toMatch(HEX_UPPER);

  // 4) Export to a TR-31 key block under the ZMK.
  await page.getByTestId("export-key").click();
  await expect(page.getByTestId("prop-type")).toHaveText("AES128");
  await page.getByTestId("key-usage").selectOption("D0");
  await page.getByTestId("mode-of-use").selectOption("B");
  await page.getByTestId("exportability").selectOption("E");
  await page.getByTestId("do-export").click();
  const block = await page.getByTestId("keyblock-out").inputValue();
  expect(block[0]).toBe("D"); // AES ZMK → version D
  expect(Number(block.slice(1, 5))).toBe(block.length); // header length is self-consistent

  // 5) Import the produced block back under the same ZMK.
  await page.goto("#/keys");
  await page.getByTestId("import-key").click();
  await page.getByTestId("gen-key-id").click();
  await page.getByTestId("keyblock").fill(block);
  await page.getByTestId("do-import").click();

  // Back on the list with two keys; the imported one recovers the same key + KCV.
  await expect(page.getByTestId("key-item")).toHaveCount(2);
  await page.getByTestId("key-item").nth(1).click();
  await expect(page.getByTestId("detail-kcv")).toHaveText(origKcv);
  await expect(page.getByTestId("detail-key")).toHaveText(origKey);

  // 6) Delete the imported key.
  await page.getByTestId("delete-key").click();
  await expect(page.getByTestId("key-item")).toHaveCount(1);
});

test("Import rejects a wrong ZMK (MAC failure) without saving", async ({ page }, testInfo) => {
  // Keypair + public hex.
  await page.goto("#/ec-keypair");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("private-hex")).not.toHaveValue("");
  const pubDownload = page.waitForEvent("download");
  await page.getByTestId("spki-format").selectOption("hex");
  await page.getByTestId("export-public").click();
  const pubPath = testInfo.outputPath("pub.hex");
  await (await pubDownload).saveAs(pubPath);
  const ourPublicHex = (await readFile(pubPath, "utf8")).trim();

  // Two distinct AES ZMKs.
  for (const [id, secret] of [["1", "11"], ["2", "22"]] as const) {
    await page.goto("#/zmk/derive");
    await page.getByTestId("zmk-id").fill(id);
    await page.getByTestId("their-public").fill(ourPublicHex);
    await page.getByTestId("shared-secret").fill(secret.repeat(64));
    await page.getByTestId("zmk-type").selectOption("AES128");
    await page.getByTestId("derive").click();
    await expect(page.getByTestId("status")).toContainText(/derived and saved/i);
  }

  // Make a key and export it under ZMK 1.
  await page.goto("#/keys");
  await page.getByTestId("new-key").click();
  await page.getByTestId("key-id").fill("9");
  await page.getByTestId("key-type").selectOption("AES128");
  await page.getByTestId("gen-key").click();
  await page.getByTestId("save-key").click();
  await page.getByTestId("key-item").first().click();
  await page.getByTestId("export-key").click();
  // ZMK 1 is the first option; export under it.
  await page.getByTestId("zmk-select").selectOption({ index: 0 });
  await page.getByTestId("do-export").click();
  const block = await page.getByTestId("keyblock-out").inputValue();

  // Try to import under ZMK 2 → MAC verification must fail; nothing saved.
  await page.goto("#/keys");
  await page.getByTestId("import-key").click();
  await page.getByTestId("key-id").fill("99");
  await page.getByTestId("zmk-select").selectOption({ index: 1 });
  await page.getByTestId("keyblock").fill(block);
  await page.getByTestId("do-import").click();
  await expect(page.getByTestId("status")).toContainText(/MAC verification failed/i);
  // Still only the original key.
  await page.goto("#/keys");
  await expect(page.getByTestId("key-item")).toHaveCount(1);
});
