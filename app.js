'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (v, d = 2) => v == null || v === '' ? '—' : '$' + Number(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const m0 = v => money(v, 0);
const CATN = {suppressor:'Suppressor', handgun:'Handgun', long_gun:'Long gun', nfa:'NFA', accessory:'Accessory', ammo:'Ammo', default:'Other'};
let LOADED = false, META = {fee:{pct:.0325, fixed:.2, min_net:50}}, ctl = null, timer = null;
const S = {sort:'rank', dir:''};

async function api(path, opt) {
  const r = await fetch(path, opt); if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status); return r.json();
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(e._t); e._t = setTimeout(() => e.hidden = true, 1800); }
const netAt = (p, l) => p == null || l == null ? null : +(p - l - (META.fee.pct * p + META.fee.fixed)).toFixed(2);
const priceFor = (l, n) => Math.ceil((l + n + META.fee.fixed) / (1 - META.fee.pct) * 100) / 100;
function ago(ts) {
  if (!ts) return ''; const t = new Date(ts.replace(' ', 'T')), m = (Date.now() - t) / 60000;
  if (m < 1) return 'just now'; if (m < 60) return Math.round(m) + 'm ago'; if (m < 1440) return Math.round(m / 60) + 'h ago'; return Math.round(m / 1440) + 'd ago';
}

/* ---------- customer view + mobile menu ---------- */
function setCust(on) { document.body.classList.toggle('cust', on); $('#custview').classList.toggle('on', on); $('#m-custcb').checked = on; localStorage.cust = on ? '1' : ''; }
$('#custview').addEventListener('click', e => { e.stopPropagation(); setCust(!document.body.classList.contains('cust')); });
$('#m-cust').addEventListener('click', e => { e.stopPropagation(); setCust(!document.body.classList.contains('cust')); toast(document.body.classList.contains('cust') ? 'Customer view on: costs hidden' : 'Customer view off'); });
/* theme: dark is the default; light only when picked (saved in localStorage.theme) */
function setTheme(t, save) {
  t = t === 'light' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', t);
  if (save) { try { if (t === 'light') localStorage.theme = 'light'; else localStorage.removeItem('theme'); } catch (e) {} }
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'light' ? '#f4f5f7' : '#0d1014';
  const s = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]'); if (s) s.content = t === 'light' ? 'default' : 'black-translucent';
  $('#themebtn .ti').textContent = t === 'light' ? '☾' : '☀'; $('#themebtn .tl').textContent = t === 'light' ? 'Dark' : 'Light';
  $('#themebtn').setAttribute('aria-label', t === 'light' ? 'Switch to dark theme' : 'Switch to light theme'); $('#m-themecb').checked = t === 'light';
}
$('#themebtn').addEventListener('click', e => { e.stopPropagation(); setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true); });
$('#m-theme').addEventListener('click', e => { e.stopPropagation(); const t = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; setTheme(t, true); toast(t === 'light' ? 'Light theme' : 'Dark theme'); });
setTheme(document.documentElement.getAttribute('data-theme'), false);
function toggleMenu(on) { $('#menu').hidden = !on; $('#menubtn').setAttribute('aria-expanded', on); }
$('#menubtn').addEventListener('click', e => { e.stopPropagation(); toggleMenu($('#menu').hidden); });
$('#b-more').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleMenu($('#menu').hidden); });
$('#menu').addEventListener('click', e => { if (e.target.closest('a')) toggleMenu(false); });
document.addEventListener('click', e => { if (!$('#menu').hidden && !e.target.closest('#menu')) toggleMenu(false); });
setCust(!!localStorage.cust);

