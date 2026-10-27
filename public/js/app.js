// public/js/app.js
window.App = (function () {
  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: iconFor('dashboard') },
    { id: 'patients', label: 'Patients', icon: iconFor('patients') },
    { id: 'doctors', label: 'Doctors', icon: iconFor('doctors') },
    { id: 'visits', label: 'Visits & Rx', icon: iconFor('visits') },
    { id: 'laboratory', label: 'Laboratory', icon: iconFor('lab') },
    { id: 'billing', label: 'Billing & Payments', icon: iconFor('billing') },
    { id: 'reports', label: 'Reports', icon: iconFor('reports') },
    { id: 'assistant', label: 'AI Report Assistant', icon: iconFor('ai') },
    { id: 'settings', label: 'Settings', icon: iconFor('settings') }
  ];
  const views = {}; // populated by each view module
  const register = (id, fn) => views[id] = fn;

  function iconFor(k) {
    const paths = {
      dashboard: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z',
      patients: 'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z',
      doctors: 'M12 2a3 3 0 0 1 3 3v2a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm-7 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2z',
      visits: 'M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v16h18V5a2 2 0 0 0-2-2zm0 18H5V8h14z',
      lab: 'M9 2v6L4 20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2L15 8V2zm2 2h2v4h-2z',
      billing: 'M4 4h16v4H4zm0 6h16v10H4zm2 3h6v2H6z',
      reports: 'M3 3h18v2H3zm2 4h14v2H5zm0 4h14v2H5zm0 4h10v2H5zm0 4h14v2H5z',
      ai: 'M12 2a7 7 0 0 0-7 7v3H4v4h3v4h10v-4h3v-4h-1V9a7 7 0 0 0-7-7zm-3 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
      settings: 'M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-.9-2 3.4L4.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 1.7-1l2.4.9 2-3.4zM12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6z'
    };
    return `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="${paths[k] || paths.dashboard}"/></svg>`;
  }

  // ------- API helper -------
  async function api(path, opts = {}) {
    const o = { method: 'GET', headers: {}, ...opts };
    if (o.body && typeof o.body !== 'string') {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(o.body);
    }
    const res = await fetch(path, o);
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const msg = data?.error || `Request failed (HTTP ${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  // ------- Toasts & modal -------
  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
  function openModal(title, bodyHtml) {
    const m = document.getElementById('modal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    m.hidden = false;
  }
  function closeModal() { document.getElementById('modal').hidden = true; }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-modal]') || e.target.id === 'modal') {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ------- Formatters -------
  const fmtMoney = (cents) => {
    const n = (cents || 0) / 100;
    return '৳ ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const fmtDate = (s) => s ? new Date(s.replace(' ', 'T')).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const fmtDay = (s) => s ? new Date(s.replace(' ', 'T')).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------- Router -------
  function renderNav() {
    const navEl = document.getElementById('nav');
    navEl.innerHTML = nav.map(n =>
      `<a href="#/${n.id}" data-view="${n.id}">${n.icon}<span>${n.label}</span></a>`
    ).join('');
  }

  async function go(id, params) {
    document.querySelectorAll('#nav a').forEach(a =>
      a.classList.toggle('active', a.dataset.view === id));
    const item = nav.find(n => n.id === id);
    document.getElementById('crumbs').innerHTML =
      `<span>Dr. ChatterMate</span> &nbsp;/&nbsp; <b>${item ? item.label : 'Dashboard'}</b>`;
    const view = document.getElementById('view');
    view.innerHTML = '<div class="loader">Loading</div>';
    try {
      if (views[id]) await views[id](view, params);
      else view.innerHTML = `<div class="empty"><h3>Not found</h3></div>`;
    } catch (e) {
      view.innerHTML = `<div class="empty"><h3>Something went wrong</h3><p>${escape(e.message)}</p></div>`;
    }
    document.querySelector('.sidebar')?.classList.remove('open');
  }

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [id, ...rest] = h.split('/');
    return { id: id || 'dashboard', params: rest };
  }

  function start() {
    renderNav();
    document.getElementById('menuBtn')?.addEventListener('click', () =>
      document.querySelector('.sidebar').classList.toggle('open'));
    window.addEventListener('hashchange', () => {
      const { id, params } = parseHash();
      go(id, params);
    });
    const { id, params } = parseHash();
    go(id, params);
    checkAI();
  }

  const AI_KEY_STORAGE = 'dr_chattermate_api_key';
  const getAiApiKey = () => {
    try { return (localStorage.getItem(AI_KEY_STORAGE) || '').trim(); }
    catch { return ''; }
  };
  const setAiApiKey = (key) => {
    const v = String(key || '').trim();
    if (v) localStorage.setItem(AI_KEY_STORAGE, v);
    else localStorage.removeItem(AI_KEY_STORAGE);
  };
  const clearAiApiKey = () => localStorage.removeItem(AI_KEY_STORAGE);

  async function checkAI() {
    try {
      const body = { question: 'ping' };
      const key = getAiApiKey();
      if (key) body.apiKey = key;
      const r = await api('/api/ai/report-chat', { method: 'POST', body });
      const el = document.getElementById('aiStatus');
      if (r.configured) { el.className = 'pill pill-ok'; el.textContent = 'AI: ready'; }
      else { el.className = 'pill pill-warn'; el.textContent = 'AI: not configured'; }
    } catch {
      const el = document.getElementById('aiStatus');
      el.className = 'pill pill-warn'; el.textContent = 'AI: offline';
    }
  }

  return {
    start, go, register, api, toast, openModal, closeModal,
    fmtMoney, fmtDate, fmtDay, todayISO, escape,
    getAiApiKey, setAiApiKey, clearAiApiKey, checkAI
  };
})();