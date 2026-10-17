# AI receptionist test log

Manual checks on the live ElevenLabs agent. Test data only (fake names and numbers).

| Date | Channel | Check | Result |
|---|---|---|---|
| 2026-10-17 | chat | Telugu: price + Saturday hours for a cleaning | ✅ Correct (₹800, 30 min, 9:00–5:30), asked for name |
| 2026-10-17 | chat | Romanised Hindi: address + timings | ✅ Replied in romanised Hindi with correct address and hours |
| 2026-10-17 | voice | Telugu booking (real caller) | ⚠️ Telugu and booking flow good, 108 safety rule held, but **wrong mobile number saved** (a "0" heard as "7") → prompt fixed |
| 2026-10-18 | chat | 9-digit number `987654321` | ✅ "I heard 9 digits… 10 digits" and asked again |
| 2026-10-18 | chat | `+91 98765 43210` | ✅ Stripped +91, read back "9 8 7 6 5 ... 4 3 2 1 0. Is that correct?" |
| 2026-10-18 | chat | Caller says "No, that's wrong" | ✅ "No problem, let's start again" and asked for the full number |
| — | voice | Number given in two halves by voice | ☐ To test on the live site (needs a microphone) |