/* ---------- routing ---------- */
const VIEWS = {'':'home', orders:'orders', search:'search', changes:'changes', watch:'watch', quote:'quote', feeds:'feeds', suppliers:'suppliers', settings:'settings', lists:'lists', backorders:'backorders', deals:'deals', p:'search'};
function route() {
  const h = location.hash.replace(/^#\/?/, ''); const [v, arg] = h.split('/');
  const view = VIEWS[v.split('?')[0]] || 'home';
  if (v.startsWith('search?')) { const hq = new URLSearchParams(v.slice(7)).get('q'); if (hq !== null && hq !== $('#q').value) { $('#q').value = hq; LOADED = false; } }
  $$('.view').forEach(e => e.classList.toggle('on', e.id === 'v-' + view));
  $$('.tabs a, .btabs a[data-v]').forEach(a => a.classList.toggle('on', a.dataset.v === view));
  $('.tabs a.on')?.scrollIntoView({inline: 'nearest', block: 'nearest'});
  if (view === 'home') loadHome(); if (view === 'changes') loadChanges(true); if (view === 'watch') loadWatch();
  if (view === 'lists') loadLists(); if (view === 'backorders') loadBackorders(); if (view === 'deals') loadDeals();
  if (view === 'orders' && window.loadOrders) loadOrders(arg); if (view === 'feeds') loadFeeds(); if (view === 'suppliers') loadSuppliers(); if (view === 'settings' && window.loadSettings) loadSettings(arg); if (view === 'quote') calc(); if (view === 'search' && !LOADED && META.cats) doSearch();
  if (v === 'p' && arg) openProduct({gid: arg}); else closeDrawer(true);
}
window.addEventListener('hashchange', route);

/* ---------- search (dense grid) ---------- */
const F = ['cat','cal','thread','dist','pmin','pmax','cmax'];
const ACTL = {bolt:'Bolt', semi:'Semi-Auto', pump:'Pump', lever:'Lever', revolver:'Revolver', break:'Break Action', single:'Single Shot', other:'Other', unknown:'Unknown action'};
const n0 = v => v == null || v === '' ? '—' : Number(v).toLocaleString('en-US');
const BCL = {};
const calTxt = r => r.cat === 'suppressor' ? (BCL[r.bclass] || (r.bclass ? r.bclass : '')) : (r.cal || '').split(' ').slice(0, 2).join(', ');
const COLDEF = [
  {k:'img', l:'Img', w:40, r: r => r.img ? `<img src="${esc(r.img)}" loading="lazy" referrerpolicy="no-referrer" alt="">` : '', c:'img'},
  {k:'upc', l:'UPC', w:110, r: r => esc(r.upc || ''), c:'mono'},
  {k:'title', l:'Title', w:330, s:'brand', r: r => esc(r.stitle) + (r.match ? `<span class="mt">${esc(r.match.join(' · '))}</span>` : '') + (r.alloc ? ' <span class="chip warn">Alloc</span>' : '') + (r.junk ? ` <span class="chip warn">${esc(r.junk)}</span>` : ''), c:'t', tip: r => r.title},
  {k:'mfg', l:'MFG', w:120, r: r => esc(r.bname || r.brand)},
  {k:'mpn', l:'MFG P/N', w:110, r: r => esc(r.mfr_part || ''), c:'mono'},
  {k:'model', l:'Model', w:110, r: r => esc(r.model || '')},
  {k:'cal', l:'Caliber', w:100, r: r => esc(calTxt(r))},
  {k:'cat', l:'Category', w:84, r: r => esc(CATN[r.cat] || r.cat)},
  {k:'action', l:'Action', w:84, r: r => esc(r.action ? ACTL[r.action] || r.action : '')},
  {k:'src', l:'Best source', w:150, r: r => esc(r.best_dist || '') + (r.landed != null && r.best_dist ? ` <span class="cost muted">${money(r.landed)}${r.best_est ? ' <span class="est">Est.</span>' : ''}</span>` : '') + (r.at_dist ? ` <span class="muted">${esc(r.at_dist.item)}</span>` : '')},
  {k:'qty', l:'Qty', w:52, s:'qty', a:'r', r: r => `<span class="${r.best_qty < 1 ? 'q0' : r.best_qty <= 2 ? 'qlo' : ''}">${n0(r.total_qty)}</span>`},
  {k:'srcs', l:'Srcs', w:46, s:'srcs', a:'r', r: r => n0(r.n_instock)},
  {k:'cost', l:'Cost', w:84, a:'r', cost:1, r: r => money(r.cost)},
  {k:'landed', l:'Landed', w:88, s:'landed', a:'r', cost:1, r: r => r.landed != null ? money(r.landed) + (r.best_est ? ' <span class="est" title="Shipping terms for this source are not confirmed: landed is an estimate">Est.</span>' : '') : r.ref ? `<span class="muted" title="ref from ${esc(r.ref.dist)}">${money(r.ref.landed)}</span>` : '—'},
  {k:'map', l:'MAP', w:84, s:'map', a:'r', r: r => money(r.map)},
  {k:'msrp', l:'MSRP', w:84, s:'msrp', a:'r', r: r => money(r.msrp)},
  {k:'sell', l:'Sell', w:84, s:'price', a:'r', r: r => `<b>${money(r.sug)}</b>`},
  {k:'net', l:'Net', w:76, s:'net', a:'r', cost:1, r: r => `<span class="net ${r.net_at_sug == null ? '' : r.net_at_sug >= META.fee.min_net ? 'pos' : 'neg'}">${money(r.net_at_sug)}</span>`},
  {k:'floor', l:'Floor', w:84, s:'floor', a:'r', cost:1, r: r => money(r.floor ?? (r.ref && r.ref.floor))},
];
const DEFCOLS = ['title','mfg','mpn','cal','src','qty','landed','map','sell','net'];
let COLS = (() => { try { const v = JSON.parse(localStorage.cols || 'null'); return Array.isArray(v) && v.length ? v.filter(k => COLDEF.some(c => c.k === k)) : DEFCOLS.slice(); } catch { return DEFCOLS.slice(); } })();
if (!localStorage.colsBest && !COLS.includes('src')) { const i = COLS.indexOf('qty'); COLS.splice(i < 0 ? COLS.length : i, 0, 'src'); localStorage.cols = JSON.stringify(COLS); }
localStorage.colsBest = '1';   // 2026-10-23: show Best source once by default (user can hide it again)
let COLW = (() => { try { return JSON.parse(localStorage.colw || '{}'); } catch { return {}; } })();
let LAST = null, RES = [], SEL = null, FAC = null, BK = '', BKNAME = '', GUPC = '', LASTP = null, MORE = false;
const pageSize = () => isPhone() ? 50 : 100;
const colsOn = () => COLDEF.filter(c => COLS.includes(c.k) && (c.k !== 'img' || $('#f-img').checked));
function params() {
  const p = new URLSearchParams(); const q = $('#q').value.trim(); if (q) p.set('q', q);
  const by = $('#f-by').value; if (by !== 'all' && q) p.set('by', by);
  F.forEach(k => { const v = $('#f-' + k).value.trim(); if (v) p.set(k, v); });
  if ($('#f-cat').value === 'suppressor') { p.delete('cal'); const bc = $('#f-bc').value; if (bc) p.set('bc', bc); if ($('#f-also').checked) p.set('also', '1'); }
  if (!$('#f-act').hidden && $('#f-act').value) p.set('act', $('#f-act').value);
  if (BK) p.set('bk', BK); else if ($('#f-brandq').value.trim()) p.set('brand', $('#f-brandq').value.trim());
  const kw = $('#f-kw').value.trim(); if (kw) p.set('kw', kw);
  if (!$('#f-stock').checked) p.set('stock', '0'); if ($('#f-junk').checked) p.set('junk', '1');
  if ($('#f-img').checked) p.set('img', '1');
  if (S.sort !== 'rank') { p.set('sort', S.sort); if (S.dir) p.set('dir', S.dir); }
  return p;
}
function specChips(r) {
  const c = [`<span class="chip cat">${esc(CATN[r.cat] || r.cat)}</span>`];
  if (r.cal) c.push(...r.cal.split(' ').slice(0, 3).map(x => `<span class="chip">${esc(x)}</span>`));
  if (r.thread) c.push(...r.thread.split(' ').slice(0, 2).map(x => `<span class="chip">${esc(x)}</span>`));
  if (r.length) c.push(`<span class="chip">${r.length}"</span>`); if (r.weight) c.push(`<span class="chip">${r.weight} oz</span>`);
  if (r.alloc) c.push('<span class="chip warn">Allocated</span>'); if (!r.instock) c.push('<span class="chip bad">Out of stock</span>');
  if (r.junk) c.push(`<span class="chip warn">${esc(r.junk)}</span>`);
  return c.join('');
}
function schedule() { clearTimeout(timer); timer = setTimeout(doSearch, 120); }
function loadingState() {
  $('#gridwrap').classList.add('busy');
  if (!RES.length) { $('#results tbody').innerHTML = `<tr><td colspan="${colsOn().length}" class="empty loading"><span class="spin"></span>Searching…</td></tr>`; $('#cards').innerHTML = '<div class="empty loading"><span class="spin"></span>Searching…</div>'; }
}
async function doSearch() {
  GUPC = '';
  const p = params(); sessionStorage.lastq = p.toString(); LOADED = true; MORE = false;
  p.set('limit', pageSize()); LASTP = p;
  if (ctl) ctl.abort(); ctl = new AbortController(); loadingState();
  let d; try { d = await (await fetch('./api/search?' + p, {signal: ctl.signal})).json(); } catch (e) { if (e.name !== 'AbortError') { $('#gridwrap').classList.remove('busy'); $('#summary').textContent = 'Error: ' + e.message; } return; }
  renderResults(d);
}
/* paging: "Show more" button at the end of the list, auto-clicked when it scrolls into view (infinite scroll) */
async function loadMore() {
  if (MORE || !LASTP || !LAST || RES.length >= LAST.total) return;
  MORE = true; const p = new URLSearchParams(LASTP); p.set('offset', RES.length); const want = LAST;
  $$('.moreb').forEach(b => { b.disabled = true; b.innerHTML = '<span class="spin"></span>Loading…'; });
  let d; try { d = await (await fetch('./api/search?' + p, {signal: ctl?.signal})).json(); } catch (e) { MORE = false; moreRow(); return; }
  if (LAST !== want) return;   // a new search started meanwhile
  MORE = false; RES = RES.concat(d.results || []); LAST.results = RES;
  if (isPhone()) { $('#cards .moreb')?.remove(); $('#cards').insertAdjacentHTML('beforeend', d.results.map(cardHTML).join('')); }
  else { $('#results tbody tr.morer')?.remove(); $('#results tbody').insertAdjacentHTML('beforeend', d.results.map(rowHTML).join('')); }
  countText(); moreRow();
}
function countText() { const d = LAST; $('#rcount').textContent = 'Results: ' + n0(d.total) + (d.total > RES.length ? ` (showing ${n0(RES.length)})` : ''); }
const moreObs = 'IntersectionObserver' in window ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) loadMore(); }, {rootMargin: '600px'}) : null;
function moreRow() {
  $$('.moreb').forEach(b => { moreObs?.unobserve(b); b.closest('tr.morer') ? b.closest('tr.morer').remove() : b.remove(); });
  if (!LAST || GUPC || RES.length >= (LAST.total || 0)) return;
  const left = LAST.total - RES.length, lab = `Show more (${n0(Math.min(left, pageSize()))} of ${n0(left)} left)`;
  if (isPhone()) $('#cards').insertAdjacentHTML('beforeend', `<button type="button" class="ghost moreb">${lab}</button>`);
  else $('#results tbody').insertAdjacentHTML('beforeend', `<tr class="morer"><td colspan="${colsOn().length}"><button type="button" class="ghost moreb">${lab}</button></td></tr>`);
  const b = $('.moreb'); b.onclick = e => { e.stopPropagation(); loadMore(); }; moreObs?.observe(b);
}
async function globalUPC(v) {
  v = v.replace(/[^0-9]/g, ''); if (v.length < 6) { toast('UPC needs at least 6 digits'); return; }
  GUPC = v; if (ctl) ctl.abort(); ctl = new AbortController(); loadingState();
  const d = await (await fetch('./api/search?' + new URLSearchParams({q: v, by: 'upc', stock: '0', junk: '1', img: $('#f-img').checked ? '1' : ''}), {signal: ctl.signal})).json();
  d.note = ['Global UPC lookup (all categories, in or out of stock, ignores filters)'].concat(d.note || []); renderResults(d);
}
function renderHead() {
  const cs = colsOn();
  $('#results colgroup').innerHTML = cs.map(c => `<col style="width:${COLW[c.k] || c.w}px">`).join('');
  $('#results').style.width = cs.reduce((t, c) => t + (COLW[c.k] || c.w), 0) + 'px';
  $('#results thead tr').innerHTML = cs.map(c => `<th data-k="${c.k}" ${c.s ? `data-s="${c.s}"` : ''} class="${c.a || ''} ${c.cost ? 'cost' : ''} ${c.s && S.sort === c.s ? 'sorted ' + (S.dir ? 'desc' : 'asc') : ''}" title="${esc(c.l)}">${esc(c.l)}<span class="rz"></span></th>`).join('');
}
function rowHTML(r) {
  return `<tr data-gid="${r.gid}" class="${r.instock ? 'ins' : 'oos'}${SEL == r.gid ? ' sel' : ''}${$('#f-img').checked ? ' imgs' : ''}">` + colsOn().map(c =>
    `<td class="${c.a || ''} ${c.c || ''} ${c.cost ? 'cost' : ''}"${c.tip ? ` title="${esc(c.tip(r))}"` : ''}>${c.r(r)}</td>`).join('') + '</tr>';
}
function cardHTML(r) {
  return `<div class="pcard ${r.instock ? '' : 'oos'}" data-gid="${r.gid}"><div class="pc1">${r.img && $('#f-img').checked ? `<img src="${esc(r.img)}" loading="lazy" referrerpolicy="no-referrer" alt="">` : ''}<div style="min-width:0">
    <span class="pt">${esc(r.stitle)}</span><div class="sub"><span class="pb">${esc(r.bname || r.brand)}</span>${esc([r.mfr_part, calTxt(r), r.action ? ACTL[r.action] : ''].filter(Boolean).join(' · '))}</div>
    ${r.match ? `<div class="sub" style="color:var(--blue)">${esc(r.match.join(' · '))}</div>` : ''}</div></div>
    <div class="pc2"><div><span>Qty</span><b class="${r.best_qty < 1 ? 'q0' : r.best_qty <= 2 ? 'qlo' : ''}">${n0(r.total_qty)}</b></div><div class="cost"><span>Landed${r.best_est ? ' <span class="est">Est.</span>' : ''}</span><b>${money(r.landed ?? r.ref?.landed)}</b><small class="bsrc">${esc(r.best_dist || '')}</small></div>
    <div><span>MAP</span><b>${money(r.map)}</b></div><div><span>Sell${r.sug_src ? ' (' + esc(r.sug_src) + ')' : ''}</span><b>${money(r.sug)}</b></div></div></div>`;
}
const isPhone = () => matchMedia('(max-width:820px)').matches;
function renderResults(d) {
  LAST = d; $('#gridwrap').classList.remove('busy'); renderHead();
  const tb = $('#results tbody'), ncol = colsOn().length;
  if (d.mode === 'empty') {
    RES = []; $('#rcount').textContent = 'Results: 0'; $('#summary').textContent = '';
    const m = 'Start typing and results appear instantly. Try <b>enticer</b>, <b>9mm can</b>, <b>glock 19</b>, a UPC or a distributor item #, or pick a category.';
    tb.innerHTML = `<tr><td colspan="${ncol}" class="empty" style="white-space:normal">${m}</td></tr>`; $('#cards').innerHTML = `<div class="empty">${m}</div>`; $('#tilebar').hidden = true; return;
  }
  RES = d.results;
  const hid = Object.entries(d.hidden || {}).filter(([, v]) => v).map(([k, v]) => `${n0(v)} ${k}`).join(', ');
  countText();
  if (d.mode === 'browse') d.parsed = [`Browsing everything${$('#f-stock').checked ? ' in stock' : ''} · type › brand › name · pick a filter or type to narrow`];
  $('#summary').innerHTML = (d.parsed?.length ? esc(d.parsed.join(' · ')) : '') + (d.note?.length ? (d.parsed?.length ? ' · ' : '') + esc(d.note.join('; ')) : '')
    + (hid ? ` · hidden: ${esc(hid)}` : '') + ` · ${d.ms} ms`;
  const none = 'No matches. Try fewer words, turn off “In stock”, clear the Filter box, or tick “Parts/used”.';
  if (isPhone()) { $('#cards').innerHTML = RES.length ? RES.map(cardHTML).join('') : `<div class="empty">${none}</div>`; tb.innerHTML = ''; }
  else { tb.innerHTML = RES.length ? RES.map(rowHTML).join('') : `<tr><td colspan="${ncol}" class="empty" style="white-space:normal">${none}</td></tr>`; $('#cards').innerHTML = ''; }
  if (SEL && !RES.some(r => r.gid == SEL)) { SEL = null; $('#tilebar').hidden = true; }
  moreRow();
}
function tileHTML(t) {
  const has = t.state === 'stock' || t.state === 'zero';
  return `<div class="tile ${t.state}${t.best ? ' best' : ''}" title="${esc(t.dist)}${t.item_no ? ' · ' + esc(t.item_no) : ''}${t.ship_mode ? ' · ' + esc(t.ship_mode) : ''}${t.state === 'off' ? ' · feed turned off' : t.state === 'none' ? ' · not carried' : ''}${t.best ? ' · best source: lowest landed cost' : ''}${t.est ? ' · landed is an estimate (shipping terms not confirmed)' : ''}">
     ${t.best ? `<i class="bestb">BEST${t.net != null ? `<span class="cost"> · net ${money(t.net)}</span>` : ''}</i>` : ''}<b>${esc(t.dist)}</b><span>${t.state === 'none' || t.state === 'off' ? '—' : 'Qty ' + n0(t.qty)}</span>${has ? `<span class="cost"> · ${money(t.landed ?? t.cost)}${t.est ? ' <span class="est">Est.</span>' : ''}</span>` : ''}</div>`;
}
/* row select -> distributor tiles; double-click / Enter -> details */
async function selectRow(gid) {
  SEL = gid; $$('#results tbody tr.sel').forEach(t => t.classList.remove('sel')); $(`#results tbody tr[data-gid="${gid}"]`)?.classList.add('sel');
  const tb = $('#tilebar'); tb.hidden = false; tb.innerHTML = '<div class="th"><span class="spin"></span><span class="muted">Loading distributors…</span></div>';
  const d = await api('./api/product?gid=' + gid); if (SEL != gid) return;
  if (d.error) { tb.innerHTML = `<div class="th muted">${esc(d.error)}</div>`; return; }
  const p = d.product, fav = (d.lists || []).includes('Favorites');
  tb.innerHTML = `<div class="th"><b title="${esc(p.title)}"><span class="pb">${esc(p.bname || p.brand)}</span>${esc(p.title)}</b>
     <button class="ghost sm" id="t-fav">${fav ? '★ Favorite' : '☆ Favorite'}</button><button class="ghost sm" id="t-list">＋ List</button><button class="pill sm on" id="t-open">Details ›</button></div>
   <div class="tiles">${d.tiles.map(tileHTML).join('')}</div>`;
  $('#t-open').onclick = () => location.hash = '#/p/' + gid;
  $('#t-fav').onclick = async () => { const on = !$('#t-fav').textContent.startsWith('★');
    await post('./api/lists/' + (on ? 'add' : 'remove'), {name: 'Favorites', key: p.key, title: (p.bname || p.brand) + ' ' + p.stitle});
    $('#t-fav').textContent = on ? '★ Favorite' : '☆ Favorite'; toast(on ? 'Added to Favorites' : 'Removed from Favorites'); };
  $('#t-list').onclick = () => addToList(p);
}
async function addToList(p) {
  const L = (await api('./api/lists')).lists.map(l => l.name).filter(n => n !== 'Favorites');
  const name = prompt('Add to which Quick List? Type an existing name or a new one.' + (L.length ? '\nLists: ' + L.join(', ') : ''), L[0] || 'Quote list'); if (!name) return;
  if (!L.some(n => n.toLowerCase() === name.trim().toLowerCase())) { const c = await post('./api/lists/create', {name}); if (c.error) { toast(c.error); return; } }
  const r = await post('./api/lists/add', {name, key: p.key, title: (p.bname || p.brand) + ' ' + p.stitle}); toast(r.error || 'Added to ' + name);
}
$('#results tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-gid]'); if (tr) selectRow(tr.dataset.gid); });
$('#results tbody').addEventListener('dblclick', e => { const tr = e.target.closest('tr[data-gid]'); if (tr) location.hash = '#/p/' + tr.dataset.gid; });
$('#cards').addEventListener('click', e => { const c = e.target.closest('[data-gid]'); if (c) location.hash = '#/p/' + c.dataset.gid; });
document.addEventListener('keydown', e => {
  if (!$('#v-search').classList.contains('on') || !$('#drawer').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !RES.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const i = RES.findIndex(r => r.gid == SEL), j = Math.max(0, Math.min(RES.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    selectRow(RES[j].gid); $(`#results tbody tr[data-gid="${RES[j].gid}"]`)?.scrollIntoView({block: 'nearest'}); }
  if (e.key === 'Enter' && SEL) location.hash = '#/p/' + SEL;
});
/* sorting + column resize */
$('#results thead').addEventListener('click', e => {
  if (e.target.classList.contains('rz')) return; const th = e.target.closest('th[data-s]'); if (!th) return;
  const s = th.dataset.s, defDesc = ['qty', 'net', 'srcs'].includes(s);
  if (S.sort === s) S.dir = S.dir === 'desc' ? '' : 'desc'; else { S.sort = s; S.dir = defDesc ? 'desc' : ''; }
  $('#f-sort').value = [...$('#f-sort').options].some(o => o.value === S.sort + (S.dir ? ':' + S.dir : '')) ? S.sort + (S.dir ? ':' + S.dir : '') : 'rank';
  doSearch();
});
$('#results thead').addEventListener('mousedown', e => {
  if (!e.target.classList.contains('rz')) return; e.preventDefault();
  const th = e.target.closest('th'), k = th.dataset.k, i = [...th.parentNode.children].indexOf(th), col = $('#results colgroup').children[i], x0 = e.clientX, w0 = col.offsetWidth || th.offsetWidth;
  const mv = ev => { const w = Math.max(36, w0 + ev.clientX - x0); col.style.width = w + 'px'; COLW[k] = w; $('#results').style.width = colsOn().reduce((t, c) => t + (COLW[c.k] || c.w), 0) + 'px'; };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); localStorage.colw = JSON.stringify(COLW); };
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
});
/* column picker */
function renderColMenu() {
  $('#colmenu').innerHTML = COLDEF.filter(c => c.k !== 'img').map(c => `<label class="${c.cost ? 'cost' : ''}"><input type="checkbox" value="${c.k}" ${COLS.includes(c.k) ? 'checked' : ''}>${esc(c.l)}</label>`).join('')
    + '<div class="ft"><button class="ghost sm" id="col-reset" type="button">Reset columns &amp; widths</button></div>';
}
$('#colbtn').onclick = e => { e.stopPropagation(); renderColMenu(); $('#colmenu').hidden = !$('#colmenu').hidden; };
$('#colmenu').addEventListener('click', e => e.stopPropagation());
$('#colmenu').addEventListener('change', e => { const k = e.target.value; COLS = COLDEF.map(c => c.k).filter(x => x === k ? e.target.checked : COLS.includes(x)); if (!COLS.includes('title')) COLS.unshift('title'); localStorage.cols = JSON.stringify(COLS); renderResults(lastD()); });
$('#colmenu').addEventListener('click', e => { if (e.target.id === 'col-reset') { COLS = DEFCOLS.slice(); COLW = {}; localStorage.removeItem('cols'); localStorage.removeItem('colw'); renderColMenu(); renderResults(lastD()); } });
const lastD = () => LAST || {mode: 'empty'};
/* brand combobox: every brand in the category, A-Z, "Name (in-stock)" */
function brandOpts() {
  const t = $('#f-brandq').value.trim().toLowerCase(), all = FAC?.brands || [], st = $('#f-stock').checked;
  const list = all.filter(b => !t || b.name.toLowerCase().includes(t)).sort((a, b) => (t && a.name.toLowerCase().startsWith(t) ? 0 : 1) - (t && b.name.toLowerCase().startsWith(t) ? 0 : 1) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  $('#brandlist').innerHTML = (list.length ? list.map((b, i) => `<div class="opt ${st && !b.n_in ? 'zero' : ''}${i === 0 && t ? ' hi' : ''}" data-k="${esc(b.key)}" data-n="${esc(b.name)}"><span>${esc(b.name)}</span><span class="n">${n0(st ? b.n_in : b.n)}</span></div>`).join('')
    : `<div class="none">No brand matches “${esc(t)}”.${t ? ' Press Enter to search the text instead.' : ''}</div>`);
  $('#brandlist').firstElementChild?.insertAdjacentHTML('beforebegin', `<div class="none">${n0(list.length)} brand${list.length === 1 ? '' : 's'}${$('#f-cat').value ? ' in ' + esc(CATN[$('#f-cat').value]) : ''} · count = ${st ? 'in stock' : 'listed'}</div>`);
}
function setBrand(k, n) { BK = k || ''; BKNAME = n || ''; $('#f-brandq').value = n || ''; $('#f-brandq').classList.toggle('set', !!k); $('#brandx').hidden = !k && !$('#f-brandq').value; $('#brandlist').hidden = true; loadFacets(); doSearch(); }
$('#f-brandq').addEventListener('focus', () => { brandOpts(); $('#brandlist').hidden = false; });
$('#f-brandq').addEventListener('input', () => { if (BK) { BK = ''; $('#f-brandq').classList.remove('set'); } $('#brandx').hidden = !$('#f-brandq').value; brandOpts(); $('#brandlist').hidden = false; });
$('#f-brandq').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); const h = $('#brandlist .opt.hi') || (BK ? null : null); if (h) setBrand(h.dataset.k, h.dataset.n); else { $('#brandlist').hidden = true; doSearch(); } }
  if (e.key === 'Escape') $('#brandlist').hidden = true;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const os = $$('#brandlist .opt'); if (!os.length) return; let i = os.findIndex(o => o.classList.contains('hi')); os[i]?.classList.remove('hi'); i = Math.max(0, Math.min(os.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); os[i].classList.add('hi'); os[i].scrollIntoView({block: 'nearest'}); }
});
$('#brandlist').addEventListener('mousedown', e => { const o = e.target.closest('.opt'); if (o) { e.preventDefault(); setBrand(o.dataset.k, o.dataset.n); } });
$('#brandx').onclick = () => setBrand('', '');
$('#brandv').onclick = e => { e.stopPropagation(); const h = $('#brandlist').hidden; if (h) brandOpts(); $('#brandlist').hidden = !h; };
document.addEventListener('click', e => { if (!e.target.closest('#brandbox')) $('#brandlist').hidden = true; if (!e.target.closest('#colmenu,#colbtn')) $('#colmenu').hidden = true; });
/* facets: brands, actions, bore classes follow category / stock / brand */
async function loadFacets() {
  const cat = $('#f-cat').value, p = new URLSearchParams({cat}); if (!$('#f-stock').checked) p.set('stock', '0'); if ($('#f-junk').checked) p.set('junk', '1');
  if (BK) p.set('bk', BK); const a = $('#f-act').value; if (a) p.set('act', a);
  FAC = await api('./api/facets?' + p); const st = $('#f-stock').checked;
  const cnt = x => n0(st ? x.n_in : x.n);
  const act = $('#f-act'), av = act.value; act.hidden = !FAC.actions.length;
  act.innerHTML = '<option value="">Any action</option>' + FAC.actions.map(x => `<option value="${x.key}">${esc(ACTL[x.key] || x.name)} (${cnt(x)})</option>`).join('');
  if (FAC.actions.some(x => x.key === av)) act.value = av; else if (av) { act.value = ''; }
  const sup = cat === 'suppressor', bc = $('#f-bc'), bv = bc.value;
  $('#f-cal').hidden = sup; bc.hidden = !sup; $('#t-also').hidden = !sup;
  if (sup) { bc.innerHTML = '<option value="">Any bore class</option>' + (FAC.bclasses || []).map(x => `<option value="${x.key}">${esc(x.name)} (${cnt(x)})</option>`).join(''); bc.value = bv; }
  if (!$('#brandlist').hidden) brandOpts();
}
/* events */
$('#f-sort').onchange = e => { const [s, d] = e.target.value.split(':'); S.sort = s; S.dir = d || ''; doSearch(); };
$('#q').addEventListener('input', () => { if (!$('#v-search').classList.contains('on')) location.hash = '#/search'; schedule(); });
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (isPhone()) $('#q').blur(); doSearch(); } });
['thread', 'dist', 'pmin', 'pmax', 'cmax'].forEach(k => $('#f-' + k).addEventListener('input', schedule));
$('#f-cal').addEventListener('change', doSearch); $('#f-bc').addEventListener('change', doSearch); $('#f-also').addEventListener('change', doSearch);
$('#f-by').addEventListener('change', () => { if ($('#q').value.trim()) doSearch(); $('#q').placeholder = {upc: 'UPC (zeros and dashes ignored)', sku: 'Distributor item # / SKU', mpn: 'MFG part # (prefix OK)'}[$('#f-by').value] || 'Search name, UPC, SKU…  e.g. 30 cal can'; $('#q').focus(); });
$('#f-cat').addEventListener('change', () => { $('#f-bc').value = ''; $('#f-act').value = ''; loadFacets(); doSearch(); });
$('#f-act').addEventListener('change', () => { loadFacets(); doSearch(); });
$('#f-junk').addEventListener('change', () => { loadFacets(); doSearch(); });
$('#f-kw').addEventListener('input', schedule);
$('#f-img').addEventListener('change', () => { localStorage.img = $('#f-img').checked ? '1' : ''; doSearch(); });
function setStock(on) { $('#f-stock').checked = on; $('#p-stock').classList.toggle('on', on); $('#p-stock').setAttribute('aria-pressed', on); $('#p-stock').textContent = on ? 'In stock' : 'In + out of stock'; }
$('#p-stock').onclick = () => { setStock(!$('#f-stock').checked); loadFacets(); doSearch(); };
$('#f-gupc').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!$('#v-search').classList.contains('on')) location.hash = '#/search'; globalUPC($('#f-gupc').value); } });
$('#f-clear').onclick = () => {
  $('#q').value = ''; F.forEach(k => $('#f-' + k).value = ''); ['#f-bc', '#f-act', '#f-kw', '#f-gupc'].forEach(s => $(s).value = ''); $('#f-by').value = 'all';
  $('#f-also').checked = false; setStock(true); $('#f-junk').checked = false; S.sort = 'rank'; S.dir = ''; $('#f-sort').value = 'rank'; BK = ''; BKNAME = ''; $('#f-brandq').value = ''; $('#f-brandq').classList.remove('set'); $('#brandx').hidden = true;
  SEL = null; $('#tilebar').hidden = true; loadFacets(); doSearch();
};
let _ph = isPhone(); window.addEventListener('resize', () => { if (isPhone() !== _ph) { _ph = isPhone(); if (RES.length) renderResults(lastD()); } });
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#q').focus(); $('#q').select(); }
  if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer();
  if (e.key === 'Escape' && !$('#menu').hidden) toggleMenu(false);
});

