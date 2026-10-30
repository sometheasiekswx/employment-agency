import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../out/", import.meta.url));
const destination = fileURLToPath(
  new URL("../../employment_agency/web/", import.meta.url),
);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log("Packaged the static Next.js export for the Python application.");
