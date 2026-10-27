// server.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { db, resetData, regenerateDemoData } = require('./lib/db');
const reports = require('./lib/reports');
const chattermate = require('./lib/chattermate');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 256 * 1024; // 256 KB cap

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.woff2':'font/woff2'
};

function send(res, status, data, extraHeaders = {}) {
  if (data && typeof data === 'object' && !Buffer.isBuffer(data)) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      ...extraHeaders
    });
    res.end(body);
  } else {
    res.writeHead(status, extraHeaders);
    res.end(data);
  }
}
const ok  = (res, obj) => send(res, 200, obj);
const bad = (res, msg, status = 400) => send(res, status, { error: msg });

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  // Resolve + prevent traversal
  const resolved = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!resolved.startsWith(PUBLIC_DIR)) return bad(res, 'Forbidden', 403);
  fs.stat(resolved, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, buf) => {
        if (e2) return bad(res, 'Not found', 404);
        send(res, 200, buf, { 'Content-Type': MIME['.html'] });
      });
    }
    const ext = path.extname(resolved).toLowerCase();
    fs.readFile(resolved, (e, buf) => {
      if (e) return bad(res, 'Read error', 500);
      send(res, 200, buf, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    });
  });
}

// ---- Validation helpers ----
const toInt = v => (v === null || v === undefined || v === '') ? null : Number.parseInt(v, 10);
const toCents = v => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid amount');
  return Math.round(n * 100);
};
const req  = (obj, key) => {
  if (obj[key] === undefined || obj[key] === null || obj[key] === '')
    throw new Error(`Missing required field: ${key}`);
  return obj[key];
};
const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// ---- Route table ----
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:[A-Za-z]+/g, (m) => {
    keys.push(m.slice(1));
    return '([^/]+)';
  }) + '$');
  routes.push({ method, re, keys, handler });
};

async function handleApi(req, res, pathname) {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.re);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => params[k] = m[i + 1]);
    try {
      const body = ['POST','PUT','PATCH','DELETE'].includes(req.method)
        ? await parseBody(req) : {};
      const query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      const result = await r.handler({ params, body, query });
      return ok(res, result);
    } catch (e) {
      const msg = e?.message || 'Server error';
      const status = /required|invalid|not found|too large/i.test(msg) ? 400 : 500;
      return bad(res, msg, status === 400 && /not found/i.test(msg) ? 404 : status);
    }
  }
  return bad(res, 'API route not found', 404);
}

