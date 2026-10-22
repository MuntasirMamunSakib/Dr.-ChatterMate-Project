// public/js/settings.js
(function () {
App.register('settings', async (view) => {
  view.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1>
      <div class="page-sub">Application info and demo data controls</div></div></div>
    <div class="grid-2">
      <div class="card">
        <h3 class="section-title">Application</h3>
        <dl class="kv">
          <dt>Name</dt><dd>Dr. ChatterMate</dd>
          <dt>Version</dt><dd>1.0.0</dd>
          <dt>Database</dt><dd>SQLite · dr-chattermate.db</dd>
          <dt>Server</dt><dd>Node.js http (no framework)</dd>
          <dt>AI</dt><dd>ChatterMate API (server-side only)</dd>
        </dl>
      </div>
      <div class="card">
        <h3 class="section-title">Demo data</h3>
        <p class="page-sub" style="margin-bottom:14px">
          Wipe the database or reload fictional demo patients, doctors, visits, labs, and bills.
          Both actions are destructive — you will be asked to confirm.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          <button type="button" class="btn btn-danger" id="resetBtn">Reset all data</button>
          <button type="button" class="btn btn-primary" id="regenBtn">Regenerate demo data</button>
        </div>
        <p class="feed-meta" style="margin-top:12px">
          Reset clears every record and leaves an empty database.
          Regenerate clears everything, then seeds ~50 patients, 5 doctors, and a month of activity.
        </p>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 class="section-title">Security notes</h3>
      <ul style="margin:0;padding-left:18px;color:var(--muted);font-size:13px;line-height:1.7">
        <li>The ChatterMate API key is stored in <b>.env</b> and never sent to the browser.</li>
        <li>Payments are <b>simulated</b> — no real card, bank, or bKash service is ever contacted.</li>
        <li>All seeded patient data is <b>fictional</b>.</li>
        <li>The AI assistant cannot execute SQL and only sees pre-computed report summaries.</li>
      </ul>
    </div>`;

  function confirmAction({ title, blurb, endpoint, successMsg }) {
    App.openModal(title, `
      <form id="confirmForm" class="form">
        <p class="page-sub" style="margin:0 0 12px">${blurb}</p>
        <label>Type <b>RESET</b> to confirm
          <input name="confirm" autocomplete="off" required placeholder="RESET"/>
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
          <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn-danger" id="confirmBtn">Confirm</button>
        </div>
      </form>`);
    const form = document.getElementById('confirmForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('#confirmBtn');
      btn.disabled = true;
      const confirm = new FormData(form).get('confirm');
      try {
        await App.api(endpoint, { method: 'POST', body: { confirm } });
        App.closeModal();
        App.toast(successMsg, 'ok');
      } catch (err) {
        App.toast(err.message, 'err');
        btn.disabled = false;
      }
    });
  }

  view.querySelector('#resetBtn').addEventListener('click', () => confirmAction({
    title: 'Reset all data',
    blurb: 'This permanently deletes all patients, doctors, visits, lab tests, bills, and payments. The database will be empty afterward.',
    endpoint: '/api/settings/reset-data',
    successMsg: 'All data wiped'
  }));

  view.querySelector('#regenBtn').addEventListener('click', () => confirmAction({
    title: 'Regenerate demo data',
    blurb: 'This permanently deletes current data, then loads fictional demo patients, doctors, and activity.',
    endpoint: '/api/settings/regenerate-demo',
    successMsg: 'Demo data regenerated'
  }));
});
})();
