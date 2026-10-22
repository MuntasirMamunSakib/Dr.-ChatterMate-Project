// public/js/assistant.js
(function () {
App.register('assistant', async (view) => {
  view.innerHTML = `
    <div class="page-head">
      <div><h1>AI Report Assistant</h1>
        <div class="page-sub">Powered by the ChatterMate API · Answers only use live SQLite report data</div></div>
    </div>
    <div class="chat-shell">
      <div class="chat-log" id="log">
        <div class="msg msg-ai"><b>Hello</b> I'm Dr. ChatterMate, your reporting assistant. Ask about collections, who owes money, new patients, doctors, and lab tests — strictly from your real database.</div>
        <div class="suggest" id="chips">
          ${['How much money did we collect today?',
             'Who still owes money?',
             'How many new patients came this week?',
             'How much came from consultations vs lab tests?',
             'Which doctor had the most visits?',
             'How many lab tests are still pending?',
             'What is the total outstanding balance?'].map(q =>
            `<button class="chip">${q}</button>`).join('')}
        </div>
      </div>
      <form class="chat-input" id="chatForm">
        <input id="qInp" placeholder="Ask about collections, patients, visits, or lab tests…" required/>
        <button class="btn btn-primary" id="sendBtn">Send</button>
      </form>
    </div>`;

  const log = view.querySelector('#log');
  const form = view.querySelector('#chatForm');
  const inp = view.querySelector('#qInp');
  const chips = view.querySelector('#chips');

  function append(role, text, pending=false){
    const el = document.createElement('div');
    el.className = `msg msg-${role}`;
    el.innerHTML = pending ? `<span class="dots">Thinking</span>` : renderMarkdown(text);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  // Minimal, safe Markdown: escape first, then re-enable **bold**, line breaks.
  function renderMarkdown(src) {
    const esc = String(src).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return esc
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\n- /g, '<br>• ')
      .replace(/\n/g, '<br>');
  }

  async function ask(question) {
    chips?.remove();
    append('user', question);
    inp.value = '';
    const btn = form.querySelector('#sendBtn');
    btn.disabled = true;
    const pending = append('ai', '', true);
    try {
      const r = await App.api('/api/ai/report-chat', {
        method: 'POST',
        body: { question }
      });
      pending.remove();
      if (!r.configured) {
        append('sys', r.message || 'ChatterMate is not configured on the server.');
      } else if (!r.answer) {
        append('sys', r.message || 'No answer available right now.');
      } else {
        append('ai', r.answer);
      }
    } catch (e) {
      pending.remove();
      append('sys', `Request failed: ${e.message}`);
    } finally { btn.disabled = false; inp.focus(); }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); if (inp.value.trim()) ask(inp.value.trim()); });
  chips?.addEventListener('click', (e) => {
    if (e.target.classList.contains('chip')) ask(e.target.textContent);
  });
});
})();
