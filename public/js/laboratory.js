// public/js/laboratory.js
(function () {
App.register('laboratory', async (view) => {
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Laboratory</h1><div class="page-sub">Orders, results, and status</div></div>
      <button class="btn btn-primary" id="newBtn">+ Order test</button>
    </div>
    <div class="toolbar">
      <div class="search">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.49-1.49zM10 14a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/></svg>
        <input id="q" type="search" placeholder="Search tests or patients…"/>
      </div>
      <select id="statusFilter">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="in_progress">In progress</option>
        <option value="completed">Completed</option>
      </select>
    </div>
    <div id="list"></div>`;
  const list = view.querySelector('#list');
  const q = view.querySelector('#q');
  const sf = view.querySelector('#statusFilter');
  let t;
  const trigger = () => { clearTimeout(t); t = setTimeout(load, 180); };
  q.addEventListener('input', trigger);
  sf.addEventListener('change', load);
  view.querySelector('#newBtn').addEventListener('click', () => openForm());

  async function load() {
    list.innerHTML = '<div class="loader">Loading</div>';
    const params = new URLSearchParams();
    if (q.value) params.set('q', q.value);
    if (sf.value) params.set('status', sf.value);
    const rows = await App.api('/api/lab-tests?' + params);
    if (!rows.length) { list.innerHTML = `<div class="card empty"><h3>No tests found</h3></div>`; return; }
    list.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Ordered</th><th>Patient</th><th>Test</th><th>Doctor</th><th>Price</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(l=>`<tr>
        <td>${App.fmtDate(l.order_date)}</td>
        <td><a href="#/patients/${l.patient_id}">${App.escape(l.patient_name)}</a></td>
        <td>${App.escape(l.test_name)}</td>
        <td>${App.escape(l.doctor_name||'—')}</td>
        <td>${App.fmtMoney(l.price_cents)}</td>
        <td><span class="badge badge-${l.status==='in_progress'?'progress':l.status}">${l.status.replace('_',' ')}</span></td>
        <td><button class="btn btn-ghost btn-sm" data-id="${l.id}">Update</button></td>
      </tr>`).join('')}</tbody></table></div>`;
    list.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () =>
      openUpdate(rows.find(r => r.id == b.dataset.id))));
  }
  load();
});

const LAB_CATALOG = [
  ['Complete Blood Count (CBC)', 800],
  ['Blood Sugar (Fasting)', 600],
  ['Lipid Profile', 1500],
  ['Liver Function Test', 1800],
  ['Thyroid Panel (TSH, T3, T4)', 2200],
  ['Urinalysis', 500],
  ['Chest X-Ray', 1200],
  ['ECG', 1000]
];

async function openForm() {
  const [patients, doctors] = await Promise.all([
    App.api('/api/patients'),
    App.api('/api/doctors')
  ]);
  App.openModal('Order laboratory test', `
    <form id="lform" class="form">
      <label>Patient<select name="patient_id" required>
        <option value="">— Select —</option>
        ${patients.map(p=>`<option value="${p.id}">${App.escape(p.full_name)} (${App.escape(p.patient_code)})</option>`).join('')}
      </select></label>
      <div class="form-row">
        <label>Test<select id="testSel" name="test_name" required>
          <option value="">— Select test —</option>
          ${LAB_CATALOG.map(([n,p])=>`<option value="${App.escape(n)}" data-price="${p}">${App.escape(n)} — ৳${p.toFixed(2)}</option>`).join('')}
          <option value="__custom">Custom…</option>
        </select></label>
        <label>Price (BDT)<input name="price" id="priceInp" type="number" min="0" step="0.01" required/></label>
      </div>
      <label>Ordering doctor<select name="doctor_id">
        <option value="">— Optional —</option>
        ${doctors.map(d=>`<option value="${d.id}">${App.escape(d.full_name)}</option>`).join('')}
      </select></label>
      <label>Notes<textarea name="notes"></textarea></label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
        <button type="submit" class="btn btn-primary" id="saveBtn">Order test</button>
      </div>
    </form>`);
  const sel = document.getElementById('testSel');
  const price = document.getElementById('priceInp');
  sel.addEventListener('change', () => {
    const o = sel.selectedOptions[0];
    if (o.value === '__custom') { sel.insertAdjacentHTML('afterend',
      `<label style="margin-top:8px">Custom test name<input id="customName" required/></label>`); }
    if (o.dataset.price) price.value = Number(o.dataset.price).toFixed(2);
  });
  document.getElementById('lform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('#saveBtn');
    btn.disabled = true;
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    if (body.test_name === '__custom') body.test_name = document.getElementById('customName')?.value || '';
    try {
      await App.api('/api/lab-tests', { method:'POST', body });
      App.closeModal();
      App.toast('Test ordered', 'ok');
      App.go('laboratory');
    } catch (err) { App.toast(err.message, 'err'); btn.disabled = false; }
  });
}

function openUpdate(l) {
  App.openModal(`Update: ${l.test_name}`, `
    <form id="uform" class="form">
      <label>Status<select name="status">
        ${['pending','in_progress','completed'].map(s=>`<option value="${s}" ${l.status===s?'selected':''}>${s.replace('_',' ')}</option>`).join('')}
      </select></label>
      <label>Results<textarea name="results">${App.escape(l.results||'')}</textarea></label>
      <label>Notes<textarea name="notes">${App.escape(l.notes||'')}</textarea></label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
        <button type="submit" class="btn btn-primary" id="saveBtn">Save</button>
      </div>
    </form>`);
  document.getElementById('uform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('#saveBtn');
    btn.disabled = true;
    const body = Object.fromEntries(new FormData(e.target));
    try {
      await App.api(`/api/lab-tests/${l.id}`, { method:'PUT', body });
      App.closeModal();
      App.toast('Updated', 'ok');
      App.go('laboratory');
    } catch (err) { App.toast(err.message, 'err'); btn.disabled = false; }
  });
}
})();
