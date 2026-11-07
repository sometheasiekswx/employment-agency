import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Copy the installed binary maps and their Adobe redistribution notice together.
const source = fileURLToPath(
  new URL("../node_modules/pdfjs-dist/cmaps/", import.meta.url),
);
const destination = fileURLToPath(
  new URL("../public/pdfjs/cmaps/", import.meta.url),
);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
