import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(webRoot, "node_modules", "pdfjs-dist", "cmaps");
const destination = join(webRoot, "public", "pdfjs", "cmaps");

await rm(destination, { force: true, recursive: true });
await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });
