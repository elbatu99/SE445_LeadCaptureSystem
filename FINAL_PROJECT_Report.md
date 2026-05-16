# SE 445 — Final Project: Lead Capture System
## Complete Pipeline with Auto-Email Responder

## 1. Project Overview
This is the final, fully integrated iteration of the Lead Capture System. Building on the validation and AI classification introduced in HW3, this stage closes the loop by adding an **automated email responder** — every valid lead receives a personalised AI-generated reply instantly, with no manual intervention. All 10 columns of the database schema are now fully active.

## 2. Technical Architecture
The system runs as a **Google Apps Script Web App** and processes every incoming lead through a 5-step pipeline:

- **Webhook Trigger:** Accepts HTTP POST requests carrying `{ name, email, message }` JSON payloads.
- **Validation Logic:** Checks for empty fields and valid email format via Regex. Invalid leads are flagged (`is_valid: false`) with a `validation_reason` and retained — never dropped.
- **AI Agent (Gemini 2.0 Flash):** Classifies each message into `intent` (Sales, Support, Partnership, Other) and `urgency` (High, Medium, Low) using a zero-temperature prompt for deterministic output.
- **Auto-Email Responder:** Sends a personalised AI-generated greeting to every valid lead via `MailApp`. Invalid leads are skipped and logged as `"Invalid - Skipped"` in the `action_taken` column.
- **Storage Layer:** Writes all 10 enriched fields into the Google Sheets database via `appendRow` — including `ai_response` and `action_taken`, which are populated for the first time in this phase.

## 3. Database Schema (10 Columns — All Active)

| Column | Field | Source | Phase |
|---|---|---|---|
| A | `timestamp` | Auto-generated | HW1 |
| B | `name` | Webhook payload | HW1 |
| C | `email` | Webhook payload | HW1 |
| D | `message` | Webhook payload | HW1 |
| E | `is_valid` | Validation Logic | HW3 |
| F | `validation_reason` | Validation Logic | HW3 |
| G | `intent` | AI Agent | HW3 |
| H | `urgency` | AI Agent | HW3 |
| I | `ai_response` | Gemini Greeting | **Final** |
| J | `action_taken` | Auto-Email Responder | **Final** |

## 4. Testing & Verification
The system has been successfully verified for both valid and invalid inputs.

- **Valid lead:** All 10 columns populated; AI greeting generated; auto-reply email delivered; `action_taken = "Email sent"`.
- **Invalid lead:** Record retained with `is_valid = false`; email skipped; `action_taken = "Invalid - Skipped"`.

> *Note: Detailed screenshots and live webhook URL are available in the official academic Word submission.*
