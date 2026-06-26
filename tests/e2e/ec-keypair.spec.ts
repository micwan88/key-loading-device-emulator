import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const HEX = /^[0-9a-f]+$/;

test("landing page links to the EC Keypair feature", async ({ page }) => {
  await page.goto("/key-loading-device-emulator/");
  const item = page.getByTestId("menu-item");
  await expect(item).toContainText("EC Keypair");
  await item.click();
  await expect(page.getByRole("heading", { name: "EC Keypair" })).toBeVisible();
});

test("generate, persist across navigation, save, restore and export", async ({ page }, testInfo) => {
  await page.goto("/key-loading-device-emulator/#/ec-keypair");

  // (1)(2)(3) generate a P-384 keypair and show hex
  await page.getByTestId("curve").selectOption("P-384");
  await page.getByTestId("generate").click();

  const privEl = page.getByTestId("private-hex");
  const pubEl = page.getByTestId("public-hex");
  await expect(privEl).not.toHaveValue("");
  const priv = await privEl.inputValue();
  const pub = await pubEl.inputValue();
  expect(priv).toMatch(HEX);
  expect(pub.startsWith("04")).toBe(true);

  // (9) keypair persists when navigating away and back
  await page.goto("/key-loading-device-emulator/#/");
  await page.goto("/key-loading-device-emulator/#/ec-keypair");
  await expect(page.getByTestId("private-hex")).toHaveValue(priv);
  await expect(page.getByTestId("public-hex")).toHaveValue(pub);

  // (5)(6) save keypair as PKCS#8 PEM
  const savePromise = page.waitForEvent("download");
  await page.getByTestId("save-keypair").click();
  const saved = await savePromise;
  expect(saved.suggestedFilename()).toBe("ec-keypair-P-384.pkcs8.pem");
  const savedPath = testInfo.outputPath("keypair.pem");
  await saved.saveAs(savedPath);
  expect(await readFile(savedPath, "utf8")).toContain("-----BEGIN PRIVATE KEY-----");

  // Replace the keypair with a different one...
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("private-hex")).not.toHaveValue(priv);

  // (7) ...then restore from the saved file and confirm we get the original back
  await page.getByTestId("restore-file").setInputFiles(savedPath);
  await expect(page.getByTestId("private-hex")).toHaveValue(priv);
  await expect(page.getByTestId("public-hex")).toHaveValue(pub);

  // (8)(10) export public key as PEM
  const pemPromise = page.waitForEvent("download");
  await page.getByTestId("spki-format").selectOption("pem");
  await page.getByTestId("export-public").click();
  expect((await pemPromise).suggestedFilename()).toBe("ec-public-P-384.spki.pem");

  // (8)(10) export public key as DER
  const derPromise = page.waitForEvent("download");
  await page.getByTestId("spki-format").selectOption("der");
  await page.getByTestId("export-public").click();
  expect((await derPromise).suggestedFilename()).toBe("ec-public-P-384.spki.der");
});

test("paste validation requires both hex fields", async ({ page }) => {
  await page.goto("/key-loading-device-emulator/#/ec-keypair");
  await page.getByTestId("private-hex").fill("00".repeat(32));
  await page.getByTestId("apply-hex").click();
  await expect(page.getByTestId("status")).toContainText(/both private and public/i);
});