function moreLabel() {
  const n = ['#f-cal', '#f-thread', '#f-dist', '#f-pmin', '#f-pmax', '#f-cmax'].filter(s => $(s).value && !$(s).hidden).length + ($('#f-junk').checked ? 1 : 0) + ($('#f-also').checked ? 1 : 0);
  const o = $('.filters').classList.contains('open');
  $('#f-more').textContent = (o ? 'Fewer filters' : 'More filters') + (n ? ` (${n} on)` : '');
}
$('#f-more').addEventListener('click', () => { $('.filters').classList.toggle('open'); $('#f-more').setAttribute('aria-expanded', $('.filters').classList.contains('open')); moreLabel(); });
$('.filters').addEventListener('change', moreLabel); $('.filters').addEventListener('input', moreLabel);
/* ---------- product drawer ---------- */
/* Sheet v2: the panel is its own scroll container; body is pinned (position:fixed) while open and
   restored (incl. scroll position) on every close path. Key-opened sheets push a history entry so
   iOS back-swipe / browser Back closes the sheet instead of leaving the app. No touchmove preventDefault. */
let DLOCK = null, DPUSH = false, DSEQ = 0, DFOCUS = null;
function lockBody() {
  if (DLOCK) return; DLOCK = {y: window.scrollY};
  Object.assign(document.body.style, {position: 'fixed', top: -DLOCK.y + 'px', left: '0', right: '0', width: '100%', overflow: 'hidden'});
}
function unlockBody() {
  const s = document.body.style; s.position = s.top = s.left = s.right = s.width = s.overflow = '';
  if (DLOCK) { const y = DLOCK.y; DLOCK = null; window.scrollTo(0, y); }
}
function closeDrawer(silent) {
  const dr = $('#drawer'), was = !dr.hidden; dr.hidden = true; unlockBody(); DSEQ++;   // always unlock (failsafe)
  if (!was) return;
  $('.dtitle').textContent = ''; try { DFOCUS && DFOCUS.focus({preventScroll: true}); } catch (e) {} DFOCUS = null;
  const pushed = DPUSH; DPUSH = false;
  if (silent) return;
  if (location.hash.startsWith('#/p/')) history.length > 1 ? history.back() : (location.hash = '#/search');
  else if (pushed && history.state && history.state.dr) history.back();
}
$('.dback').addEventListener('click', () => closeDrawer());
$('.dclose').addEventListener('click', () => closeDrawer()); $('.dbk').addEventListener('click', () => closeDrawer());
window.addEventListener('popstate', e => { if (!$('#drawer').hidden && !location.hash.startsWith('#/p/') && !(e.state && e.state.dr)) { DPUSH = false; closeDrawer(true); } });
window.addEventListener('pageshow', () => { if ($('#drawer').hidden) unlockBody(); });
(() => { // swipe down on the sheet's header bar to close (passive listeners only; content scrolling never closes)
  const pn = $('.dpanel'); let t0 = null;
  pn.addEventListener('touchstart', e => { t0 = e.touches.length === 1 && pn.scrollTop <= 0 && e.target.closest('.dbar') && !e.target.closest('button') ? {x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now()} : null; }, {passive: true});
  pn.addEventListener('touchend', e => { if (!t0) return; const p = e.changedTouches[0], dy = p.clientY - t0.y, dx = Math.abs(p.clientX - t0.x);
    if (dy > 110 && dx < dy / 2 && pn.scrollTop <= 0 && Date.now() - t0.t < 900) closeDrawer(); t0 = null; }, {passive: true});
  pn.addEventListener('touchcancel', () => { t0 = null; }, {passive: true});
})();
async function openProduct(by) {
  const dr = $('#drawer'), opening = dr.hidden, seq = ++DSEQ;
  if (opening) { DFOCUS = document.activeElement; lockBody(); dr.hidden = false;
    if (!location.hash.startsWith('#/p/')) { history.pushState({dr: 1}, '', location.href); DPUSH = true; } }
  $('.dpanel').scrollTop = 0; $('.dtitle').textContent = '';
  $('#dbody').innerHTML = '<div class="empty loading"><span class="spin"></span>Loading…</div>';
  const d = await api('./api/product?' + new URLSearchParams(by));
  if (seq !== DSEQ) return;   // closed or superseded while loading
  if (d.error) { $('#dbody').innerHTML = `<div class="empty">${esc(d.error)}</div>`; return; }
  const p = d.product; CUR = d; $('.dtitle').textContent = p.title || '';
  const img = d.photos.length ? `<div><div class="dimg" id="dimg" style="background-image:url('${esc(d.photos[0])}')"></div>${d.photos.length > 1 ? `<div class="dthumbs">${d.photos.map(u => `<img src="${esc(u)}" referrerpolicy="no-referrer" loading="lazy">`).join('')}</div>` : ''}</div>` : '<div class="dimg none">No photo in feeds</div>';
  const srcs = d.sources.map(i => `<tr><td><b>${esc(i.dist)}</b><div class="mono muted">${esc(i.item_no)}</div></td>
     <td class="r q ${i.qty < 1 ? 'zero' : i.qty <= 2 ? 'low' : ''}">${i.qty}${i.alloc ? '<small>allocated</small>' : ''}</td>
     <td class="r money cost">${money(i.cost)}${i.inbound ? `<small>+${money(i.inbound)} ship</small>` : ''}</td>
     <td class="r money cost">${money(i.landed)}${i.ship_known ? '' : '<small>+ freight?</small>'}</td>
     <td class="r money">${m0(i.map)}<small>MSRP ${m0(i.msrp)}</small></td>
     <td class="r money cost">${money(i.floor)}</td>
     <td class="small muted">${esc(i.ship_mode || '')}${i.status ? '<br>' + esc(i.status) : ''}${i.junk ? '<br><span class="chip warn">' + esc(i.junk) + '</span>' : ''}</td></tr>`).join('');
  const ev = d.events.length ? d.events.map(e => `<div class="lrow"><span class="kind ${e.kind}">${KN[e.kind]}</span><span class="t">${evText(e)}</span><span class="muted small">${ago(e.ts)}</span></div>`).join('') : '<div class="muted small">No changes recorded yet.</div>';
  const parts = [...new Set(d.sources.map(i => i.mfr_part).filter(Boolean))].join(', ');
  $('#dbody').innerHTML = `
   <div class="dhead">${img}<div style="flex:1;min-width:0">
     <div class="pb">${esc(p.bname || p.brand)}</div><h2>${esc(p.title)}</h2><div class="chips">${specChips(p)}</div>
     <div class="kv">
       <div><span>Sell (${esc(p.sug_src || '—')})</span><b>${m0(p.sug)}</b></div>
       <div><span>MAP / MSRP</span><b>${m0(p.map)} / ${m0(p.msrp)}</b></div>
       <div class="cost"><span>Best landed</span><b>${money(p.landed)}</b></div>
       <div class="cost"><span>Net at sell</span><b class="net ${p.net_at_sug >= 50 ? 'pos' : 'neg'}">${money(p.net_at_sug)}</b></div>
       <div class="cost"><span>Floor ($${META.fee.min_net} net)</span><b>${money(p.floor)}</b></div>
       <div><span>In stock</span><b>${p.total_qty} across ${p.n_instock} of ${p.n_src}</b></div>
     </div>
     <div class="mono muted">UPC ${esc(p.upc || '—')} · MFG P/N ${esc(parts || '—')}${p.model ? ' · Model ' + esc(p.model) : ''}${p.cat === 'suppressor' && p.bclass ? ' · Bore class ' + esc(BCL[p.bclass] || p.bclass) + (p.bclass_also ? ' (also rated ' + esc(p.bclass_also.split(' ').map(k => BCL[k] || k).join(', ')) + ')' : '') : ''}${p.action ? ' · ' + esc(ACTL[p.action] || p.action) : ''}</div>
     <div class="btns"><button class="btn pri" id="d-watch">${d.watched ? '★ Watching' : '☆ Watch'}</button>
       <button class="btn" id="d-fav">${(d.lists || []).includes('Favorites') ? '★ Favorite' : '☆ Favorite'}</button><button class="btn" id="d-list">＋ Quick List</button>
       <button class="btn" id="d-copy">Copy customer quote</button><button class="btn" id="d-calc">Open in quote calc</button><button class="btn" id="d-po" title="Start a distributor PO draft from a paid customer invoice (dry run only)">Start PO draft</button></div>
   </div></div>
   <div class="panel"><h3>Distributors</h3><div class="tiles">${d.tiles.map(tileHTML).join('')}</div>${(d.lists || []).length ? `<div class="muted small" style="margin-top:8px">On lists: ${esc(d.lists.join(', '))}</div>` : ''}</div>
   <div class="panel"><h3>Every distributor</h3><div class="tablewrap"><table class="grid mcards"><thead><tr><th data-m="t">Distributor</th><th class="r">Qty</th><th class="r cost">Cost</th><th class="r cost">Landed</th><th class="r">MAP / MSRP</th><th class="r cost">Floor</th><th data-m="f">Ship / status</th></tr></thead><tbody>${srcs}</tbody></table></div></div>
   <div class="panel"><h3>Quote this item</h3>
     <div class="qgrid"><label>Customer price<input id="d-price" inputmode="decimal" value="${p.sug ?? p.map ?? ''}"></label>
       <label class="cost">…or target net<input id="d-net" inputmode="decimal" placeholder="e.g. 100"></label>
       <label class="cost">Landed used<input id="d-landed" inputmode="decimal" value="${p.landed ?? (d.sources.find(s => s.landed != null)?.landed ?? '')}"></label></div>
     <div class="qout" id="d-out"></div>
     <p class="muted small" style="margin-top:12px">Customer quote text (no cost info):</p><textarea class="cq" id="d-cq"></textarea></div>
   <div class="panel"><h3>History</h3>${ev}</div>`;
  const upd = (src) => {
    const L = num($('#d-landed').value); let P = num($('#d-price').value); const N = num($('#d-net').value);
    if (src === 'net' && N != null && L != null) { P = atMap(priceFor(L, N), p.map); $('#d-price').value = P.toFixed(2); }
    $('#d-out').innerHTML = quoteBoxes(L, P, p.map);
    $('#d-cq').value = `${p.brand} ${p.stitle}\nPrice: ${P != null ? money(P) : '—'}\nPricing is valid for 24 hours from the time this quote is sent.\nGiven market conditions, current inventory may change rapidly.`;
    const cq = $('#d-cq'); cq.style.height = 'auto'; cq.style.height = (cq.scrollHeight + 4) + 'px';
  };
  $('#d-price').oninput = () => { $('#d-net').value = ''; upd(); }; $('#d-net').oninput = () => upd('net'); $('#d-landed').oninput = () => upd(); upd();
  $('#d-copy').onclick = async () => { try { await navigator.clipboard.writeText($('#d-cq').value); toast('Copied quote (no cost info)'); } catch { $('#d-cq').select(); document.execCommand('copy'); toast('Copied'); } };
  $('#d-po').onclick = () => { closeDrawer(true); location.hash = '#/orders/new?gid=' + p.gid; };
  $('#d-calc').onclick = () => { $('#qc-landed').value = $('#d-landed').value; $('#qc-price').value = $('#d-price').value; $('#qc-map').value = p.map ?? ''; $('#qc-net').value = ''; closeDrawer(true); location.hash = '#/quote'; };
  $('#d-watch').onclick = async () => {
    if (d.watched) await post('./api/watch/del', {key: p.key});
    else { const t = prompt('Optional: alert when landed cost is at or under $ (leave blank for any in-stock):', ''); if (t === null) return;
      await post('./api/watch/add', {key: p.key, title: p.brand + ' ' + p.stitle, target_cost: t, note: ''}); }
    d.watched = !d.watched; $('#d-watch').textContent = d.watched ? '★ Watching' : '☆ Watch'; toast(d.watched ? 'Added to watchlist' : 'Removed');
  };
  $('#d-fav').onclick = async () => { const on = !$('#d-fav').textContent.startsWith('★');
    await post('./api/lists/' + (on ? 'add' : 'remove'), {name: 'Favorites', key: p.key, title: (p.bname || p.brand) + ' ' + p.stitle});
    $('#d-fav').textContent = on ? '★ Favorite' : '☆ Favorite'; toast(on ? 'Added to Favorites' : 'Removed from Favorites'); };
  $('#d-list').onclick = () => addToList(p);
  $$('.dthumbs img').forEach(im => im.onclick = () => $('#dimg').style.backgroundImage = `url('${im.src}')`);
}
let CUR = null;
const num = v => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return isNaN(n) ? null : n; };
const post = (u, b) => api(u, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-RDA': '1'}, body: JSON.stringify(b)});
// pre-filled prices never go under MAP (owner 2026-10-23); a typed price under MAP only gets the amber warning
const atMap = (P, map) => map && P < map ? +(+map).toFixed(2) : P;
function quoteBoxes(L, P, map) {
  const fee = P != null ? +(META.fee.pct * P + META.fee.fixed).toFixed(2) : null, n = netAt(P, L);
  const b = [`<div><span>Price</span><b>${money(P)}</b></div>`, `<div class="cost"><span>Card fee</span><b>${money(fee)}</b></div>`,
    `<div class="cost"><span>Net profit</span><b class="net ${n == null ? '' : n >= META.fee.min_net ? 'pos' : 'neg'}">${money(n)}</b></div>`,
    `<div class="cost"><span>Margin</span><b>${n != null && P ? (n / P * 100).toFixed(1) + '%' : '—'}</b></div>`,
    `<div class="cost"><span>Floor ($${META.fee.min_net} net)</span><b>${L != null ? money(priceFor(L, META.fee.min_net)) : '—'}</b></div>`];
  if (map) b.push(`<div><span>MAP</span><b>${money(map)}</b></div>`, `<div class="${P != null && P < map ? 'belowmap' : ''}"><span>vs MAP</span><b>${P != null ? (P < map ? '⚠ Below MAP' : 'at/above MAP') : '—'}</b></div>`);
  return b.join('');
}

/* ---------- quote calc page ---------- */
function calc(src) {
  $('.feetxt').textContent = `${(META.fee.pct * 100).toFixed(2)}% + ${money(META.fee.fixed)}`; $('.minnet').textContent = META.fee.min_net;
  const L = num($('#qc-landed').value), N = num($('#qc-net').value), M = num($('#qc-map').value); let P = num($('#qc-price').value);
  if (src === 'net' && N != null && L != null) { P = atMap(priceFor(L, N), M); $('#qc-price').value = P.toFixed(2); }
  $('#qc-out').innerHTML = quoteBoxes(L, P, M);
}
$('#qc-price').oninput = () => { $('#qc-net').value = ''; calc(); }; $('#qc-net').oninput = () => calc('net');
$('#qc-landed').oninput = () => calc($('#qc-net').value ? 'net' : ''); $('#qc-map').oninput = () => calc();

/* ---------- changes ---------- */
const KN = {new:'New', back:'Back in stock', out:'Sold out', drop:'Cost ↓', up:'Cost ↑'};
const evText = e => e.kind === 'drop' || e.kind === 'up' ? `<span class="cost">${money(e.old)} → ${money(e.new)}</span>` : e.kind === 'back' ? `qty ${e.new ?? ''}` : e.kind === 'new' ? 'first seen in a feed' : 'no stock anywhere';
/* Changes page (2026-10-23): per-distributor Sold out / Back in stock / New / Price, from /api/dchanges (read-only).
   Filters (type, caliber/bore, distributor, keyword, parts) combine with tab + window, and live in the URL: #/changes?tab=sold&win=7d&type=suppressor&cal=30+cal */
const CXK = ['tab', 'win', 'type', 'cal', 'dist', 'kw', 'junk', 'held', 'new0'];
const CXD = {tab: 'sold', win: 'last', type: '', cal: '', dist: '', kw: '', junk: '', held: '', new0: ''};
const CX = Object.assign({}, CXD, (() => { try { return JSON.parse(localStorage.cxState || '{}'); } catch (e) { return {}; } })(), {seq: 0});
if (!localStorage.cxState) { if (localStorage.cxTab) CX.tab = localStorage.cxTab; if (localStorage.cxWin) CX.win = localStorage.cxWin; }
const MRS_TIP = 'Some distributors hold back the last unit of serialized items from its feed, so 0 may still mean 1 on hand. Not counted as sold out.';
const CXW = {last: 'since each distributor\u2019s last sync', '24h': 'in the last 24 hours', '7d': 'in the last 7 days'};
const CXTN = {sold: 'sold out', back: 'back in stock', new: 'new', price: 'price changes'};
const CXTYPE = {suppressor: 'Suppressors', handgun: 'Handguns', rifle: 'Rifles', shotgun: 'Shotguns', nfa: 'NFA', ammo: 'Ammo', parts: 'Parts & accessories'};
const qtx = (v, isNew) => v == null ? `<span class="muted">${isNew ? '—' : 'none'}</span>` : v <= 0 ? '<span class="z">0</span>' : `<span class="p">${v}</span>`;
const cxQS = () => { const u = new URLSearchParams(); CXK.forEach(k => { if (CX[k] && CX[k] !== CXD[k]) u.set(k, CX[k]); }); return u.toString(); };
function cxSave() {
  const s = {}; CXK.forEach(k => s[k] = CX[k]); localStorage.cxState = JSON.stringify(s);
  const want = '#/changes' + (cxQS() ? '?' + cxQS() : '');
  if (location.hash.startsWith('#/changes') && location.hash !== want) history.replaceState(null, '', want);
}
function cxFromURL() {
  const h = location.hash; const i = h.indexOf('?');
  if (!h.startsWith('#/changes') || i < 0) return;
  const u = new URLSearchParams(h.slice(i + 1)); CXK.forEach(k => CX[k] = u.get(k) || CXD[k]);
  if (!['sold', 'back', 'new', 'price'].includes(CX.tab)) CX.tab = 'sold'; if (!['last', '24h', '7d'].includes(CX.win)) CX.win = 'last';
}
function cxToUI() {
  $('#cx-dist').value = CX.dist; $('#cx-kw').value = CX.kw; $('#cx-junk').checked = CX.junk === '1';
  $('#cx-type').value = CX.type; if ($('#cx-type').value !== CX.type) $('#cx-type').innerHTML += `<option value="${esc(CX.type)}" selected>${esc(CXTYPE[CX.type] || CX.type)}</option>`;
  const isOpt = CX.cal === 'unknown' || /^(c|bc):/.test(CX.cal);
  $('#cx-calq').value = isOpt ? '' : CX.cal;
}
function cxChips(d) {
  const ch = [];
  if (CX.type) ch.push(['type', CXTYPE[CX.type] || CX.type]);
  if (CX.cal) ch.push(['cal', d && d.cal_label ? (/^(c|bc):|unknown/.test(CX.cal) ? d.cal_label : `“${CX.cal}”`) : CX.cal]);
  if (CX.dist) ch.push(['dist', CX.dist]);
  if (CX.kw) ch.push(['kw', `“${CX.kw}”`]);
  if (CX.junk === '1') ch.push(['junk', 'incl. parts/used']);
  $('#cx-chips').innerHTML = ch.map(([k, l]) => `<button type="button" class="chip cat cxchip" data-k="${k}" title="Remove this filter">${esc(l)} <span aria-hidden="true">×</span></button>`).join('');
  $('#cx-fn').textContent = ch.length; $('#cx-fn').hidden = !ch.length;
}
function cxRow(e) {
  const mrs = e.dist === 'hold-back distributor', bf = e.src === 'backfill';
  let k = e.kind, lab = {sold: 'Sold out', held: 'Maybe 1 left', back: 'Back', new: 'New'}[k], sub = '';
  if (k === 'price') { k = e.cnew < e.cold ? 'drop' : 'up'; lab = e.cnew < e.cold ? 'Cost ↓' : 'Cost ↑';
    const pct = (e.cnew - e.cold) / e.cold * 100; sub = `cost ${money(e.cold)} → ${money(e.cnew)} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`; }
  else if (k === 'sold') sub = e.n_in ? `still in stock at ${e.n_in} distributor${e.n_in === 1 ? '' : 's'}` : 'out everywhere now';
  else if (k === 'held') sub = 'possibly 1 on hand (last unit held back)';
  else if (k === 'back') sub = e.qold == null ? 'was missing from the feed' : '';
  else if (k === 'new') { sub = 'first time at ' + e.dist; if (!Math.max(e.qnew || 0, e.now_qty || 0)) { lab = 'New · 0'; k = 'new0'; sub += ', listed with no stock'; } }
  if (e.flips > 1 && e.kind !== 'new') sub += `${sub ? ' · ' : ''}changed ${e.flips}× in window`;
  const q = e.kind === 'price' ? qtx(e.now_qty) : `${qtx(e.qold, e.kind === 'new')} → ${qtx(e.qnew)}`;
  const meta = [CXTYPE[e.type] ? CXTYPE[e.type].replace(/s$/, '').replace('Parts & accessorie', 'Part/accessory') : '', e.cal || '', '#' + e.item_no].filter(Boolean).map(esc).join(' · ');
  return `<div class="cxr${e.kind === 'held' ? ' held' : ''}" data-key="${esc(e.key || '')}" role="button" tabindex="0"${mrs ? ` title="${esc(MRS_TIP)}"` : ''}>
   <div class="ci"><span class="kind ${k}">${lab}</span><span class="pb">${esc(e.brand || '')}</span><span class="pt">${esc(e.title || e.item_no)}</span>
    <div class="cm">${meta}${sub ? ` · <span class="${e.kind === 'price' ? 'cost' : ''}">${esc(sub)}</span>` : ''}</div></div>
   <div class="cd" data-l="Distributor">${esc(e.dist)}${mrs ? ` <span class="info" title="${esc(MRS_TIP)}">ⓘ</span>` : ''}</div>
   <div class="cq qa" data-l="Qty">${q}</div>
   <div class="cl money cost" data-l="Landed">${money(e.landed)}</div>
   <div class="cs money" data-l="Sell">${m0(e.sell)}</div>
   <div class="cw" data-l="Changed" title="${esc(e.ts)} CDT${bf ? ' (approximate: from saved feed copies)' : ''}">${bf ? '≈ ' : ''}${ago(e.ts)}</div></div>`;
}
async function loadChanges(fromRoute) {
  if (fromRoute) { cxFromURL(); cxToUI(); }
  if (document.body.classList.contains('cust') && CX.tab === 'price') CX.tab = 'sold';
  cxSave(); cxChips();
  $$('#cx-tab button').forEach(b => { b.classList.toggle('on', b.dataset.t === CX.tab); b.setAttribute('aria-selected', b.dataset.t === CX.tab); });
  $$('#cx-win button').forEach(b => b.classList.toggle('on', b.dataset.w === CX.win));
  const p = new URLSearchParams(cxQS()); p.set('tab', CX.tab); p.set('win', CX.win);
  const seq = ++CX.seq;
  if (!$('#cx-list').children.length) $('#cx-list').innerHTML = '<div class="empty loading"><span class="spin"></span>Loading…</div>';
  $('#cx-list').classList.add('busy');
  let d; try { d = await api('./api/dchanges?' + p); } catch (err) { if (seq === CX.seq) { $('#cx-list').classList.remove('busy'); $('#cx-list').innerHTML = '<div class="empty">Could not load changes.</div>'; } return; }
  if (seq !== CX.seq) return;
  $('#cx-list').classList.remove('busy');
  $$('#cx-tab button').forEach(b => b.querySelector('.n').textContent = (d.counts[b.dataset.t] || 0).toLocaleString());
  const ds = $('#cx-dist');
  if (ds.options.length - 1 !== d.dists.length) { ds.innerHTML = '<option value="">All distributors</option>' + d.dists.map(x => `<option>${esc(x)}</option>`).join(''); }
  ds.value = CX.dist;
  $('#cx-type').innerHTML = `<option value="">All types (${d.types.reduce((a, t) => a + t.n, 0).toLocaleString()})</option>` + d.types.map(t => `<option value="${t.v}"${t.v === CX.type ? ' selected' : ''}>${esc(t.l)} (${t.n.toLocaleString()})</option>`).join('');
  const isOpt = CX.cal === 'unknown' || /^(c|bc):/.test(CX.cal);
  $('#cx-cal').innerHTML = `<option value="">Any caliber (${d.facet_total.toLocaleString()})</option>` + (CX.cal && !isOpt ? `<option value="__txt" selected>Typed: ${esc(CX.cal)}</option>` : '') +
    d.calopts.map(o => `<option value="${esc(o.v)}"${o.v === CX.cal ? ' selected' : ''}>${esc(o.l)} (${o.n.toLocaleString()})</option>`).join('');
  cxChips(d);
  const ls = Object.entries(d.last_sync || {}).filter(([x]) => !CX.dist || x === CX.dist);
  let sum = `<b>${d.total.toLocaleString()}</b> ${CXTN[CX.tab]}${d.cal_label ? ' · ' + esc(d.cal_label) : ''}${CX.type ? ' · ' + esc((CXTYPE[CX.type] || CX.type).toLowerCase()) : ''} ${CXW[CX.win]}`;
  if (CX.win === 'last') sum += ls.length ? ' (' + ls.map(([x, t]) => `<span title="${esc(t)} CDT">${esc(x)} ${ago(t)}</span>`).join(', ') + ')' : '';
  if (d.hidden_junk) sum += ` · ${d.hidden_junk} parts/used hidden`;
  if (d.total > d.results.length) sum += ` · showing newest ${d.results.length}, narrow with filters`;
  if (CX.tab === 'sold' && d.counts.held) sum += ` · <button type="button" class="ghost sm" id="cx-held" title="${esc(MRS_TIP)}">${CX.held ? 'Hide' : 'Show'} ${d.counts.held} “maybe 1 left”</button>`;
  if (CX.tab === 'new' && d.counts.new0) sum += ` · <button type="button" class="ghost sm" id="cx-new0" title="Items a distributor added to its catalog with no stock yet (some distributors do this a lot). Not counted in New.">${CX.new0 ? 'Hide' : 'Show'} ${d.counts.new0.toLocaleString()} listed with 0 stock</button>`;
  $('#cx-summary').innerHTML = sum;
  const filt = CX.kw || CX.type || CX.cal || CX.dist;
  $('#cx-list').innerHTML = d.results.length ? '<div class="cxh"><div>Item</div><div>Distributor</div><div>Qty before → after</div><div class="cost">Landed</div><div>Sell</div><div>Changed</div></div>' + d.results.map(cxRow).join('')
    : `<div class="empty">Nothing ${({sold: 'sold out', back: 'back in stock', new: 'new', price: 'with a price change'})[CX.tab]} ${CXW[CX.win]}${filt ? ' with these filters' : ''}.${CX.win !== '7d' && filt ? ' <button type="button" class="ghost sm" id="cx-try7">Try 7 days</button>' : ''}</div>`;
  $('#cx-note').textContent = `Compares each distributor feed update with the one before. Tracked per distributor since ${d.tracking_since || 'tonight'}; Early history for some distributors was filled in from the saved feed copies (≈ times are approximate). Sold out = in stock at that distributor last time, now 0 or gone. New = item # / UPC never seen at that distributor before and in stock (catalog listings with 0 stock are behind the "listed with 0 stock" button). Caliber/bore uses the same rules as Search: cans match by bore class (30 cal = .30/.308/7.62/300 BLK class, not 9mm), guns and ammo by caliber; "338 Lapua" narrows .338 to Lapua titles. Serialized items from those distributors that drop to 0 are shown as “maybe 1 left”, not sold out.`;
}
$$('#cx-tab button').forEach(b => b.onclick = () => { CX.tab = b.dataset.t; CX.held = CX.new0 = ''; loadChanges(); });
$$('#cx-win button').forEach(b => b.onclick = () => { CX.win = b.dataset.w; loadChanges(); });
$('#cx-type').onchange = e => { const was = CX.type; CX.type = e.target.value;
  if ((was === 'suppressor') !== (CX.type === 'suppressor') && /^bc:/.test(CX.cal) && CX.type) CX.cal = '';   // bore classes only apply to cans
  loadChanges(); };
$('#cx-cal').onchange = e => { const v = e.target.value; if (v === '__txt') return; CX.cal = v; $('#cx-calq').value = ''; loadChanges(); };
$('#cx-dist').onchange = e => { CX.dist = e.target.value; loadChanges(); };
$('#cx-junk').onchange = e => { CX.junk = e.target.checked ? '1' : ''; loadChanges(); };
$('#cx-kw').oninput = e => { CX.kw = e.target.value.trim(); clearTimeout(timer); timer = setTimeout(loadChanges, 250); };
$('#cx-calq').oninput = e => { CX.cal = e.target.value.trim(); clearTimeout(timer); timer = setTimeout(loadChanges, 350); };
[$('#cx-kw'), $('#cx-calq')].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); loadChanges(); i.blur(); } }));
$('#cx-clear').onclick = () => { Object.assign(CX, {type: '', cal: '', dist: '', kw: '', junk: '', held: '', new0: ''}); cxToUI(); loadChanges(); };
$('#cx-link').onclick = async () => { cxSave(); const u = location.href;
  try { await navigator.clipboard.writeText(u); toast('Link copied: bookmark it to come back to this view'); } catch (e) { prompt('Copy this link', u); } };
