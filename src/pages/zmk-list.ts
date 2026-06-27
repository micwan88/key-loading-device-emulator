// ZMK list page — list, detail, delete, and entry to the derive page.

import { navigate } from "../router.ts";
import { getKeyPair } from "../lib/store.ts";
import { listZmks, getZmk, deleteZmk, type Zmk } from "../lib/zmk-store.ts";

export function renderZmkList(root: HTMLElement): void {
  const hasKeyPair = getKeyPair() !== null;
  let selectedId: string | null = null;

  root.innerHTML = `
    <section class="mx-auto max-w-3xl p-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Zone Master Keys</h1>
        <span data-testid="new-wrap" title="${hasKeyPair ? "" : "Create an EC keypair first"}">
          <button data-testid="new-zmk"
            class="rounded bg-accent px-4 py-2 text-accent-contrast font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            ${hasKeyPair ? "" : "disabled"}>
            New
          </button>
        </span>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <ul data-testid="zmk-list" class="grid gap-2"></ul>
        <div data-testid="zmk-detail" class="rounded-lg border border-line bg-surface p-4"></div>
      </div>
    </section>
  `;

  const listEl = root.querySelector('[data-testid="zmk-list"]') as HTMLUListElement;
  const detailEl = root.querySelector('[data-testid="zmk-detail"]') as HTMLDivElement;

  function renderList(): void {
    const zmks = listZmks();
    if (zmks.length === 0) {
      listEl.innerHTML = `<li class="text-muted text-sm">No ZMKs yet. Click "New" to derive one.</li>`;
      return;
    }
    listEl.innerHTML = zmks
      .map(
        (z) => `
        <li>
          <button data-id="${z.id}" data-testid="zmk-item"
            class="w-full text-left rounded border px-3 py-2 transition ${
              z.id === selectedId
                ? "border-accent bg-elevated"
                : "border-line bg-surface hover:border-accent"
            }">
            <span class="font-medium text-content">${escapeHtml(z.zmkId)}</span>
            <span class="text-xs text-muted ml-2">${z.type}</span>
          </button>
        </li>`,
      )
      .join("");
  }

  function renderDetail(): void {
    const z: Zmk | undefined = selectedId ? getZmk(selectedId) : undefined;
    if (!z) {
      detailEl.innerHTML = `<p class="text-muted text-sm">Select a ZMK to see its details.</p>`;
      return;
    }
    detailEl.innerHTML = `
      <dl class="grid gap-3 text-sm">
        <div><dt class="text-muted">ZMK ID</dt><dd data-testid="detail-id" class="text-content">${escapeHtml(z.zmkId)}</dd></div>
        <div><dt class="text-muted">Type</dt><dd data-testid="detail-type" class="text-content">${z.type}</dd></div>
        <div><dt class="text-muted">Key (HEX)</dt><dd data-testid="detail-key" class="font-mono text-xs break-all text-content">${z.keyHex}</dd></div>
        <div><dt class="text-muted">KCV</dt><dd data-testid="detail-kcv" class="font-mono text-content">${z.kcv}</dd></div>
        ${
          z.emvKcv
            ? `<div><dt class="text-muted">EMV KCV</dt><dd data-testid="detail-emv-kcv" class="font-mono text-content">${z.emvKcv}</dd></div>`
            : ""
        }
      </dl>
      <button data-testid="delete-zmk"
        class="mt-4 rounded border border-danger text-danger px-4 py-2 hover:bg-danger hover:text-base transition">
        Delete
      </button>
    `;
    (detailEl.querySelector('[data-testid="delete-zmk"]') as HTMLButtonElement).addEventListener(
      "click",
      () => {
        deleteZmk(z.id);
        selectedId = null;
        renderList();
        renderDetail();
      },
    );
  }

  listEl.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-id]") as HTMLElement | null;
    if (!btn) return;
    selectedId = btn.dataset.id ?? null;
    renderList();
    renderDetail();
  });

  (root.querySelector('[data-testid="new-zmk"]') as HTMLButtonElement).addEventListener(
    "click",
    () => navigate("/zmk/derive"),
  );

  renderList();
  renderDetail();
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
