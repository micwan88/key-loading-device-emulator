import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const HEX_UPPER = /^[0-9A-F]+$/;

test("dark theme is applied to the page", async ({ page }) => {
  await page.goto("/key-loading-device-emulator/");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(11, 13, 16)"); // theme `base` token #0b0d10
});

test("full ZMK derive, save, list, delete, and MZMKdata CSV round-trip", async ({ page }, testInfo) => {
  // 1) Create a keypair (default curve P-521) and grab our public key as HEX.
  await page.goto("/key-loading-device-emulator/#/ec-keypair");
  await expect(page.getByTestId("curve")).toHaveValue("P-521");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("private-hex")).not.toHaveValue("");
  expect(await page.getByTestId("private-hex").inputValue()).toMatch(HEX_UPPER);

  const pubDownload = page.waitForEvent("download");
  await page.getByTestId("spki-format").selectOption("hex");
  await page.getByTestId("export-public").click();
  const pubPath = testInfo.outputPath("pub.hex");
  await (await pubDownload).saveAs(pubPath);
  const ourPublicHex = (await readFile(pubPath, "utf8")).trim();
  expect(ourPublicHex).toMatch(HEX_UPPER);

  // 2) Go to ZMK; New is enabled now that a keypair exists.
  await page.goto("/key-loading-device-emulator/#/zmk");
  await expect(page.getByTestId("new-zmk")).toBeEnabled();
  await page.getByTestId("new-zmk").click();
  await expect(page.getByTestId("derive-desc")).toContainText("P-521");
  // TMD section shows the two labelled actions.
  await expect(page.getByText("Exchange your derived ZMK to Thales TMD")).toBeVisible();
  await expect(page.getByText("Derive the ZMK from Thales TMD")).toBeVisible();
  await expect(page.getByText("Import MZMKdata CSV")).toBeVisible();

  // 3) Derive a ZMK (use our own public key as the counterparty).
  await page.getByTestId("gen-zmk-id").click(); // auto-generate the first ID → "1"
  await expect(page.getByTestId("zmk-id")).toHaveValue("1");
  await page.getByTestId("their-public").fill(ourPublicHex);
  await page.getByTestId("gen-shared").click();
  expect(await page.getByTestId("shared-secret").inputValue()).toMatch(/^[0-9A-F]{256}$/);
  await page.getByTestId("zmk-type").selectOption("AES256");
  await page.getByTestId("derive").click();

  const derivedKey = await page.getByTestId("derived-key").textContent();
  const derivedKcv = await page.getByTestId("derived-kcv").textContent();
  expect(derivedKey ?? "").toMatch(HEX_UPPER);
  expect(derivedKcv ?? "").toMatch(/^[0-9A-F]{6}$/);
  // EMV KCV is shown for AES keys.
  await expect(page.getByTestId("derived-emv-kcv-row")).toBeVisible();
  const derivedEmvKcv = await page.getByTestId("derived-emv-kcv").textContent();
  expect(derivedEmvKcv ?? "").toMatch(/^[0-9A-F]{6}$/);
  await expect(page.getByTestId("status")).toContainText(/derived and saved/i);

  // 4) Generate MZMKdata CSV; filename is MZMKdata_yyyy_mm_dd_HH_MM.csv.
  const csvDownload = page.waitForEvent("download");
  await page.getByTestId("gen-csv").click();
  const dl = await csvDownload;
  expect(dl.suggestedFilename()).toMatch(/^MZMKdata_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}\.csv$/);
  const csvPath = testInfo.outputPath("MZMKdata.csv");
  await dl.saveAs(csvPath);
  const csv = await readFile(csvPath, "utf8");
  expect(csv.split("\n")[0]).toContain("MZMK CHECK VALUE");
  expect(csv).toContain(derivedKcv!.toLowerCase()); // CSV content is lowercase

  // 5) It appears in the list with details; uppercase HEX shown.
  await page.goto("/key-loading-device-emulator/#/zmk");
  await expect(page.getByTestId("zmk-item").first()).toContainText(`(${derivedKcv})`);
  await page.getByTestId("zmk-item").first().click();
  await expect(page.getByTestId("detail-id")).toHaveText("1");
  await expect(page.getByTestId("detail-kcv")).toHaveText(derivedKcv!);
  await expect(page.getByTestId("detail-emv-kcv")).toHaveText(derivedEmvKcv!);
  expect((await page.getByTestId("detail-key").textContent()) ?? "").toMatch(HEX_UPPER);

  // 6) Exchange-from-CSV re-derives the same key (KCV matches) and saves it.
  await page.getByTestId("new-zmk").click();
  await page.getByTestId("zmk-id").fill("2");
  await page.getByTestId("exchange-file").setInputFiles(csvPath);
  await expect(page.getByTestId("status")).toContainText(/exchanged and saved/i);
  await expect(page.getByTestId("derived-kcv")).toHaveText(derivedKcv!);

  // 7) Delete a ZMK.
  await page.goto("/key-loading-device-emulator/#/zmk");
  await page.getByTestId("zmk-item").first().click();
  await page.getByTestId("delete-zmk").click();
  await expect(page.getByTestId("zmk-detail")).toContainText(/select a zmk/i);
});

