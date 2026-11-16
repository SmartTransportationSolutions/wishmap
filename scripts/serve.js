// Local preview: encrypts test/fixtures/mapdata.json (or an empty map with --empty) with the
// passphrase "test-passphrase" (1000 iterations), assembles dist-dev/ and serves it on :5173.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { assemble } from "../build/build.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "dist-dev");
const PORT = Number(process.env.PORT || 5173);
const fixture = JSON.parse(readFileSync(join(ROOT, "test/fixtures/mapdata.json"), "utf8"));
const mapData = process.argv.includes("--empty") ? { ...fixture, wishes: [], projects: [], people: {} } : fixture;
await assemble({ mapData, passphrase: "test-passphrase", outDir: OUT, iterations: 1000 });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".enc": "application/json" };
createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(OUT, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!file.startsWith(OUT) || !existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`serving dist-dev on http://localhost:${PORT} (passphrase: test-passphrase)`));
