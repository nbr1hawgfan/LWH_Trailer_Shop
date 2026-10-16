/* Shared helpers for Trailer Shop */
window.TS = (function () {
  'use strict';
  const CFG = window.TS_CONFIG || {};
  const $ = id => document.getElementById(id);
  const STATUSES = ['Pending', 'Reviewed', 'Work Order Created', 'In Progress', 'Completed', 'No Action Needed'];

  /* ---------- server ---------- */
  async function post(body, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 90000);
    let text;
    try {
      const res = await fetch(CFG.API_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body), redirect: 'follow', signal: ctrl.signal
      });
      text = await res.text();
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'The server took too long to answer. Try again.' : 'No connection to the server.');
    } finally { clearTimeout(t); }
    let j;
    try { j = JSON.parse(text); } catch (e) {
      throw new Error(/accounts\.google|ServiceLogin/i.test(text)
        ? 'The server asked for a Google sign-in. Check the web app access is set to "Anyone".'
        : 'The server isn\'t set up for Trailer Shop yet (ShopApi.gs / Api.gs not deployed).');
    }
    if (!j.ok) {
      if (j.error === 'SESSION_EXPIRED') { if (window.TSApp) TSApp.sessionExpired(); throw new Error('Your manager session expired. Enter the PIN again.'); }
      throw new Error(j.error || 'Request failed.');
    }
    return j;
  }
  const tech = (fn, ...args) => post({ action: 'tech', fn, args }).then(j => j.result);
  const mgr = (fn, ...args) => post({ action: 'mgr', fn, args, token: (state.mgrToken || '') }).then(j => j.result);

  /* ---------- state persisted on this device ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ts_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { v == null ? localStorage.removeItem('ts_' + k) : localStorage.setItem('ts_' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const sess = {
    get(k) { try { return JSON.parse(sessionStorage.getItem('ts_' + k)); } catch (e) { return null; } },
    set(k, v) { try { v == null ? sessionStorage.removeItem('ts_' + k) : sessionStorage.setItem('ts_' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const state = { mgrToken: sess.get('mgrToken') };

  /* ---------- ui ---------- */
  function toast(msg, kind) {
    const t = $('toast'); t.textContent = msg; t.className = 'toast ' + (kind || ''); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, kind === 'err' ? 5500 : 3200);
  }
  let busyN = 0;
  function busy(on, msg) {
    busyN = Math.max(0, busyN + (on ? 1 : -1));
    if (msg) $('busyMsg').textContent = msg;
    $('busy').hidden = busyN === 0;
  }
  async function run(fn, msg) {
    if (msg !== false) busy(true, msg || 'Loading…');
    try { return await fn(); }
    catch (e) { toast(e.message, 'err'); }
    finally { if (msg !== false) busy(false); }
  }
  function screen(id) {
    document.querySelectorAll('.screen').forEach(s => { s.hidden = s.id !== id; });
    window.scrollTo(0, 0);
  }
  function setBusyBtn(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = label || 'Working…'; }
    else { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; }
  }

  /* ---------- formatting ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => (n < 10 ? '0' : '') + n;
  function parseTs(v) {
    if (!v) return null;
    const s = String(v).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    const d = new Date(s); return isNaN(d) ? null : d;
  }
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  function toYMD(v) { const d = parseTs(v); return d ? ymd(d) : ''; }
  function fmtTs(v) { const d = parseTs(v); return d ? ymd(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : (v ? String(v) : ''); }
  function fmtMins(m) { m = parseInt(m, 10) || 0; const h = Math.floor(m / 60), r = m % 60; return h > 0 ? h + 'h ' + r + 'm' : r + 'm'; }
  const today = () => ymd(new Date());
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  const hasDefects = d => !!(d && d !== 'No defects selected');
  const defectList = d => (hasDefects(d) ? String(d).split(' | ').filter(Boolean) : []);
  const statusKey = s => (s || 'Pending').replace(/\s+/g, '-');
  const badge = s => `<span class="badge b-${statusKey(s)}">${esc(s || 'Pending')}</span>`;
  function partsText(raw, sep) {
    if (!raw) return '';
    if (Array.isArray(raw)) return raw.filter(p => p.desc).map(p => p.desc + (p.qty ? ' ×' + p.qty : '')).join(sep || ', ');
    try { return JSON.parse(raw).filter(p => p.desc).map(p => p.desc + (p.qty ? ' ×' + p.qty : '') + (p.notes ? ' (' + p.notes + ')' : '')).join(sep || ', '); }
    catch (e) { return String(raw); }
  }
  function bar(pct, color, label) {
    return `<div class="bar"><i><em class="${color || ''}" style="width:${Math.max(0, Math.min(100, pct))}%"></em></i><small>${esc(label)}</small></div>`;
  }

  /* ---------- csv / gps / docs ---------- */
  function csv(filename, headers, rows) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const text = [headers.map(q).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function gps() {
    return new Promise(res => {
      if (!navigator.geolocation) return res([null, null]);
      const t = setTimeout(() => res([null, null]), 8000);
      navigator.geolocation.getCurrentPosition(
        p => { clearTimeout(t); res([p.coords.latitude.toFixed(6), p.coords.longitude.toFixed(6)]); },
        () => { clearTimeout(t); res([null, null]); }, { timeout: 7000, maximumAge: 30000 });
    });
  }
  // Work orders come back as full HTML pages; show them in an in-app viewer
  function showDoc(html, title) {
    const clean = String(html || '').replace(/<div class="no-print"[\s\S]*?<\/div>/, '');
    $('docTitle').textContent = title || 'Work order';
    $('docFrame').srcdoc = clean;
    $('docView').hidden = false;
  }
  $('docClose').onclick = () => { $('docView').hidden = true; $('docFrame').srcdoc = ''; };
  $('docPrint').onclick = () => { try { $('docFrame').contentWindow.focus(); $('docFrame').contentWindow.print(); } catch (e) { toast('Printing isn\'t available here.', 'err'); } };

  return { CFG, STATUSES, $, post, tech, mgr, store, sess, state, toast, busy, run, screen, setBusyBtn,
    esc, parseTs, toYMD, fmtTs, fmtMins, today, daysAgo, hasDefects, defectList, statusKey, badge, partsText, bar, csv, gps, showDoc };
})();