// ========= PATIENTS =========
route('GET', '/api/patients', ({ query }) => {
  const q = (query.q || '').trim();
  const stmt = q
    ? db.prepare(`SELECT * FROM patients
                  WHERE full_name LIKE ? OR phone LIKE ? OR patient_code LIKE ?
                  ORDER BY created_at DESC LIMIT 500`)
    : db.prepare(`SELECT * FROM patients ORDER BY created_at DESC LIMIT 500`);
  return q ? stmt.all(`%${q}%`, `%${q}%`, `%${q}%`) : stmt.all();
});
route('POST', '/api/patients', ({ body }) => {
  const full_name = String(req(body, 'full_name')).trim();
  if (full_name.length < 2) throw new Error('Invalid full_name');
  const row = db.prepare('SELECT MAX(id) AS m FROM patients').get();
  const code = `PAT-${1000 + (row.m || 0) + 1}`;
  const info = db.prepare(`INSERT INTO patients
    (patient_code, full_name, dob, gender, phone, address, emergency_contact, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    code, full_name,
    body.dob || null, body.gender || null,
    body.phone || null, body.address || null,
    body.emergency_contact || null, body.notes || null
  );
  return db.prepare('SELECT * FROM patients WHERE id = ?').get(info.lastInsertRowid);
});
route('GET', '/api/patients/:id', ({ params }) => {
  const id = toInt(params.id);
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  if (!patient) throw new Error('Patient not found');
  const visits = db.prepare(`SELECT v.*, d.full_name AS doctor_name
    FROM visits v JOIN doctors d ON d.id = v.doctor_id
    WHERE v.patient_id = ? ORDER BY v.visit_date DESC`).all(id);
  const labs = db.prepare(`SELECT * FROM lab_tests WHERE patient_id = ?
    ORDER BY order_date DESC`).all(id);
  const bills = db.prepare(`SELECT b.*,
    COALESCE((SELECT SUM(amount_cents) FROM payments WHERE bill_id = b.id),0) AS paid_cents
    FROM bills b WHERE patient_id = ? ORDER BY bill_date DESC`).all(id);
  return { patient, visits, labs, bills };
});
route('PUT', '/api/patients/:id', ({ params, body }) => {
  const id = toInt(params.id);
  const existing = db.prepare('SELECT id FROM patients WHERE id = ?').get(id);
  if (!existing) throw new Error('Patient not found');
  db.prepare(`UPDATE patients SET
    full_name = COALESCE(?, full_name),
    dob = ?, gender = ?, phone = ?, address = ?, emergency_contact = ?, notes = ?
    WHERE id = ?`).run(
    body.full_name || null,
    body.dob || null, body.gender || null,
    body.phone || null, body.address || null,
    body.emergency_contact || null, body.notes || null,
    id
  );
  return db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
});

// ========= DOCTORS =========
route('GET', '/api/doctors', ({ query }) => {
  const q = (query.q || '').trim();
  const stmt = q
    ? db.prepare(`SELECT * FROM doctors
         WHERE full_name LIKE ? OR specialty LIKE ? OR doctor_code LIKE ?
         ORDER BY full_name`)
    : db.prepare('SELECT * FROM doctors ORDER BY full_name');
  return q ? stmt.all(`%${q}%`, `%${q}%`, `%${q}%`) : stmt.all();
});
route('POST', '/api/doctors', ({ body }) => {
  const row = db.prepare('SELECT MAX(id) AS m FROM doctors').get();
  const code = `DOC-${String(1 + (row.m || 0)).padStart(3,'0')}`;
  const info = db.prepare(`INSERT INTO doctors
    (doctor_code, full_name, specialty, phone, email, consultation_fee_cents, schedule, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    code,
    String(req(body, 'full_name')).trim(),
    String(req(body, 'specialty')).trim(),
    body.phone || null, body.email || null,
    toCents(body.consultation_fee || 0),
    body.schedule || null,
    body.is_active === false ? 0 : 1
  );
  return db.prepare('SELECT * FROM doctors WHERE id = ?').get(info.lastInsertRowid);
});
route('PUT', '/api/doctors/:id', ({ params, body }) => {
  const id = toInt(params.id);
  const existing = db.prepare('SELECT id FROM doctors WHERE id = ?').get(id);
  if (!existing) throw new Error('Doctor not found');
  db.prepare(`UPDATE doctors SET
    full_name = COALESCE(?, full_name),
    specialty = COALESCE(?, specialty),
    phone = ?, email = ?, consultation_fee_cents = ?, schedule = ?,
    is_active = COALESCE(?, is_active)
    WHERE id = ?`).run(
    body.full_name || null, body.specialty || null,
    body.phone || null, body.email || null,
    toCents(body.consultation_fee || 0),
    body.schedule || null,
    body.is_active === undefined ? null : (body.is_active ? 1 : 0),
    id
  );
  return db.prepare('SELECT * FROM doctors WHERE id = ?').get(id);
});

// ========= VISITS =========
route('GET', '/api/visits', ({ query }) => {
  const where = [], args = [];
  if (query.patient_id) { where.push('v.patient_id = ?'); args.push(toInt(query.patient_id)); }
  if (query.doctor_id)  { where.push('v.doctor_id = ?');  args.push(toInt(query.doctor_id)); }
  if (query.from) { where.push("v.visit_date >= ?"); args.push(query.from + ' 00:00:00'); }
  if (query.to)   { where.push("v.visit_date <= ?"); args.push(query.to   + ' 23:59:59'); }
  const sql = `SELECT v.*, p.full_name AS patient_name, p.patient_code,
                      d.full_name AS doctor_name, d.specialty
               FROM visits v
               JOIN patients p ON p.id = v.patient_id
               JOIN doctors  d ON d.id = v.doctor_id
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY v.visit_date DESC LIMIT 500`;
  return db.prepare(sql).all(...args);
});
route('POST', '/api/visits', ({ body }) => {
  const patient_id = toInt(req(body, 'patient_id'));
  const doctor_id  = toInt(req(body, 'doctor_id'));
  const doc = db.prepare('SELECT consultation_fee_cents FROM doctors WHERE id = ?').get(doctor_id);
  if (!doc) throw new Error('Doctor not found');
  const patient = db.prepare('SELECT id FROM patients WHERE id = ?').get(patient_id);
  if (!patient) throw new Error('Patient not found');
  const fee = body.consultation_fee !== undefined
    ? toCents(body.consultation_fee) : doc.consultation_fee_cents;
  const visitDate = body.visit_date || nowSql();

  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO visits
      (patient_id, doctor_id, visit_date, reason, diagnosis, treatment, notes, consultation_fee_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      patient_id, doctor_id, visitDate,
      body.reason || null, body.diagnosis || null,
      body.treatment || null, body.notes || null, fee
    );
    const visitId = info.lastInsertRowid;
    if (Array.isArray(body.prescriptions)) {
      const ins = db.prepare(`INSERT INTO prescriptions
        (visit_id, medication, dosage, frequency, duration, instructions)
        VALUES (?, ?, ?, ?, ?, ?)`);
      body.prescriptions.forEach(p => {
        if (!p?.medication) return;
        ins.run(visitId, p.medication, p.dosage || null, p.frequency || null,
                p.duration || null, p.instructions || null);
      });
    }
    // Auto-create a bill with the consultation line
    const bill = db.prepare(`INSERT INTO bills
      (patient_id, bill_date, total_cents, status) VALUES (?, ?, ?, 'unpaid')`)
      .run(patient_id, visitDate, fee);
    db.prepare(`INSERT INTO bill_items
      (bill_id, item_type, ref_id, description, amount_cents)
      VALUES (?, 'consultation', ?, ?, ?)`)
      .run(bill.lastInsertRowid, visitId, 'Consultation', fee);
    return visitId;
  });
  const id = tx();
  return db.prepare(`SELECT v.*, p.full_name AS patient_name,
                            d.full_name AS doctor_name
                     FROM visits v
                     JOIN patients p ON p.id = v.patient_id
                     JOIN doctors d ON d.id = v.doctor_id
                     WHERE v.id = ?`).get(id);
});
route('GET', '/api/visits/:id', ({ params }) => {
  const id = toInt(params.id);
  const visit = db.prepare(`SELECT v.*, p.full_name AS patient_name, p.patient_code,
                                   d.full_name AS doctor_name, d.specialty
                            FROM visits v
                            JOIN patients p ON p.id = v.patient_id
                            JOIN doctors d ON d.id = v.doctor_id
                            WHERE v.id = ?`).get(id);
  if (!visit) throw new Error('Visit not found');
  const prescriptions = db.prepare('SELECT * FROM prescriptions WHERE visit_id = ?').all(id);
  return { visit, prescriptions };
});