$('#cx-fbtn').onclick = () => { const o = !document.body.classList.contains('cx-open'); document.body.classList.toggle('cx-open', o); $('#cx-fbtn').setAttribute('aria-expanded', o); };
$('#cx-chips').addEventListener('click', e => { const b = e.target.closest('.cxchip'); if (!b) return; const k = b.dataset.k;
  CX[k] = ''; cxToUI(); loadChanges(); });
$('#cx-summary').addEventListener('click', e => { if (e.target.id === 'cx-held') { CX.held = CX.held ? '' : '1'; loadChanges(); } if (e.target.id === 'cx-new0') { CX.new0 = CX.new0 ? '' : '1'; loadChanges(); } });
const cxOpen = r => r.dataset.key ? openProduct({key: r.dataset.key}) : toast('Not in any feed now');
$('#cx-list').addEventListener('click', e => { if (e.target.id === 'cx-try7') { CX.win = '7d'; loadChanges(); return; } const r = e.target.closest('.cxr'); if (r) cxOpen(r); });
$('#cx-list').addEventListener('keydown', e => { const r = e.target.closest('.cxr'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cxOpen(r); } });

/* ---------- watchlist ---------- */
async function loadWatch(target = '#w-table tbody', compact = false) {
  const d = await api('./api/watch');
  if (compact) {
    $(target).innerHTML = d.results.length ? d.results.slice(0, 8).map(w => { const p = w.product;
      return `<div class="lrow" data-key="${esc(w.key)}"><span class="star">${w.hit ? '●' : '○'}</span><span class="t">${esc(w.title)}</span><span class="q ${p && p.instock ? '' : 'zero'}">${p ? (p.instock ? 'q' + p.total_qty : 'OOS') : 'gone'}</span><span class="money">${p ? m0(p.sug) : ''}</span></div>`; }).join('')
      : '<div class="muted small">Nothing watched yet. Open a product and tap ☆ Watch.</div>';
    return;
  }
  $(target).innerHTML = d.results.length ? d.results.map(w => { const p = w.product;
    return `<tr data-key="${esc(w.key)}"><td><span class="star">${w.hit ? '●' : '○'}</span> <span class="pt">${esc(w.title)}</span>${p ? '' : '<div class="chip bad">not in any feed now</div>'}</td>
     <td class="r q ${p && p.instock ? '' : 'zero'}">${p ? p.total_qty : '—'}</td><td class="r money cost">${p ? money(p.landed) : '—'}</td>
     <td class="r money cost">${money(w.target_cost)}</td><td class="r money">${p ? m0(p.sug) : '—'}</td>
     <td class="small">${esc(w.note || '')}${w.events.map(e => `<div><span class="kind ${e.kind}">${KN[e.kind]}</span> <span class="muted">${ago(e.ts)}</span></div>`).join('')}</td>
     <td><button class="ghost sm mmore monly" type="button" aria-label="More actions" title="More">⋯</button><button class="ghost mrm" data-del="${esc(w.key)}">Remove<span class="monly"> from watchlist</span></button></td></tr>`; }).join('')
    : '<tr><td colspan="7" class="empty">Nothing watched yet. Open any product and tap ☆ Watch.</td></tr>';
}
$('#w-table tbody').addEventListener('click', async e => {
  const del = e.target.closest('[data-del]'); if (del) { e.stopPropagation(); await post('./api/watch/del', {key: del.dataset.del}); loadWatch(); return; }
  const tr = e.target.closest('tr[data-key]'); if (tr) openProduct({key: tr.dataset.key});
});

