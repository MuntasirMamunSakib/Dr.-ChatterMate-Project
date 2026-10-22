// public/js/dashboard.js
App.register('dashboard', async (view) => {
  const d = await App.api('/api/dashboard');
  const s = d.stats;
  const stat = (label, value, hint) => `
    <div class="card stat">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      ${hint ? `<div class="stat-trend">${hint}</div>` : ''}
    </div>`;

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <div class="page-sub">Today — ${new Date().toLocaleDateString(undefined,{dateStyle:'full'})}</div>
      </div>
    </div>

    <div class="cards">
      ${stat('Total Patients', s.total_patients)}
      ${stat('Patients Today', s.patients_today)}
      ${stat('Visits Today', s.visits_today)}
      ${stat('Collected Today', App.fmtMoney(s.collected_today_cents))}
      ${stat('Outstanding', App.fmtMoney(s.outstanding_cents), 'across all unpaid bills')}
      ${stat('Lab Pending', s.lab_pending)}
      ${stat('Lab Completed', s.lab_completed)}
    </div>

    <div class="grid-2">
      <div class="card">
        <h3 class="section-title">Patient visits — last 14 days</h3>
        <div class="chart-wrap">${lineChart(d.visit_trend, 'c', '#10b981')}</div>
      </div>
      <div class="card">
        <h3 class="section-title">Revenue collected — last 14 days</h3>
        <div class="chart-wrap">${lineChart(d.revenue_trend, 'v', '#0f766e', true)}</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3 class="section-title">Recent activity</h3>
        <div class="feed">${feed(d.recent_activity)}</div>
      </div>
      <div class="card">
        <h3 class="section-title">Shortcuts</h3>
        <div class="shortcuts">
          ${shortcut('patients','Register patient','M12 5v14M5 12h14')}
          ${shortcut('visits','Record visit','M4 7h16M4 12h16M4 17h10')}
          ${shortcut('billing','Create bill','M4 4h16v4H4zm0 6h16v10H4z')}
          ${shortcut('reports','View reports','M3 3h18v2H3zm2 4h14v2H5zm0 4h14v2H5z')}
        </div>
        <h3 class="section-title" style="margin-top:18px">Lab status</h3>
        <div class="chart-wrap" style="height:150px">${donut(d.lab_distribution)}</div>
      </div>
    </div>
  `;
});

function feed(rows){
  if (!rows.length) return `<div class="empty">No recent activity</div>`;
  return rows.map(r => {
    const kindLabel = { visit:'Visit', payment:'Payment', lab:'Lab' }[r.kind] || r.kind;
    const detail = r.kind === 'payment' ? `৳ ${r.detail} via <b>${App.escape(r.actor)}</b>` :
      r.kind === 'lab' ? `${App.escape(r.detail)} — <b>${App.escape(r.actor)}</b>` :
      `with <b>${App.escape(r.actor)}</b> — ${App.escape(r.detail || '')}`;
    return `<div class="feed-row">
      <div class="feed-dot ${r.kind}"></div>
      <div class="feed-main">
        <div><b>${kindLabel}</b> · ${App.escape(r.patient)}</div>
        <div class="feed-meta">${detail} · ${App.fmtDate(r.ts)}</div>
      </div>
    </div>`;
  }).join('');
}

function shortcut(view, label, pathD){
  return `<a class="shortcut" href="#/${view}">
    <div class="shortcut-icon"><svg viewBox="0 0 24 24" width="18" height="18"><path d="${pathD}" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></div>
    <div>${label}</div>
  </a>`;
}

function lineChart(rows, valueKey, color, money){
  if (!rows.length) return `<div class="empty">No data</div>`;
  const W = 600, H = 220, PAD = 32;
  const days = rows.map(r => r.day);
  const vals = rows.map(r => Number(r[valueKey]) || 0);
  const max = Math.max(...vals, 1);
  const stepX = (W - PAD*2) / Math.max(1, vals.length - 1);
  const points = vals.map((v, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - (v / max) * (H - PAD*2);
    return [x, y];
  });
  const path = points.map((p,i)=> (i===0?'M':'L') + p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const area = `${path} L${points[points.length-1][0].toFixed(1)},${H-PAD} L${points[0][0].toFixed(1)},${H-PAD} Z`;
  const yTicks = [0, max*0.5, max].map(v => {
    const y = H - PAD - (v / max) * (H - PAD*2);
    return `<line x1="${PAD}" y1="${y}" x2="${W-PAD}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="2,3"/>
            <text x="4" y="${y+3}" font-size="10" fill="#94a3b8">${money?('৳'+Math.round(v/100)):Math.round(v)}</text>`;
  }).join('');
  const xLabels = days.map((d, i) => {
    if (i % Math.ceil(days.length/6) !== 0 && i !== days.length-1) return '';
    const x = PAD + i * stepX;
    const label = d.slice(5);
    return `<text x="${x}" y="${H-10}" font-size="10" text-anchor="middle" fill="#94a3b8">${label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="g${valueKey}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".3"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${yTicks}
    <path d="${area}" fill="url(#g${valueKey})"/>
    <path d="${path}" stroke="${color}" stroke-width="2" fill="none"/>
    ${points.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="${color}"/>`).join('')}
    ${xLabels}
  </svg>`;
}

function donut(rows){
  const total = rows.reduce((s,r)=>s+r.c, 0) || 1;
  const colors = { pending:'#f59e0b', in_progress:'#3b82f6', completed:'#10b981' };
  const labels = { pending:'Pending', in_progress:'In progress', completed:'Completed' };
  let a0 = -Math.PI/2;
  const R = 55, CX = 90, CY = 75;
  const arcs = rows.map(r => {
    const a1 = a0 + (r.c/total) * Math.PI*2;
    const x0 = CX + R*Math.cos(a0), y0 = CY + R*Math.sin(a0);
    const x1 = CX + R*Math.cos(a1), y1 = CY + R*Math.sin(a1);
    const large = (a1-a0) > Math.PI ? 1 : 0;
    const d = `M${CX},${CY} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`;
    a0 = a1;
    return `<path d="${d}" fill="${colors[r.status]||'#94a3b8'}" stroke="#fff" stroke-width="2"/>`;
  }).join('');
  const legend = rows.map(r => `<div class="legend-item">
    <span class="legend-dot" style="background:${colors[r.status]||'#94a3b8'}"></span>
    ${labels[r.status]||r.status}: <b>${r.c}</b></div>`).join('');
  return `<div style="display:flex;gap:16px;align-items:center">
    <svg viewBox="0 0 180 150" width="180" height="150">${arcs}
      <circle cx="${CX}" cy="${CY}" r="30" fill="#fff"/>
      <text x="${CX}" y="${CY-2}" text-anchor="middle" font-size="11" fill="#64748b">Total</text>
      <text x="${CX}" y="${CY+14}" text-anchor="middle" font-size="18" font-weight="700" fill="#0f172a">${total}</text>
    </svg>
    <div class="legend" style="flex-direction:column;align-items:flex-start">${legend}</div>
  </div>`;
}