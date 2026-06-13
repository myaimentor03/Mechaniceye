import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const publishDir = path.resolve("dist/client");
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

await writeFile(
  path.join(publishDir, "mechaniceye-deploy-marker.txt"),
  `Mechanic's Eye frontend build\nBuilt: ${new Date().toISOString()}\nPublish directory: dist/client\n`,
);

for (const route of routes) {
  const routeDir = path.join(publishDir, route);
  await mkdir(routeDir, { recursive: true });
  await copyFile(indexFile, path.join(routeDir, "index.html"));
}
