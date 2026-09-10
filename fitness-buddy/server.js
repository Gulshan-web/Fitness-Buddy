/**
 * Fitness Buddy – Local Proxy Server
 * Handles IBM IAM token exchange + Granite API calls server-side
 * to bypass browser CORS restrictions.
 *
 * Run:  node server.js
 * Then: open http://localhost:3000
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URLSearchParams } = require("url");

const PORT = 3000;
const IBM_API_KEY  = "UNSaaEoswfuED7LPSw-WDPNjvWyZalCJN_MUbmYcjedZ";
const IBM_IAM_URL  = "https://iam.cloud.ibm.com/identity/token";
const IBM_GRANITE_URL = "https://us-south.ml.cloud.ibm.com/ml/v1/text/chat?version=2023-05-29";

// ─── Token cache ────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiry  = 0;

function getIAMToken() {
  return new Promise((resolve, reject) => {
    if (cachedToken && Date.now() < tokenExpiry) return resolve(cachedToken);

    const body = new URLSearchParams({
      grant_type: "urn:ibm:params:oauth:grant-type:apikey",
      apikey: IBM_API_KEY
    }).toString();

    const req = https.request(IBM_IAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (!json.access_token) return reject(new Error("No access_token: " + data));
          cachedToken = json.access_token;
          tokenExpiry  = Date.now() + (json.expires_in - 60) * 1000;
          resolve(cachedToken);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Proxy Granite request ───────────────────────────────────────
function proxyGranite(body, res) {
  getIAMToken().then(token => {
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    const req = https.request(IBM_GRANITE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "Content-Length": Buffer.byteLength(bodyStr)
      }
    }, (apiRes) => {
      res.writeHead(apiRes.statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      apiRes.pipe(res);
    });
    req.on("error", (e) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    });
    req.write(bodyStr);
    req.end();
  }).catch(e => {
    res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: "IAM token error: " + e.message }));
  });
}

// ─── Static file server ─────────────────────────────────────────
const MIME = {
  ".html": "text/html",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".png":  "image/png",
  ".ico":  "image/x-icon"
};

const STATIC_DIR = __dirname;

function serveStatic(pathname, res) {
  const filePath = path.join(STATIC_DIR, pathname === "/" ? "index.html" : pathname);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(data);
  });
}

// ─── Main server ────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  // API proxy endpoint
  if (req.method === "POST" && req.url === "/api/chat") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => proxyGranite(body, res));
    return;
  }

  // Serve static files
  serveStatic(req.url, res);
});

server.listen(PORT, () => {
  console.log(`\n✅ Fitness Buddy running at http://localhost:${PORT}`);
  console.log(`   Open your browser → http://localhost:${PORT}\n`);
});
