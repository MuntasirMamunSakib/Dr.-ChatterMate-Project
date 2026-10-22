// public/js/billing.js
App.register('billing', async (view, params) => {
  if (params && params[0]) return openBill(view, params[0]);
  const rows = await App.api('/api/bills');
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Billing & Payments</h1><div class="page-sub">
        Patient invoices, balances, and payments — Cash, Card, or bKash</div></div>
    </div>
    ${rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Bill</th><th>Patient</th><th>Date</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(b=>`<tr>
        <td><b>#${b.id}</b></td>
        <td><a href="#/patients/${b.patient_id}">${App.escape(b.patient_name)}</a></td>
        <td>${App.fmtDate(b.bill_date)}</td>
        <td>${App.fmtMoney(b.total_cents)}</td>
        <td>${App.fmtMoney(b.paid_cents)}</td>
        <td>${App.fmtMoney(Math.max(0, b.total_cents - b.paid_cents))}</td>
        <td><span class="badge badge-${b.status}">${b.status}</span></td>
        <td><a class="btn btn-ghost btn-sm" href="#/billing/${b.id}">Open</a></td>
      </tr>`).join('')}</tbody></table></div>` : `<div class="card empty"><h3>No bills yet</h3></div>`}`;
});

async function openBill(view, id) {
  view.innerHTML = '<div class="loader">Loading</div>';
  const data = await App.api(`/api/bills/${id}`);
  const b = data.bill;
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Bill #${b.id}</h1><div class="page-sub">${App.escape(b.patient_name)} · ${App.fmtDate(b.bill_date)}</div></div>
      <a class="btn btn-ghost" href="#/billing">← All bills</a>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 class="section-title">Items</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Type</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${data.items.map(i=>`<tr>
            <td><span class="badge">${i.item_type}</span></td>
            <td>${App.escape(i.description)}</td>
            <td style="text-align:right">${App.fmtMoney(i.amount_cents)}</td>
          </tr>`).join('')}</tbody>
          <tfoot>
            <tr><td colspan="2">Total</td><td style="text-align:right">${App.fmtMoney(b.total_cents)}</td></tr>
            <tr><td colspan="2">Paid</td><td style="text-align:right">${App.fmtMoney(data.paid_cents)}</td></tr>
            <tr><td colspan="2">Outstanding</td><td style="text-align:right"><b>${App.fmtMoney(data.outstanding_cents)}</b></td></tr>
          </tfoot>
        </table></div>
      </div>
      <div class="card">
        <h3 class="section-title">Record payment</h3>
        <p class="feed-meta">Enter the amount received and the payment method used at the counter.</p>
        ${data.outstanding_cents > 0 ? `
        <form id="payForm" class="form">
          <div class="form-row">
            <label>Method<select name="method" required>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bkash">bKash</option>
            </select></label>
            <label>Amount (BDT)<input name="amount" type="number" min="0.01" step="0.01" max="${(data.outstanding_cents/100).toFixed(2)}" value="${(data.outstanding_cents/100).toFixed(2)}" required/></label>
          </div>
          <button type="submit" class="btn btn-primary" id="payBtn">Record payment</button>
        </form>` : '<div class="pill pill-ok" style="margin-top:8px">Fully paid</div>'}

        <h3 class="section-title" style="margin-top:16px">Payment history</h3>
        ${data.payments.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Method</th><th>Amount</th><th>Receipt</th></tr></thead>
          <tbody>${data.payments.map(p=>`<tr>
            <td>${App.fmtDate(p.payment_date)}</td>
            <td>${App.escape(p.method)}</td>
            <td>${App.fmtMoney(p.amount_cents)}</td>
            <td class="feed-meta">${App.escape(p.reference||'')}</td>
          </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No payments yet</div>'}
      </div>
    </div>`;
  const form = document.getElementById('payForm');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('#payBtn');
    btn.disabled = true;
    const body = Object.fromEntries(new FormData(form));
    body.bill_id = b.id;
    try {
      const r = await App.api('/api/payments', { method:'POST', body });
      App.toast(`Payment recorded · receipt ${r.reference}`, 'ok');
      App.go('billing', [String(b.id)]);
    } catch (err) { App.toast(err.message, 'err'); btn.disabled = false; }
  });
}