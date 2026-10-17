const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone, findExisting, buildLeadRow } = require("../src/lead.js");

const NOW = "2026-10-17T10:00:00.000Z";

test("normalizePhone turns Indian numbers into E.164", () => {
  assert.equal(normalizePhone("98765 43210"), "+919876543210");
  assert.equal(normalizePhone("098765-43210"), "+919876543210");
  assert.equal(normalizePhone("+91 98765 43210"), "+919876543210");
  assert.equal(normalizePhone("919876543210"), "+919876543210");
  assert.equal(normalizePhone("+1 415 555 0100"), "+14155550100");
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone(undefined), "");
});

test("findExisting matches on phone first, then email", () => {
  const rows = [
    { lead_id: "L1", phone: "+919876543210", email: "a@x.com" },
    { lead_id: "L2", phone: "", email: "b@x.com" },
  ];
  assert.equal(findExisting(rows, { phone: "98765 43210" }).lead_id, "L1");
  assert.equal(findExisting(rows, { phone: "", email: "B@x.com" }).lead_id, "L2");
  assert.equal(findExisting(rows, { phone: "+910000000000", email: "z@x.com" }), null);
});

test("new lead gets an id, created_at and defaults", () => {
  const { row, created } = buildLeadRow(
    { name: "Ravi", phone: "98765 43210", source: "chat", stage: "Qualified", service: "Check-up & cleaning" },
    null, NOW, () => "abc123");
  assert.equal(created, true);
  assert.equal(row.lead_id, "L-abc123");
  assert.equal(row.created_at, NOW);
  assert.equal(row.last_contact_at, NOW);
  assert.equal(row.phone, "+919876543210");
  assert.equal(row.language, "en");
  assert.equal(row.stage, "Qualified");
});

test("returning lead keeps id and created_at, updates stage and contact time", () => {
  const existing = { lead_id: "L-old", created_at: "2026-10-10T00:00:00.000Z", name: "Ravi",
    phone: "+919876543210", email: "r@x.com", source: "chat", language: "hi", stage: "Qualified", notes: "VIP" };
  const { row, created } = buildLeadRow(
    { phone: "9876543210", source: "voice", stage: "Booked", appointment_at: "2026-10-23T10:30:00+05:30" },
    existing, NOW, () => "zzz");
  assert.equal(created, false);
  assert.equal(row.lead_id, "L-old");
  assert.equal(row.created_at, "2026-10-10T00:00:00.000Z");
  assert.equal(row.stage, "Booked");
  assert.equal(row.source, "voice");
  assert.equal(row.email, "r@x.com", "blank input fields do not wipe existing values");
  assert.equal(row.language, "hi");
  assert.equal(row.notes, "VIP");
  assert.equal(row.last_contact_at, NOW);
});

test("invalid language or stage falls back safely", () => {
  const { row } = buildLeadRow({ phone: "9876543210", language: "fr", stage: "Weird" }, null, NOW, () => "x");
  assert.equal(row.language, "en");
  assert.equal(row.stage, "New");
});

test("row has exactly the Leads columns in order", () => {
  const { row } = buildLeadRow({ phone: "9876543210" }, null, NOW, () => "x");
  assert.deepEqual(Object.keys(row), ["lead_id", "created_at", "name", "phone", "email", "source", "language",
    "service", "stage", "appointment_at", "calendar_event_id", "summary", "last_contact_at", "notes"]);
});
