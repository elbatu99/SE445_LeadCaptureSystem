// =============================================================================
// SE 445 — Lead Capture System
// HW1: Component Foundations — Google Apps Script Implementation
// =============================================================================
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
    "is_valid",           // E  — HW3
    "validation_reason",  // F  — HW3
    "intent",             // G  — HW3
    "urgency",            // H  — HW3
    "ai_response",        // I  — HW1 (Gemini greeting)
    "action_taken"        // J  — Final
  ],

  // Gemini API
  GEMINI_MODEL: "gemini-2.0-flash",
  GEMINI_MAX_TOKENS: 256,
  GEMINI_TEMPERATURE: 0.7,

  // System prompt for the greeting generator
  SYSTEM_PROMPT: [
    "Sen bir satış destek asistanısın.",
    "Görevin, yeni bir müşteri adayı sistemimize kayıt olduğunda",
    "o kişiye gönderilecek sıcak, profesyonel ve kısa bir karşılama",
    "mesajı taslağı hazırlamaktır.",
    "Mesajı şirket adına birinci çoğul şahıs ('Biz olarak...') ile yaz.",
    "Mesaj en fazla 3 cümle olsun."
  ].join(" ")
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

    // ── Step 2 — Parse & Extract ──
    const payload = _parsePayload(e.postData.contents);

    // ── Step 3 — Persist to Google Sheets ──
    const timestamp = new Date().toISOString();
    const rowIndex  = _appendLeadToSheet(timestamp, payload);

    // ── Step 4 — AI Greeting via Gemini ──
    const greeting = _generateGreeting(payload);

    // ── Write AI response back to the same row (column I) ──
    _updateAiResponse(rowIndex, greeting);

    // ── Success response ──
    return _jsonResponse(200, "success", "Lead captured and greeting generated.", {
      timestamp:    timestamp,
      row:          rowIndex,
      ai_response:  greeting
    });

  } catch (error) {
    // Log the full error for debugging in Apps Script's Execution Log
    console.error("doPost error:", error.message, error.stack);
    return _jsonResponse(500, "error", error.message);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — PROCESSING / PAYLOAD PARSER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses the raw JSON string and extracts the three required fields.
 *
 * HW1 scope: No validation is performed — fields may be empty or missing.
 * HW3 will add regex-based email validation and required-field checks here.
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
// STEP 3 — GOOGLE SHEETS INTEGRATION (Append Row)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appends a new lead row to the "leads" sheet.
 *
 * All 10 columns are written on every insert. Columns E–J are left empty
 * in HW1; they will be populated in HW3 and Final without schema changes.
 *
 * @param  {string} timestamp  ISO-8601 timestamp of ingestion.
 * @param  {Object} payload    Parsed payload { name, email, message }.
 * @return {number}            The 1-based row index of the newly appended row.
 */
function _appendLeadToSheet(timestamp, payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
                              .getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'Sheet "' + CONFIG.SHEET_NAME + '" not found. ' +
      'Please create a sheet tab named "' + CONFIG.SHEET_NAME + '".'
    );
  }

  // Build the row array aligned to columns A–J
  const row = [
    timestamp,        // A — timestamp
    payload.name,     // B — name
    payload.email,    // C — email
    payload.message,  // D — message
    "",               // E — is_valid          (HW3)
    "",               // F — validation_reason (HW3)
    "",               // G — intent            (HW3)
    "",               // H — urgency           (HW3)
    "",               // I — ai_response       (filled after Gemini call)
    ""                // J — action_taken      (Final)
  ];

  sheet.appendRow(row);

  // Return the row number that was just written
  return sheet.getLastRow();
}


/**
 * Updates the AI_Response column (I) for a specific row.
 *
 * This is called AFTER the Gemini API returns, so the row already exists
 * from _appendLeadToSheet(). We target column 9 (I) specifically to avoid
 * rewriting the entire row.
 *
 * @param {number} rowIndex  1-based row number to update.
 * @param {string} greeting  The AI-generated greeting text.
 */
function _updateAiResponse(rowIndex, greeting) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
                              .getSheetByName(CONFIG.SHEET_NAME);

  // Column I = column index 9
  sheet.getRange(rowIndex, 9).setValue(greeting);
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — AI INTEGRATION (Gemini API)
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
// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — AI INTEGRATION (Gemini API) - GÜÇLENDİRİLMİŞ VERSİYON
// ─────────────────────────────────────────────────────────────────────────────

function _generateGreeting(payload) {
  try {
    const apiKey = _getGeminiApiKey();
    const url = "https://generativelanguage.googleapis.com/v1beta/models/"
              + CONFIG.GEMINI_MODEL
              + ":generateContent?key=" + apiKey;

    const userPrompt = [
      "Müşteri Adı   : " + payload.name,
      "E-posta       : " + payload.email,
      "Müşteri Mesajı: " + payload.message,
      "",
      "Bu kişi için bir karşılama mesajı taslağı yaz."
    ].join("\n");

    const requestBody = {
      contents: [{ role: "user", parts: [{ text: CONFIG.SYSTEM_PROMPT + "\n\n" + userPrompt }] }],
      generationConfig: { temperature: CONFIG.GEMINI_TEMPERATURE, maxOutputTokens: CONFIG.GEMINI_MAX_TOKENS }
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = JSON.parse(response.getContentText());

    // Eğer Gemini API kota veya başka bir hata verirse:
    if (responseCode !== 200) {
      console.warn("Gemini API Hatası Yakalandı. Fallback (B Planı) mesajı kullanılıyor.");
      return "Merhaba " + payload.name + ",\nSistemimize hoş geldiniz! (Sistem Notu: Yapay zeka kotası aşıldığı için bu otomatik yedek mesajdır. Talebiniz veri tabanına başarıyla kaydedilmiştir.)";
    }

    const generatedText = responseBody.candidates[0].content.parts[0].text;
    return generatedText.trim();

  } catch (error) {
    // API tamamen çökerse veya internet koparsa burası çalışır
    console.error("AI Üretim Hatası:", error);
    return "Merhaba " + payload.name + ", sistemimize hoş geldiniz! Talebinizi aldık.";
  }
}


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
// UTILITY — Manual Test (run from editor to verify Sheets + Gemini)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulates a POST request for local testing.
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

