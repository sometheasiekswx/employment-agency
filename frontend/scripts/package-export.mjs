import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../out/", import.meta.url));
const destination = process.env.EA_WEB_EXPORT_DIR
  ? path.resolve(process.env.EA_WEB_EXPORT_DIR)
  : fileURLToPath(new URL("../../employment_agency/web/", import.meta.url));
if (process.env.EA_WEB_EXPORT_DIR) {
  await mkdir(destination);
} else {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
}
await cp(source, destination, { recursive: true });
console.log("Packaged the static Next.js export for the Python application.");
