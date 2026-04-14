# SE 445 — HW2: Data Ingestion & Persistence Report

## 1. Project Overview
This stage focuses on the core data pipeline of the Lead Capture System. The system successfully ingests lead data via an HTTP POST Webhook and persists it into a structured Google Sheets database.

## 2. Technical Architecture
- **Endpoint:** Google Apps Script Web App (doPost Trigger)
- **Database:** Google Sheets (Atomic appendRow operations)
- **Format:** JSON (application/json)

## 3. Data Pipeline Flow
1. **Request:** External client sends `name`, `email`, and `message`.
2. **Processing:** Apps Script parses the JSON and adds a UTC ISO-8601 timestamp.
3. **Persistence:** Data is appended to the next available row in the 'leads' sheet.
4. **Resilience:** Gemini AI integration is decoupled; even if the AI service fails, data persistence remains guaranteed via the implemented fallback mechanism.

## 4. Verification
The system has been verified using PowerShell and cURL. 
- **Status Code:** 200 OK
- **Response:** `{"status": "success", "message": "Lead captured."}`

> **Note:** For the live Webhook URL and detailed screenshots, please refer to the official Word/PDF submission.
