/* Manager reports — Shop Analytics, Driver & Location, Trailer History (ported from Dashboard.html) */
window.TSReports = (function () {
  'use strict';
  const { $, mgr, toast, esc, toYMD, fmtTs, fmtMins, hasDefects, defectList, badge, csv, bar, partsText, setBusyBtn } = TS;
  const st = { staff: [], repair: [], anRows: [], anLoaded: false, dlRows: [], dlReady: false };

  function setStaff(staff) {
    st.staff = staff || [];
    const sel = $('anTech'), cur = sel.value;
    sel.innerHTML = '<option value="">All techs</option>' + st.staff.map(s => `<option>${esc(s.name)}</option>`).join('');
    sel.value = cur;
  }

  /* ================= SHOP ANALYTICS ================= */
  async function runAnalytics() {
    const btn = $('anRun'); setBusyBtn(btn, true, 'Loading…');
    try { st.repair = await mgr('getRepairLogData') || []; st.anLoaded = true; applyAnalytics(); }
    catch (e) { toast(e.message, 'err'); }
    finally { setBusyBtn(btn, false); }
  }
  function applyAnalytics() {
    const from = $('anFrom').value, to = $('anTo').value, tech = $('anTech').value;
    st.anRows = st.repair.filter(r => {
      const d = toYMD(r.startTs);
      if (tech && r.techName !== tech) return false;
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      return true;
    });
    const rows = st.anRows;
    let done = 0, ip = 0, mins = 0, doneTimed = 0;
    rows.forEach(r => { const m = parseInt(r.totalMins, 10) || 0; if (r.repairStatus === 'Completed') { done++; if (m > 0) doneTimed++; } if (r.repairStatus === 'In Progress') ip++; mins += m; });
    $('anTotal').textContent = rows.length; $('anDone').textContent = done; $('anIp').textContent = ip;
    $('anHours').textContent = (mins / 60).toFixed(1) + 'h';
    $('anAvg').textContent = doneTimed ? fmtMins(Math.round(mins / doneTimed)) : '0m';
    $('anOpen').textContent = rows.length - done;

    const map = {};
    rows.forEach(r => { const n = r.techName || 'Unknown'; map[n] = map[n] || { jobs: 0, done: 0, mins: 0 }; map[n].jobs++; if (r.repairStatus === 'Completed') map[n].done++; map[n].mins += parseInt(r.totalMins, 10) || 0; });
    const techs = Object.keys(map).map(n => Object.assign({ name: n }, map[n])).sort((a, b) => b.mins - a.mins);
    const max = techs.length ? techs[0].mins || 1 : 1;
    $('anTechBody').innerHTML = techs.length ? techs.map(t => {
      const hrs = (t.mins / 60).toFixed(1), cls = t.done === t.jobs ? 'green' : (t.jobs - t.done > 2 ? 'red' : 'amber');
      return `<tr><td><b>${esc(t.name)}</b></td><td>${t.jobs}</td><td style="color:var(--green);font-weight:800">${t.done}</td><td><b>${hrs}h</b></td><td>${fmtMins(t.jobs ? Math.round(t.mins / t.jobs) : 0)}</td><td>${bar(t.mins / max * 100, cls, hrs + 'h')}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty-cell">No data.</td></tr>';

    $('anCount').textContent = rows.length + (rows.length === 1 ? ' session' : ' sessions');
    $('anSessBody').innerHTML = rows.length ? rows.map(r => {
      const m = parseInt(r.totalMins, 10) || 0, parts = partsText(r.parts);
      return `<tr><td style="white-space:nowrap"><b>${esc(r.woNumber || '--')}</b></td><td>${esc(r.techName || '--')}</td><td>${esc(r.trailer || '--')}</td><td>${esc(r.location || '--')}</td>
        <td style="white-space:nowrap">${esc(fmtTs(r.startTs) || '--')}</td><td style="white-space:nowrap">${esc(fmtTs(r.endTs) || '--')}</td>
        <td><b>${m ? fmtMins(m) : r.repairStatus === 'In Progress' ? 'Running' : '--'}</b></td>
        <td title="${esc(parts)}" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(parts || '--')}</td>
        <td>${r.repairStatus === 'Completed' ? '<span class="badge b-Completed">Done</span>' : '<span class="badge b-In-Progress">Open</span>'}</td>
        <td>${r.startLink ? `<a href="${esc(r.startLink)}" target="_blank" rel="noopener">Map</a>` : '--'}</td><td>${r.endLink ? `<a href="${esc(r.endLink)}" target="_blank" rel="noopener">Map</a>` : '--'}</td></tr>`;
    }).join('') : '<tr><td colspan="11" class="empty-cell">No sessions found.</td></tr>';
  }
  function exportAnalytics() {
    if (!st.anRows.length) return toast('No data to export.', 'err');
    csv('ShopAnalytics_' + TS.today().replace(/-/g, '') + '.csv',
      ['WO Number', 'Tech Name', 'Trailer', 'Location', 'Start Time', 'End Time', 'Total Minutes', 'Total Hours', 'Parts', 'Labor Notes', 'Status', 'Start GPS', 'End GPS'],
      st.anRows.map(r => { const m = parseInt(r.totalMins, 10) || 0; return [r.woNumber, r.techName, r.trailer, r.location, fmtTs(r.startTs), fmtTs(r.endTs), m, (m / 60).toFixed(2), partsText(r.parts, ' | '), r.laborNotes, r.repairStatus, r.startGps, r.endGps]; }));
    toast('Exported ' + st.anRows.length + ' sessions.', 'ok');
  }

  /* ================= DRIVER & LOCATION ================= */
  function initDl() {
    if (st.dlReady) return; st.dlReady = true;
    $('dlTo').value = TS.today(); $('dlFrom').value = TS.daysAgo(30);
  }
  async function runDl() {
    const btn = $('dlRun'); setBusyBtn(btn, true, 'Loading…');
    try {
      const all = await mgr('getSubmissions') || [];
      const from = $('dlFrom').value, to = $('dlTo').value;
      const names = {}; all.concat(TSMgr.rows()).forEach(r => { if (r.driver && r.driver.trim()) names[r.driver.trim()] = 1; });
      st.dlRows = all.filter(r => { const d = toYMD(r.date) || toYMD(r.timestamp); return !(from && d < from) && !(to && d > to); });
      renderDl(st.dlRows, Object.keys(names));
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusyBtn(btn, false); }
  }
  function renderDl(rows, knownNames) {
    const set = (id, v) => { $(id).textContent = v; };
    if (!rows.length) {
      $('dlDriverBody').innerHTML = '<tr><td colspan="9" class="empty-cell">No inspections in this date range.</td></tr>';
      $('dlLocBody').innerHTML = '<tr><td colspan="8" class="empty-cell">No inspections in this date range.</td></tr>';
      set('dlTotal', 0); set('dlActive', 0); set('dlInactive', 0); set('dlHot', '--'); return;
    }
    const INACTIVE = 10, now = new Date();
    const dm = {};
    rows.forEach(r => { const n = (r.driver || 'Unknown').trim(); dm[n] = dm[n] || { ins: [], defects: 0 }; dm[n].ins.push(r); dm[n].defects += defectList(r.defects).length; });
    (knownNames || []).forEach(n => { if (n && !dm[n]) dm[n] = { ins: [], defects: 0 }; });
    const drivers = Object.keys(dm).map(name => {
      const days = dm[name].ins.map(r => toYMD(r.date) || toYMD(r.timestamp)).filter(Boolean).sort();
      const last = days.length ? days[days.length - 1] : '';
      const since = last ? Math.floor((now - TS.parseTs(last + ' 12:00')) / 86400000) : null;
      let avg = null;
      if (days.length >= 2) { const gaps = []; for (let i = 1; i < days.length; i++) { const g = Math.floor((TS.parseTs(days[i]) - TS.parseTs(days[i - 1])) / 86400000); if (g >= 0) gaps.push(g); } if (gaps.length) avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length); }
      const n = dm[name].ins.length;
      return { name, count: n, last, since, avg, defects: dm[name].defects, rate: n ? Math.round(dm[name].defects / n * 10) / 10 : 0, inactive: since === null || since > INACTIVE };
    }).sort((a, b) => (a.count > 0 && !b.count) ? -1 : (!a.count && b.count > 0) ? 1 : (a.last && b.last) ? b.last.localeCompare(a.last) : a.name.localeCompare(b.name));
    set('dlTotal', rows.length);
    set('dlActive', drivers.filter(d => d.count > 0 && !d.inactive).length);
    set('dlInactive', drivers.filter(d => d.inactive).length);
    const maxC = Math.max(1, ...drivers.map(d => d.count));
    $('dlDriverBody').innerHTML = drivers.map(d => {
      const cls = d.inactive ? 'red' : d.count >= 5 ? 'green' : 'amber';
      const status = d.inactive ? (d.count ? '<span class="st-warn">Inactive &gt;10d</span>' : '<span class="st-none">No submissions</span>') : '<span class="st-active">Active</span>';
      return `<tr><td><b>${esc(d.name)}</b></td><td><b>${d.count}</b></td><td>${esc(d.last || 'Never')}</td>
        <td style="${d.since !== null && d.since > INACTIVE ? 'color:var(--red);font-weight:800' : ''}">${d.since !== null ? d.since + 'd' : '--'}</td>
        <td>${d.avg !== null ? d.avg + 'd' : '--'}</td><td>${d.defects}</td><td>${d.rate} per insp.</td><td>${bar(d.count / maxC * 100, cls, d.count)}</td><td>${status}</td></tr>`;
    }).join('') || '<tr><td colspan="9" class="empty-cell">No driver data.</td></tr>';

    const lm = {};
    rows.forEach(r => {
      const n = (r.location || 'Unknown').trim(); lm[n] = lm[n] || { total: 0, withD: 0, items: 0, types: {} }; lm[n].total++;
      const defs = defectList(r.defects); if (defs.length) { lm[n].withD++; lm[n].items += defs.length; defs.forEach(d => { d = d.trim(); lm[n].types[d] = (lm[n].types[d] || 0) + 1; }); }
    });
    const locs = Object.keys(lm).map(n => {
      const l = lm[n]; let top = '--', tc = 0; Object.keys(l.types).forEach(t => { if (l.types[t] > tc) { tc = l.types[t]; top = t; } });
      return { name: n, total: l.total, withD: l.withD, items: l.items, rate: l.total ? Math.round(l.withD / l.total * 100) : 0, top };
    }).sort((a, b) => b.items - a.items);
    if (locs.length) set('dlHot', locs[0].name);
    const maxI = locs.length ? locs[0].items || 1 : 1;
    $('dlLocBody').innerHTML = locs.map((l, i) => {
      const rc = l.rate >= 60 ? 'rate-hi' : l.rate >= 30 ? 'rate-md' : 'rate-lo';
      return `<tr><td style="text-align:center;font-weight:900">${i + 1}</td><td><b>${esc(l.name)}</b></td><td>${l.total}</td><td>${l.withD}</td><td><b>${l.items}</b></td><td class="${rc}">${l.rate}%</td>
        <td title="${esc(l.top)}" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.top)}</td><td>${bar(l.items / maxI * 100, l.rate >= 60 ? 'red' : l.rate >= 30 ? 'amber' : 'green', l.items)}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty-cell">No location data.</td></tr>';
  }
  function exportDl() {
    if (!st.dlRows.length) return toast('Run the report first.', 'err');
    csv('DriverLocation_' + TS.today().replace(/-/g, '') + '.csv', ['Date', 'Driver', 'Trailer', 'Location', 'Defects', 'Defect Count', 'Status'],
      st.dlRows.map(r => [toYMD(r.date) || r.date, r.driver, r.trailer, r.location, r.defects || 'No defects', defectList(r.defects).length, r.status]));
    toast('Exported ' + st.dlRows.length + ' records.', 'ok');
  }

  /* ================= TRAILER HISTORY ================= */
  async function runHistory() {
    const val = $('histInput').value.trim(); if (!val) return toast('Enter a trailer number.', 'err');
    const btn = $('histGo'), body = $('histBody');
    setBusyBtn(btn, true, 'Loading…');
    body.innerHTML = `<div class="empty">Loading history for trailer ${esc(val)}…</div>`;
    try { renderHistory(val, await mgr('getTrailerHistory', val) || {}); }
    catch (e) { body.innerHTML = '<div class="empty">Couldn\'t load history.</div>'; toast(e.message, 'err'); }
    finally { setBusyBtn(btn, false); }
  }
  function renderHistory(num, data) {
    const ins = data.inspections || [], s = data.stats || {};
    if (!ins.length) { $('histBody').innerHTML = `<div class="empty">No inspections found for trailer ${esc(num)}.</div>`; return; }
    let h = `<div class="kpis"><div class="kpi"><b>${s.totalInspections || 0}</b><span>Inspections</span></div><div class="kpi red"><b>${s.totalDefectEvents || 0}</b><span>Defects reported</span></div>
      <div class="kpi"><b>${s.totalRepairMins ? fmtMins(s.totalRepairMins) : '0'}</b><span>Total labor</span></div><div class="kpi green"><b>${s.completedRepairs || 0}</b><span>Completed repairs</span></div></div>`;
    if (s.topDefects && s.topDefects.length) {
      h += `<div class="panel"><div class="panel-h"><span>Top recurring defects</span></div><div class="chipline">` +
        s.topDefects.map(t => `<span>${esc(t.name)} <b style="color:${t.count >= 3 ? 'var(--red)' : t.count >= 2 ? 'var(--amber)' : 'var(--muted)'}">×${t.count}</b></span>`).join('') + '</div></div>';
    }
    h += `<div class="panel"><div class="panel-h"><span>Inspection timeline</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Driver</th><th>Location</th><th>Defects</th><th>Status</th><th>WO #</th><th>Assigned</th><th>Links</th></tr></thead><tbody>` +
      ins.map(r => {
        const n = defectList(r.defects).length;
        const links = (r.pdfUrl ? `<a href="${esc(r.pdfUrl)}" target="_blank" rel="noopener">PDF</a> ` : '') + (r.photoUrl ? `<a href="${esc(r.photoUrl)}" target="_blank" rel="noopener">Photo</a>` : '');
        return `<tr><td style="white-space:nowrap">${esc(toYMD(r.date) || '--')}</td><td>${esc(r.driver || '--')}</td><td>${esc(r.location || '--')}</td>
          <td>${n ? `<span class="badge b-defect">! ${n}</span>` : '<span class="badge b-clear">Clear</span>'}</td><td>${badge(r.status)}</td><td>${esc(r.woNumber || '--')}</td><td>${esc(r.assignedTech || '--')}</td><td>${links || '--'}</td></tr>`;
      }).join('') + '</tbody></table></div></div>';
    $('histBody').innerHTML = h;
  }

  /* ---------- wiring ---------- */
  $('anTo').value = TS.today(); $('anFrom').value = TS.daysAgo(30);
  $('anRun').onclick = runAnalytics; $('anCsv').onclick = exportAnalytics;
  ['anFrom', 'anTo', 'anTech'].forEach(id => $(id).addEventListener('change', () => { if (st.anLoaded) applyAnalytics(); }));
  $('dlRun').onclick = runDl; $('dlCsv').onclick = exportDl;
  $('dlQuick').onchange = () => { const d = parseInt($('dlQuick').value, 10); $('dlTo').value = TS.today(); $('dlFrom').value = d > 0 ? TS.daysAgo(d) : '2000-01-01'; };
  $('histGo').onclick = runHistory;
  $('histInput').addEventListener('keydown', e => { if (e.key === 'Enter') runHistory(); });

  return {
    setStaff,
    openAnalytics() { if (!st.anLoaded) runAnalytics(); },
    openDl() { initDl(); runDl(); },
    refresh(tab) { if (tab === 'an') runAnalytics(); else if (tab === 'dl') runDl(); else if (tab === 'hist' && $('histInput').value.trim()) runHistory(); },
    reset() { st.repair = []; st.anRows = []; st.anLoaded = false; st.dlRows = []; }
  };
})();
