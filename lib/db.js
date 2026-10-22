// lib/db.js
// Node 22.5+ / Node 24 built-in SQLite. No native npm dependency required.
// Schema is aligned with server.js and lib/reports.js.

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.join(__dirname, '..', 'dr-chattermate.db');
let dbInstance;

function makeDatabase() {
  const raw = new DatabaseSync(DB_PATH);
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec('PRAGMA journal_mode = WAL;');

  // Keep the better-sqlite3-style methods used by this project.
  const db = {
    prepare(sql) { return raw.prepare(sql); },
    exec(sql) { return raw.exec(sql); },
    close() { return raw.close(); },
    transaction(fn) {
      return (...args) => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const result = fn(...args);
          raw.exec('COMMIT');
          return result;
        } catch (error) {
          try { raw.exec('ROLLBACK'); } catch { }
          throw error;
        }
      };
    }
  };

  initSchema(db);
  seedIfEmpty(db);
  return db;
}

function getDb() {
  if (!dbInstance) dbInstance = makeDatabase();
  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      dob TEXT,
      gender TEXT,
      phone TEXT,
      address TEXT,
      emergency_contact TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      consultation_fee_cents INTEGER NOT NULL DEFAULT 0,
      schedule TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
      doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
      visit_date TEXT NOT NULL,
      reason TEXT,
      diagnosis TEXT,
      treatment TEXT,
      notes TEXT,
      consultation_fee_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      medication TEXT NOT NULL,
      dosage TEXT,
      frequency TEXT,
      duration TEXT,
      instructions TEXT
    );

    CREATE TABLE IF NOT EXISTS lab_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
      visit_id INTEGER REFERENCES visits(id) ON DELETE SET NULL,
      doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
      test_name TEXT NOT NULL,
      order_date TEXT NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','in_progress','completed')),
      results TEXT,
      notes TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
      bill_date TEXT NOT NULL,
      total_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK(status IN ('unpaid','partial','paid')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL CHECK(item_type IN ('consultation','lab','other')),
      ref_id INTEGER,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE RESTRICT,
      amount_cents INTEGER NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('cash','card','bkash')),
      payment_date TEXT NOT NULL,
      reference TEXT,
      is_simulated INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_patients_created ON patients(created_at);
    CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);
    CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id);
    CREATE INDEX IF NOT EXISTS idx_lab_order_date ON lab_tests(order_date);
    CREATE INDEX IF NOT EXISTS idx_lab_status ON lab_tests(status);
    CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(bill_date);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
    CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments(bill_id);
  `);
}

function clearAllData(database = getDb()) {
  database.transaction(() => {
    database.exec(`
      DELETE FROM payments;
      DELETE FROM bill_items;
      DELETE FROM bills;
      DELETE FROM prescriptions;
      DELETE FROM lab_tests;
      DELETE FROM visits;
      DELETE FROM patients;
      DELETE FROM doctors;
      DELETE FROM sqlite_sequence;
    `);
  })();
}

function seedIfEmpty(database) {
  const count = database.prepare('SELECT COUNT(*) AS n FROM patients').get().n;
  if (Number(count) > 0) return;
  seedDemoData(database);
}

/** Wipe every table but keep the live connection (safe while the server is running). */
function resetData() {
  clearAllData();
  return { ok: true, action: 'reset' };
}

/** Wipe every table, then load fictional demo patients/doctors/activity. */
function regenerateDemoData() {
  clearAllData();
  seedDemoData(getDb());
  return { ok: true, action: 'regenerate' };
}

function seedDemoData(db) {
  const doctors = [
    ['DOC-001', 'Dr. Sarah Jenkins', 'Cardiology', '+1 555-0101', 'sarah@example.test', 12000, 'Mon-Thu 09:00-14:00', 1],
    ['DOC-002', 'Dr. Marcus Vance', 'Pediatrics', '+1 555-0102', 'marcus@example.test', 8000, 'Mon-Fri 10:00-16:00', 1],
    ['DOC-003', 'Dr. Ayesha Rahman', 'Internal Medicine', '+1 555-0103', 'ayesha@example.test', 9500, 'Tue-Sat 08:30-13:30', 1],
    ['DOC-004', 'Dr. David Chen', 'Orthopedics', '+1 555-0104', 'david@example.test', 11000, 'Mon, Wed, Fri 12:00-18:00', 1],
    ['DOC-005', 'Dr. Elena Rostova', 'Neurology', '+1 555-0105', 'elena@example.test', 13500, 'Thu-Sat 10:00-17:00', 1]
  ];
  const firstNames = ['James', 'Emma', 'Michael', 'Olivia', 'William', 'Sophia', 'Alexander', 'Isabella', 'Daniel', 'Mia', 'Liam', 'Charlotte', 'Benjamin', 'Amelia', 'Elijah', 'Harper', 'Lucas', 'Evelyn', 'Henry', 'Abigail'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
  const labs = [
    ['Complete Blood Count (CBC)', 3500],
    ['Lipid Panel', 4500],
    ['Comprehensive Metabolic Panel', 5000],
    ['Thyroid Stimulating Hormone (TSH)', 4000],
    ['Hemoglobin A1c', 3800]
  ];
  const isoDay = offset => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

  db.transaction(() => {
    const insertDoctor = db.prepare(`INSERT INTO doctors
      (doctor_code, full_name, specialty, phone, email, consultation_fee_cents, schedule, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const doctor of doctors) insertDoctor.run(...doctor);

    const insertPatient = db.prepare(`INSERT INTO patients
      (patient_code, full_name, dob, gender, phone, address, emergency_contact, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (let i = 1; i <= 50; i++) {
      const first = firstNames[(i - 1) % firstNames.length];
      const last = lastNames[(i * 3) % lastNames.length];
      const dob = isoDay(365 * (18 + (i % 60)));
      const created = `${isoDay((50 - i) % 30)} 09:00:00`;
      insertPatient.run(
        `PAT-${String(i).padStart(4, '0')}`, `${first} ${last}`, dob,
        i % 2 === 0 ? 'Female' : 'Male', `+1 555-${String(2000 + i)}`,
        `${100 + i} Medical Center Way`, '+1 555-9999',
        'Fictional demo patient record', created
      );
    }

    const insertVisit = db.prepare(`INSERT INTO visits
      (patient_id, doctor_id, visit_date, reason, diagnosis, treatment, notes, consultation_fee_cents, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertPrescription = db.prepare(`INSERT INTO prescriptions
      (visit_id, medication, dosage, frequency, duration, instructions)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const insertLab = db.prepare(`INSERT INTO lab_tests
      (patient_id, visit_id, doctor_id, test_name, order_date, price_cents, status, results, notes, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertBill = db.prepare(`INSERT INTO bills
      (patient_id, bill_date, total_cents, status, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const insertItem = db.prepare(`INSERT INTO bill_items
      (bill_id, item_type, ref_id, description, amount_cents)
      VALUES (?, ?, ?, ?, ?)`);
    const insertPayment = db.prepare(`INSERT INTO payments
      (bill_id, amount_cents, method, payment_date, reference, is_simulated)
      VALUES (?, ?, ?, ?, ?, 1)`);

    for (let patientId = 1; patientId <= 35; patientId++) {
      const doctorId = 1 + ((patientId - 1) % doctors.length);
      const day = isoDay(35 - patientId);
      const visitDate = `${day} 10:00:00`;
      const fee = doctors[doctorId - 1][5];
      const visit = insertVisit.run(patientId, doctorId, visitDate, 'Routine evaluation',
        'Demo diagnosis for fictional data', 'Follow-up as needed', 'Seeded demo visit', fee, visitDate);
      const visitId = Number(visit.lastInsertRowid);
      insertPrescription.run(visitId, 'Demo medication', '10 mg', 'Once daily', '30 days', 'Fictional example prescription');

      let labId = null;
      let total = fee;
      if (patientId % 2 === 0) {
        const [testName, price] = labs[patientId % labs.length];
        const completed = patientId % 3 !== 0;
        const lab = insertLab.run(patientId, visitId, doctorId, testName, visitDate, price,
          completed ? 'completed' : 'pending',
          completed ? 'Fictional demo result: within reference range' : null,
          'Seeded demo lab test', completed ? visitDate : null);
        labId = Number(lab.lastInsertRowid);
        total += price;
      }

      const paid = patientId % 4 !== 0;
      const partial = !paid && patientId % 2 === 0;
      const status = paid ? 'paid' : partial ? 'partial' : 'unpaid';
      const bill = insertBill.run(patientId, visitDate, total, status, 'Simulated demo bill', visitDate);
      const billId = Number(bill.lastInsertRowid);
      insertItem.run(billId, 'consultation', visitId, 'Consultation', fee);
      if (labId !== null) insertItem.run(billId, 'lab', labId, 'Laboratory test', total - fee);
      if (paid) {
        const method = patientId % 3 === 0 ? 'bkash' : patientId % 2 === 0 ? 'card' : 'cash';
        insertPayment.run(billId, total, method, visitDate, `SIM-DEMO-${billId}`);
      } else if (partial) {
        insertPayment.run(billId, Math.floor(total / 2), 'cash', visitDate, `SIM-DEMO-${billId}`);
      }
    }
  })();

  console.log('Seeded fictional Dr. ChatterMate demo data.');
}

function resetAndSeed() {
  // CLI helper: prefer in-place clear+seed so callers holding `db` stay valid.
  // Fall back to file wipe only when no connection exists yet.
  if (dbInstance) {
    regenerateDemoData();
    return dbInstance;
  }
  for (const suffix of ['', '-wal', '-shm']) {
    const file = DB_PATH + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  dbInstance = makeDatabase();
  return dbInstance;
}

// server.js and reports.js use `const { db } = require('./db')`.
// Initialize once, then export that shared database connection.
const db = getDb();

module.exports = {
  db,
  getDb,
  resetAndSeed,
  resetData,
  regenerateDemoData
};