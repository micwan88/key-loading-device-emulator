// Landing page with the feature menu.

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
];

export function renderLanding(root: HTMLElement): void {
  root.innerHTML = `
    <section class="mx-auto max-w-3xl p-6">
      <h1 class="text-2xl font-bold mb-2">Key Loading Device Emulator</h1>
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
    </section>
  `;
}