/* ---------- favorites + quick lists ---------- */
let LCUR = 'Favorites';
const loadingRow = n => `<tr><td colspan="${n}" class="empty loading"><span class="spin"></span>Loading…</td></tr>`;
const ddate = ts => ts ? ts.slice(0, 10) : '';
async function loadLists() {
  $('#l-table tbody').innerHTML = loadingRow(10);
  const ix = await api('./api/lists'); if (!ix.lists.some(l => l.name === LCUR)) LCUR = 'Favorites';
  $('#l-tabs').innerHTML = ix.lists.map(l => `<button data-n="${esc(l.name)}" class="${l.name === LCUR ? 'on' : ''}">${l.name === 'Favorites' ? '★ ' : ''}${esc(l.name)} <span class="muted">${n0(l.n)}</span></button>`).join('');
  $('#l-actions').innerHTML = `<a class="ghost btnlink" href="/api/lists/csv?name=${encodeURIComponent(LCUR)}" download><button class="ghost sm" type="button">⇩ Export CSV</button></a>`
    + (LCUR !== 'Favorites' ? '<button class="ghost sm danger" id="l-del" type="button">Delete list</button>' : '') + '<span class="muted small">Add items from a search row (☆ Favorite / ＋ List) or a product’s detail page.</span>';
  const d = await api('./api/lists/items?name=' + encodeURIComponent(LCUR));
  $('#l-table tbody').innerHTML = d.results?.length ? d.results.map(x => { const r = x.product;
    return `<tr data-key="${esc(x.key)}" class="${r && r.instock ? 'ins' : 'oos'}"><td class="t" title="${esc(r ? r.title : x.title)}">${r && (r.bname || r.brand) ? `<span class="pb monly">${esc(r.bname || r.brand)}</span>` : ''}${esc(r ? r.stitle : x.title)}${r ? '' : ' <span class="chip bad">not in any feed now</span>'}</td>
      <td>${esc(r ? r.bname || r.brand : '')}</td><td class="mono">${esc(r?.mfr_part || '')}</td><td class="r"><span class="${r && r.instock ? '' : 'q0'}">${r ? n0(r.total_qty) : '—'}</span></td>
      <td class="r cost">${money(r?.landed)}</td><td class="r">${money(r?.map)}</td><td class="r"><b>${money(r?.sug)}</b>${r && r.map && r.sug && Math.abs(r.sug - r.map) < 0.01 ? ' <span class="mtag monly">MAP</span>' : ''}</td><td>${r?.best_dist ? `<span class="bsb">${esc(r.best_dist)}</span>` : ''}</td><td class="muted">${ddate(x.added)}</td>
      <td><button class="ghost sm mmore monly" type="button" aria-label="More actions" title="More">⋯</button><button class="ghost sm mrm" data-rm="${esc(x.key)}">Remove<span class="monly"> from list</span></button></td></tr>`; }).join('')
    : `<tr><td colspan="10" class="empty">${LCUR === 'Favorites' ? 'No favorites yet. Select a search row and tap ☆ Favorite.' : 'This list is empty.'}</td></tr>`;
  const del = $('#l-del'); if (del) del.onclick = async () => { if (!confirm(`Delete the list “${LCUR}”? (Items stay in the catalog.)`)) return; const r = await post('./api/lists/delete', {name: LCUR}); toast(r.error || 'List deleted'); LCUR = 'Favorites'; loadLists(); };
}
$('#l-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-n]'); if (b) { LCUR = b.dataset.n; loadLists(); } });
$('#l-create').onclick = async () => { const n = $('#l-new').value.trim(); if (!n) { $('#l-new').focus(); return; } const r = await post('./api/lists/create', {name: n}); if (r.error) { toast(r.error); return; } $('#l-new').value = ''; LCUR = n; loadLists(); };
$('#l-new').addEventListener('keydown', e => { if (e.key === 'Enter') $('#l-create').click(); });
$('#l-table tbody').addEventListener('click', async e => {
  const rm = e.target.closest('[data-rm]'); if (rm) { e.stopPropagation(); await post('./api/lists/remove', {name: LCUR, key: rm.dataset.rm}); loadLists(); return; }
  const tr = e.target.closest('tr[data-key]'); if (tr) openProduct({key: tr.dataset.key});
});

