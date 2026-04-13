# SE 445 — Lead Capture System

## HW1 Teslim Raporu: Component Foundations

> **Ders:** SE 445 — Prompt Engineering
> **Ödev:** HW1 — Component Foundations
> **Platform:** Google Apps Script (Hosted on Google Cloud)
> **Tarih:** 13 Nisan 2026

---

## İçindekiler

1. [Sistem Mimarisi (Global Architecture)](#1-sistem-mimarisi-global-architecture)
2. [Veri Şeması (Data Schema)](#2-veri-şeması-data-schema)
3. [HW1 İş Akışı Tasarımı (Apps Script Functions)](#3-hw1-i̇ş-akışı-tasarımı-apps-script-functions)
4. [İleriye Dönük Yol Haritası (Roadmap to Final)](#4-i̇leriye-dönük-yol-haritası-roadmap-to-final)
5. [Test Senaryosu (Test Case)](#5-test-senaryosu-test-case)

---

## 1. Sistem Mimarisi (Global Architecture)

### 1.1 Proje Vizyonu

**Lead Capture System**, dışarıdan gelen potansiyel müşteri (lead) verilerini otomatik olarak yakalayan, doğrulayan, sınıflandıran ve ilgili taraflara ileten uçtan uca bir otomasyon sistemidir. Sistem; SE 445 dersinin HW1'den Final projesine uzanan tüm aşamalarını kapsayacak şekilde genişletilebilir (extensible) ve modüler (modular) bir mimari üzerine inşa edilmiştir.

### 1.2 Neden Google Apps Script?

Google Apps Script, Google Cloud altyapısı üzerinde çalışan sunucusuz (serverless) bir JavaScript çalışma zamanıdır. Bu platform aşağıdaki nedenlerle seçilmiştir:

| Kriter | Açıklama |
|---|---|
| **Sunucusuz Mimari** | Altyapı yönetimi gerektirmez; Google Cloud otomatik ölçeklendirme sağlar. |
| **Native Webhook Desteği** | `doPost()` fonksiyonu, Web App olarak deploy edildiğinde otomatik bir HTTPS endpoint oluşturur; HW2 zorunluluğunu şimdiden karşılar. |
| **Google Ekosistemi Entegrasyonu** | Google Sheets, Gmail, Drive ile yerleşik (native) entegrasyon sağlar; `SpreadsheetApp`, `GmailApp` gibi servisler ek kimlik doğrulama olmadan kullanılabilir. |
| **Gemini API Erişimi** | `UrlFetchApp` servisi ile Gemini REST API doğrudan çağrılır; HW3'ün yapay zeka gereksinimleri karşılanır. |
| **Sıfır Maliyet** | Google hesabı olan herkes için ücretsizdir; öğrenci projeleri için idealdir. |
| **Kod Tabanlı Kontrol** | Görsel sürükle-bırak yerine tam programatik kontrol sağlar; versiyon takibi ve modüler genişletme kolaylaşır. |

### 1.3 Uçtan Uca Veri Akışı (End-to-End Data Flow)

```
┌────────────────────┐
│   Harici İstemci   │  ← Web formu, CRM, test aracı (cURL / Postman)
│  (External Client) │
└────────┬───────────┘
         │  HTTP POST  (Web App URL)
         │  Content-Type: application/json
         │  Body: { "name": "...", "email": "...", "message": "..." }
         ▼
┌────────────────────────────────────────────────────────────────────┐
│                  GOOGLE APPS SCRIPT — Code.gs                      │
│                                                                    │
│  ┌──────────────────┐                                             │
│  │  doPost(e)       │  ← STEP 1: Webhook Trigger                 │
│  │  HTTP Entry Point│     Receives POST, extracts e.postData      │
│  └────────┬─────────┘                                             │
│           │                                                        │
│  ┌────────▼─────────┐                                             │
│  │  _parsePayload() │  ← STEP 2: Processing / Data Extraction    │
│  │  JSON → Object   │     JSON.parse → { name, email, message }  │
│  └────────┬─────────┘                                             │
│           │                                                        │
│  ┌────────▼──────────────┐                                        │
│  │  _appendLeadToSheet() │  ← STEP 3: Google Sheets Persistence  │
│  │  SpreadsheetApp API   │     Appends row with 10 columns (A–J) │
│  └────────┬──────────────┘                                        │
│           │                                                        │
│  ┌────────▼──────────────┐                                        │
│  │  _generateGreeting()  │  ← STEP 4: AI Integration (Gemini)    │
│  │  Gemini REST API Call │     Generates personalised greeting    │
│  └────────┬──────────────┘                                        │
│           │                                                        │
│  ┌────────▼──────────────┐                                        │
│  │  _updateAiResponse()  │  ← STEP 4b: Write AI Output           │
│  │  Sheets Column I      │     Updates AI_Response column         │
│  └────────┬──────────────┘                                        │
│           │                                                        │
│  ┌────────▼──────────────┐                                        │
│  │  _jsonResponse()      │  ← Response Builder                   │
│  │  Return JSON to       │     { status, code, message, data }   │
│  │  caller               │                                        │
│  └───────────────────────┘                                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────┐     ┌─────────────────────────┐
│   Google Sheets    │     │   Gemini API             │
│   "leads" Sheet    │     │   (generativelanguage    │
│   (Persistent      │     │    .googleapis.com)      │
│    Storage)        │     │                          │
└────────────────────┘     └─────────────────────────┘
```

### 1.4 Neden Form Yerine Webhook / doPost?

HW1 teknik şartnamesinin en basit çözümü bir Google Form tetikleyici olurdu. Ancak bu yaklaşım **HW2 zorunluluğuyla çakışır**: HW2, dışarıdan gelen HTTP isteklerini işleyebilen bir endpoint gerektirmektedir.

**`doPost()` Webhook kullanmanın teknik avantajları:**

- **Decoupling (Bağımsızlaştırma):** Veri kaynağı (kim POST attığı) iş akışından bağımsızdır. CRM, web formu veya başka bir servis aynı endpoint'i kullanabilir.
- **Payload Kontrolü:** Hangi alanların geleceği, şema (schema) düzeyinde tasarımcı tarafından belirlenir; form alanlarının kısıtlamalarına bağlı kalınmaz.
- **Asenkron Tetikleme:** Webhook, senkron form submit'ten daha hızlıdır; büyük hacimlerde daha iyi ölçeklenir.
- **HW2 Uyumluluğu:** Sıfır mimari değişikliğiyle HW2 teslim edilebilir olur.
- **REST Uyumluluğu:** Standart HTTP POST semantiği; herhangi bir HTTP istemcisi (cURL, Postman, fetch) ile test edilebilir.

### 1.5 Mimari Kararlar ve Gerekçeleri

| Karar | Gerekçe |
|---|---|
| Tek dosya (`Code.gs`) | Apps Script projeleri monolitik yapıdadır; HW1 kapsamı tek dosyada yönetilebilir. HW3'te modüller ayrılabilir. |
| `CONFIG` nesnesi | Tüm ayarlar (model adı, sıcaklık, sheet adı) merkezileştirilmiştir; değişiklik tek noktadan yapılır. |
| API Key → Script Properties | Gizli anahtarlar kaynak kodda saklanmaz; `PropertiesService` ile güvenli erişim sağlanır. |
| Rezerv sütunlar (E–J) | Şema değişikliği riski ortadan kaldırılır; gelecek ödevlerde yalnızca fonksiyon mantığı genişler. |
| `_` prefix convention | `_parsePayload()`, `_appendLeadToSheet()` gibi yardımcı fonksiyonlar `_` ile başlar; dahili (internal) olduklarını belirtir. |

---

## 2. Veri Şeması (Data Schema)

### 2.1 JSON Payload Yapısı

Webhook'a gönderilecek HTTP POST isteğinin gövdesi (body) aşağıdaki JSON şemasına uygun olmalıdır:

```json
{
  "name":    "Jane Doe",
  "email":   "jane.doe@example.com",
  "message": "Ürününüzün enterprise fiyatlandırması hakkında bilgi almak istiyorum."
}
```

**Alan Tanımları:**

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `name` | `string` | ✅ Evet | Müşteri adayının tam adı |
| `email` | `string` | ✅ Evet | İletişim e-posta adresi; HW3'te format doğrulamasına tabi tutulacak |
| `message` | `string` | ✅ Evet | Müşteri adayının talebi veya mesajı; HW3'te AI sınıflandırmasına tabi tutulacak |

> **Not:** HW1 aşamasında payload doğrulama (validation) gerçekleştirilmez. Gelen veri ham (raw) olarak işlenir. `_parsePayload()` fonksiyonu eksik alanları boş string olarak atar. Doğrulama mantığı HW3 kapsamında bu fonksiyona eklenecektir.

### 2.2 Google Sheets Tablo Yapısı

**Sheet Tab Adı:** `leads`
**Spreadsheet Adı:** `SE445_LeadCaptureDB`

Tüm sütunlar **başlangıçta** tanımlanmıştır. Bu kararın gerekçesi 2.3'te açıklanmaktadır.

| # | Sütun Adı | Veri Tipi | Kaynak Fonksiyon | İlk Kullanım | Açıklama |
|---|---|---|---|---|---|
| A | `Timestamp` | `datetime` | `doPost()` → `new Date().toISOString()` | HW1 | UTC zaman damgası |
| B | `Name` | `string` | `_parsePayload()` | HW1 | Ham müşteri adı |
| C | `Email` | `string` | `_parsePayload()` | HW1 | Ham e-posta adresi |
| D | `Message` | `string` | `_parsePayload()` | HW1 | Orijinal mesaj metni |
| E | `Is_Valid` | `boolean` | HW3 — `_validatePayload()` | HW3 | E-posta format + boş alan kontrolü |
| F | `Validation_Reason` | `string` | HW3 — `_validatePayload()` | HW3 | Doğrulama başarısızlık nedeni |
| G | `Intent` | `string` | HW3 — `_classifyIntent()` | HW3 | LLM niyet etiketi (örn. `pricing_inquiry`) |
| H | `Urgency` | `string` | HW3 — `_classifyIntent()` | HW3 | Aciliyet seviyesi: `low` / `medium` / `high` |
| I | `AI_Response` | `string` | `_generateGreeting()` | HW1 | Gemini tarafından üretilen karşılama metni |
| J | `Action_Taken` | `string` | Final — `_routeByUrgency()` | Final | Otomatik aksiyon kaydı |

### 2.3 Future-Proofing: Neden Tüm Sütunlar Şimdiden Açılıyor?

Google Sheets'te **bir sütunu tablonun ortasına sonradan eklemek** kritik bir risk taşır:

1. **Sütun Referansları Kayar:** Mevcut fonksiyonlarda `getRange(row, 9)` ile I sütununa yazılan veri, yeni sütun eklenmesiyle bozulur.
2. **Veri Tutarsızlığı:** HW1'de yazılan eski kayıtlar yeni sütunları boş bırakır; tablo sorgulanabilirliği düşer.
3. **Yeniden İş (Rework):** Her ödev tesliminde `_appendLeadToSheet()` fonksiyonunun yeniden konfigüre edilmesi gerekir.

**Çözüm:** Tüm sütunlar baştan tanımlanır; HW1/HW2'de rezerv sütunlar **boş string** olarak yazılır. HW3 ve Final aşamalarında yalnızca ilgili fonksiyonlar bu sütunlara gerçek değerler yazmaya başlar.

```
HW1 Kaydı Örneği:
──────────────────────────────────────────────────────────────────────────────
Timestamp          | Name     | Email       | Message     | Is_Valid | ... | AI_Response
──────────────────────────────────────────────────────────────────────────────
2026-04-13T15:32Z  | Jane Doe | jane@ex.com | Bilgi almak |          | ... | Merhaba Jane
                   |          |             | istiyorum.  |          |     | Hanım, ...
──────────────────────────────────────────────────────────────────────────────
```

---

## 3. HW1 İş Akışı Tasarımı (Apps Script Functions)

HW1 iş akışı `Code.gs` dosyasındaki dört temel fonksiyondan (step) oluşmaktadır.

---

### Step 1 — `doPost(e)` — Webhook Trigger

**Apps Script Mekanizması:** Web App Deployment

**Amacı:** Dış dünyadan gelen HTTP POST isteklerini dinlemek ve işleme hattını başlatmak.

**Nasıl Çalışır:**

Google Apps Script, bir proje Web App olarak deploy edildiğinde, gelen her POST isteğini otomatik olarak `doPost(e)` fonksiyonuna yönlendirir. Bu fonksiyon, tüm pipeline'ın orkestratörüdür:

```javascript
function doPost(e) {
  // 1. Guard: boş body kontrolü
  // 2. _parsePayload() → JSON ayrıştırma
  // 3. _appendLeadToSheet() → Google Sheets'e yazma
  // 4. _generateGreeting() → Gemini API çağrısı
  // 5. _updateAiResponse() → AI yanıtını Sheets'e yazma
  // 6. _jsonResponse() → Çağırıcıya JSON yanıt dönme
}
```

**Giriş (Input):**

```http
POST https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
Content-Type: application/json

{
  "name":    "Ahmet Yılmaz",
  "email":   "ahmet@sirket.com",
  "message": "Demo talep ediyorum."
}
```

**Apps Script Event Nesnesi:**

```javascript
e = {
  postData: {
    contents: '{"name":"Ahmet Yılmaz","email":"ahmet@sirket.com","message":"Demo talep ediyorum."}',
    type: "application/json"
  },
  parameter: {},
  contextPath: "",
  contentLength: 82,
  queryString: ""
}
```

**Çıkış (Output):**

```json
{
  "status":  "success",
  "code":    200,
  "message": "Lead captured and greeting generated.",
  "data": {
    "timestamp":   "2026-04-13T15:32:11.000Z",
    "row":         5,
    "ai_response": "Merhaba Ahmet Bey, ..."
  }
}
```

> **HW2 Hazırlığı:** `doPost()` fonksiyonuna API Key doğrulama mantığı eklenebilir:
> ```javascript
> const apiKey = e.parameter.key;
> if (apiKey !== expectedKey) return _jsonResponse(401, "error", "Unauthorized");
> ```

---

### Step 2 — `_parsePayload(raw)` — Processing / Data Extraction

**Amacı:** Ham JSON string'ini ayrıştırmak (parse) ve yapılandırılmış bir nesneye dönüştürmek.

**Fonksiyon İmzası:**

```javascript
function _parsePayload(raw) → { name: string, email: string, message: string }
```

**İşlem Akışı:**

1. `JSON.parse(raw)` ile ham string'i JavaScript nesnesine dönüştür
2. Her alan için `|| ""` fallback uygula (eksik alanlar boş string olur)
3. Yapılandırılmış nesneyi döndür

**HW1 Davranışı:** Doğrulama yapılmaz. Eksik veya geçersiz alanlar sessizce boş string olarak atanır.

> **HW3 Genişletme Noktası:** Bu fonksiyona eklenmesi planlanan mantık:
> ```javascript
> // Email regex doğrulama
> const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
> const isValid = emailRegex.test(data.email) && data.name.trim() !== "";
> return {
>   ...parsed,
>   is_valid: isValid,
>   validation_reason: isValid ? "" : "Invalid email format or empty name"
> };
> ```

---

### Step 3 — `_appendLeadToSheet(timestamp, payload)` — Google Sheets Persistence

**Amacı:** Ayrıştırılmış verileri Google Sheets tablosuna yeni bir satır olarak yazmak.

**Kullanılan API:** `SpreadsheetApp` (Google Apps Script yerleşik servisi)

**Fonksiyon İmzası:**

```javascript
function _appendLeadToSheet(timestamp, payload) → rowIndex: number
```

**İşlem Akışı:**

1. `SpreadsheetApp.getActiveSpreadsheet()` ile bağlı Spreadsheet'e eriş
2. `.getSheetByName("leads")` ile hedef sheet'i bul
3. 10 elemanlı dizi oluştur (A–J sütunlarına karşılık gelen değerler)
4. `sheet.appendRow(row)` ile yeni satır ekle
5. `sheet.getLastRow()` ile eklenen satır numarasını döndür

**Sütun Eşleştirmesi:**

```javascript
const row = [
  timestamp,        // A — Timestamp
  payload.name,     // B — Name
  payload.email,    // C — Email
  payload.message,  // D — Message
  "",               // E — Is_Valid          (HW3)
  "",               // F — Validation_Reason (HW3)
  "",               // G — Intent            (HW3)
  "",               // H — Urgency           (HW3)
  "",               // I — AI_Response       (Step 4'te doldurulur)
  ""                // J — Action_Taken      (Final)
];
```

**Tamamlayıcı Fonksiyon — `_updateAiResponse(rowIndex, greeting)`:**

Step 4'te Gemini API yanıtı alındıktan sonra, bu fonksiyon `sheet.getRange(rowIndex, 9).setValue(greeting)` ile I sütununu günceller. Tüm satırın yeniden yazılması gerekmez.

---

### Step 4 — `_generateGreeting(payload)` — AI Integration (Gemini API)

**Amacı:** Gelen müşteri adayı için kişiselleştirilmiş bir **ilk selamlama metni** üretmek.

**Kullanılan API:** Google Gemini REST API (`generativelanguage.googleapis.com`)
**Model:** `gemini-2.0-flash` (hız/maliyet dengesi için)

**Fonksiyon İmzası:**

```javascript
function _generateGreeting(payload) → greeting: string
```

**Konfigürasyon:**

| Parametre | Değer | Gerekçe |
|---|---|---|
| Model | `gemini-2.0-flash` | Düşük gecikme, düşük maliyet, yeterli kalite |
| Temperature | `0.7` | Yaratıcı ama tutarlı çıktı |
| Max Tokens | `256` | 3 cümlelik karşılama için yeterli |

**Sistem Prompt'u:**

```
Sen bir satış destek asistanısın. Görevin, yeni bir müşteri adayı sistemimize
kayıt olduğunda o kişiye gönderilecek sıcak, profesyonel ve kısa bir karşılama
mesajı taslağı hazırlamaktır. Mesajı şirket adına birinci çoğul şahıs
("Biz olarak...") ile yaz. Mesaj en fazla 3 cümle olsun.
```

**Kullanıcı Prompt'u (Dinamik):**

```
Müşteri Adı   : {{name}}
E-posta       : {{email}}
Müşteri Mesajı: {{message}}

Bu kişi için bir karşılama mesajı taslağı yaz.
```

**Güvenlik:** API anahtarı kaynak kodda saklanmaz. `PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY")` ile Script Properties'ten okunur.

**Örnek Çıktı:**

```
Merhaba Ahmet Bey,

Sistemimizdeki kaydınız için teşekkür ederiz; demo talebinizi aldık ve en kısa
sürede sizinle iletişime geçeceğiz. Demo sürecini ve beklentilerinizi daha iyi
anlamak için sizinle bir görüşme ayarlamaktan mutluluk duyarız.
```

**API Çağrı Akışı:**

```
_generateGreeting(payload)
    │
    ├── _getGeminiApiKey()          → Script Properties'ten API key oku
    │
    ├── UrlFetchApp.fetch(url, options)  → Gemini REST API'ye POST isteği
    │       URL: https://generativelanguage.googleapis.com/v1beta/models/
    │            gemini-2.0-flash:generateContent?key=<API_KEY>
    │
    ├── JSON.parse(response)        → API yanıtını ayrıştır
    │
    └── return candidates[0].content.parts[0].text  → Üretilen metni döndür
```

---

## 4. İleriye Dönük Yol Haritası (Roadmap to Final)

Bu bölüm, HW1'de kurulan temel mimarinin sonraki aşamalarda nasıl genişletileceğini göstermektedir. **Mevcut fonksiyonlar hiçbir zaman silinmez veya yeniden yapılandırılmaz; yalnızca yeni fonksiyonlar eklenir veya mevcut olanlar genişletilir.**

### 4.1 HW2 — Data Persistence & Notification

**Zorunlu İsterler:** Kalıcı veri depolama, harici sistem entegrasyonu.

| Değişiklik | Yöntem |
|---|---|
| Webhook Auth ekleme | `doPost()` içine API Key header kontrolü eklenir (5 satır değişiklik). |
| Tüm alanlar Sheets'e yazılıyor | `_appendLeadToSheet()` zaten tüm 10 sütunu yazıyor; **değişiklik gerekmez**. |
| E-posta bildirimi | Yeni `_sendConfirmationEmail()` fonksiyonu eklenir. |

**Eklenecek Fonksiyon:**

```javascript
function _sendConfirmationEmail(payload, greeting) {
  GmailApp.sendEmail(
    payload.email,
    "Talebiniz alındı — " + payload.name,
    greeting
  );
}
```

### 4.2 HW3 — Logic & AI Classification

**Zorunlu İsterler:** Koşullu mantık, veri doğrulama, gelişmiş AI sınıflandırması.

| Değişiklik | Yöntem |
|---|---|
| E-posta doğrulama | `_parsePayload()` genişletilir → `_validatePayload()` eklenir |
| AI sınıflandırma | `_classifyIntent()` fonksiyonu eklenir; `intent` ve `urgency` JSON döner |
| Koşullu yönlendirme | `_routeByUrgency()` fonksiyonu eklenir |
| Sheets güncellemesi | `_appendLeadToSheet()` içinde E–H sütunları doldurulmaya başlar |

**Yeni `_classifyIntent()` Fonksiyonu (Beklenen Çıktı):**

```json
{
  "intent":   "demo_request",
  "urgency":  "high",
  "greeting": "Merhaba Ahmet Bey, ..."
}
```

### 4.3 Final — Full Automation Pipeline

**Zorunlu İsterler:** Uçtan uca otomasyon, CRM entegrasyonu, hata yönetimi.

| Değişiklik | Yöntem |
|---|---|
| CRM kaydı oluşturma | `_createCrmContact()` — HubSpot/Salesforce API çağrısı |
| `AI_Response` kaydı | Zaten HW1'de yapılıyor ✅ |
| `Action_Taken` kaydı | `_updateActionTaken()` — J sütununu günceller |
| Hata yönetimi | `try-catch` blokları + hata log sheet'i |
| Slack bildirimi | `_sendSlackAlert()` — yüksek aciliyetli lead'ler için |

**Final Fonksiyon Çağrı Akışı:**

```
doPost(e)
  ├── _parsePayload()
  ├── _validatePayload()          ← HW3
  ├── _appendLeadToSheet()
  ├── _classifyIntent()           ← HW3
  ├── _generateGreeting()
  ├── _updateAiResponse()
  ├── _routeByUrgency()           ← HW3
  │     ├── [high]  → _sendSlackAlert() + _createCrmContact()
  │     ├── [medium]→ _sendConfirmationEmail() + _createCrmContact()
  │     └── [low]   → (yalnızca Sheets kaydı)
  ├── _updateActionTaken()        ← Final
  └── _jsonResponse()
```

---

## 5. Test Senaryosu (Test Case)

### 5.1 Ön Koşullar (Prerequisites)

1. ✅ Google Spreadsheet `SE445_LeadCaptureDB` oluşturulmuş olmalı
2. ✅ `leads` sheet tab'ı oluşturulmuş olmalı (`initializeSheet()` çalıştırılabilir)
3. ✅ Header satırı (Row 1) 10 sütun ile doldurulmuş olmalı
4. ✅ Script Properties'te `GEMINI_API_KEY` tanımlanmış olmalı
5. ✅ Proje **Web App** olarak deploy edilmiş olmalı:
   - **Deploy → New Deployment → Web App**
   - **Execute as:** Me (kendi hesabınız)
   - **Who has access:** Anyone
6. ✅ Deployment URL kopyalanmış olmalı

### 5.2 Deployment Adımları

```
1. Google Sheets'te yeni bir Spreadsheet oluşturun: "SE445_LeadCaptureDB"
2. Extensions → Apps Script
3. Code.gs dosyasının içeriğini yapıştırın
4. Üst menüden "initializeSheet" fonksiyonunu seçip ▶ Run'a tıklayın
   → "leads" sheet'i 10 sütun başlığıyla oluşturulacaktır
5. Project Settings (⚙) → Script Properties → Add Property:
   Key:   GEMINI_API_KEY
   Value: <Gemini API anahtarınız>
6. Deploy → New Deployment
   Type: Web App
   Execute as: Me
   Who has access: Anyone
7. "Authorize access" diyaloğunda izin verin
8. Deployment URL'yi kopyalayın
```

### 5.3 Test Komutu — cURL

```bash
curl -L -X POST "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "name":    "Ayşe Kara",
    "email":   "ayse.kara@testfirma.com",
    "message": "Yazılımınızın kurumsal lisans fiyatını öğrenmek istiyorum."
  }'
```

> **Not:** `-L` flag'i gereklidir çünkü Apps Script Web App URL'leri 302 redirect döner.

### 5.4 Test Komutu — PowerShell (Windows)

```powershell
$body = @{
    name    = "Ayşe Kara"
    email   = "ayse.kara@testfirma.com"
    message = "Yazılımınızın kurumsal lisans fiyatını öğrenmek istiyorum."
} | ConvertTo-Json -Compress

Invoke-RestMethod -Uri "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

### 5.5 Postman Konfigürasyonu

```
Method  : POST
URL     : https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec

Headers :
  Key             Value
  Content-Type    application/json

Body (raw, JSON) :
{
  "name":    "Ayşe Kara",
  "email":   "ayse.kara@testfirma.com",
  "message": "Yazılımınızın kurumsal lisans fiyatını öğrenmek istiyorum."
}

Settings:
  ☑ Automatically follow redirects (ON)
```

### 5.6 Apps Script Editor İçinden Test

`Code.gs` içindeki `testDoPost()` fonksiyonunu çalıştırın:

```
Üst menüdeki fonksiyon seçiciden "testDoPost" seçin → ▶ Run
Execution Log'da (View → Logs) çıktıyı kontrol edin
```

### 5.7 Beklenen Sonuçlar

#### ✅ HTTP Yanıtı

```json
{
  "status":  "success",
  "code":    200,
  "message": "Lead captured and greeting generated.",
  "data": {
    "timestamp":   "2026-04-13T15:32:11.000Z",
    "row":         2,
    "ai_response": "Merhaba Ayşe Hanım, ..."
  }
}
```

#### ✅ Google Sheets — Yeni Satır

| Sütun | Beklenen Değer |
|---|---|
| A — `Timestamp` | `2026-04-13T15:32:11.000Z` (gerçek zaman) |
| B — `Name` | `Ayşe Kara` |
| C — `Email` | `ayse.kara@testfirma.com` |
| D — `Message` | `Yazılımınızın kurumsal lisans fiyatını öğrenmek istiyorum.` |
| E — `Is_Valid` | *(boş)* |
| F — `Validation_Reason` | *(boş)* |
| G — `Intent` | *(boş)* |
| H — `Urgency` | *(boş)* |
| I — `AI_Response` | `Merhaba Ayşe Hanım, kurumsal lisans talebiniz için teşekkür ederiz...` |
| J — `Action_Taken` | *(boş)* |

#### ✅ Execution Log (Apps Script)

```
[INFO] Response: {"status":"success","code":200,"message":"Lead captured and greeting generated.","data":{"timestamp":"2026-04-13T15:32:11.000Z","row":2,"ai_response":"Merhaba Ayşe Hanım, ..."}}
```

### 5.8 Hata Senaryoları

| Senaryo | Tetikleyici | Beklenen Davranış (HW1) |
|---|---|---|
| Boş body | `curl -X POST <URL> -d ""` | `400` — "Request body is empty or missing." |
| Eksik alan (`email` yok) | `{"name":"...", "message":"..."}` | İşlenir, `email` sütunu boş kalır |
| Geçersiz JSON | `curl -d "plain text"` | `500` — "Invalid JSON payload: ..." |
| API Key tanımsız | Script Properties boş | `500` — "GEMINI_API_KEY is not set. ..." |
| Sheet bulunamadı | `leads` tab'ı yok | `500` — 'Sheet "leads" not found. ...' |
| Gemini API hatası | Geçersiz API key | `500` — "Gemini API call failed: ..." |

> **Not:** HW1 aşamasında hata yönetimi temel `try-catch` düzeyindedir. Kapsamlı error handling (retry, dead-letter queue) HW3/Final'de uygulanacaktır.

---

## Ek A — Fonksiyon Referans Tablosu

| # | Fonksiyon Adı | Tip | Giriş | Çıkış | Faz |
|---|---|---|---|---|---|
| 1 | `doPost(e)` | HTTP Trigger | Apps Script event | JSON response | HW1 |
| 2 | `_parsePayload(raw)` | Parser | JSON string | `{ name, email, message }` | HW1 |
| 3 | `_appendLeadToSheet(ts, payload)` | Sheets Write | timestamp + payload | Row index | HW1 |
| 4 | `_generateGreeting(payload)` | AI (Gemini) | payload | Greeting text | HW1 |
| 4b | `_updateAiResponse(row, text)` | Sheets Update | row + text | void | HW1 |
| 5 | `_jsonResponse(code, status, msg)` | Utility | response data | `TextOutput` | HW1 |
| 6 | `initializeSheet()` | Setup | – | Sheet with headers | HW1 |
| 7 | `testDoPost()` | Test | Mock event | Console log | HW1 |
| — | `_validatePayload()` | Validation | payload | is_valid, reason | HW3 |
| — | `_classifyIntent()` | AI (Gemini v2) | message | intent, urgency | HW3 |
| — | `_sendConfirmationEmail()` | Gmail | payload + greeting | Email sent | HW2 |
| — | `_routeByUrgency()` | Router | urgency | Conditional branch | HW3 |
| — | `_createCrmContact()` | CRM API | lead data | CRM record | Final |
| — | `_sendSlackAlert()` | Slack API | lead summary | Slack message | Final |
| — | `_updateActionTaken()` | Sheets Update | row + action | void | Final |

## Ek B — Teknoloji Yığını (Technology Stack)

| Katman | Teknoloji |
|---|---|
| Runtime | Google Apps Script (V8 Engine) |
| Trigger Protokolü | HTTP/HTTPS — `doPost()` Web App Deployment |
| Veri Deposu | Google Sheets (`SpreadsheetApp` API) |
| AI Modeli | Google Gemini 2.0 Flash (`UrlFetchApp` → REST API) |
| Gizli Anahtar Yönetimi | `PropertiesService.getScriptProperties()` |
| Payload Formatı | JSON (RFC 7159) |
| Test Araçları | cURL / Postman / PowerShell `Invoke-RestMethod` / `testDoPost()` |

## Ek C — Dosya Yapısı

```
SE445 PROJECT/
├── Code.gs                    ← Ana Apps Script kodu (tüm fonksiyonlar)
├── SE445_HW1_Report.md        ← Bu mimari rapor
```

---

*Bu doküman SE 445 dersi kapsamında HW1 teslimi için hazırlanmıştır. Mimari, HW2, HW3 ve Final aşamalarının gereksinimlerini karşılayacak şekilde genişletilebilir yapıdadır. Mevcut fonksiyonlar değiştirilmeden, yalnızca yeni fonksiyonlar eklenerek pipeline genişletilecektir.*
