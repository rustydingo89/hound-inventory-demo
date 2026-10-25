'use strict';
/* Orders: PO drafts from PAID invoices -> review -> typed confirm -> DRY RUN (logs the exact masked request; sends nothing).
   There is deliberately no live path here: the live switch is disabled and labelled "Not enabled - needs owner approval". */
(() => {
const root = () => $('#ordersroot');
const LV = {ok: ['✓', 'good'], warn: ['!', 'warn'], block: ['✕', 'bad'], danger: ['⚠', 'bad']};
const ago2 = ts => ts ? ago(ts) : '—';
let SET = null, LIVE = null;

window.loadOrders = async function (arg) {
  arg = arg || '';
  if (arg.startsWith('PO-')) return review(arg.split('?')[0]);
  const d = await api('./api/po/list'); SET = d.settings; LIVE = d.live;
  const gid = arg.startsWith('new') ? new URLSearchParams(arg.split('?')[1] || '').get('gid') : '';
  root().innerHTML = `
  <div class="filters open"><b class="sh">Orders</b><span class="chip warn">DRY RUN ONLY</span><span class="grow"></span>
    <a class="pill" href="#/orders/log" id="o-logbtn">Dry-run log</a></div>
  <div class="panel obanner">Nothing on this page can place an order. A dry run writes the exact request it <i>would</i> send (credentials masked) to <span class="mono">orders.jsonl</span>.
    Live ordering: <label class="lsw" title="${esc(LIVE.label)}"><input type="checkbox" disabled><span></span></label> <b>${esc(LIVE.label)}</b></div>
  ${arg === 'log' ? '<div id="o-log"></div>' : `
  <div class="two">
    <div class="panel"><h3>New PO draft (from a paid invoice)</h3><form id="o-new" autocomplete="off"><div class="fgrid">
      <label>Find item (UPC, distributor SKU or MFG P/N)<input name="q" placeholder="e.g. 200000000017"></label>
      <div id="o-find" class="small" style="grid-column:1/-1"></div>
      <input type="hidden" name="gid" value="${esc(gid || '')}">
      <label>Invoice #<input name="number" maxlength="40" required></label><label>Customer<input name="customer" maxlength="80"></label>
      <label>Sale price each (invoice)<input name="sale_price_each" inputmode="decimal" required></label><label>Qty<input name="qty" inputmode="numeric" value="1"></label>
      <label>Paid note (e.g. QBO pmt #, date)<input name="paid_note" maxlength="120"></label>
      <label class="chk"><input type="checkbox" name="paid"> Invoice is PAID IN FULL (collect-first)</label>
    </div><button class="btn pri" type="submit">Create draft</button></form></div>
    <div class="panel"><h3>Ship-to settings (store FFL)</h3><form id="o-set"><div class="fgrid">
      ${[['store_name','Store name'],['store_ffl','Store FFL # (X-XX-XXX-XX-XX-XXXXX)'],['store_sot','SOT class/EIN note'],['address','Address'],['city','City'],['state','State'],['zip','ZIP']].map(([k,l]) => `<label>${l}<input name="${k}" value="${esc(SET[k] || '')}" maxlength="120"></label>`).join('')}
    </div><button class="btn" type="submit">Save ship-to</button></form></div>
  </div>
  <div class="panel"><h3>Drafts</h3><div class="tablewrap"><table class="grid mcards"><thead><tr><th>PO</th><th>Created</th><th data-m="t">Item</th><th class="r">Qty</th><th>Invoice</th><th>Distributor</th><th>Status</th></tr></thead><tbody>
    ${d.drafts.map(x => `<tr data-po="${esc(x.id)}" style="cursor:pointer"><td class="mono">${esc(x.id)}</td><td>${esc(x.created)}</td><td>${esc(x.item.title)}</td><td class="r">${x.qty}</td><td>${esc(x.invoice.number)} · ${money(x.invoice.sale_price_each)}</td><td>${esc(x.dist || '(best source)')}</td><td>${esc(x.status)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No drafts yet. Start one from a paid invoice, or from an item\'s "Start PO draft" button.</td></tr>'}
  </tbody></table></div></div>`}`;
  root().querySelectorAll('tr[data-po]').forEach(tr => tr.onclick = () => location.hash = '#/orders/' + tr.dataset.po);
  if (arg === 'log') return showLog();
  const f = $('#o-new');
  if (gid) { const r = await api('./api/product?gid=' + encodeURIComponent(gid)).catch(() => null); if (r && r.product) { $('#o-find').innerHTML = `Item: <b>${esc(r.product.brand + ' ' + r.product.title)}</b> <span class="muted">UPC ${esc(r.product.upc || '—')}</span>`; f.sale_price_each.value = r.product.sug ?? ''; } }
  let t = null;
  f.q.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
    const r = await api('./api/po/find?q=' + encodeURIComponent(f.q.value.trim()));
    $('#o-find').innerHTML = r.items.length ? r.items.map(i => `<label class="chk"><input type="radio" name="pick" value="${i.gid}"> ${esc(i.brand + ' ' + i.title)} <span class="muted mono">${esc(i.upc || '')} ${esc(i.mfr_part || '')}</span></label>`).join('') : '<span class="muted">No exact UPC / SKU / MFG P/N match.</span>';
    $('#o-find').querySelectorAll('input[name=pick]').forEach(x => x.onchange = () => f.gid.value = x.value);
    if (r.items.length === 1) { $('#o-find').querySelector('input').checked = true; f.gid.value = r.items[0].gid; }
  }, 300); };
  f.onsubmit = async e => { e.preventDefault();
    const r = await spost('./api/po/create', {gid: f.gid.value, qty: f.qty.value, invoice: {number: f.number.value, customer: f.customer.value, sale_price_each: f.sale_price_each.value, paid_note: f.paid_note.value, paid: f.paid.checked}});
    if (r.error) return toast(r.error); location.hash = '#/orders/' + r.id; };
  $('#o-set').onsubmit = async e => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); const r = await spost('./api/po/settings', b); toast(r.error || 'Saved'); };
};

async function showLog() {
  const d = await api('./api/po/log');
  $('#o-log').innerHTML = `<div class="panel"><h3>Dry-run log <span class="muted small">data/orders.jsonl · append-only · newest first</span></h3>${d.log.map(e => `
    <div class="logent"><div><b class="mono">${esc(e.po)}</b> · ${esc(e.ts)} CDT · <b>${esc(e.dist)}</b> · ${esc(e.item || '')} × ${e.qty} · cost ${money(e.cost_total)} · <span class="chip ${e.sent ? 'bad' : 'good'}">${e.sent ? 'SENT' : 'not sent'}</span> <span class="chip">${esc(e.result)}</span></div>
    <div class="muted small">Payment: ${esc(e.payment)} · confirmed with “${esc(e.confirm)}”</div>
    <pre class="req">${esc(JSON.stringify(e.request, null, 2))}</pre></div>`).join('') || '<p class="muted">No dry runs yet.</p>'}</div>`;
}

async function review(id) {
  const R = await api('./api/po/review?id=' + encodeURIComponent(id));
  if (R.error) { root().innerHTML = `<div class="panel">${esc(R.error)} <a href="#/orders">Back</a></div>`; return; }
  const d = R.draft, m = R.money, sel = R.selected, st = d.ship_to, T = R.terms || {};
  const estSel = sel && sel.est;
  const tv = k => esc(T[k] ?? 'unknown');
  root().innerHTML = `
  <div class="filters open"><a href="#/orders" class="ghost">‹ Orders</a><b class="sh">Review ${esc(d.id)}</b><span class="chip ${d.status === 'dry-run logged' ? 'good' : d.status === 'cancelled' ? 'bad' : ''}">${esc(d.status)}</span><span class="chip warn">DRY RUN ONLY</span>
    <span class="grow"></span><button class="btn" id="o-recheck" title="Re-reads local stock/cost from the latest feed sync">↻ Re-check local stock</button></div>
  ${R.info.red ? `<div class="redwarn">⚠ ${esc(R.info.red)}</div>` : ''}
  ${R.manual_only ? `<div class="redwarn amber">Manual only: ${esc(R.info.name)} has no ordering API. Order in their dealer portal by hand after owner approves; nothing is built or logged here.</div>` : ''}
  <div class="two">
    <div class="panel"><h3>Item &amp; invoice</h3>
      <div><b>${esc(d.item.title)}</b></div><div class="muted mono small">UPC ${esc(d.item.upc || '—')} · MFG P/N ${esc(d.item.mfr_part || '—')}${R.nfa ? ' · <span class="chip bad">NFA</span>' : ''}</div>
      <div class="okv"><span>Invoice</span><b>${esc(d.invoice.number)}${d.invoice.customer ? ' · ' + esc(d.invoice.customer) : ''}</b>
        <span>Paid</span><b>${d.invoice.paid ? 'PAID IN FULL' : 'NOT PAID'} <span class="muted">(${esc(d.invoice.source)}${d.invoice.paid_note ? ': ' + esc(d.invoice.paid_note) : ''})</span></b>
        <span>Qty</span><b><input id="o-qty" value="${d.qty}" inputmode="numeric" style="width:60px"></b></div>
      <h3 style="margin-top:12px">Landed vs invoice</h3>
      <table class="grid money"><tbody>
        <tr><td>Distributor cost each</td><td class="r cost">${money(m.unit_cost)}</td></tr>
        <tr><td>Landed each (cost + inbound freight)${estSel ? ' <span class="est">Est.</span>' : ''}</td><td class="r cost">${money(m.landed_unit)}</td></tr>
        <tr><td>Invoice price each</td><td class="r"><b>${money(m.sale_each)}</b></td></tr>
        ${m.ds_fee ? `<tr><td>Drop-ship fee</td><td class="r cost">${money(m.ds_fee)}</td></tr>` : ''}
        <tr><td>PO total (cost × qty${m.ds_fee ? ' + drop-ship' : ''})</td><td class="r cost"><b>${money(m.cost_total)}</b></td></tr>
        <tr><td>Landed total</td><td class="r cost">${money(m.landed_total)}</td></tr>
        <tr><td>Invoice total</td><td class="r">${money(m.sale_total)}</td></tr>
        <tr><td>Est. payment fee</td><td class="r cost">${money(m.est_payment_fee)}</td></tr>
        <tr><td><b>Net</b></td><td class="r cost"><b class="net ${m.net == null ? '' : m.net >= META.fee.min_net * d.qty ? 'pos' : 'neg'}">${money(m.net)}</b></td></tr>
      </tbody></table></div>
    <div class="panel"><h3>Source (live local stock: ${sel && sel.feed_at ? 'feed synced ' + esc(ago2(sel.feed_at)) : 'from last sync'})</h3>
      <table class="grid"><thead><tr><th></th><th>Distributor</th><th class="r">Qty</th><th class="r cost">Cost</th><th class="r cost">Landed</th><th class="ofeed">Feed</th></tr></thead><tbody>
      ${R.sources.map(s => `<tr class="${s.best ? 'bestrow' : ''}"><td><input type="radio" name="o-dist" value="${esc(s.id)}" ${s.id === d.dist ? 'checked' : ''} ${s.id ? '' : 'disabled'}></td>
        <td><b>${esc(s.dist)}</b> ${s.best ? '<i class="bestb">BEST</i>' : ''}${s.manual_only ? ' <span class="chip warn">Manual only</span>' : ''}${s.id === 'x-holdback' ? ' <span class="chip bad">ACH</span>' : ''}<div class="muted small mono">${esc(s.item_no || '')}${s.alloc ? ' · allocated' : ''}</div></td>
        <td class="r">${s.qty ?? 0}</td><td class="r cost">${money(s.cost)}</td><td class="r cost">${money(s.landed)}${s.est ? ' <span class="est">Est.</span>' : ''}</td><td class="small muted ofeed">${esc(ago2(s.feed_at))}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No distributor carries this item now.</td></tr>'}
      </tbody></table>
      <p class="muted small">BEST = lowest landed cost with enough stock (tie: more qty). Est. = that supplier's shipping terms aren't confirmed yet.</p>
      <h3>Terms · ${esc(R.info.name || '—')}</h3>
      <div class="okv small"><span>Order method</span><b>${esc(R.info.method || '—')}</b><span>Payment</span><b class="${R.info.charges_on_submit ? 'bad' : ''}">${esc(R.info.payment || '—')}</b>
        <span>Freight to RDA</span><b>flat ${tv('ship_to_rda_flat_per_order')} · per gun ${tv('ship_to_rda_per_gun')} · per item ${tv('ship_to_rda_per_item')} · free over ${tv('free_ship_over_amount')} · small-order +${tv('small_order_fee')} under ${tv('small_order_under')}</b>
        <span>Surcharges</span><b>firearm ${tv('firearm_surcharge')} · NFA ${tv('nfa_surcharge')} · NFA ships free ${tv('nfa_ships_free')}</b>
        <span>Drop ship</span><b>${R.info.ds ? 'allowed' : 'not offered'} · fee ${tv('drop_ship_fee')} ${tv('drop_ship_fee_basis')}</b>
        <span>Terms</span><b>${(T.terms_confirmed || 'no') === 'yes' ? 'confirmed' : '<span class="est">Est.</span> not confirmed'} <a href="#/suppliers">edit</a></b></div>
    </div>
  </div>
  <div class="two">
    <div class="panel"><h3>Ship to</h3><form id="o-ship"><div class="fgrid">
      <label>Ship to<select name="mode"><option value="store" ${st.mode === 'store' ? 'selected' : ''}>RDA store (our FFL/SOT)</option><option value="customer_ffl" ${st.mode === 'customer_ffl' ? 'selected' : ''}>Customer's FFL (drop ship)</option></select></label>
      ${st.mode === 'store' ? `<div class="small" style="grid-column:1/-1">${esc(R.settings.store_name || 'My Store')} · FFL <span class="mono">${esc(R.settings.store_ffl || '(not set)')}</span> · ${esc([R.settings.address, R.settings.city, R.settings.state, R.settings.zip].filter(Boolean).join(', ') || 'address not set')} <a href="#/orders">set</a></div>` :
        [['name','FFL name'],['ffl','FFL # (X-XX-XXX-XX-XX-XXXXX)'],['address','Premises address'],['city','City'],['state','State'],['zip','ZIP']].map(([k,l]) => `<label>${l}<input name="${k}" value="${esc(st[k] || '')}" maxlength="120"></label>`).join('') +
        `<label class="chk"><input type="checkbox" name="ezcheck" ${st.ezcheck ? 'checked' : ''}> Verified on FFL eZ Check</label>`}
    </div><button class="btn" type="submit">Save ship-to</button></form></div>
    <div class="panel"><h3>Checks</h3><ul class="checks">${R.checks.map(c => `<li class="${LV[c.level][1]} ${c.level}"><i>${LV[c.level][0]}</i>${esc(c.text)}</li>`).join('')}</ul></div>
  </div>
  <div class="panel confirm ${R.info.charges_on_submit ? 'danger' : ''}"><h3>Confirm</h3>
    <div class="liverow"><label class="lsw" title="${esc(R.live.label)}"><input type="checkbox" disabled><span></span></label> <b>Live order: ${esc(R.live.label)}</b></div>
    ${R.confirm_phrase ? `<p>Type <b class="mono phrase">${esc(R.confirm_phrase)}</b> to log a dry run.</p>` : '<p class="muted">No confirmation phrase until a source with a known cost is selected.</p>'}
    <div class="crow"><input id="o-confirm" class="mono" placeholder="${esc(R.confirm_phrase || '')}" autocomplete="off" spellcheck="false" ${R.can_dry_run ? '' : 'disabled'}>
      <button class="btn pri" id="o-dry" ${R.can_dry_run ? '' : 'disabled'}>Dry run (log only, nothing is sent)</button>
      <button class="btn ghost" id="o-cancel">Cancel draft</button></div>
    ${!R.can_dry_run && !R.manual_only ? '<p class="muted small">Dry run is disabled until the ✕ checks are fixed.</p>' : ''}
  </div>`;
  const upd = async b => { const r = await spost('./api/po/update', Object.assign({id: d.id}, b)); if (r.error) toast(r.error); review(id); };
  root().querySelectorAll('input[name=o-dist]').forEach(x => x.onchange = () => upd({dist: x.value}));
  $('#o-qty').onchange = () => upd({qty: $('#o-qty').value});
  $('#o-recheck').onclick = () => { toast('Re-checking local stock…'); review(id); };
  $('#o-ship').mode.onchange = e => upd({ship_to: Object.assign({}, st, {mode: e.target.value})});
  $('#o-ship').onsubmit = e => { e.preventDefault(); const f = e.target, b = {mode: f.mode.value};
    ['name','ffl','address','city','state','zip'].forEach(k => { if (f[k]) b[k] = f[k].value; }); if (f.ezcheck) b.ezcheck = f.ezcheck.checked ? 'yes' : ''; upd({ship_to: b}); };
  $('#o-cancel').onclick = () => { if (confirm('Cancel this draft?')) upd({cancel: true}); };
  $('#o-dry').onclick = async () => {
    const r = await spost('./api/po/dryrun', {id: d.id, confirm: $('#o-confirm').value});
    if (r.error) { toast(r.error); $('#o-confirm').classList.add('badin'); return; }
    toast('Dry run logged. Nothing was sent.'); location.hash = '#/orders/log';
  };
}
})();
