// public/js/reports.js
App.register('reports', async (view) => {
  const today = App.todayISO();
  const monthAgo = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Reports</h1><div class="page-sub">Date-bounded reports from live SQLite data</div></div>
      <button class="btn btn-ghost no-print" onclick="window.print()">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 8h-1V3H6v5H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3zm-3 11H8v-5h8zm3-7a1 1 0 1 1 1-1 1 1 0 0 1-1 1zm-1-4H6V5h12z"/></svg>
        Print this report
      </button>
    </div>
    <div class="card no-print">
      <div class="form-row">
        <label>Report
          <select id="reportSel">
            <option value="daily-collection">A · Daily Collection</option>
            <option value="patient-registrations">B · Patient Registrations</option>
            <option value="doctor-visits">C · Doctor-wise Visits & Fees</option>
            <option value="laboratory">D · Laboratory Tests</option>
          </select>
        </label>
        <label>From<input id="from" type="date" value="${monthAgo}"/></label>
        <label>To<input id="to" type="date" value="${today}"/></label>
        <label>&nbsp;<button class="btn btn-primary" id="genBtn">Generate</button></label>
      </div>
    </div>
    <div id="out"></div>`;
  const run = async () => {
    const type = view.querySelector('#reportSel').value;
    const from = view.querySelector('#from').value;
    const to = view.querySelector('#to').value;
    const out = view.querySelector('#out');
    out.innerHTML = '<div class="loader">Generating</div>';
    try {
      const data = await App.api(`/api/reports/${type}?from=${from}&to=${to}`);
      out.innerHTML = renderers[type](data, from, to);
    } catch (e) { out.innerHTML = `<div class="card empty"><h3>Could not generate report</h3><p>${App.escape(e.message)}</p></div>`; }
  };
  view.querySelector('#genBtn').addEventListener('click', run);
  run();
});

const renderers = {
  'daily-collection': (d, from, to) => {
    const period = `${from||'—'} to ${to||'—'}`;
    const met = d.by_method, src = d.by_source;
    return `<div class="card">
      <h3 class="section-title">Report A · Daily Collection Report</h3>
      <div class="page-sub">Period: ${period}</div>
      <div class="cards" style="margin-top:12px">
        <div class="card stat"><div class="stat-label">Total received</div><div class="stat-value">${App.fmtMoney(d.total_collected_cents)}</div></div>
        <div class="card stat"><div class="stat-label">Outstanding (bills in period)</div><div class="stat-value">${App.fmtMoney(d.outstanding_cents)}</div></div>
      </div>
      <h3 class="section-title">By payment method</h3>
      ${met.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Method</th><th>Payments</th><th style="text-align:right">Collected</th></tr></thead>
        <tbody>${met.map(m=>`<tr><td>${m.method}</td><td>${m.count}</td>
          <td style="text-align:right">${App.fmtMoney(m.total_cents)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">No payments in this period.</div>'}
      <h3 class="section-title" style="margin-top:16px">Allocated by source</h3>
      ${src.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Source</th><th style="text-align:right">Collected (allocated)</th></tr></thead>
        <tbody>${src.map(s=>`<tr><td>${s.item_type}</td>
          <td style="text-align:right">${App.fmtMoney(s.allocated_cents)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">No source breakdown available.</div>'}
    </div>`;
  },
  'patient-registrations': (d, from, to) => `
    <div class="card">
      <h3 class="section-title">Report B · Patient Registration Report</h3>
      <div class="page-sub">Period: ${from||'—'} to ${to||'—'} · Total: <b>${d.total}</b></div>
      ${d.rows.length ? `<div class="table-wrap" style="margin-top:12px"><table>
        <thead><tr><th>ID</th><th>Name</th><th>Gender</th><th>Phone</th><th>Registered</th></tr></thead>
        <tbody>${d.rows.map(p=>`<tr>
          <td>${App.escape(p.patient_code)}</td>
          <td><a href="#/patients/${p.id}">${App.escape(p.full_name)}</a></td>
          <td>${App.escape(p.gender||'—')}</td>
          <td>${App.escape(p.phone||'—')}</td>
          <td>${App.fmtDate(p.created_at)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">Total registrations</td><td><b>${d.total}</b></td></tr></tfoot>
      </table></div>` : '<div class="empty">No registrations in this period.</div>'}
    </div>`,
  'doctor-visits': (d, from, to) => `
    <div class="card">
      <h3 class="section-title">Report C · Doctor-wise Visits & Fees</h3>
      <div class="page-sub">Period: ${from||'—'} to ${to||'—'}</div>
      ${d.rows.length ? `<div class="table-wrap" style="margin-top:12px"><table>
        <thead><tr><th>Doctor</th><th>Specialty</th><th>Visits</th>
          <th style="text-align:right">Fees billed</th>
          <th style="text-align:right">Fees collected</th></tr></thead>
        <tbody>${d.rows.map(r=>`<tr>
          <td>${App.escape(r.doctor_name)}</td>
          <td>${App.escape(r.specialty)}</td>
          <td>${r.visit_count}</td>
          <td style="text-align:right">${App.fmtMoney(r.fees_billed_cents)}</td>
          <td style="text-align:right">${App.fmtMoney(r.fees_collected_cents)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="2">Totals</td>
          <td>${d.totals.visits}</td>
          <td style="text-align:right">${App.fmtMoney(d.totals.billed)}</td>
          <td style="text-align:right">${App.fmtMoney(d.totals.collected)}</td></tr></tfoot>
      </table></div>` : '<div class="empty">No visits in this period.</div>'}
    </div>`,
  'laboratory': (d, from, to) => `
    <div class="card">
      <h3 class="section-title">Report D · Laboratory Test Report</h3>
      <div class="page-sub">Period: ${from||'—'} to ${to||'—'}</div>
      <div class="cards" style="margin-top:12px">
        <div class="card stat"><div class="stat-label">Ordered</div><div class="stat-value">${d.summary.total}</div></div>
        <div class="card stat"><div class="stat-label">Pending</div><div class="stat-value">${d.summary.pending}</div></div>
        <div class="card stat"><div class="stat-label">In progress</div><div class="stat-value">${d.summary.in_progress}</div></div>
        <div class="card stat"><div class="stat-label">Completed</div><div class="stat-value">${d.summary.completed}</div></div>
        <div class="card stat"><div class="stat-label">Order value</div><div class="stat-value">${App.fmtMoney(d.summary.total_value_cents)}</div></div>
      </div>
      ${d.rows.length ? `<div class="table-wrap" style="margin-top:12px"><table>
        <thead><tr><th>Ordered</th><th>Patient</th><th>Test</th><th>Doctor</th><th>Status</th><th style="text-align:right">Price</th></tr></thead>
        <tbody>${d.rows.map(l=>`<tr>
          <td>${App.fmtDate(l.order_date)}</td>
          <td>${App.escape(l.patient_name)}</td>
          <td>${App.escape(l.test_name)}</td>
          <td>${App.escape(l.doctor_name||'—')}</td>
          <td><span class="badge badge-${l.status==='in_progress'?'progress':l.status}">${l.status.replace('_',' ')}</span></td>
          <td style="text-align:right">${App.fmtMoney(l.price_cents)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="5">Total order value</td><td style="text-align:right"><b>${App.fmtMoney(d.summary.total_value_cents)}</b></td></tr></tfoot>
      </table></div>` : '<div class="empty">No tests in this period.</div>'}
    </div>`
};