test("exchange accepts a CSV whose check value is the AES EMV KCV", async ({ page }, testInfo) => {
  // Keypair + our public key as HEX.
  await page.goto("/key-loading-device-emulator/#/ec-keypair");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("private-hex")).not.toHaveValue("");
  const pubDownload = page.waitForEvent("download");
  await page.getByTestId("spki-format").selectOption("hex");
  await page.getByTestId("export-public").click();
  const pubPath = testInfo.outputPath("pub.hex");
  await (await pubDownload).saveAs(pubPath);
  const ourPublicHex = (await readFile(pubPath, "utf8")).trim();

  // Derive an AES key and produce a standard MZMKdata CSV.
  await page.goto("/key-loading-device-emulator/#/zmk/derive");
  await page.getByTestId("zmk-id").fill("100");
  await page.getByTestId("their-public").fill(ourPublicHex);
  await page.getByTestId("gen-shared").click();
  await page.getByTestId("zmk-type").selectOption("AES128");
  await page.getByTestId("derive").click();
  const emvKcv = (await page.getByTestId("derived-emv-kcv").textContent())!;

  const csvDownload = page.waitForEvent("download");
  await page.getByTestId("gen-csv").click();
  const csvPath = testInfo.outputPath("MZMKdata.csv");
  await (await csvDownload).saveAs(csvPath);

  // Rewrite the MZMK CHECK VALUE column (index 7) to the EMV KCV (lowercase).
  const [header, row] = (await readFile(csvPath, "utf8")).split(/\r?\n/);
  const cols = row.split(",");
  cols[7] = emvKcv.toLowerCase();
  const emvCsvPath = testInfo.outputPath("MZMKdata-emv.csv");
  await writeFile(emvCsvPath, `${header}\n${cols.join(",")}\n`);

  // Exchange it under a new ID — accepted because it matches the EMV KCV.
  await page.getByTestId("zmk-id").fill("200");
  await page.getByTestId("exchange-file").setInputFiles(emvCsvPath);
  await expect(page.getByTestId("status")).toContainText(/exchanged and saved/i);
});

test("exchange-from-CSV requires a valid ZMK ID", async ({ page }) => {
  await page.goto("/key-loading-device-emulator/#/ec-keypair");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("private-hex")).not.toHaveValue("");

  await page.goto("/key-loading-device-emulator/#/zmk/derive");
  // Upload anything without an ID → validation before parsing.
  await page.getByTestId("exchange-file").setInputFiles({
    name: "x.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("VERSION\n1\n"),
  });
  await expect(page.getByTestId("status")).toContainText(/1-5 digits/i);
});
