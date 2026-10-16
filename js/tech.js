/* Shop / Tech side — ported from the Tech Portal (TechPortal.html) */
window.TSTech = (function () {
  'use strict';
  const { $, tech, toast, run, screen, esc, fmtTs, fmtMins, gps, store, showDoc, setBusyBtn } = TS;

  const st = { name: '', staff: [], counts: {}, jobs: [], session: null, timer: null, epoch: 0, job: null, recentLoaded: false };

  /* ---------- pick name ---------- */
  async function showLogin() {
    screen('scrTechLogin');
    TSApp.setSub('Shop / Tech');
    const sel = $('techSelect');
    if (st.staff.length) fillStaff();
    try {
      const [staff, counts] = await Promise.all([tech('getShopStaff'), tech('getJobCountsForAllTechs').catch(() => ({}))]);
      st.staff = staff || []; st.counts = counts || {};
      fillStaff();
    } catch (e) {
      if (!st.staff.length) sel.innerHTML = '<option value="">Couldn\'t load staff</option>';
      toast(e.message, 'err');
    }
  }
  function fillStaff() {
    const sel = $('techSelect');
    if (!st.staff.length) { sel.innerHTML = '<option value="">No staff found — check the ShopStaff tab</option>'; return; }
    const last = store.get('lastTech', '');
    sel.innerHTML = '<option value="">— Select your name —</option>' + st.staff.map(s => {
      const c = st.counts[s.name.toLowerCase()] || 0;
      return `<option value="${esc(s.name)}">${esc(s.name)}${s.role ? ' (' + esc(s.role) + ')' : ''}${c ? '  •  ' + c + (c === 1 ? ' job' : ' jobs') : ''}</option>`;
    }).join('');
    if (last && st.staff.some(s => s.name === last)) sel.value = last;
    onSelect();
  }
  function onSelect() {
    const name = $('techSelect').value, pill = $('techBadge');
    $('techGo').disabled = !name;
    if (!name) { pill.hidden = true; return; }
    const c = st.counts[name.toLowerCase()] || 0;
    pill.hidden = false;
    pill.className = 'pill-note ' + (c ? 'jobs' : 'clear');
    pill.textContent = c ? c + (c === 1 ? ' job assigned to you' : ' jobs assigned to you') : 'No jobs assigned right now';
  }
  function login() {
    const name = $('techSelect').value; if (!name) return;
    st.name = name; store.set('lastTech', name); st.recentLoaded = false;
    TSApp.setSub('Tech · ' + name); TSApp.showSwitch(true, 'Switch');
    showTab('jobs');
    loadJobs();
  }

  /* ---------- jobs ---------- */
  function showTab(t) {
    screen('scrTech');
    document.querySelectorAll('#techTabs .tab').forEach(b => b.classList.toggle('active', b.dataset.ttab === t));
    $('techJobs').hidden = t !== 'jobs'; $('techRecent').hidden = t !== 'recent';
    if (t === 'recent' && !st.recentLoaded) loadRecent();
  }
  async function loadJobs() {
    if (!st.jobs.length) $('techJobs').innerHTML = '<div class="empty">Loading your jobs…</div>';
    await run(async () => {
      const [session, jobs] = await Promise.all([tech('getOpenSession', st.name).catch(() => null), tech('getJobsForTech', st.name)]);
      st.session = session; st.epoch = session ? (TS.parseTs(session.startTs) || new Date()).getTime() : 0;
      st.jobs = jobs || [];
      renderJobs();
    }, 'Loading your jobs…');
  }
  function renderJobs() {
    const box = $('techJobs'), n = st.jobs.length;
    if (!n) { box.innerHTML = '<div class="empty"><b>All clear!</b><br>No jobs assigned right now.</div>'; return; }
    const ip = st.jobs.filter(j => j.status === 'In Progress').length;
    box.innerHTML = `<div class="sum-bar"><div><b>${n}</b><br><span>${n === 1 ? 'job' : 'jobs'} assigned${ip ? ' · ' + ip + ' in progress' : ''}</span></div><span style="font-size:34px">🔧</span></div>` +
      st.jobs.map((j, i) => {
        const active = st.session && st.session.woNumber === j.woNumber;
        const cls = active ? 's-ip' : j.status === 'Work Order Created' ? 's-wo' : j.status === 'Reviewed' ? 's-rev' : '';
        const defs = (j.defects || []);
        const chips = defs.slice(0, 3).map(d => `<span class="chip">${esc(d)}</span>`).join('') + (defs.length > 3 ? `<span class="chip more">+${defs.length - 3}</span>` : '');
        return `<div class="job ${cls}" data-job="${i}"><div class="job-accent"></div><div class="job-body">
          <div class="job-top"><div><div class="job-title">Trailer ${esc(j.trailer)}</div><div class="job-sub">${esc(j.location)}${j.date ? ' · ' + esc(TS.toYMD(j.date) || j.date) : ''}${j.woNumber ? ' · WO ' + esc(j.woNumber) : ''}</div></div>
          ${active ? '<span class="badge b-In-Progress">▶ In progress</span>' : TS.badge(j.status)}</div>
          <div class="chips">${chips || '<span class="ok-text">No defects listed</span>'}</div></div><div class="job-arrow">›</div></div>`;
      }).join('');
  }

  /* ---------- repair screen ---------- */
  function openRepair(job) {
    st.job = job;
    $('repairTitle').textContent = 'Trailer ' + job.trailer;
    $('repairSub').textContent = job.location + (job.woNumber ? ' · WO ' + job.woNumber : '');
    screen('scrRepair');
    buildRepair();
  }
  function isActive() { return !!(st.session && st.job && st.session.woNumber === st.job.woNumber); }
  function buildRepair() {
    const job = st.job, active = isActive();
    const otherOpen = st.session && !active;
    const defs = job.defects || [];
    const list = defs.length
      ? '<div class="checklist">' + defs.map(d => `<button type="button" class="check"><span class="box"></span><span class="t">${esc(d)}</span></button>`).join('') + '</div>'
      : '<span class="ok-text">✓ No defects reported</span>';
    const calls = (TS.CFG.MANAGERS || []).map(m => `<a class="call" href="tel:${esc(m.phone.replace(/[^0-9+]/g, ''))}"><span class="call-ic">📞</span><span><b>${esc(m.name)}</b><small>${esc(m.phone)}</small></span><em>Call →</em></a>`).join('');
    $('repairBody').innerHTML = `
      <div class="timer">
        <div class="timer-top"><span class="timer-lbl">⏱ Repair timer</span><span class="timer-badge ${active ? 'run' : ''}">${active ? '● Running' : 'Not started'}</span></div>
        <div class="timer-clock" id="timerClock">${active ? elapsed() : '00:00:00'}</div>
        <div class="timer-note">${active ? 'Started ' + esc(fmtTs(st.session.startTs)) : 'Start the timer when you begin work'}</div>
      </div>
      ${otherOpen ? `<div class="alert">You already have a repair running on WO ${esc(st.session.woNumber)} (Trailer ${esc(st.session.trailer)}). Finish or save that one first.</div>` : ''}
      ${active ? `<div class="time-entry"><h3>Your time entry</h3><p>How long did the job actually take? Sent to the managers alongside the timer.</p>
        <div class="time-row"><div><label class="lbl">Hours</label><input type="number" id="rptH" min="0" max="23" inputmode="numeric" placeholder="0"></div>
        <div><label class="lbl">Minutes</label><input type="number" id="rptM" min="0" max="59" inputmode="numeric" placeholder="0"></div></div></div>` : ''}
      <div class="card"><div class="card-h">Job details</div><div class="card-b">
        <div class="grid2">
          <div class="fld"><span class="lbl">WO #</span><div class="v">${esc(job.woNumber || '—')}</div></div>
          <div class="fld"><span class="lbl">Date</span><div class="v">${esc(TS.toYMD(job.date) || job.date || '—')}</div></div>
          <div class="fld"><span class="lbl">Trailer</span><div class="v">${esc(job.trailer)}</div></div>
          <div class="fld"><span class="lbl">Location</span><div class="v">${esc(job.location)}</div></div>
          <div class="fld full"><span class="lbl">Defects — tap to check off</span>${list}</div>
        </div>
        ${job.driverNotes ? `<div class="note drv"><b>Driver:</b> ${esc(job.driverNotes)}</div>` : ''}
        ${job.mgrNotes ? `<div class="note mgr"><b>Manager:</b> ${esc(job.mgrNotes)}</div>` : ''}
      </div></div>
      ${active ? `<div class="card"><div class="card-h">Labor notes</div><div class="card-b"><label class="lbl" for="laborNotes">Describe work performed</label><textarea id="laborNotes" placeholder="What was repaired, parts replaced, findings…"></textarea></div></div>
      <div class="card"><div class="card-h">Parts used</div><div class="card-b">
        <div class="parts-head"><span>Description</span><span>Qty</span><span>Notes / vendor</span><span></span></div>
        <div id="partsBody"></div><button type="button" class="add-dashed" id="addPart">+ Add part</button></div></div>` : ''}
      ${calls ? `<div class="card"><div class="card-h">Call a manager</div><div class="card-b">${calls}</div></div>` : ''}
      <div class="actions">
        ${job.gpsLink ? `<a class="btn outline" href="${esc(job.gpsLink)}" target="_blank" rel="noopener">📍 View trailer location</a>` : ''}
        ${active ? '<button class="btn red" id="btnSave" style="background:#c4520a">💾 Save progress (keep open)</button><button class="btn green" id="btnDone">✅ Mark complete &amp; submit</button>'
                 : `<button class="btn green" id="btnStart" ${otherOpen ? 'disabled' : ''}>▶ Start repair</button>`}
      </div>`;
    document.querySelectorAll('#repairBody .check').forEach(b => b.onclick = () => { b.classList.toggle('done'); b.querySelector('.box').textContent = b.classList.contains('done') ? '✓' : ''; });
    if (active) {
      addPart(); $('addPart').onclick = addPart;
      $('btnSave').onclick = () => stopRepair(false);
      $('btnDone').onclick = () => stopRepair(true);
      startClock();
    } else {
      stopClock();
      const b = $('btnStart'); if (b) b.onclick = startRepair;
    }
  }
  function addPart() {
    const row = document.createElement('div'); row.className = 'part-row';
    row.innerHTML = '<input class="pd" placeholder="Description" autocomplete="off"><input class="pq" placeholder="1" autocomplete="off"><input class="pn" placeholder="Vendor / notes" autocomplete="off"><button type="button" class="part-del" aria-label="Remove part">✕</button>';
    row.querySelector('.part-del').onclick = () => row.remove();
    $('partsBody').appendChild(row);
  }
  function collectParts() {
    return [...document.querySelectorAll('#partsBody .part-row')].map(r => ({
      desc: r.querySelector('.pd').value.trim(), qty: r.querySelector('.pq').value.trim(), notes: r.querySelector('.pn').value.trim()
    })).filter(p => p.desc);
  }
  async function startRepair() {
    const job = st.job;
    await run(async () => {
      TS.busy(true, 'Getting location…');
      const [lat, lng] = await gps(); TS.busy(false);
      TS.busy(true, 'Starting repair…');
      try {
        const r = await tech('startRepair', st.name, job.woNumber, job.trailer, job.location, lat || '', lng || '');
        if (!r || !r.success) throw new Error((r && r.message) || 'Could not start the repair.');
        st.session = { logId: r.logId, woNumber: job.woNumber, trailer: job.trailer, location: job.location, startTs: r.startTs, rowIndex: r.repairLogRow };
        st.epoch = (TS.parseTs(r.startTs) || new Date()).getTime();
        job.status = 'In Progress';
        buildRepair();
        toast('Timer started.', 'ok');
      } finally { TS.busy(false); }
    }, false);
  }
  async function stopRepair(complete) {
    if (!st.session) return;
    const labor = ($('laborNotes') || {}).value || '';
    const parts = collectParts();
    const mins = (parseInt(($('rptH') || {}).value, 10) || 0) * 60 + (parseInt(($('rptM') || {}).value, 10) || 0);
    if (!confirm(complete ? 'Mark this repair COMPLETE? The managers will be notified.' : 'Save progress and keep the job open?')) return;
    await run(async () => {
      TS.busy(true, 'Getting location…');
      const [lat, lng] = await gps(); TS.busy(false);
      TS.busy(true, complete ? 'Submitting…' : 'Saving…');
      try {
        const r = await tech('stopRepair', st.session.rowIndex, st.name, st.session.woNumber, lat || '', lng || '', parts, labor.trim(), complete, mins);
        if (!r || !r.success) throw new Error((r && r.message) || 'Save failed.');
        if (complete) {
          stopClock();
          const wo = st.session.woNumber;
          st.session = null; st.jobs = st.jobs.filter(j => j.woNumber !== wo); st.recentLoaded = false;
          toast('Repair completed. Managers notified.', 'ok');
          showTab('jobs'); renderJobs(); setTimeout(loadJobs, 2000);
        } else {
          // Same as the Tech Portal: the repair stays open and the timer keeps counting.
          toast('Progress saved — ' + (r.totalMins || 0) + ' min so far. The job stays open.', 'ok');
        }
      } finally { TS.busy(false); }
    }, false);
  }
  /* ---------- timer ---------- */
  function elapsed() {
    let ms = Math.max(0, Date.now() - st.epoch);
    const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
    const p = n => (n < 10 ? '0' : '') + n;
    return p(h) + ':' + p(m) + ':' + p(s);
  }
  function startClock() { stopClock(); st.timer = setInterval(() => { const el = $('timerClock'); if (el) el.textContent = elapsed(); }, 1000); }
  function stopClock() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }

  /* ---------- recent work ---------- */
  async function loadRecent() {
    const box = $('techRecent');
    box.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const rows = await tech('getRecentWorkForTech', st.name, 35);
      st.recentLoaded = true; renderRecent(rows || []);
    } catch (e) { box.innerHTML = '<div class="empty">Couldn\'t load recent work. Try again.</div>'; toast(e.message, 'err'); }
  }
  function renderRecent(rows) {
    const box = $('techRecent');
    if (!rows.length) { box.innerHTML = '<div class="empty"><b>No completed work</b><br>Nothing in the last 35 days.</div>'; return; }
    const total = rows.reduce((s, r) => s + (r.totalMins || 0), 0);
    box.innerHTML = `<div class="sum-bar"><div><b>${rows.length}</b><br><span>completed job${rows.length === 1 ? '' : 's'} · last 35 days</span></div><div style="text-align:right"><b style="font-size:22px">${fmtMins(total)}</b><br><span>total labor</span></div></div>` +
      rows.map(s => {
        const defs = TS.defectList(s.defects);
        const chips = defs.slice(0, 4).map(d => `<span class="chip">${esc(d)}</span>`).join('') + (defs.length > 4 ? `<span class="chip more">+${defs.length - 4}</span>` : '');
        const parts = TS.partsText(s.parts);
        return `<div class="hcard"><div class="hcard-h"><div><b>Trailer ${esc(s.trailer)}</b><small>WO ${esc(s.woNumber)} · ${esc(s.location)}</small></div><span class="badge b-Completed">✓ Done</span></div>
          <div class="hcard-b"><div class="meta"><span>${esc(fmtTs(s.startTs))}</span><span><b>⏱ ${esc(s.totalTimeStr)}</b></span>
          ${s.startLink ? `<a href="${esc(s.startLink)}" target="_blank" rel="noopener">Start map</a>` : ''}${s.endLink ? `<a href="${esc(s.endLink)}" target="_blank" rel="noopener">End map</a>` : ''}</div>
          <div class="chips">${chips || '<span class="ok-text">No defects</span>'}</div>
          ${parts ? `<div style="margin-top:8px"><b>Parts:</b> ${esc(parts)}</div>` : ''}
          ${s.laborNotes ? `<div class="labor">${esc(s.laborNotes)}</div>` : ''}
          <button class="btn dark sm" data-print="${esc(s.logId)}" style="width:100%;margin-top:6px">🖨 Print work order</button></div></div>`;
      }).join('');
  }
  async function printTechWO(btn) {
    setBusyBtn(btn, true, 'Generating…');
    try {
      const r = await tech('generateTechWorkOrderHtml', btn.dataset.print, st.name);
      if (!r || !r.success) throw new Error('Could not generate the work order.');
      showDoc(r.html, 'Work order');
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusyBtn(btn, false); }
  }

  /* ---------- wiring ---------- */
  $('techSelect').addEventListener('change', onSelect);
  $('techGo').onclick = login;
  document.querySelectorAll('#techTabs .tab').forEach(b => b.onclick = () => showTab(b.dataset.ttab));
  $('techJobs').addEventListener('click', e => { const j = e.target.closest('[data-job]'); if (j) openRepair(st.jobs[+j.dataset.job]); });
  $('techRecent').addEventListener('click', e => { const b = e.target.closest('[data-print]'); if (b) printTechWO(b); });
  $('repairBack').onclick = () => { stopClock(); showTab('jobs'); renderJobs(); };

  function signOut() {
    if (st.session && !confirm('You have a repair running. Switch anyway? (The timer keeps running on the server.)')) return false;
    stopClock(); st.name = ''; st.jobs = []; st.session = null; st.recentLoaded = false;
    return true;
  }
  function refresh() {
    if (!st.name) return showLogin();
    if (!$('scrRepair').hidden) return loadJobs().then(() => { const j = st.jobs.find(x => st.job && x.woNumber === st.job.woNumber); if (j) { st.job = j; buildRepair(); } });
    if (!$('techRecent').hidden) return loadRecent();
    return loadJobs();
  }
  return { showLogin, signOut, refresh, isSignedIn: () => !!st.name };
})();
