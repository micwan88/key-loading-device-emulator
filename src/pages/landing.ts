// Landing page with the feature menu.

import { buildBackupZip, restoreBackupZip } from "../lib/backup.ts";

interface MenuItem {
  label: string;
  path: string;
  description: string;
}

const MENU: MenuItem[] = [
  {
    label: "EC Keypair",
    path: "#/ec-keypair",
    description: "Generate, save, restore and export elliptic-curve keypairs.",
  },
  {
    label: "Zone Master Key (ZMK)",
    path: "#/zmk",
    description: "Derive and manage ZMKs via ECDH key exchange (ANSI X9.63 KDF).",
  },
  {
    label: "Key Management",
    path: "#/keys",
    description: "Generate, import and export symmetric keys as TR-31 key blocks.",
  },
];

export function renderLanding(root: HTMLElement): void {
  root.innerHTML = `
    <section class="mx-auto max-w-3xl p-6">
      <h1 class="text-2xl font-bold mb-2">Key Loading Device Emulator</h1>
      <p data-testid="prod-warning" class="text-danger font-semibold mb-2">
        Designed for testing purpose only — DON'T USE IT FOR PRODUCTION.
      </p>
      <p class="text-muted mb-6">
        Emulate crypto key loading device flows to test your system.
      </p>
      <nav>
        <ul class="grid gap-4" data-testid="menu">
          ${MENU.map(
            (item) => `
            <li>
              <a href="${item.path}"
                 data-testid="menu-item"
                 class="block rounded-lg border border-line bg-surface p-4 hover:border-accent transition">
                <span class="text-lg font-semibold text-content">${item.label}</span>
                <p class="text-sm text-muted">${item.description}</p>
              </a>
            </li>`,
          ).join("")}
        </ul>
      </nav>

      <div class="mt-8 border-t border-line pt-6">
        <div class="flex flex-wrap items-center gap-3">
          <button data-testid="backup"
            class="rounded bg-accent px-4 py-2 text-accent-contrast font-medium hover:opacity-90">Backup</button>
          <label class="rounded border border-line px-4 py-2 hover:bg-elevated cursor-pointer">
            Restore Backup
            <input data-testid="restore-file" type="file" accept=".bak,.zip" class="hidden" />
          </label>
        </div>
        <p data-testid="backup-status" role="status" class="text-sm min-h-5 mt-2"></p>
      </div>
    </section>
  `;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(`[data-testid="${sel}"]`) as T;
  const statusEl = $<HTMLParagraphElement>("backup-status");

  function setStatus(msg: string, kind: "ok" | "error" = "ok"): void {
    statusEl.textContent = msg;
    statusEl.className = `text-sm min-h-5 mt-2 ${kind === "error" ? "text-danger" : "text-success"}`;
  }

  // Local yyyymmddHHMM for the backup file name.
  function backupTimestamp(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
  }

  $("backup").addEventListener("click", async () => {
    try {
      const zip = await buildBackupZip();
      const blob = new Blob([new Uint8Array(zip)], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `KLD-emulator-${backupTimestamp(new Date())}.bak`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Backup created.");
    } catch (err) {
      setStatus(`Backup failed: ${(err as Error).message}`, "error");
    }
  });

  const restoreEl = $<HTMLInputElement>("restore-file");
  restoreEl.addEventListener("change", async () => {
    const file = restoreEl.files?.[0];
    if (!file) return;
    try {
      const summary = await restoreBackupZip(new Uint8Array(await file.arrayBuffer()));
      const parts = [
        summary.keypair ? "keypair" : "no keypair",
        `${summary.zmks} ZMK(s)`,
        `${summary.keys} key(s)`,
      ];
      const skipped = summary.skipped.length ? ` Skipped: ${summary.skipped.join("; ")}.` : "";
      setStatus(`Restored ${parts.join(", ")}.${skipped}`, summary.skipped.length ? "error" : "ok");
    } catch (err) {
      setStatus(`Restore failed: ${(err as Error).message}`, "error");
    } finally {
      restoreEl.value = "";
    }
  });
}
