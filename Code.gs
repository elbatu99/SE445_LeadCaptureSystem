// =============================================================================
// SE 445 — Lead Capture System
// HW3: Logic & Intelligent Processing — Google Apps Script Implementation
// =============================================================================
//
// PIPELINE (4-Step):
//   ① Webhook Trigger   — doPost(e) receives HTTP POST
//   ② Validation Logic  — _validatePayload() checks empty fields + email regex
//   ③ AI Agent          — _classifyIntent() calls Gemini for intent & urgency
//   ④ Google Sheets     — _appendLeadToSheet() writes all 10 columns
//
// DEPLOYMENT:
//   1. Create a new Google Spreadsheet named "SE445_LeadCaptureDB"
//   2. Rename the first sheet tab to "leads"
//   3. Add headers in Row 1: Timestamp | Name | Email | Message | Is_Valid |
//      Validation_Reason | Intent | Urgency | AI_Response | Action_Taken
//   4. Open Extensions → Apps Script, paste this code
//   5. Set your GEMINI_API_KEY in Script Properties:
//      Project Settings → Script Properties → Add:
//        Key:   GEMINI_API_KEY
//        Value: <your-api-key>
//   6. Deploy → New Deployment → Web App
//        Execute as: Me
//        Who has access: Anyone
//   7. Copy the deployment URL — this is your Webhook endpoint
//
// =============================================================================


// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Central configuration object.
 * All tunables are in one place to simplify future HW iterations.
 */
const CONFIG = {
  // Google Sheets
  SHEET_NAME: "leads",

  // Column layout (A–J) — matches the Data Schema in the architecture doc
  COLUMNS: [
    "timestamp",          // A
    "name",               // B
    "email",              // C
    "message",            // D
    "is_valid",           // E  — HW3 (Validation)
    "validation_reason",  // F  — HW3 (Validation)
    "intent",             // G  — HW3 (AI Classification)
    "urgency",            // H  — HW3 (AI Classification)
    "ai_response",        // I  — HW1 (Gemini greeting)
    "action_taken"        // J  — Final
  ],

  // Gemini API
  GEMINI_MODEL: "gemini-2.0-flash",
  GEMINI_MAX_TOKENS: 256,
  GEMINI_TEMPERATURE: 0.7,

  // Classification — lower temperature for deterministic output
  CLASSIFY_TEMPERATURE: 0,
  CLASSIFY_MAX_TOKENS: 100,

  // System prompt for the greeting generator (HW1 — retained)
  GREETING_SYSTEM_PROMPT: [
    "Sen bir satış destek asistanısın.",
    "Görevin, yeni bir müşteri adayı sistemimize kayıt olduğunda",
    "o kişiye gönderilecek sıcak, profesyonel ve kısa bir karşılama",
    "mesajı taslağı hazırlamaktır.",
    "Mesajı şirket adına birinci çoğul şahıs ('Biz olarak...') ile yaz.",
    "Mesaj en fazla 3 cümle olsun."
  ].join(" "),

  // System prompt for intent/urgency classification (HW3 — new)
  CLASSIFY_SYSTEM_PROMPT: [
    "You are a lead classification engine for a B2B SaaS company.",
    "Your task is to analyze the content of an incoming lead message and return a structured JSON classification.",
    "You must respond with ONLY a valid JSON object — no preamble, no explanation, no markdown formatting.",
    "",
    "Classify the message into exactly one of these intent categories:",
    '  - "Sales"       → The lead is asking about pricing, purchasing, plans, or demos.',
    '  - "Support"     → The lead has a technical issue, bug report, or usage question.',
    '  - "Partnership" → The lead is proposing a business partnership or integration.',
    '  - "Other"       → The message does not fit any of the above categories.',
    "",
    "Classify the urgency into exactly one of these levels:",
    '  - "High"   → The message implies time sensitivity, urgency, or a critical issue.',
    '  - "Medium" → The message is a standard business inquiry with no stated deadline.',
    '  - "Low"    → The message is informational, exploratory, or vague.',
    "",
    "Return format (strict):",
    '{',
    '  "intent":  "<Sales | Support | Partnership | Other>",',
    '  "urgency": "<High | Medium | Low>"',
    '}'
  ].join("\n"),

  // Valid enum values for classification fallback
  VALID_INTENTS:   ["Sales", "Support", "Partnership", "Other"],
  VALID_URGENCIES: ["High", "Medium", "Low"]
};


// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — WEBHOOK TRIGGER  (doPost)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HTTP POST entry point — acts as the Webhook Trigger.
 *
 * Google Apps Script automatically routes every incoming POST request to this
 * function when the script is deployed as a Web App.
 *
 * Pipeline:
 *   1. Parse raw JSON → { name, email, message }
 *   2. Validate fields → { is_valid, validation_reason }
 *   3. Classify intent/urgency via Gemini → { intent, urgency }
 *   4. Generate AI greeting via Gemini → ai_response
 *   5. Append all 10 columns to Google Sheets
 *
 * @param  {Object} e  The event object provided by Apps Script.
 *                     e.postData.contents holds the raw JSON string.
 * @return {ContentService.TextOutput}  JSON response to the caller.
 */
function doPost(e) {
  try {
    // ── Guard: ensure we received a body ──
    if (!e || !e.postData || !e.postData.contents) {
      return _jsonResponse(400, "error", "Request body is empty or missing.");
    }

    // ── Step 1 — Parse & Extract ──
    const payload = _parsePayload(e.postData.contents);

    // ── Step 2 — Validation Logic (HW3) ──
    const validation = _validatePayload(payload);

    // ── Step 3 — AI Agent: Intent & Urgency Classification (HW3) ──
    let classification = { intent: "Other", urgency: "Low" };
    try {
      classification = _classifyIntent(payload);
    } catch (classifyError) {
      console.error("Classification failed, using defaults:", classifyError.message);
      // Pipeline continues with fallback values — no record is dropped
    }

    // ── Step 4a — AI Greeting via Gemini (HW1 — retained) ──
    let greeting = "";
    try {
      greeting = _generateGreeting(payload);
    } catch (greetingError) {
      console.error("Greeting generation failed:", greetingError.message);
      greeting = "(Greeting generation failed)";
    }

    // ── Step 4b — Persist to Google Sheets (all 10 columns) ──
    const timestamp = new Date().toISOString();
    const rowIndex  = _appendLeadToSheet(timestamp, payload, validation, classification, greeting);

    // ── Success response ──
    return _jsonResponse(200, "success", "Lead captured and processed.", {
      timestamp:         timestamp,
      row:               rowIndex,
      is_valid:          validation.is_valid,
      validation_reason: validation.validation_reason,
      intent:            classification.intent,
      urgency:           classification.urgency,
      ai_response:       greeting
    });

  } catch (error) {
    // Log the full error for debugging in Apps Script's Execution Log
    console.error("doPost error:", error.message, error.stack);
    return _jsonResponse(500, "error", error.message);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 2a — PAYLOAD PARSER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses the raw JSON string and extracts the three required fields.
 *
 * @param  {string} raw  The raw JSON string from the POST body.
 * @return {Object}      { name: string, email: string, message: string }
 * @throws {Error}       If the body is not valid JSON.
 */
function _parsePayload(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (parseError) {
    throw new Error("Invalid JSON payload: " + parseError.message);
  }

  return {
    name:    data.name    || "",
    email:   data.email   || "",
    message: data.message || ""
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 2b — VALIDATION LOGIC (HW3 — NEW)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the parsed payload against quality rules.
 *
 * Rules:
 *   R-01: name must not be empty/whitespace
 *   R-02: message must not be empty/whitespace
 *   R-03: email must match simplified RFC 5322 regex
 *
 * NO records are dropped — all records continue through the pipeline.
 * Validation results are stored as metadata (is_valid, validation_reason).
 *
 * @param  {Object} payload  { name, email, message }
 * @return {Object}          { is_valid: boolean, validation_reason: string }
 */
function _validatePayload(payload) {
  // Email validation regex (RFC 5322 simplified)
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

  // Collect validation failures
  const errors = [];

  if ((payload.name || "").trim() === "") {
    errors.push("Missing name");
  }

  if ((payload.message || "").trim() === "") {
    errors.push("Missing message");
  }

  if (!emailRegex.test((payload.email || "").trim())) {
    errors.push("Invalid email format");
  }

  const is_valid          = errors.length === 0;
  const validation_reason = errors.join("; ");

  console.log("Validation result: is_valid=" + is_valid +
              ", reason=\"" + validation_reason + "\"");

  return {
    is_valid:          is_valid,
    validation_reason: validation_reason
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — AI AGENT: INTENT & URGENCY CLASSIFICATION (HW3 — NEW)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls the Gemini API to classify the lead's intent and urgency.
 *
 * Uses temperature=0 for deterministic output and a strict system prompt
 * that enforces JSON-only responses.
 *
 * @param  {Object} payload  { name, email, message }
 * @return {Object}          { intent: string, urgency: string }
 */
function _classifyIntent(payload) {
  const apiKey = _getGeminiApiKey();

  const url = "https://generativelanguage.googleapis.com/v1beta/models/"
            + CONFIG.GEMINI_MODEL
            + ":generateContent?key=" + apiKey;

  // Build the user prompt with the lead message
  const userPrompt = 'Lead message: "' + payload.message + '"';

  // Gemini API request body
  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: CONFIG.CLASSIFY_SYSTEM_PROMPT + "\n\n" + userPrompt }]
      }
    ],
    generationConfig: {
      temperature:     CONFIG.CLASSIFY_TEMPERATURE,
      maxOutputTokens: CONFIG.CLASSIFY_MAX_TOKENS
    }
  };

  const options = {
    method:      "post",
    contentType: "application/json",
    payload:     JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  const response     = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseBody = JSON.parse(response.getContentText());

  if (responseCode !== 200) {
    const errorMsg = (responseBody.error && responseBody.error.message)
                   ? responseBody.error.message
                   : "Unknown Gemini API error (HTTP " + responseCode + ")";
    throw new Error("Gemini classification failed: " + errorMsg);
  }

  // Extract the generated text from the response
  const generatedText = responseBody.candidates
                     && responseBody.candidates[0]
                     && responseBody.candidates[0].content
                     && responseBody.candidates[0].content.parts
                     && responseBody.candidates[0].content.parts[0]
                     && responseBody.candidates[0].content.parts[0].text;

  if (!generatedText) {
    throw new Error("Gemini returned an empty classification response.");
  }

  // Parse the JSON response from Gemini
  let classification;
  try {
    // Strip any accidental markdown code fences from the response
    const cleanedText = generatedText.trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");
    classification = JSON.parse(cleanedText);
  } catch (jsonError) {
    console.error("Failed to parse classification JSON:", generatedText);
    throw new Error("Gemini returned invalid JSON: " + jsonError.message);
  }

  // Validate and apply fallbacks for unexpected values
  const intent  = CONFIG.VALID_INTENTS.indexOf(classification.intent) !== -1
                ? classification.intent
                : "Other";
  const urgency = CONFIG.VALID_URGENCIES.indexOf(classification.urgency) !== -1
                ? classification.urgency
                : "Low";

  console.log("Classification result: intent=" + intent + ", urgency=" + urgency);

  return {
    intent:  intent,
    urgency: urgency
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 4a — AI GREETING GENERATOR (HW1 — RETAINED)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls the Gemini API to generate a personalised greeting for the lead.
 *
 * The API key is read from Script Properties (Project Settings → Script
 * Properties) to avoid hardcoding secrets in source code.
 *
 * @param  {Object} payload  { name, email, message }
 * @return {string}          The generated greeting text.
 */
function _generateGreeting(payload) {
  const apiKey = _getGeminiApiKey();

  const url = "https://generativelanguage.googleapis.com/v1beta/models/"
            + CONFIG.GEMINI_MODEL
            + ":generateContent?key=" + apiKey;

  // Build the user prompt with lead data
  const userPrompt = [
    "Müşteri Adı   : " + payload.name,
    "E-posta       : " + payload.email,
    "Müşteri Mesajı: " + payload.message,
    "",
    "Bu kişi için bir karşılama mesajı taslağı yaz."
  ].join("\n");

  // Gemini API request body
  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: CONFIG.GREETING_SYSTEM_PROMPT + "\n\n" + userPrompt }]
      }
    ],
    generationConfig: {
      temperature:     CONFIG.GEMINI_TEMPERATURE,
      maxOutputTokens: CONFIG.GEMINI_MAX_TOKENS
    }
  };

  const options = {
    method:      "post",
    contentType: "application/json",
    payload:     JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  const response     = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseBody = JSON.parse(response.getContentText());

  if (responseCode !== 200) {
    const errorMsg = (responseBody.error && responseBody.error.message)
                   ? responseBody.error.message
                   : "Unknown Gemini API error (HTTP " + responseCode + ")";
    console.error("Gemini API error:", errorMsg);
    throw new Error("Gemini API call failed: " + errorMsg);
  }

  // Extract the generated text from the response
  const generatedText = responseBody.candidates
                     && responseBody.candidates[0]
                     && responseBody.candidates[0].content
                     && responseBody.candidates[0].content.parts
                     && responseBody.candidates[0].content.parts[0]
                     && responseBody.candidates[0].content.parts[0].text;

  if (!generatedText) {
    throw new Error("Gemini returned an empty response. Check model availability.");
  }

  return generatedText.trim();
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 4b — GOOGLE SHEETS INTEGRATION (Append Row — ALL 10 COLUMNS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appends a new lead row to the "leads" sheet with ALL 10 columns populated.
 *
 * HW3 upgrade: Columns E–H are now filled with validation and classification
 * data instead of empty strings.
 *
 * @param  {string} timestamp       ISO-8601 timestamp of ingestion.
 * @param  {Object} payload         Parsed payload { name, email, message }.
 * @param  {Object} validation      { is_valid, validation_reason }
 * @param  {Object} classification  { intent, urgency }
 * @param  {string} greeting        AI-generated greeting text.
 * @return {number}                 The 1-based row index of the newly appended row.
 */
function _appendLeadToSheet(timestamp, payload, validation, classification, greeting) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
                              .getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'Sheet "' + CONFIG.SHEET_NAME + '" not found. ' +
      'Please create a sheet tab named "' + CONFIG.SHEET_NAME + '".'
    );
  }

  // Build the row array aligned to columns A–J (all 10 columns populated)
  const row = [
    timestamp,                       // A — Timestamp
    payload.name,                    // B — Name
    payload.email,                   // C — Email
    payload.message,                 // D — Message
    validation.is_valid,             // E — Is_Valid          (HW3)
    validation.validation_reason,    // F — Validation_Reason (HW3)
    classification.intent,           // G — Intent            (HW3)
    classification.urgency,          // H — Urgency           (HW3)
    greeting,                        // I — AI_Response       (HW1, filled inline)
    ""                               // J — Action_Taken      (Final)
  ];

  sheet.appendRow(row);

  // Return the row number that was just written
  const lastRow = sheet.getLastRow();
  console.log("Lead appended to row " + lastRow);
  return lastRow;
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — Gemini API Key Retrieval
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieves the Gemini API key from Script Properties.
 *
 * @return {string} The API key.
 * @throws {Error}  If the key is not set.
 */
