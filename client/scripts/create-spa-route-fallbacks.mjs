import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const publishDir = path.resolve("dist");
const indexFile = path.join(publishDir, "index.html");

const routes = [
  "start",
  "preview-hub",
  "clearsale",
  "clear-sale",
  "buyer-check",
  "buyer-risk-preview",
  "repair-vs-sell-preview",
  "mechanic-match",
  "mechanic-match/request",
  "mechanic-match/submitted",
  "help",
  "evidence-checklist",
  "marketplace",
  "marketplace/browse",
  "marketplace/listing/sample",
  "marketplace/sell",
  "marketplace/sell/intake",
  "marketplace/sell/submitted",
  "marketplace/offer-event",
  "marketplace/terms",
];

await copyFile(indexFile, path.join(publishDir, "404.html"));

for (const route of routes) {
  const routeDir = path.join(publishDir, route);
  await mkdir(routeDir, { recursive: true });
  await copyFile(indexFile, path.join(routeDir, "index.html"));
}