// ========= LAB TESTS =========
route('GET', '/api/lab-tests', ({ query }) => {
  const where = [], args = [];
  if (query.status) { where.push('l.status = ?'); args.push(query.status); }
  if (query.patient_id) { where.push('l.patient_id = ?'); args.push(toInt(query.patient_id)); }
  if (query.q) {
    where.push('(l.test_name LIKE ? OR p.full_name LIKE ?)');
    args.push(`%${query.q}%`, `%${query.q}%`);
  }
  const sql = `SELECT l.*, p.full_name AS patient_name, p.patient_code,
                      d.full_name AS doctor_name
               FROM lab_tests l
               JOIN patients p ON p.id = l.patient_id
               LEFT JOIN doctors d ON d.id = l.doctor_id
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY l.order_date DESC LIMIT 500`;
  return db.prepare(sql).all(...args);
});
route('POST', '/api/lab-tests', ({ body }) => {
  const patient_id = toInt(req(body, 'patient_id'));
  const test_name = String(req(body, 'test_name')).trim();
  const price = toCents(req(body, 'price'));
  const info = db.prepare(`INSERT INTO lab_tests
    (patient_id, visit_id, doctor_id, test_name, order_date, price_cents, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`).run(
    patient_id,
    body.visit_id ? toInt(body.visit_id) : null,
    body.doctor_id ? toInt(body.doctor_id) : null,
    test_name, body.order_date || nowSql(), price, body.notes || null
  );
  // Add to the patient's most recent unpaid bill (if any) OR create a bill
  const unpaid = db.prepare(`SELECT id FROM bills
    WHERE patient_id = ? AND status != 'paid'
    ORDER BY bill_date DESC LIMIT 1`).get(patient_id);
  let billId = unpaid?.id;
  if (!billId) {
    const b = db.prepare(`INSERT INTO bills (patient_id, bill_date, total_cents, status)
      VALUES (?, ?, 0, 'unpaid')`).run(patient_id, nowSql());
    billId = b.lastInsertRowid;
  }
  db.prepare(`INSERT INTO bill_items (bill_id, item_type, ref_id, description, amount_cents)
    VALUES (?, 'lab', ?, ?, ?)`).run(billId, info.lastInsertRowid, `Lab: ${test_name}`, price);
  recalcBill(billId);
  return db.prepare('SELECT * FROM lab_tests WHERE id = ?').get(info.lastInsertRowid);
});
route('PUT', '/api/lab-tests/:id', ({ params, body }) => {
  const id = toInt(params.id);
  const existing = db.prepare('SELECT * FROM lab_tests WHERE id = ?').get(id);
  if (!existing) throw new Error('Lab test not found');
  const status = body.status || existing.status;
  if (!['pending','in_progress','completed'].includes(status))
    throw new Error('Invalid status');
  const completed_at = status === 'completed'
    ? (existing.completed_at || nowSql()) : null;
  db.prepare(`UPDATE lab_tests
    SET status = ?, results = ?, notes = ?, completed_at = ?
    WHERE id = ?`).run(
    status,
    body.results !== undefined ? body.results : existing.results,
    body.notes   !== undefined ? body.notes   : existing.notes,
    completed_at, id
  );
  return db.prepare('SELECT * FROM lab_tests WHERE id = ?').get(id);
});

