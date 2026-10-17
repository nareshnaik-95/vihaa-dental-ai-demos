// Generates the CRM and follow-up n8n workflows from the tested logic in src/ and templates/.
// Run: node scripts/build.js   (re-run after changing src/ or templates/, then re-import in n8n)

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const lib = file => fs.readFileSync(path.join(root, "src", file), "utf8")
  .replace(/^if \(typeof module.*$/m, "")
  .trim();
const templates = fs.readFileSync(path.join(root, "templates", "messages.json"), "utf8").trim();

const SHEET = { __rl: true, value: "YOUR_SHEET_ID", mode: "id" };
const tab = name => ({ __rl: true, value: name, mode: "name" });
const settings = { executionOrder: "v1", timezone: "Asia/Kolkata" };

let n = 0;
const node = (name, type, typeVersion, parameters, x, extra = {}) =>
  ({ parameters, id: `vihaa-${String(++n).padStart(4, "0")}`, name, type, typeVersion, position: [x, extra.y || 0], ...extra.props });
const link = (...names) => ({ main: [names.map(node => ({ node, type: "main", index: 0 }))] });
const sheetsRead = (name, sheet, x) => node(name, "n8n-nodes-base.googleSheets", 4.5,
  { operation: "read", documentId: SHEET, sheetName: tab(sheet), options: {} }, x, { props: { alwaysOutputData: true } });
const sheetsWrite = (name, operation, sheet, x, match, extra) => node(name, "n8n-nodes-base.googleSheets", 4.5,
  { operation, documentId: SHEET, sheetName: tab(sheet),
    columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: match ? [match] : [], schema: [] }, options: {} }, x, extra);
const code = (name, jsCode, x, y) => node(name, "n8n-nodes-base.code", 2, { jsCode }, x, { y });
const trigger = () => node("When called by another workflow", "n8n-nodes-base.executeWorkflowTrigger", 1.1,
  { inputSource: "passthrough" }, 0);

// ---------- upsert_lead: the only writer of the Leads tab ----------
function upsertLead() {
  n = 0;
  const nodes = [
    trigger(),
    sheetsRead("Read Leads", "Leads", 220),
    code("Build row", `${lib("lead.js")}

const input = $('When called by another workflow').first().json;
const rows = $input.all().map(i => i.json).filter(r => r.lead_id);
const existing = findExisting(rows, input);
const { row } = buildLeadRow(input, existing, new Date().toISOString(),
  () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
return [{ json: row }];`, 440),
    sheetsWrite("Save lead", "appendOrUpdate", "Leads", 660, "lead_id",
      { props: { onError: "continueErrorOutput" } }),
    code("Result", `const row = $('Build row').first().json;
const before = $('Read Leads').all().map(i => i.json).some(r => r.lead_id === row.lead_id);
return [{ json: { lead_id: row.lead_id, created: !before } }];`, 880),
    code("To Inbox", `return [{ json: { received_at: new Date().toISOString(), source: 'upsert_lead',
  payload: JSON.stringify($('When called by another workflow').first().json),
  error: String($json.error?.message || $json.error || 'Sheets write failed') } }];`, 880, 200),
    sheetsWrite("Save to Inbox", "append", "Inbox", 1100, null, { y: 200 }),
    node("Raise alert", "n8n-nodes-base.stopAndError", 1,
      { errorMessage: "Could not save lead to Leads; stored in Inbox instead" }, 1320, { y: 200 }),
  ];
  const connections = {
    "When called by another workflow": link("Read Leads"),
    "Read Leads": link("Build row"),
    "Build row": link("Save lead"),
    "Save lead": { main: [[{ node: "Result", type: "main", index: 0 }], [{ node: "To Inbox", type: "main", index: 0 }]] },
    "To Inbox": link("Save to Inbox"),
    "Save to Inbox": link("Raise alert"),
  };
  return { name: "upsert_lead", nodes, connections, settings, active: false };
}

