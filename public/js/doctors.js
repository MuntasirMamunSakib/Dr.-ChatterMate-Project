// public/js/doctors.js
(function () {
App.register('doctors', async (view) => {
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Doctors</h1><div class="page-sub">Directory of practising clinicians</div></div>
      <button class="btn btn-primary" id="newBtn">+ Add doctor</button>
    </div>
    <div class="toolbar">
      <div class="search">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.49-1.49zM10 14a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/></svg>
        <input id="q" type="search" placeholder="Search by name, specialty, or ID…"/>
      </div>
    </div>
    <div id="list"></div>`;
  const list = view.querySelector('#list');
  const q = view.querySelector('#q');
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => load(q.value), 180); });
  view.querySelector('#newBtn').addEventListener('click', () => openForm());

  async function load(query = '') {
    list.innerHTML = '<div class="loader">Loading</div>';
    const rows = await App.api('/api/doctors' + (query ? `?q=${encodeURIComponent(query)}` : ''));
    if (!rows.length) { list.innerHTML = `<div class="card empty"><h3>No doctors found</h3></div>`; return; }
    list.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Name</th><th>Specialty</th><th>Fee</th><th>Schedule</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(d => `<tr>
        <td><b>${App.escape(d.doctor_code)}</b></td>
        <td>${App.escape(d.full_name)}<div class="feed-meta">${App.escape(d.email || '')}</div></td>
        <td>${App.escape(d.specialty)}</td>
        <td>${App.fmtMoney(d.consultation_fee_cents)}</td>
        <td>${App.escape(d.schedule || '—')}</td>
        <td><span class="badge badge-${d.is_active ? 'active' : 'unpaid'}">${d.is_active ? 'Active' : 'Inactive'}</span></td>
        <td><button class="btn btn-ghost btn-sm" data-id="${d.id}">Edit</button></td>
      </tr>`).join('')}</tbody></table></div>`;
    list.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () =>
      openForm(rows.find(r => r.id == b.dataset.id))));
  }
  load();
});

function openForm(existing) {
  const d = existing || { is_active: 1, consultation_fee_cents: 0 };
  App.openModal(existing ? 'Edit doctor' : 'Add doctor', `
    <form id="dform" class="form">
      <div class="form-row">
        <label>Full name<input name="full_name" required value="${App.escape(d.full_name || '')}"/></label>
        <label>Specialty<input name="specialty" required value="${App.escape(d.specialty || '')}"/></label>
      </div>
      <div class="form-row">
        <label>Phone<input name="phone" value="${App.escape(d.phone || '')}"/></label>
        <label>Email<input name="email" type="email" value="${App.escape(d.email || '')}"/></label>
      </div>
      <div class="form-row">
        <label>Consultation fee (BDT)<input name="consultation_fee" type="number" min="0" step="0.01" value="${(d.consultation_fee_cents / 100).toFixed(2)}"/></label>
        <label>Schedule<input name="schedule" value="${App.escape(d.schedule || '')}" placeholder="Mon-Fri 09:00-17:00"/></label>
      </div>
      <label><input type="checkbox" name="is_active" ${d.is_active ? 'checked' : ''}/> Active</label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
        <button type="submit" class="btn btn-primary" id="saveBtn">${existing ? 'Save changes' : 'Add doctor'}</button>
      </div>
    </form>`);
  const form = document.getElementById('dform');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('#saveBtn');
    btn.disabled = true;
    const fd = new FormData(form);
    const body = Object.fromEntries(fd);
    body.is_active = fd.get('is_active') === 'on';
    try {
      if (existing) await App.api(`/api/doctors/${existing.id}`, { method: 'PUT', body });
      else await App.api('/api/doctors', { method: 'POST', body });
      App.closeModal();
      App.toast('Doctor saved', 'ok');
      App.go('doctors');
    } catch (err) { App.toast(err.message, 'err'); btn.disabled = false; }
  });
}
})();
