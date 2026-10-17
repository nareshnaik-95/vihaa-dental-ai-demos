# Vihaa Dental Demos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four connected, filmable demos for a fictional dental clinic: AI chatbot, AI voice receptionist, Sheets CRM, follow-up automation.

**Architecture:** One n8n instance owns all logic. The chat widget and Vapi are thin front ends calling n8n. Google Calendar holds availability. A Google Sheet is the CRM, written only by the `upsert_lead` sub-workflow.

**Tech Stack:** n8n (Cloud Starter or self-hosted), n8n AI Agent node (Claude model), Vapi, Twilio SMS, Gmail, Google Calendar, Google Sheets, Looker Studio, a static HTML page on Netlify.

**Spec:** `docs/superpowers/specs/2026-10-17-portfolio-demos-design.md`

**Version control:** after each task, export the touched n8n workflows as JSON into `demos/northwind/workflows/`. Initialise git in `demos/northwind/` first (Task 1) and commit after each task.

## Global Constraints

- Business is fictional: "Vihaa Dental". Never use real patient data.
- Hours Mon–Sat 9:00–18:00, 30-minute slots. Services: check-up & clean, whitening, emergency visit, Invisalign consult.
- Stages exactly: `New, Qualified, Booked, Confirmed, Attended, No-show, Review requested`.
- `Leads` columns exactly: `lead_id, created_at, name, phone, email, source, language, service, stage, appointment_at, calendar_event_id, summary, last_contact_at, notes`. `source` ∈ `chat|voice`. `language` ∈ `en|hi|te`.
- Languages: English, Hindi, Telugu. Reply in the user's language and script (native or romanised). Prices, times and phone numbers always as digits. Follow-ups come from fixed templates in the lead's stored language, never live-translated.
- Only `upsert_lead` writes to `Leads`.
- Agent never gives medical advice. Pain or emergency → hand off to the phone number.
- A lead shows up in the CRM within 1 minute. Idle running cost stays under ~$50/month.

## Review Focus

1. **Double booking:** two people grab the same slot. Expect the second to be offered other slots (test in Task 4).
2. **Same person returns** on another channel with the same phone number. Expect one row, updated (test in Task 3).
3. **Booking outside hours or on Sunday** ("book me Sunday 8pm"). Expect a refusal plus the nearest valid slots (test in Task 4).
4. **Duplicate follow-ups** when a scheduled workflow re-runs. Expect each `lead_id + message_type` to be sent once (test in Task 6).
5. **Timezone drift:** slots shown or reminders sent in the wrong timezone. Expect everything in the clinic's timezone, set once in n8n settings (test in Task 6 reminder run).
6. **Language switch mid-conversation** (starts in English, switches to Telugu). Expect the reply to switch and the stored `language` to update to the last one used (test in Task 5).

---

### Task 1: Accounts and shared foundation

**Files:**
- Create: `demos/northwind/README.md` (accounts, URLs, phone number, timezone; **no secrets**)
- Create: `demos/northwind/knowledge.md` (copy of the clinic knowledge doc)

**Produces:** Google Calendar `Vihaa Appointments`; Google Sheet `Vihaa CRM` with tabs `Leads`, `Messages` (`lead_id, message_type, sent_at`), `Inbox`; Google Doc `Vihaa Knowledge`; n8n credentials for Google, Twilio, LLM; n8n timezone set; Error workflow `ERR alert` that emails you the workflow name and input.

- [ ] **Step 1:** Create the n8n, Twilio, Vapi, Netlify and LLM API accounts. Set the n8n instance timezone to your clinic timezone.
- [ ] **Step 2:** Write the knowledge doc: services + prices, hours, insurance accepted, location, 10 FAQs, emergency policy.
- [ ] **Step 3:** Create the Calendar and the Sheet with the exact headers from Global Constraints.
- [ ] **Step 4:** Build `ERR alert` (Error Trigger → Gmail) and set it as the error workflow on every workflow you build afterwards.
- [ ] **Step 5: Verify:** a test workflow that throws on purpose triggers the alert email.
- [ ] **Step 6:** `git init` in `demos/northwind`, export `ERR alert`, commit `"chore: foundation"`.

### Task 2: Demo site

**Files:** Create `demos/northwind/site/index.html`

- [ ] **Step 1:** One-page clinic site: hero, services, hours, "Call our AI receptionist" (placeholder number until Task 7), chat widget placeholder. Make it look like a real clinic site, because it will be on camera.
- [ ] **Step 2:** Deploy to Netlify. **Verify:** the public URL loads on phone and desktop.
- [ ] **Step 3:** Commit `"feat: demo site"`.