// ---------- send_once: sends a templated SMS/email at most once per lead + type + channel ----------
function sendOnce() {
  n = 0;
  const nodes = [
    trigger(),
    sheetsRead("Read Messages", "Messages", 220),
    code("Check and render", `// Set this to your public demo site once it is deployed.
const BOOKING_LINK = "https://nareshnaik-95.github.io/vihaa-dental-ai-demos/site/";
const templates = ${templates};
${lib("followups.js")}

const req = $('When called by another workflow').first().json;
const sent = $input.all().map(i => i.json)
  .some(r => r.lead_id === req.lead_id && r.message_type === req.message_type && r.channel === req.channel);
if (sent || !req.to) return [{ json: { ...req, skip: true } }];
const msg = renderMessage(templates, req.message_type, req.language, { link: BOOKING_LINK, ...(req.vars || {}) });
return [{ json: { ...req, ...msg, skip: false } }];`, 440),
    node("Already sent?", "n8n-nodes-base.if", 2.2, {
      conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and",
        conditions: [{ id: "c1", leftValue: "={{ $json.skip }}", rightValue: true,
          operator: { type: "boolean", operation: "true", singleValue: true } }] },
      options: {} }, 660),
    code("Not sent", "return [{ json: { sent: false } }];", 880, -160),
    node("SMS?", "n8n-nodes-base.if", 2.2, {
      conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and",
        conditions: [{ id: "c2", leftValue: "={{ $json.channel }}", rightValue: "sms",
          operator: { type: "string", operation: "equals" } }] },
      options: {} }, 880, 80),
    node("Send SMS", "n8n-nodes-base.twilio", 1,
      { from: "YOUR_TWILIO_NUMBER", to: "={{ $json.to }}", message: "={{ $json.body }}", options: {} }, 1100),
    node("Send email", "n8n-nodes-base.gmail", 2.1,
      { sendTo: "={{ $json.to }}", subject: "={{ $json.subject }}", emailType: "text",
        message: "={{ $json.body }}", options: { appendAttribution: false } }, 1100, { y: 200 }),
    code("Log row", `const req = $('Check and render').first().json;
return [{ json: { lead_id: req.lead_id, message_type: req.message_type, channel: req.channel, sent_at: new Date().toISOString() } }];`, 1320, 80),
    sheetsWrite("Save to Messages", "append", "Messages", 1540, null, { y: 80 }),
    code("Sent", "return [{ json: { sent: true } }];", 1760, 80),
  ];
  const connections = {
    "When called by another workflow": link("Read Messages"),
    "Read Messages": link("Check and render"),
    "Check and render": link("Already sent?"),
    "Already sent?": { main: [[{ node: "Not sent", type: "main", index: 0 }], [{ node: "SMS?", type: "main", index: 0 }]] },
    "SMS?": { main: [[{ node: "Send SMS", type: "main", index: 0 }], [{ node: "Send email", type: "main", index: 0 }]] },
    "Send SMS": link("Log row"),
    "Send email": link("Log row"),
    "Log row": link("Save to Messages"),
    "Save to Messages": link("Sent"),
  };
  return { name: "send_once", nodes, connections, settings, active: false };
}

// ---------- followups: every 5 minutes, send whatever is due and move stages ----------
function followups() {
  n = 0;
  const nodes = [
    node("Every 5 minutes", "n8n-nodes-base.scheduleTrigger", 1.2,
      { rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } }, 0),
    sheetsRead("Read Leads", "Leads", 220),
    code("Due actions", `${lib("followups.js")}

const leads = $input.all().map(i => i.json).filter(r => r.lead_id);
return dueActions(leads, new Date()).map(a => ({ json: a }));`, 440),
    node("send_once", "n8n-nodes-base.executeWorkflow", 1.2,
      { workflowId: { __rl: true, value: "", mode: "list" }, mode: "each", options: { waitForSubWorkflow: true } }, 660),
    code("Stage changes", `const changes = new Map();
for (const { json: a } of $('Due actions').all()) if (a.new_stage) changes.set(a.lead_id, a.new_stage);
return [...changes].map(([lead_id, stage]) => ({ json: { lead_id, stage } }));`, 880),
    sheetsWrite("Update stage", "update", "Leads", 1100, "lead_id"),
  ];
  const connections = {
    "Every 5 minutes": link("Read Leads"),
    "Read Leads": link("Due actions"),
    "Due actions": link("send_once"),
    "send_once": link("Stage changes"),
    "Stage changes": link("Update stage"),
  };
  return { name: "followups", nodes, connections, settings, active: false };
}

const out = path.join(root, "workflows");
for (const wf of [upsertLead(), sendOnce(), followups()]) {
  fs.writeFileSync(path.join(out, `${wf.name}.json`), JSON.stringify(wf, null, 2) + "\n");
  console.log(`wrote workflows/${wf.name}.json (${wf.nodes.length} nodes)`);
}
