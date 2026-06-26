import "./style.css";
import { createRouter, type Route } from "./router.ts";
import { renderLanding } from "./pages/landing.ts";
import { renderEcKeypair } from "./pages/ec-keypair.ts";

const routes: Route[] = [
  { path: "/", title: "Home", render: renderLanding },
  { path: "/ec-keypair", title: "EC Keypair", render: renderEcKeypair },
];

const outlet = document.getElementById("app")!;
const router = createRouter(routes, outlet);
void router.start();
