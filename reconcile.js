// Payment reconciliation.
// Run:  node reconcile.js

const fs = require("fs");

// Convert a timestamp to milliseconds (UTC). Returns null if unreadable.
function parseTs(ts) {
  if (typeof ts === "number") return ts < 1e12 ? ts * 1000 : ts; // seconds vs ms
  if (typeof ts !== "string") return null;
  let s = ts.trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n < 1e12 ? n * 1000 : n;
  }
  s = s.replace(" ", "T");
  // No timezone given -> README says timestamps are UTC
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += "Z";
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

// Convert an amount to kobo (integer) so floating point doesn't drift.
function parseAmountKobo(amount) {
  let n;
  if (typeof amount === "number") n = amount;
  else if (typeof amount === "string")
    n = Number(amount.replace(/[^0-9.\-]/g, ""));
  else return 0;
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const raw = fs.readFileSync("payments.jsonl", "utf8").replace(/^\uFEFF/, "");
const lines = raw.split(/\r?\n/);

// txn_id -> latest attempt seen so far
const latest = new Map();

lines.forEach((line, index) => {
  if (line.trim().length === 0) return;

  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return; // unreadable line: ignore
  }
  if (!event || typeof event !== "object") return;

  if (event.txn_id === undefined || event.txn_id === null) return;
  const id = String(event.txn_id).trim();
  if (id === "") return; // no txn_id: ignore

  const ts = parseTs(event.ts);
  const entry = {
    ts: ts === null ? -Infinity : ts,
    index, // tie-break: later line wins
    status: String(event.status).trim().toLowerCase(),
    kobo: parseAmountKobo(event.amount),
  };

  const prev = latest.get(id);
  if (
    !prev ||
    entry.ts > prev.ts ||
    (entry.ts === prev.ts && entry.index > prev.index)
  ) {
    latest.set(id, entry);
  }
});

let totalKobo = 0;
let count = 0;
for (const entry of latest.values()) {
  if (entry.status === "success") {
    totalKobo += entry.kobo;
    count += 1;
  }
}
const total = totalKobo / 100;

const expected = parseInt(fs.readFileSync("expected.txt", "utf8").trim(), 10);

if (count !== expected) {
  console.log(
    `Check failed: counted ${count} successful payments, expected ${expected}.`,
  );
  console.log(
    "Something in the data isn't being handled the way the README describes.",
  );
} else {
  console.log(`Check passed: ${count} successful payments.`);
  console.log(`Your code: KOYA-${Math.round(total)}`);
}
