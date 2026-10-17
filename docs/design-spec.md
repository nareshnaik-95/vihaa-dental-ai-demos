# Portfolio Demo Systems — Design Spec

**Date:** 2026-10-17
**Owner:** @boringagent.ai
**Status:** Approved design, pending build

## 1. Purpose

Build working demos of the four services in the @boringagent.ai offer so that:

- Prospects (business owners, agency owners, teams) can **try them live** or watch a short recording and immediately see *less manual work, faster response, better conversions*.
- Every demo doubles as **Instagram content** (Reels, carousels) and a **long-form walkthrough** for sales calls.

**Success criteria**

1. A stranger can chat with the bot or call the phone number and get a booked appointment end to end, with no human involved.
2. Every lead from chat or voice appears in the CRM within 1 minute, with source, stage and summary.
3. Follow-ups (confirmation, reminder, no-show, review request) fire automatically on schedule.
4. Each demo can be screen-recorded as a 30–60s Reel without editing out errors.
5. Running cost stays under ~$50/month while idle-to-light use.

## 2. The fictional business

**Vihaa Dental**: a made-up single-location dental clinic (not a real company).

- Services: check-up & clean, whitening, emergency visit, Invisalign consult.
- Hours: Mon–Sat, 9:00–18:00. 30-minute slots.
- One shared **clinic knowledge doc** (Google Doc): services, prices, hours, insurance, FAQs, location. Single source of truth for the chatbot and voice agent.

## 2a. Languages

The chatbot, voice agent and all follow-up messages support **English, Hindi and Telugu**.

- **Detection:** the agent replies in whatever language the user writes or speaks first, and switches if the user switches. Mixed speech (Hinglish, Telugu–English) is answered in the dominant language, keeping English for names, times and prices.
- **Script:** Hindi in Devanagari and Telugu in Telugu script by default. If the user types romanised ("mujhe appointment chahiye", "naaku appointment kavali"), reply in the same romanised style.
- **Stored language:** `upsert_lead` saves a `language` (`en|hi|te`) column. Follow-ups are sent in that language from fixed templates (3 languages × 5 message types), not translated live by the LLM, so the wording stays reviewed and consistent.
- **Knowledge doc:** stays in English; the LLM answers from it in the user's language. Prices, times and the phone number are always given as digits.
- **Voice:** the voice stack must support speech-to-text and text-to-speech in all three languages, with a natural Indian-accent voice for each. Telugu support is the weakest point across providers, so it must be tested before committing to one (Vapi with a multilingual STT/TTS, ElevenLabs Agents, or Sarvam AI as the India-focused fallback).
- **Reels:** at least one Reel shows the same booking in all three languages. That is a strong hook for Indian businesses.

## 3. Architecture

```
 Website chat ─┐                       ┌─> Google Calendar (availability + bookings)
               ├─> n8n (AI agent + ────┼─> CRM: Google Sheet "Leads"
 Phone call ───┘    workflows)         └─> Follow-ups: Gmail / Twilio SMS / WhatsApp
 (Vapi/Retell)                                     │
                                                   └─> Dashboard (Looker Studio on the Sheet)
```

One n8n instance (n8n Cloud starter, or self-hosted on a small VPS) owns all logic. Channels are thin front ends that call n8n.

## 4. Components

### 4.1 Demo site (front end for demo 1)
- One-page clinic website (static HTML, hosted free on Netlify/Vercel or as a hosted page).
- Embeds the n8n chat widget.
- Has a visible "Call our AI receptionist: +1 …" number for demo 2.

### 4.2 Demo 1: AI website chatbot
- **Tool:** n8n *Chat Trigger* + *AI Agent* node (Claude or OpenAI model) with tools:
  - `knowledge_lookup`: reads the clinic knowledge doc.
  - `check_availability`: Google Calendar free/busy for a date.
  - `book_appointment`: creates the calendar event, then calls the `upsert_lead` sub-workflow.
- **Behaviour:** answers FAQs, qualifies (name, phone, email, service, preferred time), offers 2–3 slots, books.
- **Guardrails:** never gives medical advice, hands off "pain / emergency" to the call number, confirms details before booking.

