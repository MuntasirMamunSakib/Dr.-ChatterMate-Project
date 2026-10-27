// public/js/settings.js
(function () {
App.register('settings', async (view) => {
  const savedKey = App.getAiApiKey();
  const hasKey = !!savedKey;
  view.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1>
      <div class="page-sub">Application info, AI key, and demo data controls</div></div></div>

    <div class="card" style="margin-bottom:16px">
      <h3 class="section-title">AI Report Assistant</h3>
      <p class="page-sub" style="margin-bottom:12px">
        Paste a ChatterMate API key to try the assistant without a <b>.env</b> file.
        The key is stored only in this browser (localStorage) and is sent with AI requests.
      </p>
      <form id="aiKeyForm" class="form">
        <label>ChatterMate API key
          <input id="apiKeyInp" name="apiKey" type="password" autocomplete="off"
            placeholder="${hasKey ? '••••••••  (key saved in this browser)' : 'cm_… or your ChatterMate API key'}"
            value=""/>
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
          <button type="submit" class="btn btn-primary" id="saveKeyBtn">Save key</button>
          <button type="button" class="btn btn-ghost" id="clearKeyBtn" ${hasKey ? '' : 'disabled'}>Clear saved key</button>
        </div>
        <p class="feed-meta" id="keyStatus" style="margin-top:10px">
          ${hasKey
            ? 'A key is saved in this browser. The assistant will use it.'
            : 'No browser key saved. The server .env key will be used if one exists.'}
        </p>
      </form>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3 class="section-title">Application</h3>
        <dl class="kv">
          <dt>Name</dt><dd>Dr. ChatterMate</dd>
          <dt>Version</dt><dd>1.0.0</dd>
          <dt>Database</dt><dd>SQLite · dr-chattermate.db</dd>
          <dt>Server</dt><dd>Node.js http (no framework)</dd>
          <dt>AI</dt><dd>ChatterMate API</dd>
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
        <li>Optional server key: <b>CHATTERMATE_API_KEY</b> in <b>.env</b> (never commit this file).</li>
        <li>Optional browser key: saved in localStorage via Settings (for judges / local demos).</li>
        <li>Payments are recorded in-app — no real card, bank, or bKash service is contacted.</li>
        <li>All seeded patient data is <b>fictional</b>.</li>
        <li>The AI assistant cannot execute SQL and only sees pre-computed report summaries.</li>
      </ul>
    </div>`;

  const form = view.querySelector('#aiKeyForm');
  const inp = view.querySelector('#apiKeyInp');
  const clearBtn = view.querySelector('#clearKeyBtn');
  const status = view.querySelector('#keyStatus');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = inp.value.trim();
    if (!key) {
      App.toast('Paste an API key first, or use Clear to remove the saved one', 'err');
      return;
    }
    App.setAiApiKey(key);
    inp.value = '';
    inp.placeholder = '••••••••  (key saved in this browser)';
    clearBtn.disabled = false;
    status.textContent = 'A key is saved in this browser. The assistant will use it.';
    App.toast('API key saved in this browser', 'ok');
    App.checkAI();
  });

  clearBtn.addEventListener('click', () => {
    App.clearAiApiKey();
    inp.value = '';
    inp.placeholder = 'cm_… or your ChatterMate API key';
    clearBtn.disabled = true;
    status.textContent = 'No browser key saved. The server .env key will be used if one exists.';
    App.toast('Saved API key cleared', 'ok');
    App.checkAI();
  });

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
    const confirmForm = document.getElementById('confirmForm');
    confirmForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = confirmForm.querySelector('#confirmBtn');
      btn.disabled = true;
      const confirm = new FormData(confirmForm).get('confirm');
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