/* ---------- backorders ---------- */
async function loadBackorders() {
  $('#b-table tbody').innerHTML = loadingRow(5);
  const d = await api('./api/backorders');
  $('#b-table tbody').innerHTML = d.results.length ? d.results.map(x => { const r = x.product;
    return `<tr data-key="${esc(x.key)}" class="oos"><td class="t" title="${esc(r ? r.title : x.title)}">${esc(r ? (r.bname || r.brand) + ' ' + r.stitle : x.title)}${x.gone ? ' <span class="chip bad">not in any feed</span>' : ''}</td>
      <td>${x.from.map(f => `<span class="chip">${esc(f)}</span>`).join(' ')}</td><td class="muted">${x.out_since ? esc(x.out_since.slice(0, 16)) + ' · ' + ago(x.out_since) : '—'}</td>
      <td class="r">${money(r?.map)}</td><td>${esc(r?.best_dist || '')}</td></tr>`; }).join('')
    : '<tr><td colspan="5" class="empty">Nothing on backorder. Everything on your Watchlist, Favorites and Quick Lists is in stock somewhere.</td></tr>';
}
$('#b-table tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-key]'); if (tr) openProduct({key: tr.dataset.key}); });

/* ---------- deals ---------- */
let DKIND = 'drop';
async function loadDeals() {
  if (document.body.classList.contains('cust')) { $('#d-summary').textContent = 'Deals are based on wholesale cost, so they are hidden in Customer view.'; $('#d-table thead').innerHTML = ''; $('#d-table tbody').innerHTML = ''; return; }
  $$('#d-kind button').forEach(b => b.classList.toggle('on', b.dataset.k === DKIND)); $('#d-days').hidden = DKIND !== 'drop'; $('#d-by').hidden = DKIND !== 'margin';
  $('#d-table tbody').innerHTML = loadingRow(8);
  const p = new URLSearchParams({kind: DKIND, cat: $('#d-cat').value, days: $('#d-days').value}); if (DKIND === 'margin' && $('#d-by').value) p.set('by', $('#d-by').value);
  const d = await api('./api/deals?' + p);
  $('#d-table thead').innerHTML = DKIND === 'drop' ? '<tr><th data-m="t">Title</th><th data-m="x">MFG</th><th class="r">Was</th><th class="r">Now</th><th class="r">Drop</th><th class="r">MAP</th><th class="r">Qty</th><th>When</th></tr>'
    : '<tr><th data-m="t">Title</th><th data-m="x">MFG</th><th class="r">Landed</th><th class="r" data-m="x">MAP</th><th class="r" data-ml="Sell">Sell (MAP)</th><th class="r">Net at MAP</th><th class="r">Margin</th><th class="r">Qty</th><th>Best source</th></tr>';
  $('#d-summary').innerHTML = `<b>${n0(d.total)}</b> ${DKIND === 'drop' ? 'in-stock items with a cost drop of 5% or more' : 'in-stock items selling at MAP'}${d.total > d.results.length ? ` (top ${d.results.length})` : ''} · ${d.ms} ms`;
  $('#d-table tbody').innerHTML = d.results.length ? d.results.map(r => DKIND === 'drop'
    ? `<tr data-gid="${r.gid}" class="ins"><td class="t" title="${esc(r.title)}">${r.bname || r.brand ? `<span class="pb monly">${esc(r.bname || r.brand)}</span>` : ''}${esc(r.stitle)}</td><td>${esc(r.bname || r.brand)}</td><td class="r muted">${money(r.deal.old)}</td><td class="r"><b>${money(r.deal.new)}</b></td>
       <td class="r net pos">−${r.deal.pct}% · ${money(r.deal.save)}</td><td class="r">${money(r.map)}</td><td class="r">${n0(r.total_qty)}</td><td class="muted">${ago(r.deal.ts)}</td></tr>`
    : `<tr data-gid="${r.gid}" class="ins"><td class="t" title="${esc(r.title)}">${r.bname || r.brand ? `<span class="pb monly">${esc(r.bname || r.brand)}</span>` : ''}${esc(r.stitle)}</td><td>${esc(r.bname || r.brand)}</td><td class="r">${money(r.landed)}</td><td class="r">${money(r.map)}</td><td class="r"><b>${money(r.sug)}</b></td>
       <td class="r net pos"><b>${money(r.deal.net_at_map)}</b></td><td class="r">${r.deal.pct}%</td><td class="r">${n0(r.total_qty)}</td><td>${esc(r.best_dist || '')}</td></tr>`).join('')
    : `<tr><td colspan="8" class="empty">${DKIND === 'drop' ? 'No cost drops of 5%+ on in-stock items in this window yet. Drops are detected as feeds refresh.' : 'Nothing found.'}</td></tr>`;
}
$$('#d-kind button').forEach(b => b.onclick = () => { DKIND = b.dataset.k; loadDeals(); });
['#d-cat', '#d-days', '#d-by'].forEach(s => $(s).onchange = loadDeals);
$('#d-table tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-gid]'); if (tr) location.hash = '#/p/' + tr.dataset.gid; });

/* ---------- feeds / home ---------- */
const hhmm = ts => { if (!ts) return ''; const t = new Date(ts.replace(' ', 'T')), n = new Date(); const s = t.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  if (t.toDateString() === n.toDateString()) return s; const y = new Date(n - 864e5); return (t.toDateString() === y.toDateString() ? 'yesterday ' : t.toLocaleDateString([], {weekday: 'short'}) + ' ') + s; };
function feedRows(d) { return d.feeds.map(f => `<div class="frow fh"><span><span class="dot ${f.health}"></span>${esc(f.name)}</span><span class="muted small">last ${esc(hhmm(f.at))}${f.next_txt ? ` · next ~${esc(f.next_txt)}` : ''}</span>${f.reason ? `<span class="fwhy ${f.health}">${esc(f.reason)}</span>` : ''}</div>`).join(''); }
async function loadFeeds() {
  const d = await api('./api/feeds');
  $('#feeds-head').innerHTML = `Search index built <b>${esc(d.index_built)}</b>${d.index_pending.length ? ` · rebuilding soon for: ${esc(d.index_pending.join(', '))}` : ' · up to date'} · ${d.n_products.toLocaleString()} products from ${d.n_items.toLocaleString()} distributor listings`;
  $('#f-table tbody').innerHTML = d.feeds.map(f => `<tr><td><span class="dot ${f.health}"></span><b>${esc(f.name)}</b></td><td>${esc(f.status)}</td><td>${esc(hhmm(f.at))} <span class="muted small">(${ago(f.at)})</span>${f.reason ? `<div class="fwhy ${f.health}">${esc(f.reason)}</div>` : ''}</td><td>${f.next_txt ? '~' + esc(f.next_txt) : '<span class="muted">manual</span>'}</td><td class="r">${f.rows?.toLocaleString() ?? '—'}</td><td class="muted">${esc(f.mode || 'full')}</td></tr>`).join('');
  $('#catstats').innerHTML = d.stats.map(s => `<div class="frow"><span>${esc(CATN[s.cat] || s.cat)}</span><span class="muted small">${s.clean.toLocaleString()} in stock (clean) · ${s.total.toLocaleString()} listed</span></div>`).join('');
}
async function loadHome() {
  const d = await api('./api/feeds');
  const by = Object.fromEntries(d.stats.map(s => [s.cat, s])), bad = d.feeds.filter(f => f.health === 'amber' || f.health === 'red').length;
  const card = (cat, l) => `<div class="card" data-cat="${cat}"><div class="l">${l}</div><div class="n">${(by[cat]?.clean || 0).toLocaleString()}</div><div class="s">in stock</div></div>`;
  $('#statcards').innerHTML = card('suppressor', 'Suppressors') + card('handgun', 'Handguns') + card('long_gun', 'Long guns') + card('nfa', 'NFA / SBR') + card('ammo', 'Ammo')
    + `<div class="card" data-cat=""><div class="l">Browse all</div><div class="n">${d.stats.reduce((t, s) => t + (s.clean || 0), 0).toLocaleString()}</div><div class="s">in stock · filter without typing</div></div>`
    + `<div class="card" onclick="location.hash='#/feeds'"><div class="l">Feeds</div><div class="n" style="color:${bad ? 'var(--warn)' : 'var(--good)'}">${d.feeds.length - bad}/${d.feeds.length}</div><div class="s">healthy · index ${esc(d.index_built.slice(11))}${(() => { const nx = d.feeds.filter(f => f.next_run).sort((a, b) => a.next_run < b.next_run ? -1 : 1)[0]; return nx ? ` · next pull ~${esc(nx.next_txt)}` : ''; })()}</div></div>`;
  $$('#statcards .card[data-cat]').forEach(c => c.onclick = () => { $('#f-cat').value = c.dataset.cat; $('#f-bc').value = ''; $('#f-act').value = ''; location.hash = '#/search'; loadFacets().catch(() => {}); doSearch(); });
  $('#home-feeds').innerHTML = feedRows(d);
  loadWatch('#home-watch', true);
  const c = await api('./api/changes?kind=new,back,drop&guns=1&days=7');
  $('#home-changes').innerHTML = c.results.length ? c.results.slice(0, 12).map(e => `<div class="lrow" data-key="${esc(e.key)}"><span class="kind ${e.kind}">${KN[e.kind]}</span><span class="t"><span class="pb">${esc(e.brand)}</span>${esc(e.stitle)}</span><span class="muted small">${ago(e.ts)}</span></div>`).join('')
    : `<div class="muted small">Tracking since ${esc(c.since || 'now')}. New arrivals, restocks and cost drops show up here as feeds refresh.</div>`;
}
['#home-watch', '#home-changes'].forEach(s => $(s).addEventListener('click', e => { const r = e.target.closest('[data-key]'); if (r) openProduct({key: r.dataset.key}); }));

/* ---------- suppliers (settings) ---------- */
const TERMF = [['terms_confirmed', 'Terms confirmed (yes / partial / no) - anything but yes shows Est.'], ['ship_to_rda_flat_per_order', 'Ship to RDA, flat per order $'], ['ship_to_rda_per_gun', 'Ship to RDA, per firearm $'],
  ['ship_to_rda_per_item', 'Ship to RDA, per non-firearm item $'], ['free_ship_over_amount', 'Free shipping over $ (waives flat fee)'], ['small_order_fee', 'Small-order handling $'], ['small_order_under', 'Small-order handling applies under $'], ['firearm_surcharge', 'Firearm surcharge $ (per gun)'], ['nfa_surcharge', 'NFA / suppressor surcharge $'],
  ['nfa_ships_free', 'NFA ships free (yes/no/unknown)'], ['drop_ship_fee', 'Drop-ship fee $'], ['drop_ship_fee_basis', 'Drop-ship fee basis'], ['status', 'Notes / status'], ['source', 'Where these terms came from']];
const MAPF = [['sku', 'Item # / SKU'], ['upc', 'UPC'], ['name', 'Description'], ['brand', 'Brand / mfr'], ['model', 'Model / mfr part #'], ['category', 'Category'],
  ['cost', 'Your cost'], ['map', 'MAP'], ['msrp', 'MSRP / retail'], ['qty', 'Qty available']];
