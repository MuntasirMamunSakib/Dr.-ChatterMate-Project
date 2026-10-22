// public/js/patients.js
(function () {
App.register('patients', async (view, params) => {
  if (params && params[0]) return renderDetail(view, params[0]);
  await renderList(view);
});

async function renderList(view) {
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Patients</h1><div class="page-sub">All registered patients, newest first</div></div>
      <button class="btn btn-primary" id="newBtn">+ New patient</button>
    </div>
    <div class="toolbar">
      <div class="search">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.49-1.49zM10 14a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/></svg>
        <input id="q" type="search" placeholder="Search by name, phone, or patient ID…" />
      </div>
    </div>
    <div id="list"></div>
  `;
  const list = view.querySelector('#list');
  const q = view.querySelector('#q');
  let t;
  q.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => load(q.value), 180);
  });
  view.querySelector('#newBtn').addEventListener('click', () => openForm());

  async function load(query = '') {
    list.innerHTML = '<div class="loader">Loading</div>';
    const rows = await App.api('/api/patients' + (query ? `?q=${encodeURIComponent(query)}` : ''));
    if (!rows.length) { list.innerHTML = `<div class="card empty"><h3>No patients found</h3><p>Try a different search, or register a new patient.</p></div>`; return; }
    list.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>
        <th>ID</th><th>Name</th><th>Gender</th><th>Phone</th><th>Registered</th><th></th>
      </tr></thead><tbody>
      ${rows.map(p => `<tr>
        <td><b>${App.escape(p.patient_code)}</b></td>
        <td><a href="#/patients/${p.id}">${App.escape(p.full_name)}</a></td>
        <td>${App.escape(p.gender || '—')}</td>
        <td>${App.escape(p.phone || '—')}</td>
        <td>${App.fmtDay(p.created_at)}</td>
        <td><a class="btn btn-ghost btn-sm" href="#/patients/${p.id}">View</a></td>
      </tr>`).join('')}
      </tbody></table></div>`;
  }
  load();
}

function openForm(existing) {
  const p = existing || {};
  App.openModal(existing ? 'Edit patient' : 'Register patient', `
    <form id="pform" class="form">
      <label>Full name<input name="full_name" required value="${App.escape(p.full_name||'')}"/></label>
      <div class="form-row">
        <label>Date of birth<input name="dob" type="date" value="${App.escape(p.dob||'')}"/></label>
        <label>Gender<select name="gender">
          <option value="">—</option>
          ${['Male','Female','Other'].map(g=>`<option ${p.gender===g?'selected':''}>${g}</option>`).join('')}
        </select></label>
      </div>
      <div class="form-row">
        <label>Phone<input name="phone" value="${App.escape(p.phone||'')}"/></label>
        <label>Emergency contact<input name="emergency_contact" value="${App.escape(p.emergency_contact||'')}"/></label>
      </div>
      <label>Address<input name="address" value="${App.escape(p.address||'')}"/></label>
      <label>Notes<textarea name="notes">${App.escape(p.notes||'')}</textarea></label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
        <button type="submit" class="btn btn-primary" id="saveBtn">${existing?'Save changes':'Register'}</button>
      </div>
    </form>`);
  const form = document.getElementById('pform');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('#saveBtn');
    btn.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    try {
      if (existing) await App.api(`/api/patients/${existing.id}`, { method:'PUT', body:data });
      else await App.api('/api/patients', { method:'POST', body:data });
      App.closeModal();
      App.toast('Patient saved', 'ok');
      App.go(location.hash.includes('/patients/') ? 'patients' : 'patients');
    } catch (err) { App.toast(err.message, 'err'); btn.disabled = false; }
  });
}

async function renderDetail(view, id) {
  view.innerHTML = '<div class="loader">Loading</div>';
  let data;
  try { data = await App.api(`/api/patients/${id}`); }
  catch (e) { view.innerHTML = `<div class="card empty"><h3>Patient not found</h3><p><a href="#/patients">Back to list</a></p></div>`; return; }
  const p = data.patient;
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${App.escape(p.full_name)} <span class="badge">${App.escape(p.patient_code)}</span></h1>
        <div class="page-sub">Registered ${App.fmtDate(p.created_at)}</div>
      </div>
      <div>
        <a class="btn btn-ghost" href="#/patients">← Back</a>
        <button class="btn" id="editBtn">Edit</button>
        <a class="btn btn-primary" href="#/visits/new?patient=${p.id}">+ New visit</a>
      </div>
    </div>
    <div class="detail-grid">
      <div class="card">
        <h3 class="section-title">Profile</h3>
        <dl class="kv">
          <dt>Gender</dt><dd>${App.escape(p.gender||'—')}</dd>
          <dt>DOB</dt><dd>${App.escape(p.dob||'—')}</dd>
          <dt>Phone</dt><dd>${App.escape(p.phone||'—')}</dd>
          <dt>Address</dt><dd>${App.escape(p.address||'—')}</dd>
          <dt>Emergency</dt><dd>${App.escape(p.emergency_contact||'—')}</dd>
          <dt>Notes</dt><dd>${App.escape(p.notes||'—')}</dd>
        </dl>
      </div>
      <div class="card">
        <div class="tabs">
          <button class="tab active" data-tab="visits">Visits (${data.visits.length})</button>
          <button class="tab" data-tab="labs">Lab tests (${data.labs.length})</button>
          <button class="tab" data-tab="bills">Bills (${data.bills.length})</button>
        </div>
        <div id="tabBody"></div>
      </div>
    </div>`;
  document.getElementById('editBtn').addEventListener('click', () => openForm(p));

  const tabs = {
    visits: () => data.visits.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Doctor</th><th>Reason</th><th>Fee</th></tr></thead>
      <tbody>${data.visits.map(v=>`<tr>
        <td>${App.fmtDate(v.visit_date)}</td>
        <td>${App.escape(v.doctor_name)}</td>
        <td>${App.escape(v.reason||'—')}</td>
        <td>${App.fmtMoney(v.consultation_fee_cents)}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No visits yet</div>',
    labs: () => data.labs.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Test</th><th>Status</th><th>Price</th></tr></thead>
      <tbody>${data.labs.map(l=>`<tr>
        <td>${App.fmtDate(l.order_date)}</td>
        <td>${App.escape(l.test_name)}</td>
        <td><span class="badge badge-${l.status==='in_progress'?'progress':l.status}">${l.status.replace('_',' ')}</span></td>
        <td>${App.fmtMoney(l.price_cents)}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No lab tests</div>',
    bills: () => data.bills.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
      <tbody>${data.bills.map(b=>`<tr>
        <td>${App.fmtDate(b.bill_date)}</td>
        <td>${App.fmtMoney(b.total_cents)}</td>
        <td>${App.fmtMoney(b.paid_cents)}</td>
        <td>${App.fmtMoney(Math.max(0, b.total_cents - b.paid_cents))}</td>
        <td><span class="badge badge-${b.status}">${b.status}</span></td>
        <td><a class="btn btn-ghost btn-sm" href="#/billing/${b.id}">Open</a></td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No bills</div>'
  };
  const body = document.getElementById('tabBody');
  const render = (k) => body.innerHTML = tabs[k]();
  render('visits');
  view.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    view.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    render(t.dataset.tab);
  }));
}
})();