### Task 3: `upsert_lead` sub-workflow (CRM writer)

**Files:** `workflows/upsert_lead.json`

**Interfaces:**
- Produces: Execute-Workflow input `{name, phone, email, source, language, service, stage, appointment_at?, calendar_event_id?, summary?}` → output `{lead_id, created: boolean}`. `language` defaults to `en` if missing or not in `en|hi|te`.

- [ ] **Step 1: Test cases** (run manually with pinned data):
  - New phone → new row, `lead_id` generated, `created_at` set, `created: true`.
  - Same phone, new stage → same row updated, `last_contact_at` refreshed, `created: false`.
  - No phone, matching email → matches on email.
  - Sheets credential broken → row written to `Inbox` instead, and `ERR alert` fires.
- [ ] **Step 2:** Build: normalise the phone to E.164 → look up by phone, then by email → update or append.
- [ ] **Step 3: Verify:** all four cases behave as listed.
- [ ] **Step 4:** Export + commit `"feat: upsert_lead"`.

### Task 4: Booking tools (shared by chat and voice)

**Files:** `workflows/check_availability.json`, `workflows/book_appointment.json`, `workflows/reschedule_appointment.json`

**Interfaces:**
- Consumes: `upsert_lead` (Task 3).
- Produces (each callable both as an Execute-Workflow sub-workflow and through a Webhook trigger, for Vapi):
  - `check_availability {date, service}` → `{slots: ["2026-10-23T10:30", …]}` (up to 3, within hours, not Sunday).
  - `book_appointment {name, phone, email, service, slot, source, language}` → `{ok, calendar_event_id, lead_id}` or `{ok:false, reason:"slot_taken"|"outside_hours", alternatives:[…]}`.
  - `reschedule_appointment {phone, new_slot}` → same shape as `book_appointment`.

- [ ] **Step 1: Test cases:**
  - Friday with a free calendar → 3 slots, all between 9:00 and 17:30.
  - Sunday or 20:00 → `outside_hours` + nearest valid alternatives.
  - Book a free slot → calendar event exists, lead stage `Booked`.
  - Book the same slot twice → second call returns `slot_taken` + alternatives.
  - Reschedule → old event deleted, new event created, `appointment_at` updated.
- [ ] **Step 2:** Build. Booking re-checks free/busy right before creating the event.
- [ ] **Step 3: Verify:** all five cases pass.
- [ ] **Step 4:** Export + commit `"feat: booking tools"`.

### Task 5: Demo 1 — AI website chatbot

**Files:** `workflows/chatbot.json`, modify `site/index.html` (embed widget)

**Interfaces:** Consumes Task 4 tools + `upsert_lead`. The agent's tools: `knowledge_lookup`, `check_availability`, `book_appointment`.

- [ ] **Step 1:** Write the 10 chat test scripts in `demos/northwind/tests/chat-scripts.md`: FAQ only, happy booking, slot taken, reschedule request, emergency/pain, off-topic, rude, missing phone, Sunday request, price question. Add 6 language scripts: happy booking in Hindi (Devanagari), Telugu (Telugu script), romanised Hindi, romanised Telugu, English → Telugu switch mid-chat, and an emergency in Hindi.
- [ ] **Step 2:** Build: Chat Trigger → AI Agent (Claude model, window memory) with a system prompt covering the clinic persona, the guardrails from Global Constraints, the language rules from Global Constraints, "confirm details before booking", and qualifying with `upsert_lead` stage `Qualified` once name + phone are known. The agent passes `language` (`en|hi|te`, the last language the user used) to `upsert_lead` and `book_appointment`.
- [ ] **Step 3:** Embed the n8n chat widget on the site and redeploy.
- [ ] **Step 4: Verify:** run all 16 scripts on the live site. Language scripts are answered in the right language and script, and `Leads.language` matches (`te` after the switch script). Get a native Hindi and Telugu speaker to read the transcripts for naturalness. Each booking shows up in the Calendar and in `Leads` within 1 minute. The emergency script hands off to the phone number with no advice given.
- [ ] **Step 5:** Export + commit `"feat: chatbot demo"`.

### Task 6: Demo 4 — Follow-up automation + Demo 3 dashboard

**Files:** `workflows/followup_confirmation.json`, `followup_reminder.json`, `followup_noshow.json`, `followup_review.json`, `followup_nudge.json`, `workflows/send_once.json`, `demos/northwind/templates/messages.json`

