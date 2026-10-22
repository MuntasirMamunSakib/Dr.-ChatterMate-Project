# README.txt
Dr. ChatterMate — Hospital Management + AI Report Assistant
============================================================

A complete, SQLite-backed hospital management website with a
ChatterMate-powered reporting assistant.

Stack
-----
- Node.js (built-in http module, no Express)
- SQLite via better-sqlite3 (only runtime dependency)
- Vanilla HTML / CSS / JavaScript frontend (no framework)
- ChatterMate API for the Report Assistant

Requirements
------------
- Node.js LTS (>= 20.6, required for --env-file support and built-in fetch)
- npm

Setup
-----
1. Install Node.js LTS.
2. Open a terminal in the project folder.
3. Install the one dependency:
       npm install
4. Copy the example env file:
       cp .env.example .env       (macOS/Linux)
       copy .env.example .env     (Windows)
5. Open .env and set CHATTERMATE_API_KEY to your real ChatterMate key.
6. Start the server:
       npm start
   (equivalent to: node --env-file=.env server.js)
7. Open http://localhost:3000 in a browser.

The SQLite database file "dr-chattermate.db" is created automatically on
first start, the schema is applied, and ~50 fictional patients, 5 doctors,
visits, prescriptions, lab tests, bills, and payments are seeded. Seeding
runs ONLY when the database is empty — regular restarts preserve your data.

Reset demo data
---------------
To wipe and reseed (destructive — asks for confirmation):
    npm run reset-db

AI Report Assistant
-------------------
- The ChatterMate API key stays on the server. It is read from process.env
  and is never sent to the browser.
- The /api/ai/report-chat endpoint runs trusted, parameterised report
  queries against SQLite, builds a context from the real figures, and
  forwards your question + context to ChatterMate.
- If CHATTERMATE_API_KEY is missing or the service is unreachable, the
  rest of the site keeps working and the chat shows a clear setup message.
- The AI never executes SQL, never modifies records, and never sees secrets.

Simulated payments
------------------
Cash / Card / bKash are DEMO-ONLY. No real gateway is contacted. Every
recorded payment is tagged as simulated in SQLite and labelled in the UI.

Pages
-----
- Dashboard                       live totals + charts
- Patients                        register, search, view, edit
- Doctors                         directory + CRUD
- Visits & Prescriptions          create visits, attach prescriptions
- Laboratory                      order tests, update status, enter results
- Billing & Payments              build bills from consultations + lab tests
- Reports                         Daily Collection, Patient Registration,
                                  Doctor-wise Visits, Laboratory Test —
                                  each with date filters + Print
- AI Report Assistant             ChatterMate chat over report data
- Settings                        app info, demo-data reset

Demonstration sequence (3–5 min)
--------------------------------
1. Open the Dashboard — review KPIs and the visits/revenue chart.
2. Patients → search, open a patient, review visit/lab/billing history.
3. Visits → create a new visit for an existing patient, add a prescription.
4. Laboratory → order a test, mark it In Progress, then Completed.
5. Billing → open the patient's bill, record a simulated bKash payment.
6. Reports → pick a date range, Generate each of the four reports, Print one.
7. AI Assistant → ask "How much did we collect today?" and cross-check
   against the Daily Collection Report.

ChatterMate conversation share links
------------------------------------
Add your real share links here after the conversations are created.
(Do not fabricate links.)

- Design / planning conversation: __________
- Implementation conversation:    __________
- Demo rehearsal conversation:    __________

Security notes
--------------
- Do NOT commit .env or dr-chattermate.db to a public repository.
- Do NOT include real patient data — all seeded data is fictional.
- The /api/ai/report-chat endpoint only exposes the predefined report
  summaries; the AI cannot query arbitrary tables.

Project layout
--------------
dr-chattermate/
  server.js                   HTTP server + routing
  lib/
    db.js                     SQLite init + schema + seed
    reports.js                Report query helpers
    chattermate.js            ChatterMate API client (SSE)
  scripts/
    reset-db.js               Confirmed destructive reset
  public/
    index.html                SPA shell (hash routing)
    css/styles.css
    js/app.js                 Router, toasts, API helper
    js/dashboard.js
    js/patients.js
    js/doctors.js
    js/visits.js
    js/laboratory.js
    js/billing.js
    js/reports.js
    js/assistant.js
    js/settings.js
  package.json
  .env.example
  .gitignore
  README.txt