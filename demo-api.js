/* Inventory Hound - standalone demo shim.
   Answers the app's /api/* calls inside the browser from window.DEMO_DATA (all invented data).
   No network: nothing here ever contacts a server. Lists, favorites and the watchlist live in this browser (localStorage). */
(function () {
  'use strict';
  const D = window.DEMO_DATA; if (!D) return;
  const R = D.rec, NS = 'hound-demo:', OFF = 'Turned off in this demo (no logins, connections, pulls or orders).';
  /* keep the sample history current: move every recorded time forward by (now - build time) */
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const parse = s => { const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?$/.exec(s); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null; };
  const SHIFT = Math.max(0, Math.floor((Date.now() - (parse(D.built) || new Date()).getTime()) / 60000) * 60000);
  const TS = /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?$/;
  function shift(o) {
    if (!SHIFT || !o || typeof o !== 'object') return;
    for (const k in o) { const v = o[k];
      if (typeof v === 'string' && TS.test(v)) { const d = parse(v); if (d) o[k] = fmt(new Date(d.getTime() + SHIFT)).slice(0, v.length === 16 ? 16 : 19); }
      else if (v && typeof v === 'object') shift(v); }
  }
  shift(D.rec); shift(D.rows); shift(D.products); shift(D.deals); shift(D.changes); shift(D.dchanges);
  const NOW = () => fmt(new Date());
  const clone = o => JSON.parse(JSON.stringify(o));
  /* ---------- local state ---------- */
  const ls = (k, dflt) => { try { const v = localStorage.getItem(NS + k); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; } };
  const save = (k, v) => { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} };
  const ROWS = D.rows, BYKEY = {}, BYGID = {};
  ROWS.forEach(r => { BYKEY[r.key] = r; BYGID[r.gid] = r; });
  const title = r => ((r.bname || r.brand) + ' ' + (r.stitle || r.title)).trim();
  if (!ls('seeded')) {
    const pick = f => ROWS.filter(r => r.instock && f(r));
    const fav = [pick(r => r.cat === 'suppressor')[0], pick(r => r.cat === 'handgun')[1], pick(r => r.cat === 'long_gun')[0]].filter(Boolean);
    const rd = [pick(r => r.cat === 'ammo')[0], pick(r => r.cat === 'accessory')[0]].filter(Boolean);
    const it = r => ({key: r.key, title: title(r), note: '', added: NOW()});
    save('lists', [{name: 'Favorites', created: NOW(), items: fav.map(it)}, {name: 'Range day', created: NOW(), items: rd.map(it)}]);
    const w = pick(r => r.cat === 'handgun' && r.landed)[2];
    save('watch', w ? [{key: w.key, title: title(w), note: 'Restock for the counter', target_cost: Math.round(w.landed * 0.97), added: NOW()}] : []);
    save('seeded', 1);
  }
  const lists = () => { const L = ls('lists', []); if (!L.some(l => l.name === 'Favorites')) L.unshift({name: 'Favorites', created: NOW(), items: []}); return L; };
  const watch = () => ls('watch', []);
  /* ---------- search ---------- */
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[.\-_/]/g, '').replace(/\s+/g, ' ');
  const CATSYN = {suppressor: 'suppressor silencer can', handgun: 'handgun pistol revolver', long_gun: 'rifle shotgun long gun', nfa: 'nfa sbr sbs', accessory: 'accessory optic scope part', ammo: 'ammo ammunition rounds', default: 'other'};
  const STOP = new Set(['cal', 'caliber', 'calibre', 'the', 'a', 'for', 'and', 'with']);
  ROWS.forEach(r => { r._h = ' ' + norm([r.brand, r.bname, r.title, r.stitle, r.model, r.mfr_part, r.upc, r.best_item, r.cal, r.bore, r.thread, r.bclass, CATSYN[r.cat] || r.cat].join(' ')) + ' ';
    const p = D.products[r.gid]; r._d = p ? p.sources.filter(s => s.qty != null).map(s => [s.dist, s.qty]) : []; });
  function kwParse(s) { const req = [], exc = []; (s || '').replace(/(-?)"([^"]+)"|(-?)(\S+)/g, (m, n1, q, n2, w) => { const v = norm(q || w || ''); if (v && v !== '-') ((n1 || n2) ? exc : req).push(v.replace(/^\+/, '')); }); return [req, exc]; }
  const kwOk = (h, req, exc) => req.every(w => h.includes(w)) && !exc.some(w => h.includes(w));
  const num = v => (v === '' || v == null || isNaN(+v)) ? null : +v;
  function filterRows(p, skip) {
    const q = p.get('q') || '', by = p.get('by') || '', toks = norm(q).split(' ').filter(t => t && !STOP.has(t));
    const [req, exc] = kwParse(p.get('kw')); const stock = p.get('stock') !== '0', junk = p.get('junk') === '1';
    const pmin = num(p.get('pmin')), pmax = num(p.get('pmax')), cmax = num(p.get('cmax'));
    return ROWS.filter(r => {
      if (stock && !r.instock) return false; if (!junk && r.junk) return false;
      if (by === 'upc' && q) return String(r.upc).includes(q.replace(/\D/g, ''));
      if (toks.length && !toks.every(t => r._h.includes(t))) return false;
      if ((req.length || exc.length) && !kwOk(r._h, req, exc)) return false;
      const c = p.get('cat'); if (c && r.cat !== c) return false;
      const cal = p.get('cal'); if (cal && !(' ' + norm(r.cal) + ' ').includes(' ' + norm(cal) + ' ')) return false;
      const th = p.get('thread'); if (th && !(' ' + norm(r.thread) + ' ').includes(' ' + norm(th) + ' ')) return false;
      const ds = p.get('dist'); if (ds && !r._d.some(([d, qn]) => d === ds && (!stock || qn > 0))) return false;
      if (pmin != null && !(r.sug >= pmin)) return false; if (pmax != null && !(r.sug != null && r.sug <= pmax)) return false;
      if (cmax != null && !(r.landed != null && r.landed <= cmax)) return false;
      if (skip !== 'bk') { const bk = p.get('bk'); if (bk && r.bkey !== bk) return false; }
      const b = p.get('brand'); if (b && !norm(r.bname + ' ' + r.brand).includes(norm(b))) return false;
      if (skip !== 'act') { const a = p.get('act'); if (a && r.action !== a) return false; }
      const bc = p.get('bc'); if (bc && !(r.bclass === bc || (p.get('also') === '1' && (r.bclass_also || []).includes(bc)))) return false;
      return true;
    });
  }
  const SORT = {price: r => r.sug, landed: r => r.landed, net: r => r.net_at_sug, qty: r => r.total_qty, srcs: r => r.n_instock, brand: r => (r.bname || r.brand || '').toLowerCase()};
  const strip = r => { const o = Object.assign({}, r); delete o._h; delete o._d; return o; };
  function search(p) {
    const t0 = performance.now(); let rs = filterRows(p);
    const s = p.get('sort'), desc = p.get('dir') === 'desc';
    if (s && SORT[s]) { const f = SORT[s]; rs.sort((a, b) => { const x = f(a), y = f(b); if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1); }); }
    else { const q = norm(p.get('q') || ''); rs.sort((a, b) => (b.instock - a.instock) || ((norm(b.title).startsWith(q) ? 1 : 0) - (norm(a.title).startsWith(q) ? 1 : 0)) || (b.total_qty || 0) - (a.total_qty || 0)); }
    return {mode: 'search', results: rs.slice(0, 200).map(strip), total: rs.length, parsed: {}, hidden: 0, note: '', ms: Math.max(1, Math.round(performance.now() - t0)), built: R['/api/meta'].built};
  }
  const BCN = {}; (R['/api/meta'].bclasses || []).forEach(b => BCN[b.key] = b.name);
  const ACTN = {}; Object.keys(R).filter(k => k.startsWith('/api/facets')).forEach(k => (R[k].actions || []).forEach(a => ACTN[a.key] = a.name));
  function facets(p) {
    const tally = (rs, key, name) => { const m = {}; rs.forEach(r => { const k = key(r); if (!k) return; const o = m[k] || (m[k] = {key: k, name: name(r, k), n_in: 0, n: 0}); o.n++; if (r.instock) o.n_in++; }); return Object.values(m); };
    const q = new URLSearchParams(p); q.set('stock', '0');
    const brands = tally(filterRows(q, 'bk'), r => r.bkey, r => r.bname || r.brand).sort((a, b) => a.name.localeCompare(b.name));
    const actions = tally(filterRows(q, 'act'), r => r.action, (r, k) => ACTN[k] || k).sort((a, b) => b.n - a.n);
    const bcl = tally(filterRows(q), r => r.cat === 'suppressor' ? r.bclass : '', (r, k) => BCN[k] || k);
    const order = Object.keys(BCN); bcl.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    return {brands, actions, bclasses: bcl};
  }
  /* ---------- items, lists, watch ---------- */
  function product(p) {
    let gid = p.get('gid'); if (!gid && p.get('key')) { const r = BYKEY[p.get('key')]; gid = r && r.gid; }
    if (!gid && p.get('upc')) { const r = ROWS.find(x => x.upc === p.get('upc')); gid = r && r.gid; }
    const d = D.products[gid]; if (!d) return {error: 'Item not found in the demo data.'};
    const o = clone(d), k = o.product.key;
    o.watched = watch().some(w => w.key === k); o.lists = lists().filter(l => l.items.some(x => x.key === k)).map(l => l.name);
    o.fee = o.fee || R['/api/meta'].fee; return o;
  }
  const prow = k => BYKEY[k] ? strip(BYKEY[k]) : null;
  const evs = k => { const r = BYKEY[k], d = r && D.products[r.gid]; return d ? d.events : []; };
  function listsIdx() { const L = lists(); return {lists: L.map(l => ({name: l.name, n: l.items.length, created: l.created || ''})), fav_keys: (L.find(l => l.name === 'Favorites') || {items: []}).items.map(x => x.key)}; }
  function listsPost(path, b) {
    const L = lists(), name = (b.name || '').trim(), l = L.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (path === 'create') { if (!name) return {error: 'Give the list a name.'}; if (l) return {error: 'A list with that name already exists.'}; L.push({name, created: NOW(), items: []}); }
    else if (path === 'delete') { if (!l) return {error: 'No such list'}; if (l.name === 'Favorites') return {error: 'Favorites cannot be deleted.'}; L.splice(L.indexOf(l), 1); }
    else if (path === 'rename') { if (!l) return {error: 'No such list'}; l.name = (b.new || b.to || '').trim() || l.name; }
    else if (path === 'add') { if (!l) return {error: 'No such list'}; if (!l.items.some(x => x.key === b.key)) l.items.unshift({key: b.key, title: b.title || '', note: b.note || '', added: NOW()}); }
    else if (path === 'remove') { if (l) l.items = l.items.filter(x => x.key !== b.key); }
    else return {error: OFF};
    save('lists', L); return {ok: true};
  }
  function listItems(p) { const l = lists().find(x => x.name === p.get('name')); if (!l) return {error: 'no such list'}; return {name: l.name, results: l.items.map(x => Object.assign({}, x, {product: prow(x.key)}))}; }
  function listCSV(name) {
    const l = lists().find(x => x.name === name); if (!l) return '';
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return ['Title,UPC,MFG part,In stock,Total qty,Best source,Landed,MAP,Note,Added'].concat(l.items.map(x => { const r = prow(x.key) || {};
      return [x.title, r.upc, r.mfr_part, r.instock ? 'yes' : 'no', r.total_qty, r.best_dist, r.landed, r.map, x.note, x.added].map(q).join(','); })).join('\r\n') + '\r\n';
  }
  function watchList() { return {results: watch().map(w => { const r = prow(w.key), t = w.target_cost == null || w.target_cost === '' ? null : +w.target_cost;
    return Object.assign({}, w, {product: r, events: evs(w.key).slice(0, 5), hit: !!(r && r.instock && (t == null || (r.landed != null && r.landed <= t)))}); })}; }
  function backorders() {
    const m = {}; watch().forEach(w => (m[w.key] = m[w.key] || {title: w.title, from: new Set()}).from.add('Watchlist'));
    lists().forEach(l => l.items.forEach(x => (m[x.key] = m[x.key] || {title: x.title, from: new Set()}).from.add(l.name)));
    const out = []; Object.entries(m).forEach(([k, v]) => { const r = prow(k); if (r && r.instock) return;
      const o = evs(k).find(e => e.kind === 'out'); out.push({key: k, title: v.title, from: [...v.from].sort(), product: r, out_since: o ? o.ts : null, gone: !r}); });
    return {results: out};
  }
  /* ---------- deals / changes ---------- */
  const ago = days => fmt(new Date(Date.now() - days * 864e5));
  function deals(p) {
    const kind = p.get('kind') || 'drop', cat = p.get('cat') || '';
    if (kind === 'margin') return clone(D.deals[`margin|${cat}|${p.get('by') || ''}`] || {kind, results: [], total: 0, ms: 1});
    const d = clone(D.deals[`drop|${cat}|`] || {kind, results: [], total: 0, ms: 1}), since = ago(+(p.get('days') || 14));
    d.results = d.results.filter(r => !r.deal || !r.deal.ts || r.deal.ts >= since); d.total = d.results.length; return d;
  }
  const GUNS = new Set(['handgun', 'long_gun', 'nfa']);
  function changes(p) {
    const kinds = new Set((p.get('kind') || 'new,back,drop').split(',')), since = ago(+(p.get('days') || 7)), guns = p.get('guns') === '1';
    const base = D.changes.results.filter(e => e.ts >= since && (!guns || GUNS.has(e.cat)) && (p.get('junk') === '1' || !e.junk));
    const counts = {}; base.forEach(e => counts[e.kind] = (counts[e.kind] || 0) + 1);
    return {results: base.filter(e => kinds.has(e.kind)), counts, since, ms: 1};
  }
  const LAB = {}, BCL = {};
  Object.values(D.dchanges).forEach(d => (d.calopts || []).forEach(o => { if (!o.l.startsWith('Can bore: ')) LAB[o.v] = LAB[o.v] || o.l; }));
  (D.dlabels || []).forEach(o => { if (o.v.startsWith('bc:')) BCL[o.v] = o.l; });
  const LORDER = Object.keys(LAB);
  function dchanges(p) {
    const tab = p.get('tab') || 'sold', win = p.get('win') || 'last', dist = p.get('dist') || '';
    const types = new Set((p.get('type') || '').split(',').filter(Boolean)), cal = p.get('cal') || '';
    const sj = p.get('junk') === '1', sh = p.get('held') === '1', sn = p.get('new0') === '1', [req, exc] = kwParse(p.get('kw'));
    const recd = t => D.dchanges[`${t}|${win}|${dist}`] || D.dchanges[`${t}|${win}|`] || {results: []};
    const cur = recd(tab);
    const grp = (t, e) => t === 'sold' ? (e.kind === 'held' ? 'held' : 'sold') : t === 'new' ? (Math.max(e.qnew || 0, e.now_qty || 0) > 0 ? 'new' : 'new0') : t;
    const base = {sold: [], held: [], back: [], new: [], new0: [], price: []}; let hidden = 0;
    ['sold', 'back', 'new', 'price'].forEach(t => recd(t).results.forEach(e0 => { const e = Object.assign({}, e0), g = grp(t, e);
      if (!sj && e.pjunk) { if (g === tab || (g === 'held' && tab === 'sold' && sh)) hidden++; return; }
      if ((req.length || exc.length) && !kwOk(' ' + norm([e.brand, e.title, e.item_no, e.upc].join(' ')) + ' ', req, exc)) return;
      base[g].push(e); }));
    const tok = e => !types.size || types.has(e.type);
    const cm = cal === '' ? null : cal === 'unknown' ? (e => !e.known) : cal.startsWith('bc:') ? (e => e.type === 'suppressor' && e.bc === cal.slice(3))
      : cal.startsWith('c:') ? (e => e.type !== 'suppressor' && (e.ccodes || []).includes(cal.slice(2))) : (e => norm(e.title).includes(norm(cal)));
    const cok = e => !cm || cm(e);
    const counts = {}; Object.keys(base).forEach(g => counts[g] = base[g].filter(e => tok(e) && cok(e)).length);
    const tabrows = base[tab].concat(tab === 'sold' && sh ? base.held : [], tab === 'new' && sn ? base.new0 : []);
    const rows = tabrows.filter(e => tok(e) && cok(e)).sort((a, b) => a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0);
    const tcount = {}; tabrows.forEach(e => { if (cok(e)) tcount[e.type] = (tcount[e.type] || 0) + 1; });
    const trows = tabrows.filter(tok), opts = [];
    if (types.size === 1 && types.has('suppressor')) Object.entries(BCL).forEach(([v, l]) => opts.push([v, l]));
    else { const seen = new Set(); trows.forEach(e => (e.ccodes || []).forEach(c => seen.add('c:' + c)));
      [...seen].sort((a, b) => (LORDER.indexOf(a) + 1 || 999) - (LORDER.indexOf(b) + 1 || 999)).forEach(v => opts.push([v, LAB[v] || v.slice(2)]));
      if (trows.some(e => e.type === 'suppressor')) Object.entries(BCL).forEach(([v, l]) => opts.push([v, 'Can bore: ' + l])); }
    const calopts = [];
    opts.forEach(([v, l]) => { const m = v.startsWith('bc:') ? (e => e.type === 'suppressor' && e.bc === v.slice(3)) : (e => e.type !== 'suppressor' && (e.ccodes || []).includes(v.slice(2)));
      const n = trows.filter(m).length; if (n || v === cal) calopts.push({v, l, n}); });
    calopts.push({v: 'unknown', l: 'Unknown caliber', n: trows.filter(e => !e.known).length});
    return Object.assign({}, cur, {tab, win, counts, results: rows.slice(0, 500), total: rows.length, hidden_junk: hidden,
      types: (cur.types || []).map(t => ({v: t.v, l: t.l, n: tcount[t.v] || 0})), calopts,
      cal_label: cal ? (cal === 'unknown' ? 'unknown caliber' : LAB[cal] || BCL[cal] || cal) : '', facet_total: tabrows.length, ms: 1});
  }
  /* ---------- settings wizard (in memory, sample CSV only) ---------- */
  const ST = clone(R['/api/settings']), FILES = {};
  const slug = s => (String(s || 'supplier').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'supplier').slice(0, 40);
  function csvParse(t) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) { const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ',' || c === '\t' || c === '|') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
      else f += c; }
    row.push(f); if (row.some(x => x !== '')) rows.push(row); return rows;
  }
  const SYN = {sku: ['sku', 'item', 'itemno', 'item_no', 'itemnumber', 'partno', 'stock'], upc: ['upc', 'gtin', 'ean', 'barcode'], title: ['title', 'description', 'desc', 'name', 'itemname', 'productname'],
    brand: ['brand', 'manufacturer', 'mfg', 'mfr', 'make'], model: ['model'], qty: ['qty', 'quantity', 'onhand', 'available', 'stock', 'inventory', 'avail'],
    cost: ['cost', 'price', 'dealer', 'dealerprice', 'yourprice', 'wholesale', 'net'], map: ['map', 'mapprice', 'minadvertised'], msrp: ['msrp', 'retail', 'list', 'listprice'],
    category: ['category', 'cat', 'type', 'department', 'class'], condition: ['condition']};
  function preview(b) {
    const id = b.id || (b.draft && b.draft.id) || 'sample', txt = FILES[id] || D.sample_csv || '';
    const t = csvParse(txt); if (!t.length) return {error: 'The file looks empty.'};
    const cols = t[0].map(c => c.trim()), rows = t.slice(1, 21).map(r => Object.fromEntries(cols.map((c, i) => [c, r[i] == null ? '' : r[i]])));
    const guess = {}, used = new Set(); Object.entries(SYN).forEach(([k, ws]) => { const c = cols.find(c => !used.has(c) && ws.includes(c.toLowerCase().replace(/[^a-z_]/g, ''))) ||
      cols.find(c => !used.has(c) && ws.some(w => w.length > 3 && c.toLowerCase().replace(/[^a-z]/g, '').includes(w))); if (c) { guess[k] = [c]; used.add(c); } });
    const mp = Object.assign({}, guess); const dm = (b.draft && b.draft.mapping) || {}; Object.keys(dm).forEach(k => { if (dm[k]) mp[k] = [].concat(dm[k]); });
    const val = (r, k) => (mp[k] || []).map(c => r[c]).find(v => v != null && v !== '') || '';
    const money = v => { const n = parseFloat(String(v).replace(/[$,]/g, '')); return isNaN(n) ? null : n; };
    const mapped = rows.map(r => ({sku: val(r, 'sku'), upc: val(r, 'upc'), mpn: val(r, 'model'), title: val(r, 'title'), brand: val(r, 'brand'), model: val(r, 'model'),
      cost: money(val(r, 'cost')), map: money(val(r, 'map')), msrp: money(val(r, 'msrp')), category: val(r, 'category'), caliber: '', barrel: '', image: '', serialized: false,
      condition: val(r, 'condition') || 'new', qty: parseInt(val(r, 'qty'), 10) || 0, cat: ''}));
    return {ok: true, columns: cols, rows, guess, mapped, info: {file: FILES[id] ? 'your file' : 'sample-feed.csv', type: 'csv', rows: t.length - 1, size: txt.length}, qty_text_seen: []};
  }
  function settingsPost(path, b) {
    if (path === 'save') { const s = b.supplier || {}; if (!(s.name || '').trim()) return {error: 'Give the supplier a name.'};
      const id = s.id || slug(s.name); const i = ST.suppliers.findIndex(x => x.id === id); const rec = Object.assign({}, s, {id, enabled: false});
      if (i >= 0) ST.suppliers[i] = rec; else ST.suppliers.push(rec); return {ok: true, id, warning: 'Demo: saved in this page only. Nothing connects or pulls.'}; }
    if (path === 'delete') { const i = ST.suppliers.findIndex(x => x.id === b.id); if (i < 0) return {error: 'Not found'};
      if ((b.confirm || '').trim() !== ST.suppliers[i].name) return {error: 'Type the supplier name exactly to delete it.'};
      const s = ST.suppliers.splice(i, 1)[0]; return {ok: true, name: s.name, history_removed: {}, products: 0}; }
    if (path === 'preview') return preview(b);
    if (path === 'profile') return {ok: true};
    return {error: OFF};
  }
  /* ---------- router ---------- */
  function route(method, url, body) {
    const u = new URL(url, location.href), path = u.pathname.replace(/^.*\/api\//, ''), p = u.searchParams;
    if (method === 'GET') {
      if (path === 'search') return search(p);
      if (path === 'facets') return facets(p);
      if (path === 'product') return product(p);
      if (path === 'lists') return listsIdx();
      if (path === 'lists/items') return listItems(p);
      if (path === 'watch') return watchList();
      if (path === 'backorders') return backorders();
      if (path === 'deals') return deals(p);
      if (path === 'changes') return changes(p);
      if (path === 'dchanges') return dchanges(p);
      if (path === 'settings') return clone(ST);
      if (path === 'health') return Object.assign(clone(R['/api/health'] || {}), {built: R['/api/meta'].built});
      if (path === 'po/find') { const q = norm(p.get('q') || ''); return {items: ROWS.filter(r => !q || q.split(' ').every(t => r._h.includes(t))).slice(0, 20).map(r => ({gid: r.gid, brand: r.brand, title: r.title, upc: r.upc, mfr_part: r.mfr_part}))}; }
      const k = '/api/' + path + (u.search || ''); if (R[k]) return clone(R[k]);
      if (R['/api/' + path]) return clone(R['/api/' + path]);
      if (path.startsWith('settings/')) return {error: OFF};
      return [404, {error: 'not in the demo'}];
    }
    if (path === 'watch/add') { const W = watch().filter(w => w.key !== body.key); W.unshift({key: body.key, title: body.title || '', note: body.note || '', target_cost: body.target_cost === '' ? null : body.target_cost, added: NOW()}); save('watch', W); return {ok: true}; }
    if (path === 'watch/del') { save('watch', watch().filter(w => w.key !== body.key)); return {ok: true}; }
    if (path.startsWith('lists/')) return listsPost(path.slice(6), body);
    if (path.startsWith('settings/')) return settingsPost(path.slice(9), body);
    if (path.startsWith('po/')) return {error: 'Orders are view-only in this demo. The sample order shows the dry-run screen; nothing can be sent.'};
    return {error: OFF};
  }
  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = async function (input, opt) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/(^|\/)api\//.test(url.split('?')[0])) { if (realFetch) return realFetch(input, opt); throw new TypeError('offline demo'); }
    if (opt && opt.signal && opt.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const method = ((opt && opt.method) || 'GET').toUpperCase(); let body = {};
    if (method !== 'GET' && opt && opt.body != null) {
      if (typeof opt.body === 'string') { try { body = JSON.parse(opt.body); } catch (e) { body = {}; } }
      else if (opt.body.text) { const u = new URL(url, location.href), id = u.searchParams.get('id') || 'sample', t = await opt.body.text();
        FILES[id] = t.slice(0, 2e6); return new Response(JSON.stringify({ok: true, file: u.searchParams.get('name') || 'upload.csv'}), {status: 200, headers: {'Content-Type': 'application/json'}}); }
    }
    let r; try { r = route(method, url, body); } catch (e) { console.warn('demo shim', e); r = {error: 'Demo error: ' + e.message}; }
    const [st, obj] = Array.isArray(r) ? r : [200, r];
    await new Promise(res => setTimeout(res, 15));
    return new Response(JSON.stringify(obj), {status: st, headers: {'Content-Type': 'application/json'}});
  };
  /* list CSV export: build the file here instead of downloading from a server */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href*="api/lists/csv"]'); if (!a) return;
    e.preventDefault(); const name = new URL(a.getAttribute('href'), location.href).searchParams.get('name') || 'Favorites';
    const blob = new Blob([listCSV(name)], {type: 'text/csv'}), l = document.createElement('a');
    l.href = URL.createObjectURL(blob); l.download = name.replace(/[^A-Za-z0-9_-]+/g, '-') + '-demo.csv'; document.body.appendChild(l); l.click();
    setTimeout(() => { URL.revokeObjectURL(l.href); l.remove(); }, 1000);
  }, true);
  /* offline / Add to Home Screen (only when served over http(s); file:// cannot register a service worker) */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
})();
