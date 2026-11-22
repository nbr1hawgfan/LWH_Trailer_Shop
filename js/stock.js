/* Shop parts stock (Supabase). Stock is kept at two places: the Trailer Shop and the Off-Site Shop
   (portable building on the customer yard). Techs look up what's on the shelf at each, and parts picked
   from stock on a repair come off the count at the location they took them from when the repair is saved.
   Managers keep the list in Transportation Manager > Shop Inventory. */
window.TSStock = (function () {
  'use strict';
  const { $, esc } = TS;
  const CFG = TS.CFG;
  const st = { parts: [], locs: [], byLabel: {}, at: 0, loading: null, view: '' };
  const LS = 'ts_parts_loc';
  try { st.view = localStorage.getItem('ts_stock_view') || ''; } catch (e) {}

  async function rpc(fn, args) {
    const r = await fetch(CFG.SB_URL + '/rest/v1/rpc/' + fn, { method: 'POST', cache: 'no-store',
      headers: { apikey: CFG.SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (j && j.ok === false)) throw new Error((j && (j.error || j.message)) || 'Parts stock is not answering.');
    return j;
  }
  const label = p => p.description + (p.part_no ? ' · ' + p.part_no : '');
  const qty = v => (Math.round(Number(v) * 100) / 100).toLocaleString();
  const stockAt = (p, c) => (p && p.stock || []).find(s => s.loc === c) || null;
  const locs = () => st.locs.length ? st.locs : [{ code: 'SHOP', name: 'Trailer Shop', short: 'Shop' }, { code: 'OFFSITE', name: 'Off-Site Shop', short: 'Off-Site' }];
  const locName = c => (locs().find(l => l.code === c) || { name: c }).name;
  const lastLoc = () => { try { return localStorage.getItem(LS) || 'SHOP'; } catch (e) { return 'SHOP'; } };
  const rememberLoc = c => { try { localStorage.setItem(LS, c); } catch (e) {} };

  // Loads the list (cached 2 minutes). Never throws: stock is a helper, repairs still save without it.
  function load(force) {
    if (!force && st.parts.length && Date.now() - st.at < 120000) return Promise.resolve(st.parts);
    if (st.loading) return st.loading;
    st.loading = rpc('shop_parts_list').then(j => {
      st.parts = j.parts || []; st.locs = j.locations || []; st.at = Date.now(); st.byLabel = {};
      const seen = {};
      st.parts.forEach(p => { let l = label(p); if (seen[l]) l += ' #' + p.id; seen[l] = 1; p._label = l; st.byLabel[l.toLowerCase()] = p; });
      const dl = $('stkParts'); if (dl) dl.innerHTML = st.parts.map(p => `<option value="${esc(p._label)}">`).join('');
      return st.parts;
    }).catch(() => st.parts).finally(() => { st.loading = null; });
    return st.loading;
  }
  const find = text => st.byLabel[String(text || '').trim().toLowerCase()] || null;
  const byId = id => st.parts.find(p => String(p.id) === String(id)) || null;

  // Best location to default a part row to: the one the tech used last, unless the part isn't kept there.
  function defaultLoc(p) {
    const last = lastLoc();
    if (!p || !(p.stock || []).length || stockAt(p, last)) return last;
    const withStock = (p.stock || []).find(s => Number(s.on_hand) > 0);
    return (withStock || p.stock[0]).loc;
  }

  /* ---------- Parts Stock tab ---------- */
  function chips() {
    $('stkLocs').innerHTML = [{ code: '', name: 'Both' }].concat(locs()).map(l => `<button type="button" class="stk-loc${st.view === l.code ? ' on' : ''}" data-stkloc="${l.code}">${esc(l.name)}</button>`).join('');
  }
  async function open() {
    const box = $('stkList');
    if (!st.parts.length) box.innerHTML = '<div class="empty">Loading parts…</div>';
    await load(true);
    chips(); render();
  }
  function render() {
    const q = ($('stkSearch').value || '').trim().toLowerCase(), box = $('stkList'), v = st.view;
    if (!st.parts.length) { box.innerHTML = '<div class="empty"><b>No parts list yet</b><br>The managers set it up in Transportation Manager.</div>'; return; }
    const rows = st.parts.filter(p => (!v || stockAt(p, v)) && (!q || q.split(/\s+/).every(w => [p.description, p.part_no, p.category].concat((p.stock || []).map(s => s.bin)).some(x => x && String(x).toLowerCase().includes(w)))));
    if (!rows.length) { box.innerHTML = `<div class="empty">${v ? 'Nothing matches at ' + esc(locName(v)) + '.' : 'No parts match.'}</div>`; return; }
    let cat = null;
    box.innerHTML = rows.map(p => {
      const head = (p.category || 'Other') !== cat ? `<div class="stk-cat">${esc(cat = p.category || 'Other')}</div>` : '';
      const show = v ? [stockAt(p, v)] : locs().map(l => stockAt(p, l.code)).filter(Boolean);
      const low = show.some(s => s.low), bins = show.filter(s => s.bin).map(s => (v ? '' : locs().find(l => l.code === s.loc).short + ' ') + 'bin ' + s.bin);
      const q = show.map(s => `<div class="stk-q${s.low ? ' low' : ''}${Number(s.on_hand) <= 0 ? ' out' : ''}"><b>${qty(s.on_hand)}</b><small>${v ? esc(p.uom || 'each') : esc(locs().find(l => l.code === s.loc).short)}</small></div>`).join('');
      return head + `<div class="stk${low ? ' low' : ''}"><div class="stk-n"><b>${esc(p.description)}</b>${low ? '<span class="stk-flag">LOW</span>' : ''}
        <small>${esc([p.part_no].concat(bins).filter(Boolean).join(' · '))}${show.some(s => !s.counted_at) ? (p.part_no || bins.length ? ' · ' : '') + 'not counted yet' : ''}</small></div>
        <div class="stk-qs">${q || '<div class="stk-q"><b>—</b><small>not kept</small></div>'}</div></div>`;
    }).join('');
  }
  $('stkSearch').addEventListener('input', render);
  $('stkLocs').addEventListener('click', e => {
    const b = e.target.closest('[data-stkloc]'); if (!b) return;
    st.view = b.dataset.stkloc; try { localStorage.setItem('ts_stock_view', st.view); } catch (x) {}
    chips(); render();
  });

  /* ---------- repair session ---------- */
  const sessionKey = s => s ? (s.logId || (s.woNumber + '|' + s.rowIndex)) : '';
  async function sessionParts(s) {
    try { const j = await rpc('shop_session_parts', { p_session: sessionKey(s) }); return j.parts || []; } catch (e) { return []; }
  }
  // parts: [{desc, qty, notes, part_id?, loc?}] — the whole list for this session.
  async function use(s, tech, parts) {
    try { return await rpc('shop_use_parts', { p_session: sessionKey(s), p_wo: s.woNumber || '', p_trailer: s.trailer || '', p_tech: tech, p_parts: parts }); }
    catch (e) { return { ok: false, error: e.message }; }
  }

  return { load, find, byId, open, render, sessionParts, use, qty, stockAt, locs, locName, defaultLoc, rememberLoc };
})();