**Interfaces:**
- Produces `send_once {lead_id, message_type, channel: "sms"|"email", to, language, vars}` → `{sent: boolean}`. Looks up the body in `templates/messages.json` keyed `[message_type][language]`, falls back to `en` if missing, and fills `vars` (`name, service, appointment_at, link`). Checks the `Messages` tab first; if it sends, it appends a row there.
- `message_type` ∈ `confirmation, reminder, noshow, review, nudge, textback`.

- [ ] **Step 0:** Write `templates/messages.json`: 6 message types × `en|hi|te`, with SMS bodies kept short (Telugu and Hindi SMS are Unicode, 70 characters per segment). Have a native speaker check the Hindi and Telugu wording. (`textback` is used in Task 7.)

- [ ] **Step 1: Test cases** (create a test lead with `appointment_at` a few minutes ahead, and temporarily shorten the delays):
  - Booking → confirmation email + SMS, stage `Confirmed`.
  - Reminder fires at T−24h (shortened), with the time shown in the clinic timezone.
  - Not attended at T+1h → re-book SMS, stage `No-show`.
  - Stage set to `Attended` manually → review email after 2h (shortened), stage `Review requested`.
  - `Qualified` and unbooked for 24h → nudge email.
  - Re-run any scheduled workflow → no second message (`send_once` returns `sent:false`).
  - Test leads with `language` `hi` and `te` → confirmation and reminder arrive in Devanagari and Telugu script, rendered correctly on the phone.
- [ ] **Step 2:** Build `send_once`, then the five workflows (schedule triggers poll `Leads` every 5 min; confirmation is called right after booking).
- [ ] **Step 3: Verify:** all six cases pass. Restore the real delays.
- [ ] **Step 4:** Build the Looker Studio report on `Leads`: leads by source, booking rate, no-show rate, leads per day. **Verify:** it reflects the test rows.
- [ ] **Step 5:** Export + commit `"feat: follow-ups and dashboard"`.

### Task 7: Demo 2 — AI voice receptionist

**Files:** `demos/northwind/voice/assistant-prompt.md`, `workflows/voice_end_of_call.json`, `workflows/missed_call_textback.json`, `tests/call-scripts.md`

**Interfaces:** Vapi tools point to the Task 4 webhook URLs. Vapi end-of-call report → `voice_end_of_call` webhook.

- [ ] **Step 0: Language spike (decide the voice provider):** make a 2-minute test booking call in Telugu, then Hindi, on Vapi (multilingual STT + an Indian voice), ElevenLabs Agents, and Sarvam AI if the first two struggle with Telugu. Pick the first provider that books correctly in all three languages with a natural-sounding voice. Record the choice and why in `README.md`. The rest of this task says "Vapi"; swap in the chosen provider.
- [ ] **Step 1:** Write 5 call scripts: FAQ only, happy booking, reschedule, emergency, hang-up mid-booking. Plus 3 language scripts: full booking in Hindi, full booking in Telugu, a caller who starts in English and switches to Telugu.
- [ ] **Step 2:** In Vapi, buy a number, create the assistant from `assistant-prompt.md` (the knowledge doc + the same guardrails + the language rules), and add the three tools. Configure STT/TTS for `en`, `hi` and `te` with auto-detection. A short greeting in all three languages ("Hello / Namaste / Namaskaram…") tells callers they can pick one.
- [ ] **Step 3:** Build `voice_end_of_call`: summary + outcome + detected language → `upsert_lead` with `source: voice` and `language`. If there was no booking, call `missed_call_textback` → `send_once` SMS with the chat site link.
- [ ] **Step 4:** Put the real number on the site and redeploy.
- [ ] **Step 5: Verify:** call through all 8 scripts from your phone. The language calls are understood and answered in the caller's language, and the text-back SMS arrives in that language. A booking appears in the Calendar and CRM within 1 minute. A hang-up gets the text-back SMS. The emergency call gives no advice.
- [ ] **Step 6:** Export + commit `"feat: voice receptionist"`.

### Task 8: Full-funnel run-through and filming checklist

**Files:** `demos/northwind/tests/pre-recording-checklist.md`

- [ ] **Step 1:** Write the checklist: clear test rows (keep headers), clear `Messages`, reset Calendar, all workflows active, phone credit OK, run through once.
- [ ] **Step 2: Verify the whole funnel once end to end:** chat booking → confirmation → reminder → mark `Attended` → review request; voice booking → CRM; dashboard updated. Check the cost dashboards: projected cost under ~$50/month.
- [ ] **Step 3:** Commit `"docs: pre-recording checklist"`.
- [ ] **Step 4:** Hand off to content: record the 4 Reels + the "English / Hindi / Telugu" Reel + the long-form walkthrough (hooks are in spec §8). Schedule them via Metricool to @boringagent.ai only.
