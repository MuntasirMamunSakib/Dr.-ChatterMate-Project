// public/js/visits.js
(function () {
App.register('visits', async (view, params) => {
  if (params && params[0] === 'new') return openNew(view, new URLSearchParams(location.hash.split('?')[1] || ''));
  if (params && params[0]) return openDetail(view, params[0]);
  await renderList(view);
});

async function renderList(view) {
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Visits & Prescriptions</h1><div class="page-sub">Recent consultations</div></div>
      <a class="btn btn-primary" href="#/visits/new">+ Record visit</a>
    </div>
    <div id="list"></div>`;
  const rows = await App.api('/api/visits');
  const list = view.querySelector('#list');
  if (!rows.length) { list.innerHTML = `<div class="card empty"><h3>No visits yet</h3></div>`; return; }
  list.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Patient</th><th>Doctor</th><th>Reason</th><th>Fee</th><th></th></tr></thead>
    <tbody>${rows.map(v=>`<tr>
      <td>${App.fmtDate(v.visit_date)}</td>
      <td><a href="#/patients/${v.patient_id}">${App.escape(v.patient_name)}</a>
        <div class="feed-meta">${App.escape(v.patient_code)}</div></td>
      <td>${App.escape(v.doctor_name)}<div class="feed-meta">${App.escape(v.specialty)}</div></td>
      <td>${App.escape(v.reason||'—')}</td>
      <td>${App.fmtMoney(v.consultation_fee_cents)}</td>
      <td><a class="btn btn-ghost btn-sm" href="#/visits/${v.id}">Open</a></td>
    </tr>`).join('')}</tbody></table></div>`;
}

async function openNew(view, q) {
  const [patients, doctors] = await Promise.all([
    App.api('/api/patients'),
    App.api('/api/doctors')
  ]);
  const preselect = q ? q.get('patient') : null;
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Record visit</h1><div class="page-sub">Create a consultation and optional prescription</div></div>
      <a class="btn btn-ghost" href="#/visits">← Back</a>
    </div>
    <div class="card" style="max-width:820px">
      <form id="vform" class="form">
        <div class="form-row">
          <label>Patient<select name="patient_id" required>
            <option value="">— Select patient —</option>
            ${patients.map(p=>`<option value="${p.id}" ${String(p.id)===String(preselect)?'selected':''}>${App.escape(p.full_name)} (${App.escape(p.patient_code)})</option>`).join('')}
          </select></label>
          <label>Doctor<select name="doctor_id" id="docSel" required>
            <option value="">— Select doctor —</option>
            ${doctors.filter(d=>d.is_active).map(d=>`<option value="${d.id}" data-fee="${d.consultation_fee_cents}">${App.escape(d.full_name)} — ${App.escape(d.specialty)}</option>`).join('')}
          </select></label>
        </div>
        <div class="form-row">
          <label>Visit date<input name="visit_date" type="datetime-local" value="${new Date().toISOString().slice(0,16)}"/></label>
          <label>Consultation fee (BDT)<input name="consultation_fee" id="feeInp" type="number" min="0" step="0.01" value="0"/></label>
        </div>
        <label>Reason<input name="reason" placeholder="e.g. Fever and cough for 3 days"/></label>
        <div class="form-row">
          <label>Diagnosis<textarea name="diagnosis"></textarea></label>
          <label>Treatment<textarea name="treatment"></textarea></label>
        </div>
        <label>Notes<textarea name="notes"></textarea></label>

        <h3 class="section-title" style="margin-top:8px">Prescription (optional)</h3>
        <div id="rxList"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="addRx">+ Add medication</button>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <a href="#/visits" class="btn btn-ghost">Cancel</a>
          <button type="submit" class="btn btn-primary" id="saveBtn">Save visit</button>
        </div>
      </form>
    </div>`;
  const docSel = view.querySelector('#docSel');
  const feeInp = view.querySelector('#feeInp');
  docSel.addEventListener('change', () => {
    const o = docSel.selectedOptions[0];
    if (o?.dataset.fee) feeInp.value = (Number(o.dataset.fee) / 100).toFixed(2);
  });
  const rxList = view.querySelector('#rxList');
  const addRx = () => {
    const idx = rxList.children.length;
    const row = document.createElement('div');
    row.className = 'form-row';
    row.innerHTML = `
      <label>Medication<input name="rx_med_${idx}" placeholder="e.g. Paracetamol 500mg"/></label>
      <label>Dosage · Frequency · Duration · Instructions
        <input name="rx_meta_${idx}" placeholder="1 tab · 3x/day · 5 days · After meals"/></label>`;
    rxList.appendChild(row);
  };
  view.querySelector('#addRx').addEventListener('click', addRx);

  view.querySelector('#vform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = view.querySelector('#saveBtn');
    btn.disabled = true;
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    body.visit_date = body.visit_date ? body.visit_date.replace('T', ' ') + ':00' : null;
    const prescriptions = [];
    for (let i = 0; i < rxList.children.length; i++) {
      const med = fd.get(`rx_med_${i}`);
      if (!med) continue;
      const meta = (fd.get(`rx_meta_${i}`) || '').split('·').map(s=>s.trim());
      prescriptions.push({ medication: med, dosage: meta[0]||'', frequency: meta[1]||'', duration: meta[2]||'', instructions: meta[3]||'' });
    }
    body.prescriptions = prescriptions;
    try {
      await App.api('/api/visits', { method:'POST', body });
      App.toast('Visit recorded', 'ok');
      location.hash = '#/visits';
    } catch (err) { App.toast(err.message, 'err'); btn.disabled = false; }
  });
}

async function openDetail(view, id) {
  const { visit, prescriptions } = await App.api(`/api/visits/${id}`);
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Visit · ${App.fmtDate(visit.visit_date)}</h1>
        <div class="page-sub">${App.escape(visit.patient_name)} with ${App.escape(visit.doctor_name)} (${App.escape(visit.specialty)})</div></div>
      <a class="btn btn-ghost" href="#/visits">← Back</a>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 class="section-title">Clinical</h3>
        <dl class="kv">
          <dt>Reason</dt><dd>${App.escape(visit.reason||'—')}</dd>
          <dt>Diagnosis</dt><dd>${App.escape(visit.diagnosis||'—')}</dd>
          <dt>Treatment</dt><dd>${App.escape(visit.treatment||'—')}</dd>
          <dt>Notes</dt><dd>${App.escape(visit.notes||'—')}</dd>
          <dt>Fee</dt><dd>${App.fmtMoney(visit.consultation_fee_cents)}</dd>
        </dl>
      </div>
      <div class="card">
        <h3 class="section-title">Prescription (${prescriptions.length})</h3>
        ${prescriptions.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Notes</th></tr></thead>
          <tbody>${prescriptions.map(r=>`<tr>
            <td><b>${App.escape(r.medication)}</b></td>
            <td>${App.escape(r.dosage||'—')}</td>
            <td>${App.escape(r.frequency||'—')}</td>
            <td>${App.escape(r.duration||'—')}</td>
            <td>${App.escape(r.instructions||'—')}</td>
          </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No medications prescribed.</div>'}
        <div class="feed-meta" style="margin-top:10px">This application does not provide medical diagnosis and is not a substitute for professional judgment.</div>
      </div>
    </div>`;
}
})();
