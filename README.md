# Northwind Smile Dental — Demo Systems

Portfolio demos for @boringagent.ai. **Northwind Smile Dental is a fictional clinic.** Never put real patient data here.

- Spec: `../../docs/superpowers/specs/2026-10-17-portfolio-demos-design.md`
- Plan: `../../docs/superpowers/plans/2026-10-17-portfolio-demos.md`

## Settings

| Setting | Value |
|---|---|
| Clinic location (fictional) | Hyderabad, Telangana |
| Timezone (n8n instance + Google Calendar) | `Asia/Kolkata` (IST, UTC+5:30) |
| Hours | Mon–Sat 09:00–18:00, 30-min slots, closed Sunday |
| Languages | English (`en`), Hindi (`hi`), Telugu (`te`) |
| Currency | INR (₹) |

## Accounts (fill in as you create them, no passwords or keys here)

| Service | Purpose | Account / URL | Status |
|---|---|---|---|
| n8n | All workflows | | ☐ |
| Google (Calendar, Sheets, Docs, Gmail) | Calendar, CRM, knowledge, email | | ☐ |
| Twilio (or WhatsApp provider) | SMS follow-ups | | ☐ |
| Voice provider (picked in Task 7 spike) | AI receptionist | | ☐ |
| LLM API (Claude) | Chat agent model | | ☐ |
| Netlify | Demo site hosting | | ☐ |

## Google resources

| Resource | Name | ID / URL |
|---|---|---|
| Calendar | `Northwind Appointments` | |
| Sheet | `Northwind CRM` (tabs: `Leads`, `Messages`, `Inbox`) | |
| Doc | `Northwind Knowledge` (paste from `knowledge.md`) | |

## Demo links

- Site: _(Task 2)_
- AI receptionist phone number: _(Task 7)_

## Decisions

- **Voice provider:** _(record the Task 7 language spike result here)_
- **SMS in India:** sending Twilio SMS to Indian numbers requires DLT registration. For the demo, send SMS to your own verified number, or use WhatsApp (Twilio sandbox / WhatsApp Cloud API) for the follow-ups instead.

## Folder layout

```
workflows/   n8n workflow exports (JSON). Import via n8n → Import from file
crm/         CSV headers for the Google Sheet tabs
site/        demo website (Task 2)
templates/   follow-up message templates en/hi/te (Task 6)
voice/       voice assistant prompt (Task 7)
tests/       chat/call scripts and pre-recording checklist
```
