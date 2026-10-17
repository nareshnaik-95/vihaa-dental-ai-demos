// CRM row logic for the `upsert_lead` workflow. Pure functions: embedded into an n8n Code node by scripts/build.js.

const LEAD_COLUMNS = ["lead_id", "created_at", "name", "phone", "email", "source", "language",
  "service", "stage", "appointment_at", "calendar_event_id", "summary", "last_contact_at", "notes"];
const STAGES = ["New", "Qualified", "Booked", "Confirmed", "Attended", "No-show", "Review requested"];
const LANGUAGES = ["en", "hi", "te"];

// Indian numbers without a country code get +91.
function normalizePhone(raw) {
  if (!raw) return "";
  const hasPlus = String(raw).trim().startsWith("+");
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (hasPlus) return "+" + digits;
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return "+91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits;
  return "+" + digits;
}

function findExisting(rows, input) {
  const phone = normalizePhone(input.phone);
  const email = (input.email || "").trim().toLowerCase();
  if (phone) {
    const byPhone = rows.find(r => normalizePhone(r.phone) === phone);
    if (byPhone) return byPhone;
  }
  if (email) {
    const byEmail = rows.find(r => (r.email || "").trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  return null;
}

function buildLeadRow(input, existing, nowIso, makeId) {
  const base = existing || {};
  const pick = key => {
    const v = input[key];
    return v === undefined || v === null || v === "" ? (base[key] || "") : String(v);
  };
  const language = LANGUAGES.includes(pick("language")) ? pick("language") : "en";
  const stage = STAGES.includes(pick("stage")) ? pick("stage") : (STAGES.includes(base.stage) ? base.stage : "New");

  const values = {
    lead_id: base.lead_id || "L-" + makeId(),
    created_at: base.created_at || nowIso,
    name: pick("name"),
    phone: normalizePhone(pick("phone")),
    email: pick("email"),
    source: pick("source"),
    language,
    service: pick("service"),
    stage,
    appointment_at: pick("appointment_at"),
    calendar_event_id: pick("calendar_event_id"),
    summary: pick("summary"),
    last_contact_at: nowIso,
    notes: base.notes || "",
  };
  const row = {};
  for (const col of LEAD_COLUMNS) row[col] = values[col];
  return { row, created: !existing };
}

if (typeof module !== "undefined") module.exports = { LEAD_COLUMNS, STAGES, normalizePhone, findExisting, buildLeadRow };
