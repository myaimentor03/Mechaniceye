import { writeFile } from "node:fs/promises";
import path from "node:path";

const publishDir = path.resolve("dist/client");

await writeFile(
  path.join(publishDir, "mechaniceye-deploy-marker.txt"),
  `Mechanic's Eye frontend build\nBuilt: ${new Date().toISOString()}\nPublish directory: dist/client\n`,
);