// ========= BILLS & PAYMENTS =========
function recalcBill(billId) {
  const total = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v
                            FROM bill_items WHERE bill_id = ?`).get(billId).v;
  const paid = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v
                           FROM payments WHERE bill_id = ?`).get(billId).v;
  let status = 'unpaid';
  if (paid >= total && total > 0) status = 'paid';
  else if (paid > 0) status = 'partial';
  db.prepare('UPDATE bills SET total_cents = ?, status = ? WHERE id = ?')
    .run(total, status, billId);
}

route('GET', '/api/bills', ({ query }) => {
  const where = [], args = [];
  if (query.patient_id) { where.push('b.patient_id = ?'); args.push(toInt(query.patient_id)); }
  if (query.status) { where.push('b.status = ?'); args.push(query.status); }
  const sql = `SELECT b.*, p.full_name AS patient_name, p.patient_code,
    COALESCE((SELECT SUM(amount_cents) FROM payments WHERE bill_id = b.id),0) AS paid_cents
    FROM bills b JOIN patients p ON p.id = b.patient_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY b.bill_date DESC LIMIT 500`;
  return db.prepare(sql).all(...args);
});
route('GET', '/api/bills/:id', ({ params }) => {
  const id = toInt(params.id);
  const bill = db.prepare(`SELECT b.*, p.full_name AS patient_name, p.patient_code
    FROM bills b JOIN patients p ON p.id = b.patient_id WHERE b.id = ?`).get(id);
  if (!bill) throw new Error('Bill not found');
  const items = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(id);
  const payments = db.prepare('SELECT * FROM payments WHERE bill_id = ? ORDER BY payment_date DESC').all(id);
  const paid = payments.reduce((s, p) => s + p.amount_cents, 0);
  return { bill, items, payments, paid_cents: paid,
           outstanding_cents: Math.max(0, bill.total_cents - paid) };
});
route('POST', '/api/bills', ({ body }) => {
  const patient_id = toInt(req(body, 'patient_id'));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new Error('At least one bill item is required');
  const tx = db.transaction(() => {
    const b = db.prepare(`INSERT INTO bills (patient_id, bill_date, total_cents, status, notes)
      VALUES (?, ?, 0, 'unpaid', ?)`)
      .run(patient_id, body.bill_date || nowSql(), body.notes || null);
    const ins = db.prepare(`INSERT INTO bill_items
      (bill_id, item_type, ref_id, description, amount_cents) VALUES (?, ?, ?, ?, ?)`);
    items.forEach(it => {
      ins.run(b.lastInsertRowid,
        ['consultation','lab','other'].includes(it.type) ? it.type : 'other',
        it.ref_id ? toInt(it.ref_id) : null,
        String(it.description || 'Item'), toCents(it.amount));
    });
    recalcBill(b.lastInsertRowid);
    return b.lastInsertRowid;
  });
  const id = tx();
  return db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
});
route('POST', '/api/payments', ({ body }) => {
  const bill_id = toInt(req(body, 'bill_id'));
  const method = String(req(body, 'method')).toLowerCase();
  if (!['cash','card','bkash'].includes(method)) throw new Error('Invalid payment method');
  const amount = toCents(req(body, 'amount'));
  if (amount <= 0) throw new Error('Amount must be positive');
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(bill_id);
  if (!bill) throw new Error('Bill not found');
  const paidSoFar = db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS v FROM payments WHERE bill_id = ?')
    .get(bill_id).v;
  if (paidSoFar + amount > bill.total_cents)
    throw new Error('Payment exceeds outstanding balance');
  const ref = `RCPT-${bill_id}-${Date.now().toString(36).toUpperCase()}`;
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO payments
      (bill_id, amount_cents, method, payment_date, reference, is_simulated)
      VALUES (?, ?, ?, ?, ?, 1)`)
      .run(bill_id, amount, method, nowSql(), ref);
    recalcBill(bill_id);
  });
  tx();
  return { ok: true, reference: ref };
});

// ========= SETTINGS / DEMO DATA =========
route('POST', '/api/settings/reset-data', ({ body }) => {
  if (String(body.confirm || '').trim() !== 'RESET') {
    throw new Error('Type RESET to confirm wiping all hospital data');
  }
  return resetData();
});
route('POST', '/api/settings/regenerate-demo', ({ body }) => {
  if (String(body.confirm || '').trim() !== 'RESET') {
    throw new Error('Type RESET to confirm regenerating demo data');
  }
  return regenerateDemoData();
});

// ========= DASHBOARD & REPORTS =========
route('GET', '/api/dashboard', () => reports.dashboard());
route('GET', '/api/reports/:type', ({ params, query }) => {
  const from = query.from, to = query.to;
  switch (params.type) {
    case 'daily-collection':      return reports.dailyCollection(from, to);
    case 'patient-registrations': return reports.patientRegistrations(from, to);
    case 'doctor-visits':         return reports.doctorVisits(from, to);
    case 'laboratory':            return reports.laboratoryReport(from, to);
    default: throw new Error('Report not found');
  }
});

// ========= AI REPORT CHAT =========
route('POST', '/api/ai/report-chat', async ({ body }) => {
  const question = String(body.question || '').trim();
  if (!question) throw new Error('Question is required');
  if (question.length > 1000) throw new Error('Question is too long');

  // Prefer a key pasted in Settings (per-browser); fall back to server .env / host env.
  const fromClient = String(body.apiKey || '').trim();
  const fromEnv = String(process.env.CHATTERMATE_API_KEY || '').trim();
  const apiKey = fromClient || fromEnv;
  if (!apiKey || apiKey.includes('your-chattermate')) {
    return {
      configured: false,
      answer: null,
      message: 'No ChatterMate API key found. Open Settings → AI Report Assistant, '
             + 'paste your API key, and save — or set CHATTERMATE_API_KEY in .env and restart.'
    };
  }

  // Always use live all-time + rolling calendar windows (no UI date filter).
  const dash = reports.dashboard();
  const dc = reports.dailyCollection(null, null);
  const pr = reports.patientRegistrations(null, null);
  const regWindows = reports.patientRegistrationWindows();
  const debtors = reports.outstandingByPatient(50);
  const dv = reports.doctorVisits(null, null);
  const lab = reports.laboratoryReport(null, null);
  const money = c => (c / 100).toFixed(2);

  const debtorLines = debtors.rows.length
    ? debtors.rows.map(r =>
        `- ${r.full_name} (${r.patient_code}): ${money(r.outstanding_cents)} BDT outstanding`
        + (r.open_bills ? ` across ${r.open_bills} open bill(s)` : '')
      ).join('\n')
    : '- (nobody currently owes money)';

  const regByDay = regWindows.by_day.length
    ? regWindows.by_day.map(d => `  * ${d.day}: ${d.c}`).join('\n')
    : '  (none in the last 14 days)';

  const collectionByDay = dc.daily.length
    ? dc.daily.slice(-14).map(d => `  * ${d.day}: ${money(d.total_cents)}`).join('\n')
    : '  (no payments)';

  const context = `
HOSPITAL REPORT CONTEXT (figures are live from the SQLite database)
Scope: all available history, plus explicit calendar windows below
Currency unit: BDT (two decimal places)
Today's date: ${(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()}

== TODAY SNAPSHOT ==
- Total registered patients (all time): ${dash.stats.total_patients}
- Patients seen today: ${dash.stats.patients_today}
- Visits today: ${dash.stats.visits_today}
- Money collected today: ${money(dash.stats.collected_today_cents)}
- Total outstanding (all time): ${money(dash.stats.outstanding_cents)}
- Lab tests pending or in progress: ${dash.stats.lab_pending}
- Lab tests completed (all time): ${dash.stats.lab_completed}

== COLLECTIONS (all time) ==
- Total collected: ${money(dc.total_collected_cents)}
- By payment method:
${dc.by_method.map(m => `  * ${m.method}: ${money(m.total_cents)} across ${m.count} payment(s)`).join('\n') || '  (no payments)'}
- Allocated by source (collections only):
${dc.by_source.map(s => `  * ${s.item_type}: ${money(s.allocated_cents)}`).join('\n') || '  (none)'}
- Collections by day (last up to 14 days with activity):
${collectionByDay}

== WHO OWES MONEY (patients with outstanding balances) ==
- Patient count with a balance: ${debtors.count}
- Sum of listed balances: ${money(debtors.total_outstanding_cents)}
${debtorLines}

== PATIENT REGISTRATIONS ==
- Total registered patients (all time): ${pr.total}
- New patients today: ${regWindows.today}
- New patients this calendar week (Mon ${regWindows.week_from} through ${regWindows.week_to}): ${regWindows.this_week}
- New patients in the last 7 days: ${regWindows.last_7_days}
- New patients this calendar month (from ${regWindows.month_from}): ${regWindows.this_month}
- New patients by day (last 14 days):
${regByDay}

== DOCTOR-WISE VISITS (all time) ==
${dv.rows.map(r => `- ${r.doctor_name} (${r.specialty}): ${r.visit_count} visit(s), billed ${money(r.fees_billed_cents)}, collected ${money(r.fees_collected_cents)}`).join('\n') || '- (no visits)'}
- Totals: ${dv.totals.visits} visits, billed ${money(dv.totals.billed)}, collected ${money(dv.totals.collected)}

== LABORATORY REPORT (all time) ==
- Ordered: ${lab.summary.total}, Pending: ${lab.summary.pending}, In progress: ${lab.summary.in_progress}, Completed: ${lab.summary.completed}
- Total order value: ${money(lab.summary.total_value_cents)}
`.trim();

  const systemPrompt =
    'You are Dr. ChatterMate, a hospital reporting assistant. Answer questions using ONLY the verified ' +
    'report data provided in the current context. Prefer the dedicated sections: use "WHO OWES MONEY" for ' +
    'debtor/outstanding questions (name patients and balances), and use the PATIENT REGISTRATIONS calendar ' +
    'windows for "today", "this week", "this month", or last-7-days questions. Do not invent figures, ' +
    'dates, patients, doctors, or transactions. If the data does not contain enough information to answer, ' +
    'clearly say that the information is unavailable. Do not modify, delete, create, or claim to have ' +
    'modified any hospital record. Distinguish collected revenue from billed fees and outstanding balances. ' +
    'Present concise, professional answers with readable formatting. Currency values are in BDT.';

  const prompt = `${context}\n\n---\nQuestion: ${question}`;
  try {
    const answer = await chattermate.streamChat({ apiKey, systemPrompt, prompt });
    return { configured: true, answer };
  } catch (e) {
    return {
      configured: true, answer: null,
      message: `ChatterMate request failed: ${e.message}`
    };
  }
});

// ---- Server ----
const server = http.createServer(async (req, res) => {
  // Minimal security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  const pathname = new URL(req.url, 'http://x').pathname;
  if (pathname.startsWith('/api/')) {
    try { return await handleApi(req, res, pathname); }
    catch (e) { return bad(res, 'Server error', 500); }
  }
  if (req.method !== 'GET') return bad(res, 'Method not allowed', 405);
  return serveStatic(req, res);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Set PORT=… in the environment (or free the port) and retry.\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const configured = !!process.env.CHATTERMATE_API_KEY
    && !process.env.CHATTERMATE_API_KEY.includes('your-chattermate');
  console.log(`\n  Dr. ChatterMate running on http://localhost:${PORT}`);
  console.log(`  Database: dr-chattermate.db`);
  console.log(`  Server API key: ${configured ? 'configured ✓' : 'none (use Settings → paste a key, or set CHATTERMATE_API_KEY)'}\n`);
});