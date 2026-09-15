/**
 * Launch Vite + headless Chrome for the AFE vs Mediabunny harness.
 * Writes docs/compliance/afe-evidence.json
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.AFE_VITE_PORT || 1423);
const RECEIVE = Number(process.env.AFE_RECEIVE_PORT || 18767);
const OUT = process.env.AFE_EVIDENCE || join(root, "docs", "compliance", "afe-evidence.json");
const TIMEOUT_MS = Number(process.env.AFE_TIMEOUT_MS || 900000);

mkdirSync(dirname(OUT), { recursive: true });

function waitForResult() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("AFE harness timed out waiting for POST /afe-results"));
    }, TIMEOUT_MS);
    const server = createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "content-type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === "POST" && req.url === "/afe-results") {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          clearTimeout(timer);
          const raw = Buffer.concat(chunks).toString("utf8");
          res.writeHead(200, { "content-type": "application/json" });
          res.end('{"ok":true}');
          server.close();
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(RECEIVE, "127.0.0.1");
  });
}

function spawnVite() {
  const child = spawn(
    "npx",
    ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  let ready = false;
  return new Promise((resolve, reject) => {
    const onData = (d) => {
      const s = String(d);
      if (/Local:|ready in/i.test(s) && !ready) {
        ready = true;
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (!ready) reject(new Error("vite exited " + code));
    });
    setTimeout(() => {
      if (!ready) resolve(child);
    }, 8000);
  });
}

function spawnChrome() {
  const url = `http://127.0.0.1:${PORT}/scripts/afe-frame-harness.html`;
  const bin = process.env.CHROME_BIN || "google-chrome";
  return spawn(
    bin,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      "--use-gl=angle",
      "--use-angle=swiftshader-webgl",
      `--window-size=900,700`,
      url,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

const pending = waitForResult();
const vite = await spawnVite();
const chrome = spawnChrome();
let chromeErr = "";
chrome.stderr.on("data", (d) => {
  chromeErr += String(d);
});

try {
  const result = await pending;
  writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log("wrote", OUT);
  if (result.error) {
    console.error("harness error", result.error);
    process.exitCode = 1;
  } else {
    console.log("compared", result.totals?.compared, "agree", result.totals?.agree);
    console.log("MB", JSON.stringify(result.totals?.mediabunny));
    console.log("AFE", JSON.stringify(result.totals?.afe));
    console.log("seq", JSON.stringify(result.sequentialBatch));
    console.log("rand", JSON.stringify(result.random));
    console.log("export720", JSON.stringify(result.export720));
    console.log("abort", JSON.stringify(result.abortTest));
    console.log("fallback", JSON.stringify(result.fallbackTest));
  }
} catch (e) {
  console.error(e);
  if (chromeErr) console.error(chromeErr.slice(-2000));
  process.exitCode = 1;
} finally {
  chrome.kill("SIGTERM");
  vite.kill("SIGTERM");
  setTimeout(() => {
    try {
      chrome.kill("SIGKILL");
    } catch {
      /* */
    }
    try {
      vite.kill("SIGKILL");
    } catch {
      /* */
    }
    process.exit(process.exitCode ?? 0);
  }, 1500);
}
