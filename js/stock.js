/* Shop parts stock (Supabase). Techs look up what's on the shelf, and parts picked from stock
   on a repair come off the count when the repair is saved. Managers keep the list in
   Transportation Manager > Shop Inventory. */
window.TSStock = (function () {
  'use strict';
  const { $, esc } = TS;
  const CFG = TS.CFG;
  const st = { parts: [], byLabel: {}, at: 0, loading: null };

  async function rpc(fn, args) {
    const r = await fetch(CFG.SB_URL + '/rest/v1/rpc/' + fn, { method: 'POST', cache: 'no-store',
      headers: { apikey: CFG.SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (j && j.ok === false)) throw new Error((j && (j.error || j.message)) || 'Parts stock is not answering.');
    return j;
  }
  const label = p => p.description + (p.part_no ? ' · ' + p.part_no : '');
  const qty = v => (Math.round(Number(v) * 100) / 100).toLocaleString();

  // Loads the list (cached 2 minutes). Never throws: stock is a helper, repairs still save without it.
  function load(force) {
    if (!force && st.parts.length && Date.now() - st.at < 120000) return Promise.resolve(st.parts);
    if (st.loading) return st.loading;
    st.loading = rpc('shop_parts_list').then(j => {
      st.parts = j.parts || []; st.at = Date.now(); st.byLabel = {};
      const seen = {};
      st.parts.forEach(p => { let l = label(p); if (seen[l]) l += ' #' + p.id; seen[l] = 1; p._label = l; st.byLabel[l.toLowerCase()] = p; });
      const dl = $('stkParts'); if (dl) dl.innerHTML = st.parts.map(p => `<option value="${esc(p._label)}">`).join('');
      return st.parts;
    }).catch(() => st.parts).finally(() => { st.loading = null; });
    return st.loading;
  }
  const find = text => st.byLabel[String(text || '').trim().toLowerCase()] || null;
  const byId = id => st.parts.find(p => String(p.id) === String(id)) || null;

  /* ---------- Parts Stock tab ---------- */
  async function open() {
    const box = $('stkList');
    if (!st.parts.length) box.innerHTML = '<div class="empty">Loading parts…</div>';
    await load(true);
    render();
  }
  function render() {
    const q = ($('stkSearch').value || '').trim().toLowerCase(), box = $('stkList');
    if (!st.parts.length) { box.innerHTML = '<div class="empty"><b>No parts list yet</b><br>The managers set it up in Transportation Manager.</div>'; return; }
    const rows = st.parts.filter(p => !q || q.split(/\s+/).every(w => [p.description, p.part_no, p.bin, p.category].some(v => v && String(v).toLowerCase().includes(w))));
    if (!rows.length) { box.innerHTML = '<div class="empty">No parts match.</div>'; return; }
    let cat = null;
    box.innerHTML = rows.map(p => {
      const head = (p.category || 'Other') !== cat ? `<div class="stk-cat">${esc(cat = p.category || 'Other')}</div>` : '';
      const n = Number(p.on_hand);
      return head + `<div class="stk${p.low ? ' low' : ''}${n <= 0 ? ' out' : ''}"><div><b>${esc(p.description)}</b>${p.low ? '<span class="stk-flag">LOW</span>' : ''}
        <small>${esc([p.part_no, p.bin ? 'Bin ' + p.bin : ''].filter(Boolean).join(' · '))}${p.counted_at ? '' : (p.part_no || p.bin ? ' · ' : '') + 'not counted yet'}</small></div>
        <div class="stk-q"><b>${qty(n)}</b><small>${esc(p.uom || 'each')}</small></div></div>`;
    }).join('');
  }
  $('stkSearch').addEventListener('input', render);

  /* ---------- repair session ---------- */
  const sessionKey = s => s ? (s.logId || (s.woNumber + '|' + s.rowIndex)) : '';
  async function sessionParts(s) {
    try { const j = await rpc('shop_session_parts', { p_session: sessionKey(s) }); return j.parts || []; } catch (e) { return []; }
  }
  // parts: [{desc, qty, notes, part_id?}] — the whole list for this session. Returns {ok, low:[...]} or {ok:false, error}.
  async function use(s, tech, parts) {
    try { return await rpc('shop_use_parts', { p_session: sessionKey(s), p_wo: s.woNumber || '', p_trailer: s.trailer || '', p_tech: tech, p_parts: parts }); }
    catch (e) { return { ok: false, error: e.message }; }
  }

  return { load, find, byId, open, render, sessionParts, use, qty };
})();
