const test = require("node:test");
const assert = require("node:assert/strict");
const { dueActions, renderMessage, formatWhen } = require("../src/followups.js");
const templates = require("../templates/messages.json");

const NOW = new Date("2026-10-17T10:00:00+05:30");
const lead = over => ({ lead_id: "L1", name: "Ravi", phone: "+919876543210", email: "r@x.com", language: "en",
  service: "Check-up & cleaning", stage: "Booked", appointment_at: "2026-10-20T10:30:00+05:30",
  created_at: "2026-10-17T09:00:00+05:30", ...over });

const types = actions => actions.map(a => `${a.message_type}:${a.channel}`).sort();

test("Booked lead gets SMS + email confirmation and moves to Confirmed", () => {
  const a = dueActions([lead({})], NOW);
  assert.deepEqual(types(a), ["confirmation:email", "confirmation:sms"]);
  assert.ok(a.every(x => x.new_stage === "Confirmed"));
});

test("confirmation without email is SMS only", () => {
  assert.deepEqual(types(dueActions([lead({ email: "" })], NOW)), ["confirmation:sms"]);
});

test("Confirmed lead gets an SMS reminder within 24h of the visit, not earlier", () => {
  const soon = lead({ stage: "Confirmed", appointment_at: "2026-10-18T09:30:00+05:30" });
  const later = lead({ stage: "Confirmed", appointment_at: "2026-10-19T10:30:00+05:30" });
  assert.deepEqual(types(dueActions([soon], NOW)), ["reminder:sms"]);
  assert.equal(soon && dueActions([soon], NOW)[0].new_stage, null);
  assert.deepEqual(dueActions([later], NOW), []);
});

test("visit passed by more than 1h without Attended → no-show SMS", () => {
  const missed = lead({ stage: "Confirmed", appointment_at: "2026-10-17T08:30:00+05:30" });
  const justNow = lead({ stage: "Confirmed", appointment_at: "2026-10-17T09:30:00+05:30" });
  const a = dueActions([missed], NOW);
  assert.deepEqual(types(a), ["noshow:sms"]);
  assert.equal(a[0].new_stage, "No-show");
  assert.deepEqual(types(dueActions([justNow], NOW)), ["reminder:sms"], "within the hour it is still only a reminder");
});

test("Attended lead gets a review email 2h after the visit (SMS if no email)", () => {
  const done = lead({ stage: "Attended", appointment_at: "2026-10-17T07:30:00+05:30" });
  const tooSoon = lead({ stage: "Attended", appointment_at: "2026-10-17T09:00:00+05:30" });
  const a = dueActions([done], NOW);
  assert.deepEqual(types(a), ["review:email"]);
  assert.equal(a[0].new_stage, "Review requested");
  assert.deepEqual(dueActions([tooSoon], NOW), []);
  assert.deepEqual(types(dueActions([lead({ stage: "Attended", email: "", appointment_at: "2026-10-17T07:30:00+05:30" })], NOW)), ["review:sms"]);
});

test("Qualified lead unbooked for 24h gets a nudge", () => {
  const old = lead({ stage: "Qualified", appointment_at: "", created_at: "2026-10-16T09:00:00+05:30" });
  const fresh = lead({ stage: "Qualified", appointment_at: "" });
  assert.deepEqual(types(dueActions([old], NOW)), ["nudge:email"]);
  assert.deepEqual(dueActions([fresh], NOW), []);
});

test("leads without a phone, finished stages and bad dates are skipped safely", () => {
  const rows = [lead({ phone: "" }), lead({ stage: "Review requested" }), lead({ stage: "No-show" }),
    lead({ stage: "Confirmed", appointment_at: "not a date" }), {}];
  assert.deepEqual(dueActions(rows, NOW), []);
});

test("renderMessage fills the template in the lead's language, falling back to English", () => {
  const vars = { name: "Ravi", service: "Check-up & cleaning", when: "Tue 20 Oct, 10:30 AM", link: "https://x.test" };
  const te = renderMessage(templates, "reminder", "te", vars);
  assert.match(te.body, /Ravi/);
  assert.match(te.body, /విహా డెంటల్/);
  assert.doesNotMatch(te.body, /\{/);
  const fallback = renderMessage(templates, "reminder", "fr", vars);
  assert.equal(fallback.body, renderMessage(templates, "reminder", "en", vars).body);
});

test("every template exists in en, hi and te", () => {
  for (const type of ["confirmation", "reminder", "noshow", "review", "nudge", "textback"])
    for (const lang of ["en", "hi", "te"]) assert.ok(templates[type][lang].body, `${type}/${lang}`);
});

test("formatWhen shows the time in IST", () => {
  assert.equal(formatWhen("2026-10-20T05:00:00Z"), "Tue 20 Oct, 10:30 AM");
  assert.equal(formatWhen(""), "");
});