### 4.3 Demo 2: AI voice receptionist
- **Tool:** Vapi (default; Retell or ElevenLabs Agents are fine alternatives) with a purchased phone number.
- Assistant prompt is built from the same knowledge doc.
- Tool calls go to n8n webhooks: `check_availability`, `book_appointment`, `reschedule_appointment`.
- **End-of-call webhook** → n8n stores transcript summary + outcome in the CRM.
- **Missed-call text-back:** if a call drops or ends without booking, n8n sends an SMS with a booking link to the chat page.

### 4.4 Demo 3: CRM + pipeline
- **Store:** Google Sheet `Leads` (v1). HubSpot free tier is a later swap; keep the `upsert_lead` sub-workflow as the only writer so the swap touches one place.
- **Columns:** `lead_id, created_at, name, phone, email, source (chat|voice), language (en|hi|te), service, stage, appointment_at, calendar_event_id, summary, last_contact_at, notes`.
- **Stages:** `New → Qualified → Booked → Confirmed → Attended | No-show → Review requested`.
- **Dashboard:** Looker Studio report on the sheet: leads by source, booking rate, no-show rate, leads per day.

### 4.5 Demo 4: Follow-up automation
n8n scheduled + event workflows:

| Trigger | Action | Stage change |
|---|---|---|
| Booking created | Confirmation email + SMS | Booked → Confirmed |
| 24h before appointment | Reminder SMS with reschedule link | — |
| 1h after slot, not marked attended | "We missed you" re-book SMS | → No-show |
| Marked attended | Review request (email) after 2h | → Review requested |
| Lead `Qualified` but not booked for 24h | Nudge email with booking link | — |

"Marked attended" in the demo = manually changing the stage in the sheet (that's the live "magic moment" on camera).

## 5. Data flow (happy path)

1. Visitor asks the chatbot for a cleaning on Friday.
2. Agent → `check_availability` → offers slots → visitor picks 10:30 and gives details.
3. `book_appointment` creates the calendar event → `upsert_lead` writes the row (`Booked`).
4. Confirmation workflow sends email + SMS → stage `Confirmed`.
5. Reminder fires 24h before. After the visit, stage → `Attended` → review request goes out.
6. Dashboard updates.

The voice path is the same from step 2, via Vapi tool calls.

## 6. Error handling

- Every n8n workflow has an **Error Trigger** workflow that posts to a private alert channel (email or Telegram) with the workflow name and input.
- Booking is **check-then-create**: re-check the slot right before creating the event. If it's taken, the agent offers the next slots.
- `upsert_lead` matches on phone, then email, to avoid duplicate rows.
- If Calendar or Sheets is down, the agent says it will have the team call back, and the lead is still logged to a fallback "Inbox" sheet tab.
- SMS/email sends are idempotent per `lead_id + message_type` (logged in a `Messages` tab).

## 7. Testing

- **Scripted conversations:** 10 chat scripts and 5 call scripts (FAQ only, happy booking, slot taken, reschedule, emergency handoff, rude/off-topic, missing info).
- **Workflow tests:** run each follow-up workflow with a test lead whose appointment time is set a few minutes ahead.
- **Pre-recording checklist:** clear the test rows, reset the calendar, check that all workflows are active, and do a full run-through before filming.

## 8. Content tie-in (@boringagent.ai)

| Demo | Reel hook idea |
|---|---|
| Chatbot | "This dental clinic's website books patients at 2am" |
| CRM | "Every lead, sorted, without anyone typing anything" |
| Follow-ups | "No-shows dropped because a robot texts them" |
| Voice | "I called an AI receptionist. It booked me in 40 seconds." |
| Languages | "Same AI receptionist — English, Hindi, Telugu. Watch it switch." |
| Full funnel | Long-form: "I built a dental front desk with zero staff" |

Post via Metricool to @boringagent.ai only.

## 9. Out of scope (v1)

Multi-client setup, logins, payments, custom code apps, real patient data, HIPAA compliance, HubSpot migration.

## 10. Accounts & costs (estimate)

| Item | Est. monthly |
|---|---|
| n8n Cloud Starter (or VPS ~$6) | ~$24 |
| Vapi usage + phone number | ~$5–15 at demo volume |
| Twilio SMS | ~$2–5 |
| LLM API | ~$5 |
| Google Workspace (Sheets/Calendar/Gmail), Looker Studio, Netlify | Free |
