// Follow-up rules for the `followups` workflow. Pure functions: embedded into n8n Code nodes by scripts/build.js.
// Each run looks at every lead and returns the messages that are due. `send_once` makes repeats harmless.

const HOUR = 3600 * 1000;
const IST_OFFSET_MIN = 330;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

// "Tue 20 Oct, 10:30 AM" in IST, whatever timezone the n8n server runs in.
function formatWhen(value) {
  const t = parseTime(value);
  if (t === null) return "";
  const d = new Date(t + IST_OFFSET_MIN * 60 * 1000);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}

function renderMessage(templates, type, language, vars) {
  const byLang = templates[type] || {};
  const tpl = byLang[language] || byLang.en;
  const fill = s => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? "" : String(vars[k])));
  return { subject: fill(tpl.subject), body: fill(tpl.body) };
}

function dueActions(leads, now) {
  const nowT = now instanceof Date ? now.getTime() : parseTime(now);
  const actions = [];

  for (const lead of leads) {
    if (!lead || !lead.phone) continue;
    const appt = parseTime(lead.appointment_at);
    const created = parseTime(lead.created_at);
    const emailOr = fallback => (lead.email ? "email" : fallback);
    const add = (message_type, channels, new_stage) => {
      for (const channel of channels) {
        actions.push({ lead_id: lead.lead_id, message_type, channel,
          to: channel === "email" ? lead.email : lead.phone,
          language: lead.language || "en",
          vars: { name: lead.name || "", service: lead.service || "", when: formatWhen(lead.appointment_at) },
          new_stage });
      }
    };

    switch (lead.stage) {
      case "Booked":
      case "Confirmed":
        if (appt === null) break;
        if (nowT >= appt + HOUR) add("noshow", ["sms"], "No-show");
        else if (lead.stage === "Booked") add("confirmation", lead.email ? ["sms", "email"] : ["sms"], "Confirmed");
        else if (appt - nowT <= 24 * HOUR) add("reminder", ["sms"], null);
        break;
      case "Attended":
        if (appt !== null && nowT >= appt + 2 * HOUR) add("review", [emailOr("sms")], "Review requested");
        break;
      case "Qualified":
        if (appt === null && created !== null && nowT >= created + 24 * HOUR) add("nudge", [emailOr("sms")], null);
        break;
    }
  }
  return actions;
}

if (typeof module !== "undefined") module.exports = { formatWhen, renderMessage, dueActions };
