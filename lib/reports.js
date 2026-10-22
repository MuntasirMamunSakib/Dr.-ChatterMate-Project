// lib/reports.js
const { db } = require('./db');

// Normalise date boundaries. from/to are YYYY-MM-DD inclusive.
// Visit/bill/payment dates are stored as 'YYYY-MM-DD HH:MM:SS'.
function range(from, to) {
  const f = (from || '0001-01-01') + ' 00:00:00';
  const t = (to   || '9999-12-31') + ' 23:59:59';
  return { f, t };
}

function dailyCollection(from, to) {
  const { f, t } = range(from, to);
  const byMethod = db.prepare(`
    SELECT p.method,
           COALESCE(SUM(p.amount_cents), 0) AS total_cents,
           COUNT(*) AS count
    FROM payments p
    WHERE p.payment_date BETWEEN ? AND ?
    GROUP BY p.method
  `).all(f, t);

  const bySource = db.prepare(`
    SELECT bi.item_type,
           COALESCE(SUM(
             CASE WHEN b.total_cents > 0
                  THEN p.amount_cents * bi.amount_cents / b.total_cents
                  ELSE 0 END
           ), 0) AS allocated_cents
    FROM payments p
    JOIN bills b ON b.id = p.bill_id
    JOIN bill_items bi ON bi.bill_id = b.id
    WHERE p.payment_date BETWEEN ? AND ?
    GROUP BY bi.item_type
  `).all(f, t);

  const totalRow = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS total_cents
    FROM payments
    WHERE payment_date BETWEEN ? AND ?
  `).get(f, t);

  const outstandingRow = db.prepare(`
    SELECT COALESCE(SUM(b.total_cents), 0) - COALESCE((
      SELECT SUM(p.amount_cents) FROM payments p
      WHERE p.bill_id IN (SELECT id FROM bills WHERE bill_date BETWEEN ? AND ?)
    ), 0) AS outstanding_cents
    FROM bills b
    WHERE b.bill_date BETWEEN ? AND ?
  `).get(f, t, f, t);

  const daily = db.prepare(`
    SELECT substr(payment_date, 1, 10) AS day,
           SUM(amount_cents) AS total_cents
    FROM payments
    WHERE payment_date BETWEEN ? AND ?
    GROUP BY day
    ORDER BY day
  `).all(f, t);

  return {
    total_collected_cents: totalRow.total_cents,
    outstanding_cents: outstandingRow.outstanding_cents,
    by_method: byMethod,
    by_source: bySource,
    daily
  };
}

function patientRegistrations(from, to) {
  const { f, t } = range(from, to);
  const rows = db.prepare(`
    SELECT id, patient_code, full_name, gender, phone, created_at
    FROM patients
    WHERE created_at BETWEEN ? AND ?
    ORDER BY created_at DESC
  `).all(f, t);
  return { total: rows.length, rows };
}

function localISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Calendar Monday → today (local), as YYYY-MM-DD. */
function thisWeekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  return { from: localISO(monday), to: localISO(now) };
}

function monthStartISO() {
  const now = new Date();
  return localISO(new Date(now.getFullYear(), now.getMonth(), 1));
}

/** Rolling / calendar windows for AI answers (independent of any UI date picker). */
function patientRegistrationWindows() {
  const today = localISO();
  const week = thisWeekBounds();
  const monthFrom = monthStartISO();
  const countBetween = (from, to) => patientRegistrations(from, to).total;
  const daysAgo = (n) => localISO(new Date(Date.now() - n * 86400000));
  const last14From = daysAgo(13);
  const byDay = db.prepare(`
    SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS c
    FROM patients
    WHERE created_at >= ?
    GROUP BY day
    ORDER BY day
  `).all(last14From + ' 00:00:00');
  return {
    today: countBetween(today, today),
    this_week: countBetween(week.from, week.to),
    week_from: week.from,
    week_to: week.to,
    this_month: countBetween(monthFrom, today),
    month_from: monthFrom,
    last_7_days: countBetween(daysAgo(6), today),
    by_day: byDay
  };
}

/** Patients with a positive outstanding balance (all unpaid/partial bills). */
function outstandingByPatient(limit = 50) {
  const rows = db.prepare(`
    SELECT patient_code, full_name, outstanding_cents, open_bills
    FROM (
      SELECT p.patient_code, p.full_name,
        COALESCE((SELECT SUM(total_cents) FROM bills WHERE patient_id = p.id), 0)
        - COALESCE((
            SELECT SUM(pm.amount_cents) FROM payments pm
            JOIN bills b ON b.id = pm.bill_id
            WHERE b.patient_id = p.id
          ), 0) AS outstanding_cents,
        (SELECT COUNT(*) FROM bills b
          WHERE b.patient_id = p.id AND b.status IN ('unpaid', 'partial')) AS open_bills
      FROM patients p
    )
    WHERE outstanding_cents > 0
    ORDER BY outstanding_cents DESC
    LIMIT ?
  `).all(limit);
  const total = rows.reduce((s, r) => s + r.outstanding_cents, 0);
  return { rows, total_outstanding_cents: total, count: rows.length };
}

function doctorVisits(from, to) {
  const { f, t } = range(from, to);
  const rows = db.prepare(`
    SELECT d.id AS doctor_id,
           d.doctor_code,
           d.full_name AS doctor_name,
           d.specialty,
           COUNT(v.id) AS visit_count,
           COALESCE(SUM(v.consultation_fee_cents), 0) AS fees_billed_cents,
           COALESCE((
             SELECT SUM(
               CASE WHEN b.total_cents > 0
                    THEN p.amount_cents * bi.amount_cents / b.total_cents
                    ELSE 0 END
             )
             FROM bill_items bi
             JOIN bills b ON b.id = bi.bill_id
             JOIN payments p ON p.bill_id = b.id
             WHERE bi.item_type = 'consultation'
               AND bi.ref_id IN (
                 SELECT id FROM visits
                 WHERE doctor_id = d.id AND visit_date BETWEEN ? AND ?
               )
               AND p.payment_date BETWEEN ? AND ?
           ), 0) AS fees_collected_cents
    FROM doctors d
    LEFT JOIN visits v ON v.doctor_id = d.id AND v.visit_date BETWEEN ? AND ?
    GROUP BY d.id
    ORDER BY visit_count DESC, d.full_name
  `).all(f, t, f, t, f, t);
  const totals = rows.reduce((acc, r) => ({
    visits: acc.visits + r.visit_count,
    billed: acc.billed + r.fees_billed_cents,
    collected: acc.collected + r.fees_collected_cents
  }), { visits: 0, billed: 0, collected: 0 });
  return { rows, totals };
}

function laboratoryReport(from, to) {
  const { f, t } = range(from, to);
  const rows = db.prepare(`
    SELECT l.id, l.test_name, l.status, l.order_date, l.completed_at,
           l.price_cents, p.full_name AS patient_name, p.patient_code,
           d.full_name AS doctor_name
    FROM lab_tests l
    JOIN patients p ON p.id = l.patient_id
    LEFT JOIN doctors d ON d.id = l.doctor_id
    WHERE l.order_date BETWEEN ? AND ?
    ORDER BY l.order_date DESC
  `).all(f, t);
  const summary = {
    total: rows.length,
    pending: rows.filter(r => r.status === 'pending').length,
    in_progress: rows.filter(r => r.status === 'in_progress').length,
    completed: rows.filter(r => r.status === 'completed').length,
    total_value_cents: rows.reduce((s, r) => s + r.price_cents, 0)
  };
  return { summary, rows };
}

function dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const f = today + ' 00:00:00', t = today + ' 23:59:59';
  const q = (sql, ...a) => db.prepare(sql).get(...a);

  const totalPatients = q('SELECT COUNT(*) AS c FROM patients').c;
  const patientsToday = q(`SELECT COUNT(DISTINCT patient_id) AS c FROM visits
                           WHERE visit_date BETWEEN ? AND ?`, f, t).c;
  const visitsToday = q(`SELECT COUNT(*) AS c FROM visits
                         WHERE visit_date BETWEEN ? AND ?`, f, t).c;
  const collectedToday = q(`SELECT COALESCE(SUM(amount_cents), 0) AS v FROM payments
                            WHERE payment_date BETWEEN ? AND ?`, f, t).v;
  const outstanding = q(`SELECT COALESCE(SUM(b.total_cents), 0) -
                           COALESCE((SELECT SUM(amount_cents) FROM payments), 0) AS v
                         FROM bills b`).v;
  const labPending = q(`SELECT COUNT(*) AS c FROM lab_tests WHERE status != 'completed'`).c;
  const labCompleted = q(`SELECT COUNT(*) AS c FROM lab_tests WHERE status = 'completed'`).c;

  const visitTrend = db.prepare(`
    SELECT substr(visit_date, 1, 10) AS day, COUNT(*) AS c
    FROM visits
    WHERE visit_date >= date('now', '-13 days')
    GROUP BY day
    ORDER BY day
  `).all();

  const revenueTrend = db.prepare(`
    SELECT substr(payment_date, 1, 10) AS day,
           COALESCE(SUM(amount_cents), 0) AS v
    FROM payments
    WHERE payment_date >= date('now', '-13 days')
    GROUP BY day
    ORDER BY day
  `).all();

  const labDistribution = db.prepare(`
    SELECT status, COUNT(*) AS c FROM lab_tests GROUP BY status
  `).all();

  const recentActivity = db.prepare(`
    SELECT 'visit' AS kind, v.visit_date AS ts,
           p.full_name AS patient, d.full_name AS actor,
           v.reason AS detail
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    UNION ALL
    SELECT 'payment' AS kind, pm.payment_date AS ts,
           p.full_name AS patient, pm.method AS actor,
           printf('%.2f', pm.amount_cents / 100.0) AS detail
    FROM payments pm
    JOIN bills b ON b.id = pm.bill_id
    JOIN patients p ON p.id = b.patient_id
    UNION ALL
    SELECT 'lab' AS kind, l.order_date AS ts,
           p.full_name AS patient, l.status AS actor,
           l.test_name AS detail
    FROM lab_tests l
    JOIN patients p ON p.id = l.patient_id
    ORDER BY ts DESC
    LIMIT 12
  `).all();

  return {
    stats: {
      total_patients: totalPatients,
      patients_today: patientsToday,
      visits_today: visitsToday,
      collected_today_cents: collectedToday,
      outstanding_cents: outstanding,
      lab_pending: labPending,
      lab_completed: labCompleted
    },
    visit_trend: visitTrend,
    revenue_trend: revenueTrend,
    lab_distribution: labDistribution,
    recent_activity: recentActivity
  };
}

module.exports = {
  dashboard,
  dailyCollection,
  patientRegistrations,
  patientRegistrationWindows,
  outstandingByPatient,
  doctorVisits,
  laboratoryReport
};