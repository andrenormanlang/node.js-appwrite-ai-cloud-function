const fs = require("fs");
const path = require("path");

// Lightweight .env loader (no dependency required)
function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx);
    const val = trimmed.slice(idx + 1);
    if (!process.env[key]) process.env[key] = val;
  });
}

loadDotEnv();

const fn = require("./index.js");

const req = {
  // The function expects a string body containing JSON
  body: JSON.stringify({
    title: "Watchmen",
    status: "completed",
    rating: 5,
    mode: "long",
  }),
};

const res = {
  json: (obj) => {
    console.log("--- FUNCTION RESPONSE ---");
    console.log(JSON.stringify(obj, null, 2));
    return obj;
  },
};

(async () => {
  try {
    await fn({ req, res, log: console.log, error: console.error });
  } catch (err) {
    console.error("Invocation error:", err);
    process.exitCode = 1;
  }
})();