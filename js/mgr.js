/* Manager side — Inspections tab + detail panel (ported from Dashboard.html) */
window.TSMgr = (function () {
  'use strict';
  const { $, mgr, toast, run, esc, toYMD, fmtTs, hasDefects, defectList, badge, csv, showDoc, setBusyBtn, store } = TS;

  const st = { rows: [], filtered: [], staff: [], sortField: 'date', sortAsc: false, current: null, loaded: false };

  /* ---------- load ---------- */
  async function load() {
    const tb = $('inspTable').querySelector('tbody');
    if (!st.rows.length) tb.innerHTML = '<tr><td colspan="9" class="empty-cell">Loading inspections…</td></tr>';
    await run(async () => {
      const [rows, staff] = await Promise.all([mgr('getSubmissions'), mgr('getShopStaff').catch(() => st.staff)]);
      st.rows = rows || []; st.staff = staff || []; st.loaded = true;
      if (window.TSReports) TSReports.setStaff(st.staff);
      stats(); filter();
    }, 'Loading inspections…');
  }
  function stats() {
    const weekAgo = Date.now() - 7 * 86400000;
    $('kTotal').textContent = st.rows.length;
    $('kDefects').textContent = st.rows.filter(r => hasDefects(r.defects)).length;
    $('kPending').textContent = st.rows.filter(r => !r.status || r.status === 'Pending').length;
    $('kWeek').textContent = st.rows.filter(r => { const d = TS.parseTs(r.timestamp); return d && d.getTime() >= weekAgo; }).length;
  }

  /* ---------- filter / sort / table ---------- */
  function sortVal(r, f) { return f === 'date' ? (toYMD(r.date) || toYMD(r.timestamp)) + ' ' + fmtTs(r.timestamp) : String(r[f] || '').toLowerCase(); }
  function filter() {
    const q = $('fSearch').value.trim().toLowerCase(), s = $('fStatus').value, d = $('fDefects').value, from = $('fFrom').value, to = $('fTo').value;
    st.filtered = st.rows.filter(r => {
      if (q && (r.driver + ' ' + r.trailer + ' ' + r.location + ' ' + r.defects + ' ' + r.woNumber).toLowerCase().indexOf(q) < 0) return false;
      if (s && (r.status || 'Pending') !== s) return false;
      if (d === 'yes' && !hasDefects(r.defects)) return false;
      if (d === 'no' && hasDefects(r.defects)) return false;
      const day = toYMD(r.date) || toYMD(r.timestamp);
      if (from && day && day < from) return false;
      if (to && day && day > to) return false;
      return true;
    });
    const f = st.sortField, asc = st.sortAsc;
    st.filtered.sort((a, b) => { const c = sortVal(a, f).localeCompare(sortVal(b, f)); return asc ? c : -c; });
    document.querySelectorAll('#inspTable th[data-sort]').forEach(th => { th.classList.toggle('sorted', th.dataset.sort === f); th.classList.toggle('asc', th.dataset.sort === f && asc); });
    render();
  }
  function techPills(a) {
    if (!a) return '<span class="muted">Unassigned</span>';
    return a.split(',').map(n => n.trim()).filter(Boolean).map(n => `<span class="tech-pill">${esc(n)}</span>`).join('');
  }
  function render() {
    const tb = $('inspTable').querySelector('tbody'), n = st.filtered.length;
    $('rowCount').textContent = n + ' record' + (n === 1 ? '' : 's');
    if (!n) { tb.innerHTML = '<tr><td colspan="9" class="empty-cell">No inspections match your filters.</td></tr>'; return; }
    tb.innerHTML = st.filtered.map((r, i) => {
      const defs = defectList(r.defects).length;
      const sel = st.current && st.current.rowIndex === r.rowIndex ? ' sel' : '';
      return `<tr class="click${sel}" data-i="${i}">
        <td style="white-space:nowrap">${esc(toYMD(r.date) || toYMD(r.timestamp))}</td><td>${esc(r.driver)}</td><td><b>${esc(r.trailer)}</b></td>
        <td>${esc(r.location)}</td><td>${defs ? `<span class="badge b-defect">! ${defs}</span>` : '<span class="badge b-clear">Clear</span>'}</td>
        <td>${badge(r.status)}</td><td>${techPills(r.assignedTech)}</td>
        <td>${r.gpsLink ? `<a href="${esc(r.gpsLink)}" target="_blank" rel="noopener" class="nolink-row">Map</a>` : '<span class="muted">--</span>'}</td>
        <td class="muted" style="white-space:nowrap">${esc(r.woNumber || '--')}</td></tr>`;
    }).join('');
  }
  function exportCsv() {
    if (!st.filtered.length) return toast('No data to export.', 'err');
    csv('Inspections_' + TS.today().replace(/-/g, '') + '.csv',
      ['Date', 'Timestamp', 'Driver', 'Trailer', 'Location', 'Defects', 'Notes', 'Status', 'WO #', 'Assigned Tech', 'Photo URL', 'PDF URL', 'GPS Coords'],
      st.filtered.map(r => [toYMD(r.date) || r.date, fmtTs(r.timestamp), r.driver, r.trailer, r.location, r.defects, r.notes, r.status, r.woNumber, r.assignedTech, r.photoUrl, r.pdfUrl, r.gpsCoords]));
    toast('Exported ' + st.filtered.length + ' records.', 'ok');
  }

  /* ---------- detail drawer ---------- */
  function open(r) {
    st.current = r;
    $('dTitle').textContent = 'Trailer ' + (r.trailer || '--');
    $('dSub').textContent = (r.driver || '') + ' · ' + (toYMD(r.date) || toYMD(r.timestamp));
    renderSteps();
    $('drawerShade').hidden = false;
    requestAnimationFrame(() => { $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); });
    render();
  }
  function close() {
    $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true');
    setTimeout(() => { $('drawerShade').hidden = true; }, 220);
  }
  function step(n, title, done, openNow, body) {
    return `<div class="step${done ? ' done' : ''}${openNow ? ' open' : ''}" id="step${n}">
      <button type="button" class="step-h" data-step="${n}"><span class="step-n">${done ? '✓' : n}</span><span class="step-t">${esc(title)}</span><span class="step-c">›</span></button>
      <div class="step-b">${body}</div></div>`;
  }
  function fld(label, v) { return `<div class="fld"><span class="lbl">${esc(label)}</span><div class="v">${esc(v || '--')}</div></div>`; }
  function renderSteps() {
    const r = st.current, defs = defectList(r.defects);
    const reviewed = r.status && r.status !== 'Pending';
    const assigned = !!(r.assignedTech && r.assignedTech.trim());
    const hasWO = !!(r.woNumber && r.woNumber.trim());
    const complete = r.status === 'Completed' || r.status === 'No Action Needed';
    const me = store.get('mgrName', '');

    const s1 = `<div class="grid2">${fld('Date', toYMD(r.date))}${fld('Submitted', fmtTs(r.timestamp))}${fld('Driver', r.driver)}${fld('Trailer #', r.trailer)}<div class="full">${fld('Location', r.location)}</div></div>
      ${r.gpsCoords ? `<div class="info">📍 ${esc(r.gpsCoords)} ${r.gpsLink ? `<a href="${esc(r.gpsLink)}" target="_blank" rel="noopener">Open map</a>` : ''}</div>` : ''}
      <div style="margin-top:12px"><span class="lbl">Defects (${defs.length})</span>${defs.length ? defs.map(d => `<span class="tag">! ${esc(d)}</span>`).join('') : '<span class="ok-text">No defects reported</span>'}</div>
      ${r.notes ? `<div class="note drv"><b>Driver notes:</b> ${esc(r.notes)}</div>` : ''}
      <div class="links">${r.pdfUrl ? `<a class="btn outline sm" href="${esc(r.pdfUrl)}" target="_blank" rel="noopener">Inspection PDF</a>` : ''}${r.photoUrl ? `<a class="btn outline sm" href="${esc(r.photoUrl)}" target="_blank" rel="noopener">Photo</a>` : ''}</div>`;

    const s2 = `<p class="muted" style="margin-top:0">Review the inspection and add notes before assigning a tech.</p>
      <label class="lbl" for="mNotes">Manager notes</label><textarea id="mNotes">${esc(r.mgrNotes || '')}</textarea>
      <div class="row-btns"><button class="btn red" id="bAssess">Save assessment</button></div>
      ${r.reviewedBy ? `<p class="muted" style="font-size:13px">Reviewed by ${esc(r.reviewedBy)}${r.reviewedTs ? ' on ' + esc(fmtTs(r.reviewedTs)) : ''}</p>` : ''}`;

    const current = (r.assignedTech || '').split(',').map(s => s.trim()).filter(Boolean);
    const s3 = st.staff.length
      ? `<p class="muted" style="margin-top:0">Check the techs to assign. A work order number is created automatically.</p>` +
        st.staff.map((s, i) => `<label class="techcheck"><input type="checkbox" value="${esc(s.name)}" ${current.includes(s.name) ? 'checked' : ''}><span>${esc(s.name)}</span><span>${esc(s.role || '')}</span></label>`).join('') +
        `<div class="row-btns"><button class="btn red" id="bAssign">Save tech assignment</button></div>
        ${r.assignedTech ? `<div class="info">Assigned: <b>${esc(r.assignedTech)}</b>${r.assignedTs ? ' · ' + esc(fmtTs(r.assignedTs)) : ''}</div>` : ''}
        ${r.woNumber ? `<div class="info">Work order: <b>${esc(r.woNumber)}</b></div>` : ''}`
      : '<p class="muted">No shop staff found. Add techs to the ShopStaff tab.</p>';

    const s4 = hasWO ? `<div id="repairLog"><p class="muted">Loading repair sessions…</p></div><div class="row-btns"><button class="btn outline sm" id="bRepairRefresh">Refresh</button></div>`
                     : '<p class="muted" style="margin:0">Assign a tech to create a work order first.</p>';

    const s5 = `<label class="lbl" for="mStatus">Final status</label>
      <select id="mStatus">${TS.STATUSES.map(s => `<option ${(r.status || 'Pending') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label class="lbl" for="mBy" style="margin-top:10px">Reviewed by</label><input id="mBy" placeholder="Your name" value="${esc(r.reviewedBy || me)}">
      <div class="row-btns"><button class="btn red" id="bStatus">Save status</button><button class="btn dark" id="bPrint">Print work order</button><button class="btn green" id="bDrive">Save PDF to Drive</button></div>
      ${r.status === 'Completed' ? '<div class="row-btns"><button class="btn outline" id="bResend">Resend completion email with work order PDF</button></div>' : ''}
      <label class="lbl" for="mEmail" style="margin-top:12px">Email this report</label>
      <div style="display:flex;gap:8px"><input type="email" id="mEmail" placeholder="name@logistics-warehouse.com"><button class="btn dark sm" id="bEmail">Send</button></div>`;

    $('dBody').innerHTML = step(1, 'Inspection details', true, true, s1) + step(2, 'Assessment', reviewed, false, s2) +
      step(3, 'Assign techs', assigned, false, s3) + step(4, 'Repair log', hasWO, false, s4) + step(5, 'Close & work order', complete, false, s5);
    wire();
    if (hasWO) loadRepairLog();
  }
  function wire() {
    const r = st.current, on = (id, fn) => { const b = $(id); if (b) b.onclick = () => fn(b); };
    on('bAssess', saveAssessment); on('bAssign', assign); on('bRepairRefresh', loadRepairLog);
    on('bStatus', saveStatus); on('bPrint', printWO); on('bDrive', saveDrive); on('bResend', resend); on('bEmail', email);
    const sel = $('mStatus'); if (sel) sel.onchange = () => { if (sel.value === 'Work Order Created' && !r.woNumber) { r.woNumber = newWO(); toast('Work order # ' + r.woNumber + ' generated.', 'ok'); } };
  }
  function markDone(n) { const s = $('step' + n); if (s) { s.classList.add('done'); s.querySelector('.step-n').textContent = '✓'; } }
  function sync() { const i = st.rows.findIndex(x => x.rowIndex === st.current.rowIndex); if (i > -1) st.rows[i] = Object.assign({}, st.current); stats(); filter(); }
  function newWO() {
    const d = new Date(), code = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const n = st.rows.filter(x => x.woNumber && x.woNumber.indexOf(code) > -1).length;
    return code + '-' + String(n + 1).padStart(2, '0');
  }

  async function saveAssessment(btn) {
    const r = st.current, notes = $('mNotes').value.trim();
    const status = !r.status || r.status === 'Pending' ? 'Reviewed' : r.status;
    const by = store.get('mgrName', '') || 'Manager';
    setBusyBtn(btn, true, 'Saving…');
    try {
      const res = await mgr('updateSubmissionStatus', r.rowIndex, status, notes, r.woNumber || '', by);
      if (!res || !res.success) throw new Error('Save failed.');
      Object.assign(r, { mgrNotes: notes, status, reviewedBy: by, reviewedTs: res.timestamp || r.reviewedTs });
      sync(); markDone(2); toast('Assessment saved.', 'ok');
    } catch (e) { toast(e.message, 'err'); } finally { setBusyBtn(btn, false); }
  }
  async function assign(btn) {
    const r = st.current;
    const names = [...document.querySelectorAll('#step3 input[type=checkbox]:checked')].map(c => c.value).join(', ');
    const wo = r.woNumber || newWO();
    setBusyBtn(btn, true, 'Saving…');
    try {
      const res = await mgr('assignTech', r.rowIndex, names, wo);
      if (!res || !res.success) throw new Error('Assignment failed.');
      r.assignedTech = names; r.assignedTs = res.timestamp || '';
      r.woNumber = res.woNumber || r.woNumber || wo;
      // assignTech only moves Pending -> Work Order Created on the server. If the
      // inspection was already Reviewed, save the new status too so the Sheet matches.
      if (names && r.status === 'Reviewed') {
        await mgr('updateSubmissionStatus', r.rowIndex, 'Work Order Created', r.mgrNotes || '', r.woNumber, r.reviewedBy || store.get('mgrName', '') || 'Manager');
      }
      if (names && (!r.status || r.status === 'Pending' || r.status === 'Reviewed')) r.status = 'Work Order Created';
      sync(); toast(names ? names + ' assigned · WO ' + r.woNumber : 'Assignment cleared.', 'ok');
      renderSteps(); document.getElementById('step3').classList.add('open');
    } catch (e) { toast(e.message, 'err'); } finally { setBusyBtn(btn, false); }
  }
  async function loadRepairLog() {
    const box = $('repairLog'); if (!box) return;
    try {
      const entries = await mgr('getRepairLogForWO', st.current.woNumber);
      if (!entries || !entries.length) { box.innerHTML = '<p class="muted" style="margin:0">No repair sessions yet.</p>'; return; }
      const total = entries.reduce((s, e) => s + (parseInt(e.totalMins, 10) || 0), 0);
      box.innerHTML = `<div class="info" style="margin:0 0 10px"><b>${entries.length} session${entries.length > 1 ? 's' : ''}</b> · Total <b>${TS.fmtMins(total)}</b></div>` +
        entries.map(e => {
          const ip = e.repairStatus === 'In Progress', m = parseInt(e.totalMins, 10) || 0, parts = TS.partsText(e.parts);
          return `<div class="sess${ip ? ' ip' : ''}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(e.techName)}</b><span class="badge ${ip ? 'b-In-Progress' : 'b-Completed'}">${ip ? 'In progress' : 'Complete'}</span></div>
            <div class="muted">Started ${esc(fmtTs(e.startTs))}${e.startLink ? ` <a href="${esc(e.startLink)}" target="_blank" rel="noopener">map</a>` : ''}${e.endTs ? ' · Ended ' + esc(fmtTs(e.endTs)) + (e.endLink ? ` <a href="${esc(e.endLink)}" target="_blank" rel="noopener">map</a>` : '') : ''} · <b>${m ? TS.fmtMins(m) : ip ? 'Running…' : '--'}</b></div>
            ${e.laborNotes ? `<div style="margin-top:4px;white-space:pre-wrap">${esc(e.laborNotes)}</div>` : ''}${parts ? `<div style="margin-top:4px">Parts: ${esc(parts)}</div>` : ''}</div>`;
        }).join('');
    } catch (e) { box.innerHTML = '<p style="color:var(--red)">Couldn\'t load the repair log.</p>'; }
  }
  async function saveStatus(btn) {
    const r = st.current, status = $('mStatus').value, by = $('mBy').value.trim();
    if (by) store.set('mgrName', by);
    setBusyBtn(btn, true, 'Saving…');
    try {
      const res = await mgr('updateSubmissionStatus', r.rowIndex, status, r.mgrNotes || '', r.woNumber || '', by);
      if (!res || !res.success) throw new Error('Save failed.');
      Object.assign(r, { status, reviewedBy: by, reviewedTs: res.timestamp || r.reviewedTs });
      sync(); if (status === 'Completed' || status === 'No Action Needed') markDone(5);
      toast('Status saved.', 'ok');
    } catch (e) { toast(e.message, 'err'); } finally { setBusyBtn(btn, false); }
  }
  async function printWO(btn) {
    setBusyBtn(btn, true, 'Generating…');
    try {
      const res = await mgr('generateWorkOrderHtml', st.current.rowIndex);
      if (!res || !res.success) throw new Error('Work order generation failed.');
      if (res.woNumber && !st.current.woNumber) { st.current.woNumber = res.woNumber; sync(); }
      showDoc(res.html, 'Work order ' + (res.woNumber || ''));
    } catch (e) { toast(e.message, 'err'); } finally { setBusyBtn(btn, false); }
  }
  async function saveDrive(btn) {
    setBusyBtn(btn, true, 'Saving…');
    try {
      const res = await mgr('saveWorkOrderToDrive', st.current.rowIndex);
      if (!res || !res.success) throw new Error('Save failed: ' + ((res && res.message) || ''));
      toast('Work order saved to Drive.', 'ok');
      if (res.pdfUrl) window.open(res.pdfUrl, '_blank', 'noopener');
    } catch (e) { toast(e.message, 'err'); } finally { setBusyBtn(btn, false); }
  }
  async function resend(btn) {
    setBusyBtn(btn, true, 'Sending…');
    try {
      const res = await mgr('resendCompletionEmail', st.current.rowIndex);
      if (!res || !res.success) throw new Error('Resend failed: ' + ((res && res.message) || ''));
      toast('Completion email resent.', 'ok');
    } catch (e) { toast(e.message, 'err'); } finally { setBusyBtn(btn, false); }
  }
  async function email(btn) {
    const to = $('mEmail').value.trim();
    if (!to || to.indexOf('@') < 0) return toast('Enter a valid email address.', 'err');
    setBusyBtn(btn, true, '…');
    try {
      const res = await mgr('emailInspectionToManager', st.current.rowIndex, to);
      if (!res || !res.success) throw new Error((res && res.message) || 'Email failed.');
      toast('Email sent to ' + to, 'ok'); $('mEmail').value = '';
    } catch (e) { toast(e.message, 'err'); } finally { setBusyBtn(btn, false); }
  }

  /* ---------- wiring ---------- */
  $('fStatus').innerHTML = '<option value="">All statuses</option>' + TS.STATUSES.map(s => `<option>${s}</option>`).join('');
  ['fSearch'].forEach(id => $(id).addEventListener('input', filter));
  ['fStatus', 'fDefects', 'fFrom', 'fTo'].forEach(id => $(id).addEventListener('change', filter));
  $('fClear').onclick = () => { ['fSearch', 'fStatus', 'fDefects', 'fFrom', 'fTo'].forEach(id => { $(id).value = ''; }); filter(); };
  $('fCsv').onclick = exportCsv;
  document.querySelectorAll('#inspTable th[data-sort]').forEach(th => th.onclick = () => {
    const f = th.dataset.sort; if (st.sortField === f) st.sortAsc = !st.sortAsc; else { st.sortField = f; st.sortAsc = false; } filter();
  });
  $('inspTable').querySelector('tbody').addEventListener('click', e => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-i]'); if (tr) open(st.filtered[+tr.dataset.i]);
  });
  $('dBody').addEventListener('click', e => { const h = e.target.closest('.step-h'); if (h) h.parentElement.classList.toggle('open'); });
  $('dClose').onclick = close; $('drawerShade').onclick = close;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('drawer').classList.contains('open')) close(); });

  return { load, close, rows: () => st.rows, isLoaded: () => st.loaded, reset: () => { st.rows = []; st.filtered = []; st.loaded = false; st.current = null; } };
})();