const GUESS = {sku: /^(item|sku|item ?#|item ?no|item_?number|part ?#|stock ?#)/i, upc: /upc|gtin|barcode/i, name: /desc|name|title/i, brand: /brand|manuf|mfg|vendor/i,
  model: /model|mpn|mfg ?part|mfr ?part/i, category: /categ|dept|type/i, cost: /cost|dealer|price$|your ?price|wholesale/i, map: /^map|min.*adv/i, msrp: /msrp|retail|list/i, qty: /qty|quant|stock|avail|inventory/i};
let SUPS = null, WIZ = null;
async function spost(path, body) {
  const r = await fetch(path, {method: 'POST', headers: {'X-RDA': '1', 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  let d = {}; try { d = await r.json(); } catch {} if (!r.ok && !d.error) d.error = 'HTTP ' + r.status; return d;
}
function supHealth(s) {
  if (!s.enabled) return 'off'; if (s.health) return s.health; const st = s.status?.state || '';
  if (!st) return s.builtin ? 'amber' : 'off'; if (!st.startsWith('ok')) return 'red';
  const age = s.status.at ? (Date.now() - new Date(s.status.at.replace(' ', 'T'))) / 60000 : 1e9; return age > 26 * 60 ? 'red' : age > 180 ? 'amber' : 'green';
}
function supCard(s) {
  const st = s.status || {}, h = supHealth(s), t = s.terms || {};
  const ag = s.agents.length ? s.agents.map(a => `<div class="agent"><code>${esc(a.label.replace(/^.*\.inventory\./, ''))}</code> ${esc(a.schedule || 'no schedule')}
      <span class="chip ${a.disabled ? 'bad' : a.running ? 'warn' : a.loaded ? 'good' : ''}">${a.disabled ? 'disabled' : a.running ? 'running now' : a.loaded ? 'loaded' : 'not loaded'}</span>${a.last_exit && /^-?\d+$/.test(a.last_exit) && a.last_exit !== '0' ? ` <span class="chip bad">last exit ${esc(a.last_exit)}</span>` : ''}</div>`).join('')
    : '<div class="agent muted">No scheduled job yet' + (s.builtin ? '' : ' (activate it in the setup wizard)') + '</div>';
  const fee = t.drop_ship_fee && !/unknown|n\/a/i.test(t.drop_ship_fee) ? '$' + t.drop_ship_fee + (t.drop_ship_fee_basis && t.drop_ship_fee_basis !== 'unknown' ? ' ' + t.drop_ship_fee_basis : '') : (t.drop_ship_fee || 'unknown');
  return `<div class="scard ${s.enabled ? '' : 'off'}" data-id="${esc(s.id)}">
    <div class="shead"><span class="dot ${h}"></span><b>${esc(s.name)}</b>${s.builtin ? '' : ' <span class="chip cat">added</span>'}<span class="grow"></span>
      <label class="switch" title="${s.enabled ? 'Turn off: stops its scheduled jobs and hides it from search' : 'Turn on: reloads its jobs and adds it back to search'}"><input type="checkbox" data-act="enable" ${s.enabled ? 'checked' : ''}><span></span></label></div>
    <div class="srow"><span class="muted">Feed</span><span>${esc(s.source)}</span></div>
    <div class="srow"><span class="muted">Last sync</span><span>${st.state ? `<b class="${st.state.startsWith('ok') ? 'okt' : 'badt'}">${esc(st.state)}</b> · ${esc(st.at)} <span class="muted small">(${ago(st.at)})</span>${st.rows ? ' · ' + Number(st.rows).toLocaleString() + ' rows' : ''}` : '<span class="muted">never</span>'}</span></div>
    <div class="srow"><span class="muted">Schedule</span><span>${ag}</span></div>
    <div class="srow"><span class="muted">Drop-ship fee</span><span>${esc(fee)}${t.status ? ' <span class="muted small">· ' + esc(t.status) + '</span>' : ''}</span></div>
    <div class="sbtn"><button class="ghost" data-act="test">Test connection</button><button class="ghost" data-act="run" ${s.enabled && s.agents.length ? '' : 'disabled'}>Run now</button>
      <button class="ghost" data-act="terms">Shipping terms</button><button class="ghost" data-act="creds">Login / credentials</button>
      ${s.builtin ? '' : '<button class="ghost" data-act="edit">Edit setup</button><button class="ghost danger" data-act="remove">Remove</button>'}</div>
    <div class="sout" hidden></div><div class="sform" hidden></div></div>`;
}
let STAB = '';
function credCell(s) {
  const t = s.last_test; if (!s.enabled) return '<span class="muted">feed off</span>';
  if (!t) return '<span class="muted">not tested</span>';
  return `<span class="${t.ok ? 'okt' : 'badt'}">${t.ok ? '✓ Valid' : '✗ Failed'}</span> <span class="muted small">${ago(t.at)}</span>`;
}
function feedCell(s) { const st = s.status || {}, h = supHealth(s); return `<span class="dot ${h}"></span>${st.state ? esc(st.state) + ` <span class="muted small">${ago(st.at)}${st.rows ? ' · ' + n0(st.rows) + ' rows' : ''}</span>` : '<span class="muted">never synced</span>'}`; }
function orderCell(s) { const o = s.order; return o ? `<span title="${esc(o.detail || '')}">${esc(o.summary || o.method || 'see notes')}</span>` : '<span class="muted">Not connected (feed only)</span>'; }
function renderSupSummary() {
  const L = SUPS.suppliers.slice().sort((a, b) => (a.sort ?? 99) - (b.sort ?? 99) || a.name.localeCompare(b.name));
  $('#s-tabs').innerHTML = `<button data-id="" class="${STAB ? '' : 'on'}">Summary</button>` + L.map(s => `<button data-id="${esc(s.id)}" class="${STAB === s.id ? 'on' : ''}"><span class="dot ${supHealth(s)}"></span>${esc(s.name)}</button>`).join('');
  $('#s-sum tbody').innerHTML = L.map(s => `<tr data-id="${esc(s.id)}" class="${s.enabled ? '' : 'oos'}"><td><b>${esc(s.name)}</b></td><td>${credCell(s)}</td><td>${feedCell(s)}</td><td>${orderCell(s)}</td>
    <td><label class="switch" title="Show this distributor's tile under search results"><input type="checkbox" data-disp ${s.display !== false ? 'checked' : ''}><span></span></label></td>
    <td><input class="so" data-sort inputmode="numeric" value="${esc(s.sort ?? '')}" maxlength="2"></td></tr>`).join('');
  $('#s-sumwrap').hidden = !!STAB; $('#s-sumnote').hidden = !!STAB;
  $$('#s-list .scard').forEach(c => c.hidden = !!STAB && c.dataset.id !== STAB);
}
$('#s-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (b) { STAB = b.dataset.id; renderSupSummary(); } });
$('#s-sum').addEventListener('change', async e => {
  const tr = e.target.closest('tr[data-id]'); if (!tr) return; const id = tr.dataset.id, body = {id};
  if (e.target.matches('[data-disp]')) body.display = e.target.checked; else if (e.target.matches('[data-sort]')) body.sort = e.target.value; else return;
  const d = await spost('./api/suppliers/display', body); toast(d.error || 'Saved');
  if (!d.error) { SUPS = await api('./api/suppliers'); renderSupSummary(); }
});
async function loadSuppliers() {
  if (!SUPS) $('#s-sum tbody').innerHTML = loadingRow(6);
  SUPS = await api('./api/suppliers');
  $('#s-list').innerHTML = SUPS.suppliers.map(supCard).join(''); renderSupSummary();
  $('#s-keychain').textContent = SUPS.keychain;
  $('#s-needs').innerHTML = SUPS.needs_custom_code.map(x => `<li>${esc(x)}</li>`).join('');
}
const supBy = id => SUPS.suppliers.find(s => s.id === id);
function termsForm(s) {
  const t = s.terms || {};
  return `<form data-f="terms"><div class="fgrid">${TERMF.map(([k, l]) => `<label>${l}<input name="${k}" value="${esc(t[k] ?? 'unknown')}" maxlength="300"></label>`).join('')}</div>
    <div class="sbtn"><button class="pill on">Save terms</button><button type="button" class="ghost" data-act="close">Cancel</button><span class="muted small">Saved to shipping-terms.csv (old copy backed up). Landed cost in search updates on the next index build.</span></div></form>`;
}
function credsForm(s) {
  const c = s.creds;
  if (!c.fields.length) return `<div class="muted small">${esc(c.note || 'No credentials file for this supplier.')}</div><div class="sbtn"><button type="button" class="ghost" data-act="close">Close</button></div>`;
  return `<form data-f="creds" autocomplete="off"><div class="muted small">${esc(c.note || '')} Stored in <code>${esc(c.file)}</code> (chmod 600). Current secret values are never shown; type a new value only in the boxes you want to replace.</div>
    <div class="fgrid">${c.fields.map(f => `<label>${esc(f.key)} <span class="muted small">now: ${esc(f.display)}</span>
      <input name="${esc(f.key)}" type="${f.secret ? 'password' : 'text'}" placeholder="${f.secret ? 'new value (leave blank to keep)' : esc(f.display)}" autocomplete="new-password" spellcheck="false"></label>`).join('')}</div>
    <div class="sbtn"><button class="pill on">Replace filled-in values</button><button type="button" class="ghost" data-act="close">Cancel</button><span class="muted small">The old file is backed up first. Run “Test connection” afterward.</span></div></form>`;
}
function showOut(card, ok, msg) { const o = card.querySelector('.sout'); o.hidden = false; o.className = 'sout ' + (ok ? 'okb' : 'badb'); o.textContent = msg; }
$('#s-list').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.type === 'checkbox') return; const card = b.closest('.scard'), s = supBy(card.dataset.id), f = card.querySelector('.sform');
  const act = b.dataset.act;
  if (act === 'close') { f.hidden = true; return; }
  if (act === 'terms' || act === 'creds') { f.innerHTML = act === 'terms' ? termsForm(s) : credsForm(s); f.hidden = false; f.querySelector('input')?.focus(); return; }
  if (act === 'edit') { openWiz(s); return; }
  if (act === 'remove') {
    if (!confirm(`Remove ${s.name}? Its job is unloaded and its files are moved to the backup folder (not deleted).`)) return;
    const d = await spost('./api/suppliers/remove', {id: s.id}); toast(d.error || 'Removed'); loadSuppliers(); return;
  }
  b.disabled = true; const old = b.textContent; b.textContent = act === 'test' ? 'Testing…' : 'Starting…';
  try {
    const d = await spost('./api/suppliers/' + act, {id: s.id});
    if (act === 'test') showOut(card, d.ok, `${d.ok ? '✓' : '✗'} ${d.what ? d.what + ': ' : ''}${d.msg || d.error || ''}${d.secs != null ? ` (${d.secs}s)` : ''}`);
    else { showOut(card, !d.error, d.error || 'Update started. Last sync refreshes when it finishes.'); setTimeout(loadSuppliers, 8000); }
  } finally { b.disabled = false; b.textContent = old; }
});
$('#s-list').addEventListener('change', async e => {
  const cb = e.target.closest('[data-act=enable]'); if (!cb) return; const card = cb.closest('.scard'), s = supBy(card.dataset.id), on = cb.checked;
  if (!on && !confirm(`Turn off ${s.name}? Its scheduled updates stop and its items leave search until you turn it back on.`)) { cb.checked = true; return; }
  cb.disabled = true; const d = await spost('./api/suppliers/enable', {id: s.id, enabled: on}); cb.disabled = false;
  if (d.error) { cb.checked = !on; showOut(card, false, d.error); return; }
  toast(on ? s.name + ' on' : s.name + ' off'); await loadSuppliers();
  showOut($(`.scard[data-id="${s.id}"]`), true, (d.log || []).join(' · ') + ' · search index rebuilding');
});
$('#s-list').addEventListener('submit', async e => {
  e.preventDefault(); const fm = e.target, card = fm.closest('.scard'), s = supBy(card.dataset.id);
  const vals = Object.fromEntries([...new FormData(fm)].filter(([, v]) => fm.dataset.f === 'terms' || v !== ''));
  const d = fm.dataset.f === 'terms' ? await spost('./api/suppliers/terms', {distributor: s.name, values: vals}) : await spost('./api/suppliers/cred', {id: s.id, values: vals});
  fm.querySelectorAll('input[type=password]').forEach(i => i.value = '');
  if (d.error) { showOut(card, false, d.error); return; }
  toast('Saved'); await loadSuppliers(); showOut($(`.scard[data-id="${s.id}"]`), true, fm.dataset.f === 'terms' ? 'Shipping terms saved.' : `Replaced ${d.changed.join(', ')}. Old file backed up. Try “Test connection”.`);
});
$('#s-reload').onclick = loadSuppliers;
/* + Add supplier now links to #/settings/new */

/* add-supplier wizard */
function openWiz(s) {
  const c = s?.custom || {}, src = c.source || {type: 'file'}, sc = c.schedule || {kind: 'daily', hour: 6, minute: 0};
  WIZ = {id: s?.id || '', map: c.map || {}, headers: null};
  const w = $('#s-wiz'); w.hidden = false;
  const opt = (v, cur, l) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`;
  w.innerHTML = `<h3>${s ? 'Edit ' + esc(s.name) : 'Add a supplier'} <a href="#" id="w-x" class="small">close ✕</a></h3>
  <form id="w-form" autocomplete="off">
    <div class="step"><span class="n">1</span><b>Name and feed type</b></div>
    <div class="fgrid">
      <label>Supplier name<input name="name" value="${esc(s?.name || '')}" required maxlength="60" ${s ? 'readonly' : ''} placeholder="e.g. Acme Outdoor Supply"></label>
      <label>How the price/stock file arrives<select name="type">${opt('file', src.type, 'File I drop in (CSV / Excel)')}${opt('https', src.type, 'Web link (HTTPS), optional API key')}${opt('ftp', src.type, 'FTP')}${opt('ftps', src.type, 'FTPS (FTP over TLS)')}${opt('sftp', src.type, 'SFTP')}</select></label>
      <label>Default category<select name="cat_default">${['accessory', 'suppressor', 'nfa', 'long_gun', 'handgun', 'ammo', 'default'].map(k => opt(k, c.cat_default || 'accessory', CATN[k])).join('')}</select></label>
    </div>
    <div class="fgrid t-https"><label class="wide">Feed URL (no keys in the link)<input name="url" value="${esc(src.url || '')}" placeholder="https://supplier.com/feed.csv"></label>
      <label>API key goes in<select name="key_mode">${opt('none', src.key_mode, 'No key')}${opt('header', src.key_mode, 'a header')}${opt('query', src.key_mode, 'the link (?param=)')}</select></label>
      <label>Header name<input name="key_header" value="${esc(src.key_header || 'Authorization')}"></label><label>Header prefix<input name="key_prefix" value="${esc(src.key_prefix || '')}" placeholder="e.g. Bearer"></label>
      <label>Link parameter<input name="key_param" value="${esc(src.key_param || 'key')}"></label></div>
    <div class="fgrid t-ftp"><label>Host<input name="host" value="${esc(src.host || '')}" placeholder="ftp.supplier.com"></label><label>Port<input name="port" value="${esc(src.port || '')}" placeholder="21 / 22"></label>
      <label class="wide">File path on server<input name="path" value="${esc(src.path || '')}" placeholder="/outgoing/inventory.csv"></label></div>
    <div class="fgrid t-cred"><label class="t-ftp">Username<input name="CUSTOM_USER" autocomplete="off" placeholder="${s ? 'leave blank to keep' : ''}"></label>
      <label class="t-ftp">Password<input name="CUSTOM_PASS" type="password" autocomplete="new-password" placeholder="${s ? 'leave blank to keep' : ''}"></label>
      <label class="t-key">API key<input name="CUSTOM_KEY" type="password" autocomplete="new-password" placeholder="${s ? 'leave blank to keep' : ''}"></label></div>
    <div class="sbtn"><button class="pill on" id="w-save">Save &amp; preview the file</button><span class="muted small">Saving stores logins in a chmod-600 file and does not schedule anything yet.</span></div>
    <div id="w-up" class="t-file" hidden><div class="step"><span class="n">2</span><b>Drop a sample of the file</b></div>
      <div class="drop" id="w-drop">Drag the supplier's CSV/Excel file here, or <label class="lnk">choose a file<input type="file" id="w-file" accept=".csv,.tsv,.txt,.xlsx" hidden></label>.
      <div class="muted small">Later updates: save new files into <code>inventory/inbox/<span class="wid"></span>/</code> and the job picks them up automatically.</div></div></div>
    <div id="w-map" hidden><div class="step"><span class="n">3</span><b>Match the columns</b> <span class="muted small" id="w-total"></span></div>
      <div class="fgrid" id="w-mapf"></div><div class="tablewrap prev"><table class="grid" id="w-prev"></table></div>
      <div class="step"><span class="n">4</span><b>Schedule and turn on</b></div>
      <div class="fgrid"><label>Update<select name="kind">${opt('daily', sc.kind, 'Once a day')}${opt('hourly', sc.kind, 'Every hour in a window')}${opt('manual', sc.kind, 'Only when I click Run now' + '')}</select></label>
        <label class="k-daily">At hour (0–23)<input name="hour" value="${esc(sc.hour ?? 6)}" inputmode="numeric"></label><label class="k-run">At minute<input name="minute" value="${esc(sc.minute ?? 0)}" inputmode="numeric"></label>
        <label class="k-hourly">From hour<input name="start" value="${esc(sc.start ?? 7)}" inputmode="numeric"></label><label class="k-hourly">To hour<input name="end" value="${esc(sc.end ?? 21)}" inputmode="numeric"></label>
        <label>Minimum rows (safety)<input name="min_rows" value="${esc(c.min_rows || 1)}" inputmode="numeric"></label></div>
      <div class="sbtn"><button type="button" class="pill on" id="w-act">Turn on supplier</button><span class="muted small">Creates a launchd job, runs it once, and adds the items to search. A file-drop supplier also updates whenever a new file lands in its inbox.</span></div></div>
    <div id="w-msg" class="sout" hidden></div>
  </form>`;
  const fm = $('#w-form'), show = () => {
    const t = fm.type.value, k = fm.kind?.value;
    w.querySelectorAll('.t-https').forEach(x => x.hidden = t !== 'https'); w.querySelectorAll('.t-ftp').forEach(x => x.hidden = !/ftp/.test(t));
    w.querySelectorAll('.t-key').forEach(x => x.hidden = !(t === 'https' && fm.key_mode.value !== 'none')); fm.querySelector('.t-cred').hidden = t === 'file' || (t === 'https' && fm.key_mode.value === 'none');
    if (k) { w.querySelectorAll('.k-daily').forEach(x => x.hidden = k !== 'daily'); w.querySelectorAll('.k-hourly').forEach(x => x.hidden = k !== 'hourly'); w.querySelectorAll('.k-run').forEach(x => x.hidden = k === 'manual'); }
  };
  fm.addEventListener('change', show); show();
  $('#w-x').onclick = e => { e.preventDefault(); w.hidden = true; WIZ = null; };
  fm.onsubmit = async e => { e.preventDefault(); await wizSave(false); };
  $('#w-act').onclick = () => wizSave(true);
  const fileIn = $('#w-file'), drop = $('#w-drop');
  fileIn.onchange = () => fileIn.files[0] && wizUpload(fileIn.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('hot'); }; drop.ondragleave = () => drop.classList.remove('hot');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('hot'); e.dataTransfer.files[0] && wizUpload(e.dataTransfer.files[0]); };
  if (s) { $('.wid').textContent = s.id; if (src.type === 'file') $('#w-up').hidden = false; wizSample(); }
  w.scrollIntoView({behavior: 'smooth'});
}
function wizMsg(ok, m) { const o = $('#w-msg'); o.hidden = false; o.className = 'sout ' + (ok ? 'okb' : 'badb'); o.textContent = m; }
function wizBody(activate) {
  const fm = $('#w-form'), v = n => fm[n]?.value?.trim() ?? '';
  const map = {}; $$('#w-mapf select').forEach(s => { if (s.value) map[s.name.slice(2)] = s.value; });
  const creds = {}; ['CUSTOM_USER', 'CUSTOM_PASS', 'CUSTOM_KEY'].forEach(k => { if (v(k)) creds[k] = fm[k].value; });
  return {id: WIZ.id || undefined, name: v('name'), cat_default: v('cat_default'), creds, map: Object.keys(map).length ? map : WIZ.map, activate,
    source: {type: v('type'), url: v('url'), key_mode: v('key_mode'), key_header: v('key_header'), key_prefix: v('key_prefix'), key_param: v('key_param'), host: v('host'), port: v('port'), path: v('path')},
    schedule: {kind: v('kind') || 'daily', hour: +v('hour') || 0, minute: +v('minute') || 0, start: +v('start') || 0, end: +v('end') || 23}, min_rows: +v('min_rows') || 1};
}
async function wizSave(activate) {
  const btn = activate ? $('#w-act') : $('#w-save'); btn.disabled = true;
  try {
    const d = await spost('./api/suppliers/custom', wizBody(activate));
    ['CUSTOM_USER', 'CUSTOM_PASS', 'CUSTOM_KEY'].forEach(k => $('#w-form')[k].value = '');
    if (d.id) { WIZ.id = d.id; $('.wid').textContent = d.id; }
    if (d.error) { wizMsg(false, d.error); return; }
    if (activate) { wizMsg(!!d.activated, (d.activated ? 'Turned on: ' : 'Saved, but launchd did not load the job: ') + (d.schedule || '') + (d.schedule && d.schedule !== 'manual' ? '' : '') + '. The first update is running; items appear in search after the index rebuilds.'); loadSuppliers(); return; }
    loadSuppliers();
    if ($('#w-form').type.value === 'file') { $('#w-up').hidden = false; wizMsg(true, 'Saved. Now drop a sample file.'); } else { wizMsg(true, 'Saved. Fetching a preview…'); wizSample(); }
  } finally { btn.disabled = false; }
}
async function wizUpload(file) {
  if (!WIZ.id) { wizMsg(false, 'Save first'); return; }
  wizMsg(true, `Uploading ${file.name} (${(file.size / 1e6).toFixed(1)} MB)…`);
  const r = await fetch(`./api/suppliers/upload?id=${encodeURIComponent(WIZ.id)}&name=${encodeURIComponent(file.name)}`, {method: 'POST', headers: {'X-RDA': '1'}, body: file});
  const d = await r.json().catch(() => ({error: 'HTTP ' + r.status}));
  if (d.error) { wizMsg(false, d.error); return; } wizSample();
}
async function wizSample() {
  if (!WIZ.id) return; wizMsg(true, 'Reading the file…');
  const d = await spost('./api/suppliers/sample', {id: WIZ.id});
  if (!d.ok) { wizMsg(false, 'Preview failed: ' + (d.error || 'unknown error')); return; }
  WIZ.headers = d.headers; $('#w-map').hidden = false; $('#w-total').textContent = `${d.total.toLocaleString()} rows · ${d.headers.length} columns`;
  const used = new Set();
  $('#w-mapf').innerHTML = MAPF.map(([k, l]) => {
    let cur = WIZ.map[k] || ''; if (!cur) { cur = d.headers.find(h => GUESS[k].test(h) && !used.has(h)) || ''; } if (cur) used.add(cur);
    return `<label>${l}${['sku', 'cost'].includes(k) ? ' *' : ''}<select name="m-${k}"><option value="">— none —</option>${d.headers.map(h => `<option ${h === cur ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`;
  }).join('');
  $('#w-prev').innerHTML = `<thead><tr>${d.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${d.rows.map(r => `<tr>${d.headers.map((h, i) => `<td>${esc(Array.isArray(r) ? r[i] : r[h])}</td>`).join('')}</tr>`).join('')}</tbody>`;
  wizMsg(true, 'Check the column matches (* = needed; SKU or UPC), pick a schedule, then turn it on.');
}

/* ---------- init ---------- */
(async () => {
  META = await api('./api/meta');
  const opt = (sel, arr, lab = x => x) => $(sel).insertAdjacentHTML('beforeend', arr.map(x => `<option value="${esc(x)}">${esc(lab(x))}</option>`).join(''));
  opt('#f-cat', META.cats, x => CATN[x] || x); opt('#f-cal', META.cals); opt('#f-thread', META.threads); opt('#f-dist', META.dists);
  opt('#d-cat', META.cats.filter(c => c !== 'default'), x => CATN[x] || x);
  (META.bclasses || []).forEach(b => BCL[b.key] = b.name);
  const setBuilt = b => { $('#built').textContent = 'Index ' + b; $('#m-built').textContent = 'Index built ' + b; }; setBuilt(META.built);
  $('#f-img').checked = !!localStorage.img;
  const last = new URLSearchParams(sessionStorage.lastq || '');
  if (last.get('q')) $('#q').value = last.get('q'); F.forEach(k => { if (last.get(k)) $('#f-' + k).value = last.get(k); });
  if (last.get('by')) $('#f-by').value = last.get('by'); if (last.get('kw')) $('#f-kw').value = last.get('kw'); if (last.get('stock') === '0') setStock(false); if (last.get('junk')) $('#f-junk').checked = true;
  if (last.get('also')) $('#f-also').checked = true;
  await loadFacets().catch(() => {});
  if (last.get('bc')) { $('#f-bc').value = last.get('bc'); } if (last.get('act')) $('#f-act').value = last.get('act');
  if (last.get('bk')) { const b = (FAC?.brands || []).find(x => x.key === last.get('bk')); if (b) { BK = b.key; $('#f-brandq').value = b.name; $('#f-brandq').classList.add('set'); $('#brandx').hidden = false; } }
  else if (last.get('brand')) { $('#f-brandq').value = last.get('brand'); $('#brandx').hidden = false; }
  route(); if ($('#v-search').classList.contains('on') && !LOADED) doSearch();
  setInterval(async () => { try { const h = await api('./api/health'); setBuilt(h.built); } catch {} }, 60000);
})();

/* phone card rows (2026-10-24): any table.mcards becomes stacked cards under 820px. Each cell gets its header text as a label;
   th data-m: t = title (full width, first), f = full width, x = hidden on phone, a = actions (⋯ menu). Desktop is unchanged. */
function mLabel() {
  document.querySelectorAll('table.mcards').forEach(t => {
    const ths = [...t.querySelectorAll('thead th')]; if (!ths.length) return;
    t.querySelectorAll('tbody tr:not([data-ml])').forEach(tr => { tr.dataset.ml = '1';
      [...tr.children].forEach((td, i) => { if (td.colSpan > 1 || !ths[i]) return; const th = ths[i], m = th.dataset.m, l = (th.dataset.ml || th.textContent).trim();
        if (m) td.classList.add('m-' + m); if (l && m !== 't' && m !== 'a') td.dataset.l = l; }); });
  });
}
new MutationObserver(() => { if (!mLabel.p) mLabel.p = requestAnimationFrame(() => { mLabel.p = 0; mLabel(); }); }).observe(document.body, {childList: true, subtree: true});
mLabel();
document.addEventListener('click', e => { const b = e.target.closest('.mmore'); if (!b) return; e.stopPropagation(); e.preventDefault();
  const tr = b.closest('tr'); const o = !tr.classList.contains('mopen'); document.querySelectorAll('tr.mopen').forEach(x => x.classList.remove('mopen')); tr.classList.toggle('mopen', o); b.setAttribute('aria-expanded', o); }, true);
