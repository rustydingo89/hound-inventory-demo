'use strict';
/* Settings > Supplier connections (2026-10-24).
   Uniform supplier cards (built-in + added), a generic connector wizard (SFTP / FTP / FTPS / HTTPS / REST / watched folder / upload),
   column mapping with transforms, schedules. Secrets go to the macOS Keychain and are never sent back to the browser.
   Nothing here can place an order: ordering stays dry-run and the live switch is untouched. */
(() => {
let SET = null, WZ = null;
const root = () => $('#settingsroot');
const TRN = {sftp: 'SFTP', ftp: 'FTP', ftps: 'FTPS (FTP over TLS)', https: 'HTTPS file link', rest: 'REST API (JSON)', folder: 'Watched folder (fallback)', upload: 'Manual upload (fallback)'};
const FMT = {auto: 'Detect automatically', csv: 'CSV (comma)', tsv: 'TSV (tab)', pipe: 'Pipe |', delim: 'Other delimiter', xlsx: 'Excel .xlsx', json: 'JSON', xml: 'XML'};
const SCH = {manual: 'Manual only (Pull now)', interval: 'Every N minutes', hourly: 'Hourly', daily: 'Daily at a time', newfile: 'When a new file appears (folder / upload)'};
const DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const clone = o => JSON.parse(JSON.stringify(o || {}));
const getp = (o, p) => p.split('.').reduce((a, k) => a == null ? undefined : a[k], o);
function setp(o, p, v) { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach(k => { if (typeof a[k] !== 'object' || a[k] === null) a[k] = {}; a = a[k]; }); a[ks.at(-1)] = v; }
const opts = (m, cur) => Object.entries(m).map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
const NUMK = /(^|\.)(port|page_start|page_size|max_pages|skip_rows|minutes|minute|from|to)$/;

/* ---------------- list ---------------- */
window.loadSettings = async function (arg) {
  if (!root().innerHTML) root().innerHTML = '<div class="muted">Loading…</div>';
  SET = await api('./api/settings');
  root().innerHTML = `
  <div class="filters"><b class="sh">Settings</b><span class="muted small">› Supplier connections</span><span class="grow"></span>
    <button id="st-add" class="pill on">＋ Add supplier</button><button id="st-reload" class="ghost">Refresh</button></div>
  <div class="panel stnote ${SET.local ? 'okn' : ''}">${SET.local
    ? 'You are on the Mac itself, so passwords and API keys can be saved here. They go straight into the macOS Keychain and are never shown again.'
    : 'Viewing from the phone: you can view and change settings, but passwords and API keys can only be entered on the Mac at <b>the computer running the app</b>.'}
    Ordering is not touched by this page (orders stay dry-run).</div>
  <div id="st-wiz" class="panel wiz" hidden></div>
  <div id="st-list" class="sgrid">${SET.builtins.map(bCard).join('')}${SET.suppliers.map(vCard).join('')}</div>
  <div class="panel"><h3>Recent settings changes <span class="muted small">${esc(SET.config_file)}</span></h3>${auditHtml()}</div>`;
  $('#st-add').onclick = () => openWiz(null); $('#st-reload').onclick = () => loadSettings();
  if (arg === 'new') openWiz(null); else if (arg && SET.suppliers.find(s => s.id === arg)) openWiz(arg);
  const busy = SET.suppliers.some(s => s.run?.running); clearTimeout(window._stT); if (busy) window._stT = setTimeout(() => location.hash.startsWith('#/settings') && !WZ && loadSettings(), 6000);
};
function auditHtml() {
  if (!SET.audit.length) return '<div class="muted small">No changes yet.</div>';
  return '<div class="alog">' + SET.audit.slice(0, 12).map(a => `<div><span class="muted">${esc(a.ts.slice(5, 16))}</span> <b>${esc(a.action)}</b> ${esc(a.supplier)} <span class="muted small">${esc(a.client)}${a.detail ? ' · ' + esc(Object.entries(a.detail).map(([k, v]) => k + ': ' + (Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? Object.entries(v).filter(([, n]) => n).map(([t, n]) => t + ' ' + n).join(', ') : v)).join(' · ')) : ''}</span>${a.ok === false ? ' <span class="chip bad">refused</span>' : ''}</div>`).join('') + '</div>';
}
const row = (l, v) => `<div class="srow"><span class="muted">${l}</span><span>${v}</span></div>`;
function pullTxt(s) {
  if (!s.last_pull) return '<span class="muted">never</span>';
  const ok = (s.status || '').startsWith('ok');
  return `<b class="${ok ? 'okt' : 'badt'}">${esc(s.status)}</b> · ${esc(s.last_pull.slice(5, 16))} <span class="muted small">(${ago(s.last_pull)})</span>`;
}
function head(s, builtin) {
  return `<div class="shead"><span class="dot ${s.enabled ? (s.health || 'amber') : 'off'}"></span><b>${esc(s.name)}</b> <span class="chip ${builtin ? '' : 'cat'}">${builtin ? 'built-in' : 'added'}</span><span class="grow"></span>
    <label class="switch" title="${s.enabled ? 'Turn off' : 'Turn on'}"><input type="checkbox" data-act="enable" ${s.enabled ? 'checked' : ''}><span></span></label></div>`;
}
function healthRow(s) { return s.enabled ? row('Health', `${esc(s.health_reason || (s.health === 'green' ? 'on schedule' : ''))}${s.next_txt ? ` <span class="muted small">· next ~${esc(s.next_txt)}</span>` : ''}`) : row('Health', '<span class="muted">turned off</span>'); }
function bCard(s) {
  const p = s.profile || {}, sched = s.agents.map(a => esc(a.schedule || 'no schedule')).filter((v, i, A) => A.indexOf(v) === i).join(' · ');
  const creds = s.creds.fields.length ? s.creds.fields.map(f => `${esc(f.key)} ${f.set ? '<span class="okt">Saved ✓</span>' : '<span class="badt">not set</span>'}`).join(' · ') : '<span class="muted">none needed</span>';
  return `<div class="scard ${s.enabled ? '' : 'off'}" data-id="${esc(s.id)}" data-kind="b">${head(s, true)}
    ${row('Connection', esc(s.source))}${row('Schedule', sched || '<span class="muted">—</span>')}${row('Last pull', pullTxt(s))}
    ${row('Items', s.rows != null ? n0(s.rows) : '—')}${healthRow(s)}
    ${row('Account #', p.account ? esc(p.account) : '<span class="muted">not set</span>')}${row('Dealer site', p.site ? `<a href="${esc(p.site)}" target="_blank" rel="noopener">${esc(p.site.replace(/^https?:\/\//, ''))}</a>` : '<span class="muted">not set</span>')}${p.notes ? row('Notes', esc(p.notes)) : ''}
    ${row('Order method', `<span title="${esc(s.order?.detail || '')}">${esc(s.order?.summary || 'Not connected (feed only)')}</span> <span class="chip">display only</span>`)}
    ${row('Logins', `${creds}${s.creds.file ? `<div class="muted small">In <code>${esc(s.creds.file)}</code> (chmod 600, read by its script).</div>` : ''}`)}
    <div class="sbtn"><button class="ghost" data-act="test">Test connection</button><button class="ghost" data-act="pull" ${s.enabled ? '' : 'disabled'}>Pull now</button>
      <button class="ghost" data-act="terms">Shipping terms</button><button class="ghost" data-act="profile">Account &amp; site</button>
      <button class="ghost" disabled title="Built-in scripts read their login file directly. Moving it to the Keychain needs a script change - ask first.">Move to Keychain</button></div>
    <div class="muted small kcnote">“Move to Keychain” is off on purpose: the built-in script reads its own login file, so moving it needs a script change first.</div>
    <div class="sout" hidden></div><div class="sform" hidden></div></div>`;
}
function srcText(src) {
  const t = src.transport; if (!t) return '—';
  if (t === 'folder') return `${TRN[t]}: ${esc(src.folder || '')}/${esc(src.pattern || '*')}`;
  if (t === 'upload') return TRN[t];
  if (t === 'https' || t === 'rest') return `${TRN[t]}: ${esc((src.url || '').replace(/^https:\/\//, '').split(/[?#]/)[0].slice(0, 60))}${src.url && /\?/.test(src.url) ? '?…' : ''}`;
  return `${TRN[t]}: ${esc(src.host || '?')}${src.path ? ' · ' + esc(src.path) : ''}`;
}
function vCard(s) {
  const sec = Object.entries(s.secrets || {}), r = s.run || {};
  return `<div class="scard ${s.enabled ? '' : 'off'}" data-id="${esc(s.id)}" data-kind="v">${head(s, false)}
    ${row('Connection', srcText(s.source || {}) + ((s.join || {}).enabled ? ' <span class="muted small">+ joined 2nd file</span>' : ''))}${row('Schedule', esc(s.schedule_text))}
    ${row('Last pull', pullTxt(s) + (r.running ? ' <span class="chip warn">pulling now…</span>' : '') + (r.last_result && !r.last_result.ok ? `<div class="badt small">${esc(r.last_result.error || '')}</div>` : ''))}
    ${row('Items', s.rows != null ? n0(s.rows) : '—')}${healthRow(s)}
    ${row('Account #', s.account ? esc(s.account) : '<span class="muted">not set</span>')}${row('Dealer site', s.site ? `<a href="${esc(s.site)}" target="_blank" rel="noopener">${esc(s.site.replace(/^https?:\/\//, ''))}</a>` : '<span class="muted">not set</span>')}
    ${row('Order method', `${esc(s.order_method || 'Not connected (feed only)')} <span class="chip">display only</span>`)}
    ${row('Logins', sec.length ? sec.map(([k, v]) => `${esc(SET.secret_labels[k.replace('join_', '')] || k)}${k.startsWith('join_') ? ' (2nd file)' : ''} ${v ? '<span class="okt">Saved ✓</span>' : '<span class="badt">not set</span>'}`).join(' · ') + ' <span class="muted small">· macOS Keychain</span>' : '<span class="muted">none needed</span>')}
    <div class="sbtn"><button class="ghost" data-act="test">Test connection</button><button class="ghost" data-act="pull" ${r.running ? 'disabled' : ''}>Pull now</button>
      <button class="ghost" data-act="terms">Shipping terms</button><button class="ghost" data-act="edit">Edit setup</button><button class="ghost danger" data-act="delete">Delete</button></div>
    <div class="sout" hidden></div><div class="sform" hidden></div></div>`;
}
const findS = (id, kind) => kind === 'b' ? SET.builtins.find(s => s.id === id) : SET.suppliers.find(s => s.id === id);
function out(card, ok, msg) { const o = card.querySelector('.sout'); o.hidden = false; o.className = 'sout ' + (ok ? 'okb' : 'badb'); o.textContent = msg; }
function profileForm(s) {
  const p = s.profile || {};
  return `<form data-f="profile" autocomplete="off"><div class="fgrid"><label>Account #<input name="account" value="${esc(p.account || '')}" maxlength="60"></label>
    <label>Dealer site<input name="site" value="${esc(p.site || '')}" maxlength="200" placeholder="https://"></label><label class="wide">Notes<input name="notes" value="${esc(p.notes || '')}" maxlength="200"></label></div>
    <div class="sbtn"><button class="pill on">Save</button><button type="button" class="ghost" data-act="close">Cancel</button></div></form>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('#st-list [data-act]'); if (!b || b.type === 'checkbox') return;
  const card = b.closest('.scard'), kind = card.dataset.kind, s = findS(card.dataset.id, kind), f = card.querySelector('.sform'), act = b.dataset.act;
  if (act === 'close') { f.hidden = true; return; }
  if (act === 'terms') { f.innerHTML = termsForm(s); f.hidden = false; return; }
  if (act === 'profile') { f.innerHTML = profileForm(s); f.hidden = false; return; }
  if (act === 'edit') { openWiz(s.id); return; }
  if (act === 'delete') {
    const n = prompt(`Delete ${s.name}? This removes its settings, saved logins, downloaded files, its items from search, and its history / Changes entries.\n\nType the supplier name to confirm:`);
    if (n == null) return; const d = await spost('./api/settings/delete', {id: s.id, confirm: n});
    if (d.error) return out(card, false, d.error);
    toast('Deleted ' + d.name); await loadSettings(); return;
  }
  b.disabled = true; const old = b.textContent; b.textContent = act === 'test' ? 'Testing…' : 'Starting…';
  try {
    if (kind === 'b') {
      const d = await spost('./api/suppliers/' + (act === 'pull' ? 'run' : 'test'), {id: s.id});
      if (act === 'test') out(card, d.ok, `${d.ok ? '✓' : '✗'} ${d.what ? d.what + ': ' : ''}${d.msg || d.error || ''}${d.secs != null ? ` (${d.secs}s)` : ''}`);
      else out(card, !d.error, d.error || 'Pull started with the supplier’s own script. Last pull updates when it finishes.');
    } else {
      const d = await spost('./api/settings/' + act, {id: s.id});
      if (act === 'test') out(card, d.ok, (d.ok ? '✓ ' : '✗ ') + (d.message || d.msg || d.error || ''));
      else { out(card, !d.error, d.error || (d.started ? 'Pull started. This card refreshes when it finishes.' : 'A pull is already running.')); setTimeout(() => !WZ && loadSettings(), 5000); }
    }
  } finally { b.disabled = false; b.textContent = old; }
});
document.addEventListener('change', async e => {
  const cb = e.target.closest('#st-list [data-act=enable]'); if (!cb) return;
  const card = cb.closest('.scard'), kind = card.dataset.kind, s = findS(card.dataset.id, kind), on = cb.checked;
  if (!on && !confirm(`Turn off ${s.name}? Scheduled pulls stop and its items leave search until you turn it back on.`)) { cb.checked = true; return; }
  cb.disabled = true;
  const d = kind === 'b' ? await spost('./api/suppliers/enable', {id: s.id, enabled: on}) : await spost('./api/settings/save', {id: s.id, supplier: {...pick(s), enabled: on}});
  cb.disabled = false; if (d.error) { cb.checked = !on; return out(card, false, d.error); }
  toast(on ? s.name + ' on' : s.name + ' off'); loadSettings();
});
document.addEventListener('submit', async e => {
  const fm = e.target; if (!fm.closest('#st-list')) return; e.preventDefault();
  const card = fm.closest('.scard'), s = findS(card.dataset.id, card.dataset.kind), vals = Object.fromEntries(new FormData(fm));
  const d = fm.dataset.f === 'terms' ? await spost('./api/suppliers/terms', {distributor: s.name, values: vals}) : await spost('./api/settings/profile', {id: s.id, ...vals});
  if (d.error) return out(card, false, d.error);
  toast('Saved'); await loadSettings(); const c2 = $(`#st-list .scard[data-id="${s.id}"]`); if (c2) out(c2, true, fm.dataset.f === 'terms' ? 'Shipping terms saved (shipping-terms.csv, old copy backed up).' : 'Saved.');
});
const KEEP = ['name', 'enabled', 'template', 'source', 'format', 'join', 'mapping', 'transforms', 'schedule', 'account', 'site', 'order_method', 'notes'];
const pick = s => Object.fromEntries(KEEP.filter(k => k in s).map(k => [k, s[k]]));

/* ---------------- wizard ---------------- */
function openWiz(id) {
  const s = id ? SET.suppliers.find(x => x.id === id) : null;
  WZ = {id: id || '', d: s ? clone(pick(s)) : {name: '', enabled: false, template: 'blank-csv', ...clone(SET.templates['blank-csv']), schedule: {kind: 'daily', at: '06:00'}}, pv: null};
  delete WZ.d.label; renderWiz(); $('#st-wiz').scrollIntoView({block: 'start'});
}
function fld(path, label, extra = '') {
  const v = getp(WZ.d, path); return `<label>${label}<input data-k="${path}" value="${esc(v ?? '')}" ${extra}></label>`;
}
function sel(path, label, map, extra = '') { return `<label>${label}<select data-k="${path}" data-re="1" ${extra}>${opts(map, getp(WZ.d, path))}</select></label>`; }
function srcFields(base, which) {
  const src = getp(WZ.d, base) || {}, t = src.transport || 'sftp', p = base + '.';
  let h = sel(p + 'transport', 'Connection type', TRN);
  if (['sftp', 'ftp', 'ftps'].includes(t)) h += fld(p + 'host', 'Server host', 'placeholder="ftp.example.com" spellcheck="false"') + fld(p + 'port', 'Port', `inputmode="numeric" placeholder="${t === 'sftp' ? 22 : 21}"`)
    + fld(p + 'user', 'Username', 'autocomplete="off" spellcheck="false"') + fld(p + 'path', 'File path on server', 'placeholder="/folder/file.csv" spellcheck="false"')
    + (t === 'ftps' ? sel(p + 'ftps_mode', 'FTPS mode', {explicit: 'Explicit (port 21, usual)', implicit: 'Implicit (port 990)'}) : '');
  if (t === 'https' || t === 'rest') {
    h += `<label class="wide">${t === 'rest' ? 'API URL (inventory GET only)' : 'File URL'}<input data-k="${p}url" value="${esc(src.url || '')}" placeholder="https://" spellcheck="false"></label>`
      + sel(p + 'auth', 'Login', {none: 'None (link is private)', basic: 'Username + password', header: 'API key / token header'});
    if (src.auth === 'basic') h += fld(p + 'user', 'Username', 'autocomplete="off"');
    if (src.auth === 'header') h += fld(p + 'header_name', 'Header name', 'placeholder="Authorization"') + fld(p + 'header_prefix', 'Value prefix (optional)', 'placeholder="Bearer "');
    if (t === 'rest') h += fld(p + 'json_path', 'Items are at (JSON path)', 'placeholder="data.items"') + fld(p + 'page_param', 'Page parameter (optional)', 'placeholder="page"')
      + fld(p + 'page_start', 'First page #', 'inputmode="numeric" placeholder="1"') + fld(p + 'size_param', 'Page-size parameter', 'placeholder="per_page"')
      + fld(p + 'page_size', 'Page size', 'inputmode="numeric"') + fld(p + 'next_path', 'or: next-page URL at (JSON path)', 'placeholder="links.next"') + fld(p + 'max_pages', 'Max pages', 'inputmode="numeric" placeholder="50"');
  }
  if (t === 'folder') h += fld(p + 'folder', 'Folder on this Mac', 'placeholder="~/Downloads"') + fld(p + 'pattern', 'File name pattern', 'placeholder="*.csv"');
  if (t === 'upload') h += `<label class="wide">File to upload<input type="file" data-up="${which}"></label>`;
  return h;
}
function secretBox(which) {
  const src = (which === 'join' ? WZ.d.join?.source : WZ.d.source) || {}, pre = which === 'join' ? 'join_' : '';
  const need = []; const t = src.transport;
  if (['sftp', 'ftp', 'ftps'].includes(t) || ((t === 'https' || t === 'rest') && src.auth === 'basic')) need.push('password');
  if ((t === 'https' || t === 'rest') && src.auth === 'header') need.push('token');
  if (!need.length) return '';
  const saved = (WZ.id && SET.suppliers.find(x => x.id === WZ.id)?.secrets) || {};
  return `<div class="secbox">${need.map(k => { const f = pre + k, ok = saved[f]; return `<div class="secrow" data-sec="${f}"><span><b>${esc(SET.secret_labels[k])}</b> ${ok ? '<span class="okt">Saved ✓</span>' : '<span class="badt">not saved</span>'}</span>
    ${!WZ.id ? '<span class="muted small">Save the supplier first, then add this.</span>' : !SET.local ? '<span class="muted small">Enter on the Mac (127.0.0.1) only.</span>'
      : `<input type="password" autocomplete="new-password" spellcheck="false" placeholder="${ok ? 'Replace with a new value' : 'Paste it here'}"><button type="button" class="ghost sm" data-w="secset">${ok ? 'Replace' : 'Save'}</button>${ok ? '<button type="button" class="ghost sm" data-w="secdel">Remove</button>' : ''}`}</div>`; }).join('')}
    <div class="muted small">Stored in the macOS Keychain as rda-inventory/${esc(WZ.id || '…')}/${need.map(k => pre + k).join(', ')}. Never shown again, never written to settings files or logs.</div></div>`;
}
function fmtFields(base) {
  const f = getp(WZ.d, base) || {}, p = base + '.', t = f.type || 'auto';
  let h = sel(p + 'type', 'File format', FMT);
  if (t === 'delim') h += fld(p + 'delimiter', 'Delimiter', 'maxlength="3" placeholder=";"');
  if (!['json', 'xml', 'xlsx'].includes(t)) h += `<label>Header row<select data-k="${p}header" data-re="1">${opts({true: 'First row is column names', false: 'No header row'}, f.header !== false)}</select></label>`;
  if (f.header === false && !['json', 'xml'].includes(t)) h += `<label class="wide">Column names, in order (comma separated)<input data-k="${p}columns" value="${esc((f.columns || []).join(', '))}" placeholder="Item, UPC, Description, Qty, Price"></label>`;
  if (!['json', 'xml'].includes(t)) h += fld(p + 'skip_rows', 'Skip lines at top', 'inputmode="numeric" placeholder="0"');
  if (t === 'json' || t === 'auto') h += fld(p + 'json_path', 'JSON: items at', 'placeholder="(auto)"');
  if (t === 'xml' || t === 'auto') h += fld(p + 'xml_item', 'XML: item tag', 'placeholder="(auto)"');
  h += fld(p + 'zip_member', 'If zipped: file inside', 'placeholder="*.csv (largest file)"');
  return h;
}
function schedFields() {
  const s = WZ.d.schedule || {}, k = s.kind || 'manual';
  let h = sel('schedule.kind', 'When to pull', SCH);
  if (k === 'interval') h += fld('schedule.minutes', 'Every (minutes, 15+)', 'inputmode="numeric" placeholder="60"');
  if (k === 'hourly') h += fld('schedule.minute', 'At minute', 'inputmode="numeric" placeholder="0"') + fld('schedule.from', 'From hour (0-23)', 'inputmode="numeric" placeholder="6"') + fld('schedule.to', 'To hour (0-23)', 'inputmode="numeric" placeholder="20"');
  if (k === 'daily') h += `<label>At<input type="time" data-k="schedule.at" value="${esc(s.at || '06:00')}"></label>`;
  if (['interval', 'hourly', 'daily'].includes(k)) { const ds = s.days || [0, 1, 2, 3, 4, 5, 6]; h += `<label class="wide">Days<span class="days">${DN.map((n, i) => `<label class="dchk"><input type="checkbox" data-day="${i}" ${ds.includes(i) ? 'checked' : ''}>${n}</label>`).join('')}</span></label>`; }
  return h;
}
const qtyTextStr = m => Object.entries(m || {}).map(([k, v]) => `${k}=${v}`).join(', ');
function parseMap(s, num) { const o = {}; String(s || '').split(/[,\n]/).forEach(p => { const i = p.lastIndexOf('='); if (i > 0) { const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim(); if (k !== '' || i > 0) o[k] = num ? (parseInt(v, 10) || 0) : v; } }); return o; }
function mapSection() {
  const cols = WZ.pv?.columns || [], m = WZ.d.mapping || {}, t = WZ.d.transforms || {};
  if (!cols.length) return '<div class="muted small">Load the preview to pick columns.</div>';
  const copt = cur => `<option value="">— not in file —</option>` + cols.map(c => `<option value="${esc(c)}" ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const rows = SET.fields.map(([k, l, help]) => {
    const cur = [].concat(m[k] || []); const list = cur.length ? cur : [''];
    const multi = ['qty', 'title'].includes(k);
    return `<div class="mrow"><span class="ml">${esc(l)}${help ? `<span class="muted small">${esc(help)}</span>` : ''}</span><span class="mv">${list.map((c, i) => `<select data-map="${k}" data-i="${i}">${copt(c)}</select>`).join('')}${multi ? `<button type="button" class="ghost sm" data-w="addcol" data-f="${k}">＋ ${k === 'qty' ? 'add warehouse' : 'add column'}</button>` : ''}</span></div>`;
  }).join('');
  const sc = t.scale || {}, df = t.defaults || {};
  const noId = !(m.sku || []).filter(Boolean).length && !(m.upc || []).filter(Boolean).length;
  return `${noId ? '<div class="sout badb">Pick the SKU (item #) or UPC column. Without one, items can\'t be tracked between pulls.</div>' : ''}<div class="maps">${rows}</div>
  <div class="step sub">Transforms <span class="muted small">($ signs and commas are always stripped from prices and quantities)</span></div>
  <div class="fgrid">
    <label class="wide">Text quantities → numbers <span class="muted small">e.g. Y=1, N=0, 10+=10, Call=0, Limited*=1 (* = starts with)</span><input data-k="transforms.qty_text" data-kind="qmap" value="${esc(qtyTextStr(t.qty_text) || (WZ.pv?.qty_text_seen?.length ? WZ.pv.qty_text_seen.map(v => `${v}=${/^(y|yes|in stock|true|available)$/i.test(v) ? 1 : /^\d+\+$/.test(v) ? parseInt(v) : 0}`).join(', ') : ''))}"></label>
    ${WZ.pv?.qty_text_seen?.length ? `<div class="muted small wide">Text found in qty columns: ${WZ.pv.qty_text_seen.map(esc).join(' · ')}</div>` : ''}
    <label>Multiply cost by<input data-k="transforms.scale.cost" value="${esc(sc.cost ?? '')}" inputmode="decimal" placeholder="1 (e.g. 0.01 if in cents)"></label>
    <label>Multiply MAP by<input data-k="transforms.scale.map" value="${esc(sc.map ?? '')}" inputmode="decimal" placeholder="1"></label>
    <label>Multiply MSRP by<input data-k="transforms.scale.msrp" value="${esc(sc.msrp ?? '')}" inputmode="decimal" placeholder="1"></label>
    <label>Multiply qty by<input data-k="transforms.scale.qty" value="${esc(sc.qty ?? '')}" inputmode="decimal" placeholder="1"></label>
    <label>Default brand (if blank)<input data-k="transforms.defaults.brand" value="${esc(df.brand ?? '')}"></label>
    <label>Default qty (if no qty column)<input data-k="transforms.defaults.qty" value="${esc(df.qty ?? '')}" inputmode="numeric"></label>
    <label>Category if unknown<select data-k="transforms.cat_default">${opts(Object.fromEntries(SET.cats.map(c => [c, CATN[c] || c])), t.cat_default || 'accessory')}</select></label>
    <label class="wide">Category names → app categories <span class="muted small">e.g. Rifles=long_gun, Silencers=suppressor</span><input data-k="transforms.category_map" data-kind="cmap" value="${esc(qtyTextStr(t.category_map))}"></label>
    <label class="chk wide"><input type="checkbox" data-k="transforms.serialized_hide_last" ${t.serialized_hide_last ? 'checked' : ''}> Serialized items: hide the last unit (supplier keeps 1 back) - uses the "Serialized flag" column, or guns/NFA if none</label>
  </div>`;
}
function pvTable() {
  const p = WZ.pv; if (!p) return '';
  if (!p.ok) return `<div class="sout badb">${esc(p.error || 'Preview failed')}</div>`;
  const cols = p.columns.slice(0, 40);
  const raw = `<div class="tablewrap pv"><table class="grid dense"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${p.rows.map(r => `<tr>${cols.map(c => `<td>${esc(String(r[c] ?? '').slice(0, 60))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const mp = `<div class="tablewrap pv"><table class="grid dense"><thead><tr><th>SKU</th><th>UPC</th><th>Title</th><th>Brand</th><th class="r">Qty</th><th class="r">Cost</th><th class="r">MAP</th><th class="r">MSRP</th><th>Category</th></tr></thead><tbody>${p.mapped.map(o => `<tr><td>${esc(o.sku)}</td><td>${esc(o.upc)}</td><td>${esc(o.title.slice(0, 70))}</td><td>${esc(o.brand)}</td><td class="r">${o.qty}</td><td class="r">${money(o.cost)}</td><td class="r">${money(o.map)}</td><td class="r">${money(o.msrp)}</td><td>${esc(CATN[o.cat] || o.cat)}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="muted small">${esc(p.info.file)} · ${esc(p.info.type)} · ${n0(p.info.rows)} rows${p.info.join_matched != null ? ` · 2nd file ${esc(p.info.join_file)}: matched ${n0(p.info.join_matched)} of ${n0(p.info.rows)}` : ''} · first ${p.rows.length} shown</div>${raw}
    <div class="step sub">How it will look in the app (first ${p.mapped.length})</div>${mp}`;
}
function renderWiz() {
  const d = WZ.d, j = d.join || {}, w = $('#st-wiz'); w.hidden = false;
  const tpl = WZ.id ? '' : `<label class="wide">Start from<select data-w="tpl">${opts(Object.fromEntries(Object.entries(SET.templates).map(([k, v]) => [k, v.label])), d.template)}</select></label>`;
  const note = SET.templates[d.template]?.notes;
  w.innerHTML = `<h3>${WZ.id ? 'Edit ' + esc(d.name) : 'Add a supplier'} <a href="#" data-w="x" class="small">close ✕</a></h3>
  <form id="st-form" autocomplete="off" onsubmit="return false">
    <div class="step"><span class="n">1</span><b>Supplier</b></div>
    <div class="fgrid">${tpl}${fld('name', 'Name (shown in search)', 'maxlength="60" required placeholder="e.g. Acme Outdoor Supply"')}
      ${fld('account', 'Account #', 'maxlength="60"')}${fld('site', 'Dealer site', 'placeholder="https://" maxlength="200"')}${fld('order_method', 'Order method (display only)', 'maxlength="120" placeholder="e.g. dealer portal / phone rep"')}</div>
    ${note ? `<div class="muted small">${esc(note)}</div>` : ''}
    <div class="step"><span class="n">2</span><b>Connection</b> <span class="muted small">automated feed first; folder / upload are fallbacks</span></div>
    <div class="fgrid">${srcFields('source', 'main')}</div>${secretBox('main')}
    <div class="sbtn"><button type="button" class="ghost" data-w="test">Test connection</button><span class="muted small" id="w-testout"></span></div>
    <div class="step"><span class="n">3</span><b>File format</b></div>
    <div class="fgrid">${fmtFields('format')}</div>
    <label class="chk"><input type="checkbox" data-k="join.enabled" data-re="1" ${j.enabled ? 'checked' : ''}> Add a second file joined on item # (e.g. a separate quantity file)</label>
    ${j.enabled ? `<div class="joinbox"><div class="fgrid">${srcFields('join.source', 'join')}${fmtFields('join.format')}
      ${WZ.pv?.columns?.length ? `<label>Item # column in main file<select data-k="join.key_main">${opts(Object.fromEntries(WZ.pv.columns.filter(c => !c.startsWith('B: ')).map(c => [c, c])), j.key_main)}</select></label>` : fld('join.key_main', 'Item # column in main file')}
      ${fld('join.key_join', 'Item # column in 2nd file')}</div>${secretBox('join')}
      <div class="sbtn"><button type="button" class="ghost" data-w="testj">Test 2nd file</button><span class="muted small" id="w-testjout"></span></div>
      <div class="muted small">Columns from the 2nd file show as “B: name” below.</div></div>` : ''}
    <div class="step"><span class="n">4</span><b>Preview &amp; columns</b></div>
    <div class="sbtn"><button type="button" class="pill on" data-w="preview">${WZ.pv ? 'Reload preview' : 'Load preview'}</button><span class="muted small">Downloads the file once and shows the first 20 rows.</span></div>
    <div id="w-pv">${pvTable()}</div>
    ${mapSection()}
    <div class="step"><span class="n">5</span><b>Schedule</b></div>
    <div class="fgrid">${schedFields()}<label class="chk"><input type="checkbox" data-k="enabled" ${d.enabled ? 'checked' : ''}> Enabled (pull on schedule and show in search)</label></div>
    <div class="sbtn"><button type="button" class="pill on" data-w="save">Save</button><button type="button" class="ghost" data-w="savepull">Save &amp; pull now</button><button type="button" class="ghost" data-w="x">Cancel</button>
      ${WZ.id ? '<span class="grow"></span><button type="button" class="ghost danger" data-w="delete">Delete supplier</button>' : ''}</div>
    <div class="sout" id="w-out" hidden></div>
  </form>`;
}
function collect() {
  const d = WZ.d;
  $$('#st-form [data-k]').forEach(el => {
    const k = el.dataset.k; let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.dataset.kind === 'qmap') v = parseMap(el.value, true);
    else if (el.dataset.kind === 'cmap') v = parseMap(el.value, false);
    else if (/\.columns$/.test(k)) v = el.value.split(',').map(s => s.trim()).filter(Boolean);
    else if (/\.header$/.test(k)) v = el.value !== 'false';
    else if (/^transforms\.scale\./.test(k)) v = el.value.trim() === '' ? undefined : parseFloat(el.value);
    else if (NUMK.test(k)) v = el.value.trim() === '' ? undefined : parseInt(el.value, 10);
    else v = el.value.trim();
    setp(d, k, v);
  });
  if ($('#st-form [data-day]')) d.schedule.days = $$('#st-form [data-day]').filter(c => c.checked).map(c => +c.dataset.day);
  if ($('#st-form [data-map]')) {
    const m = {}; $$('#st-form [data-map]').forEach(s => { if (s.value) (m[s.dataset.map] ||= []).push(s.value); });
    d.mapping = m;
  }
  return d;
}
function wout(ok, msg) { const o = $('#w-out'); if (!o) return toast(msg); o.hidden = false; o.className = 'sout ' + (ok ? 'okb' : 'badb'); o.textContent = msg; }
async function save(extra) {
  collect(); const d = await spost('./api/settings/save', {id: WZ.id, supplier: {...WZ.d, ...(extra || {})}});
  if (d.error) { wout(false, d.error); return null; }
  const isNew = !WZ.id; WZ.id = d.id; SET = await api('./api/settings');
  if (isNew) renderWiz();
  return d;
}
async function upload(which, file) {
  if (!WZ.id && !(await save({enabled: false}))) return;
  wout(true, `Uploading ${file.name}…`);
  const r = await fetch(`./api/settings/upload?id=${encodeURIComponent(WZ.id)}&which=${which}&name=${encodeURIComponent(file.name)}`, {method: 'POST', headers: {'X-RDA': '1'}, body: file});
  const d = await r.json().catch(() => ({error: 'HTTP ' + r.status})); wout(!d.error, d.error || `Uploaded ${d.file}. Now load the preview.`);
}
document.addEventListener('change', async e => {
  const el = e.target; if (!el.closest('#st-wiz')) return;
  if (el.dataset.w === 'tpl') {
    const t = clone(SET.templates[el.value]); delete t.label; const name = collect().name;
    WZ.d = {name, enabled: false, schedule: {kind: 'daily', at: '06:00'}, template: el.value, mapping: {}, transforms: {}, ...t}; WZ.pv = null; renderWiz(); return;
  }
  if (el.dataset.up) { if (el.files[0]) upload(el.dataset.up, el.files[0]); return; }
  if (el.dataset.re) { collect(); renderWiz(); }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('#st-wiz [data-w]'); if (!b || b.tagName === 'SELECT') return; e.preventDefault();
  const a = b.dataset.w;
  if (a === 'x') { WZ = null; $('#st-wiz').hidden = true; if (location.hash !== '#/settings') history.replaceState(null, '', '#/settings'); loadSettings(); return; }
  if (a === 'addcol') { collect(); const k = b.dataset.f; WZ.d.mapping[k] = [...(WZ.d.mapping[k] || []), '']; renderWiz(); $$(`#st-form [data-map="${k}"]`).at(-1)?.focus(); return; }
  if (a === 'secset' || a === 'secdel') {
    const r = b.closest('[data-sec]'), f = r.dataset.sec, inp = r.querySelector('input');
    if (a === 'secset' && !inp.value) return inp.focus();
    if (a === 'secdel' && !confirm('Remove this saved secret from the Keychain?')) return;
    b.disabled = true; const d = await spost('./api/settings/secret', a === 'secset' ? {id: WZ.id, field: f, value: inp.value} : {id: WZ.id, field: f, delete: true});
    if (inp) inp.value = ''; b.disabled = false;
    if (d.error) return wout(false, d.error);
    const s = SET.suppliers.find(x => x.id === WZ.id); if (s) s.secrets = d.secrets; collect(); renderWiz(); wout(true, a === 'secset' ? 'Saved to the Keychain ✓ - try “Test connection”.' : 'Removed from the Keychain.'); return;
  }
  if (a === 'test' || a === 'testj') {
    collect(); const o = $(a === 'test' ? '#w-testout' : '#w-testjout'); o.textContent = 'Testing…'; o.className = 'muted small';
    if (!WZ.id && !(await save({enabled: false}))) return;
    const d = await spost('./api/settings/test', {id: WZ.id, which: a === 'test' ? 'main' : 'join', source: a === 'test' ? WZ.d.source : WZ.d.join?.source});
    const o2 = $(a === 'test' ? '#w-testout' : '#w-testjout'); o2.textContent = (d.ok ? '✓ ' : '✗ ') + (d.message || d.msg || d.error || ''); o2.className = 'small ' + (d.ok ? 'okt' : 'badt'); return;
  }
  if (a === 'preview') {
    collect(); if (!WZ.id && !(await save({enabled: false}))) return;
    b.disabled = true; b.textContent = 'Loading…';
    const keepMap = Object.keys(WZ.d.mapping || {}).length > 0;
    const d = await spost('./api/settings/preview', {id: WZ.id, draft: WZ.d}); WZ.pv = d;
    if (d.ok && !keepMap) WZ.d.mapping = d.guess;
    if (d.ok && keepMap && d.columns) { const cs = new Set(d.columns); for (const k in WZ.d.mapping) WZ.d.mapping[k] = WZ.d.mapping[k].filter(c => cs.has(c)); }
    renderWiz(); $('#w-pv')?.scrollIntoView({block: 'nearest'}); return;
  }
  if (a === 'save' || a === 'savepull') {
    b.disabled = true; const d = await save(); b.disabled = false; if (!d) return;
    if (a === 'savepull') { const p = await spost('./api/settings/pull', {id: WZ.id}); wout(!p.error, p.error || 'Saved. Pull started - the card below updates when it finishes.'); }
    else wout(true, 'Saved.' + (d.warning ? ' Note: ' + d.warning : ''));
    if (!d.warning) setTimeout(() => { WZ = null; loadSettings(); }, a === 'savepull' ? 1500 : 900);
    return;
  }
  if (a === 'delete') {
    const n = prompt(`Delete ${WZ.d.name}? Removes its settings, Keychain logins, files, search items and history.\n\nType the supplier name to confirm:`); if (n == null) return;
    const d = await spost('./api/settings/delete', {id: WZ.id, confirm: n}); if (d.error) return wout(false, d.error);
    WZ = null; toast('Deleted ' + d.name); loadSettings();
  }
});
})();