function _getGeminiApiKey() {
  const key = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Go to Project Settings → Script Properties " +
      "and add a property named GEMINI_API_KEY with your Gemini API key."
    );
  }
  return key;
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — JSON Response Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a standardised JSON response for the webhook caller.
 *
 * @param  {number} code    HTTP-equivalent status code (informational only;
 *                          Apps Script Web Apps always return 200 at transport level).
 * @param  {string} status  "success" | "error"
 * @param  {string} message Human-readable summary.
 * @param  {Object} [data]  Optional additional data to include.
 * @return {ContentService.TextOutput}
 */
function _jsonResponse(code, status, message, data) {
  const body = {
    status:  status,
    code:    code,
    message: message
  };

  if (data) {
    body.data = data;
  }

  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — Sheet Initialiser (run once manually)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates the "leads" sheet with headers if it doesn't already exist.
 * Run this function ONCE from the Apps Script editor (Run → initializeSheet).
 */
function initializeSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  // Write header row
  const headers = [
    "Timestamp",
    "Name",
    "Email",
    "Message",
    "Is_Valid",
    "Validation_Reason",
    "Intent",
    "Urgency",
    "AI_Response",
    "Action_Taken"
  ];

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);

  // Format header row
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#4285F4");
  headerRange.setFontColor("#FFFFFF");

  // Auto-resize columns for readability
  for (let i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }

  // Freeze the header row
  sheet.setFrozenRows(1);

  SpreadsheetApp.getUi().alert(
    "✅ Sheet '" + CONFIG.SHEET_NAME + "' initialized with " +
    headers.length + " columns."
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — Manual Test: Valid Input (run from editor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulates a valid POST request for local testing.
 * Run from the Apps Script editor: Run → testDoPost_ValidInput
 * Check the Execution Log for output.
 */
function testDoPost_ValidInput() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        name:    "Batuhan Yeşilyurt",
        email:   "batuhan@softwareco.com",
        message: "We are evaluating your platform for our 200-person sales team. Could we arrange an enterprise demo this week?"
      }),
      type: "application/json"
    }
  };

  const result = doPost(mockEvent);
  console.log("Response:", result.getContent());
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — Manual Test: Invalid Input (run from editor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulates an invalid POST request for local testing.
 * Tests validation logic with empty name and malformed email.
 * Run from the Apps Script editor: Run → testDoPost_InvalidInput
 * Check the Execution Log for output.
 */
function testDoPost_InvalidInput() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        name:    "",
        email:   "not-a-valid-email",
        message: "Hello there."
      }),
      type: "application/json"
    }
  };

  const result = doPost(mockEvent);
  console.log("Response:", result.getContent());
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — Manual Test: Original HW1 test (retained for backwards compat)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulates a POST request with Turkish content (original HW1 test).
 * Run from the Apps Script editor: Run → testDoPost
 * Check the Execution Log for output.
 */
function testDoPost() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        name:    "Test Kullanıcı",
        email:   "test@example.com",
        message: "Bu bir test mesajıdır. Ürün hakkında bilgi almak istiyorum."
      }),
      type: "application/json"
    }
  };

  const result = doPost(mockEvent);
  console.log("Response:", result.getContent());
}
