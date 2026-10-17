// Runs the generated n8n Code nodes against mocked n8n inputs, so the JSON that gets imported is what was tested.
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
execFileSync(process.execPath, [path.join(root, "scripts", "build.js")]);
const wf = name => require(path.join(root, "workflows", `${name}.json`));
const codeOf = (w, nodeName) => w.nodes.find(n => n.name === nodeName).parameters.jsCode;

// Minimal n8n Code-node runtime: $input.all(), $('Node').first()/all(), $json.
function runCode(jsCode, { input = [], nodes = {} }) {
  const wrap = arr => ({ all: () => arr.map(json => ({ json })), first: () => ({ json: arr[0] }) });
  const $ = name => wrap(nodes[name]);
  return new Function("$input", "$", "$json", jsCode)(wrap(input), $, input[0]);
}

test("every workflow is valid JSON with connected, uniquely named nodes", () => {
  for (const name of ["upsert_lead", "send_once", "followups"]) {
    const w = wf(name);
    const names = w.nodes.map(n => n.name);
    assert.equal(new Set(names).size, names.length, `${name}: duplicate node names`);
    for (const [from, c] of Object.entries(w.connections)) {
      assert.ok(names.includes(from), `${name}: unknown source ${from}`);
      for (const branch of c.main) for (const t of branch) assert.ok(names.includes(t.node), `${name}: unknown target ${t.node}`);
    }
  }
});

test("upsert_lead Build row updates the existing lead instead of duplicating", () => {
  const out = runCode(codeOf(wf("upsert_lead"), "Build row"), {
    input: [{ lead_id: "L-1", created_at: "2026-10-01T00:00:00Z", phone: "+919876543210", stage: "Qualified", language: "te" }],
    nodes: { "When called by another workflow": [{ phone: "98765 43210", stage: "Booked", source: "voice" }] },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].json.lead_id, "L-1");
  assert.equal(out[0].json.stage, "Booked");
  assert.equal(out[0].json.language, "te");
});

test("upsert_lead Build row creates a new lead on an empty sheet", () => {
  const out = runCode(codeOf(wf("upsert_lead"), "Build row"), {
    input: [{}], // n8n's "always output data" item when the sheet is empty
    nodes: { "When called by another workflow": [{ name: "Asha", phone: "9123456789", source: "chat", language: "hi" }] },
  });
  assert.match(out[0].json.lead_id, /^L-/);
  assert.equal(out[0].json.phone, "+919123456789");
});

test("send_once renders a Telugu SMS the first time and skips the repeat", () => {
  const req = { lead_id: "L-1", message_type: "confirmation", channel: "sms", to: "+919876543210", language: "te",
    vars: { name: "Ravi", service: "Check-up & cleaning", when: "Tue 20 Oct, 10:30 AM" } };
  const code = codeOf(wf("send_once"), "Check and render");
  const first = runCode(code, { input: [{}], nodes: { "When called by another workflow": [req] } })[0].json;
  assert.equal(first.skip, false);
  assert.match(first.body, /Ravi.*విహా డెంటల్|విహా డెంటల్.*Ravi/);
  const again = runCode(code, {
    input: [{ lead_id: "L-1", message_type: "confirmation", channel: "sms", sent_at: "x" }],
    nodes: { "When called by another workflow": [req] },
  })[0].json;
  assert.equal(again.skip, true);
});

test("followups Due actions turns sheet rows into send_once calls", () => {
  const soon = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
  const out = runCode(codeOf(wf("followups"), "Due actions"), {
    input: [{ lead_id: "L-1", phone: "+919876543210", email: "", stage: "Booked", appointment_at: soon, language: "hi", name: "Ravi" }],
  });
  assert.deepEqual(out.map(i => [i.json.message_type, i.json.channel, i.json.new_stage]), [["confirmation", "sms", "Confirmed"]]);
});

test("followups Stage changes gives one update per lead", () => {
  const out = runCode(codeOf(wf("followups"), "Stage changes"), {
    nodes: { "Due actions": [
      { lead_id: "L-1", new_stage: "Confirmed" }, { lead_id: "L-1", new_stage: "Confirmed" }, { lead_id: "L-2", new_stage: null }] },
  });
  assert.deepEqual(out.map(i => i.json), [{ lead_id: "L-1", stage: "Confirmed" }]);
});
