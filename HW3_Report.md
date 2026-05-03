# SE 445 — HW3: Logic & Intelligent Processing

## 1. Project Overview
This stage upgrades the Lead Capture System with **Data Validation** and **AI Classification**, fulfilling the HW3 requirements.

## 2. Technical Architecture
- **Validation Logic:** Checks for empty fields and valid email formats using Regex. Invalid leads are flagged (`is_valid: false`) and retained with a `validation_reason` to prevent data loss.
- **AI Agent (Gemini 2.0 Flash):** Processes incoming messages to extract `intent` (Sales, Support, Partnership, Other) and `urgency` (High, Medium, Low).
- **Storage Layer:** Automatically maps all enriched payload data into our 10-column Google Sheets database via `appendRow`.

## 3. Testing & Verification
The system has been successfully verified for both Valid and Invalid inputs. 
- *Note: Detailed screenshots and live webhook URLs are available in the official academic Word/PDF submission.*
