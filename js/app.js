/* App controller: role picker, PIN, tabs, refresh, service worker */
window.TSApp = (function () {
  'use strict';
  const { $, post, toast, run, screen, store, sess, state } = TS;
  let role = null, mtab = 'insp', pin = '';

  function setSub(t) { $('tbSub').textContent = t || 'Logistics Warehouse'; }
  function showSwitch(on, label) { $('btnSwitch').hidden = !on; if (label) $('btnSwitch').textContent = label; }

  /* ---------- roles ---------- */
  function goRole() { role = null; store.set('role', null); showSwitch(false); setSub(); screen('scrRole'); weather(); }
  function pickRole(r) {
    role = r; store.set('role', r);
    if (r === 'tech') { showSwitch(false); TSTech.showLogin(); }
    else if (state.mgrToken) enterMgr();
    else showPin();
  }
  function switchUser() {
    if (role === 'tech') { if (TSTech.signOut()) { showSwitch(false); TSTech.showLogin(); } return; }
    if (role === 'mgr') {
      if (!confirm('Sign out of the manager dashboard?')) return;
      post({ action: 'mgrLogout', token: state.mgrToken }).catch(() => {});
      state.mgrToken = null; sess.set('mgrToken', null);
      TSMgr.close(); TSMgr.reset(); TSReports.reset();
      goRole();
    }
  }

  /* ---------- manager PIN ---------- */
  function showPin() { pin = ''; dots(); $('pinErr').textContent = ''; setSub('Manager'); showSwitch(false); screen('scrPin'); }
  function dots() { document.querySelectorAll('#pinDots i').forEach((d, i) => d.classList.toggle('on', i < pin.length)); }
  function press(k) {
    if (k === 'clr') pin = '';
    else if (k === 'back') pin = pin.slice(0, -1);
    else if (pin.length < 4) pin += k;
    dots();
    if (pin.length === 4) setTimeout(login, 120);
  }
  async function login() {
    const p = pin;
    await run(async () => {
      try {
        const j = await post({ action: 'mgrLogin', pin: p });
        state.mgrToken = j.token; sess.set('mgrToken', j.token);
        enterMgr();
      } catch (e) {
        pin = ''; dots(); $('pinErr').textContent = e.message;
        const d = $('pinDots'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
      }
    }, 'Checking PIN…');
  }
  function enterMgr() {
    setSub('Manager Dashboard'); showSwitch(true, 'Sign out');
    screen('scrMgr'); showTab(mtab);
    if (!TSMgr.isLoaded()) TSMgr.load();
  }
  function sessionExpired() { state.mgrToken = null; sess.set('mgrToken', null); if (role === 'mgr') showPin(); }

  /* ---------- manager tabs ---------- */
  const VIEWS = { insp: 'mvInsp', an: 'mvAn', dl: 'mvDl', hist: 'mvHist', map: 'mvMap' };
  function showTab(t) {
    mtab = t;
    document.querySelectorAll('#mgrTabs .tab').forEach(b => b.classList.toggle('active', b.dataset.mtab === t));
    Object.keys(VIEWS).forEach(k => { $(VIEWS[k]).hidden = k !== t; });
    if (t === 'an') TSReports.openAnalytics();
    if (t === 'dl') TSReports.openDl();
    if (t === 'map') TSMap.open();
  }

  /* ---------- weather (current only) ---------- */
  let wxDone = false;
  function weather() {
    if (wxDone) return; wxDone = true;
    const names = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${TS.CFG.WX_LAT}&longitude=${TS.CFG.WX_LNG}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=America%2FChicago`)
      .then(r => r.json()).then(d => { $('wxLine').textContent = Math.round(d.current.temperature_2m) + '°F · ' + (names[d.current.weather_code] || '') + ' · Fort Smith'; })
      .catch(() => {});
  }

  /* ---------- wiring ---------- */
  document.querySelectorAll('[data-role]').forEach(b => b.onclick = () => pickRole(b.dataset.role));
  document.querySelectorAll('[data-goto="role"]').forEach(b => b.onclick = goRole);
  $('keypad').addEventListener('click', e => { const b = e.target.closest('button'); if (b) press(b.dataset.k || b.textContent.trim()); });
  document.addEventListener('keydown', e => {
    if ($('scrPin').hidden) return;
    if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('back'); else if (e.key === 'Escape') press('clr');
  });
  document.querySelectorAll('#mgrTabs .tab').forEach(b => b.onclick = () => showTab(b.dataset.mtab));
  $('btnSwitch').onclick = switchUser;
  $('btnRefresh').onclick = () => {
    if (role === 'tech') return TSTech.refresh();
    if (role === 'mgr' && !$('scrMgr').hidden) {
      if (mtab === 'insp') return TSMgr.load();
      if (mtab === 'map') return TSMap.refresh();
      return TSReports.refresh(mtab);
    }
    location.reload();
  };

  // Start: #tech / #manager links jump straight in; otherwise use this phone's last role
  const hash = location.hash.replace('#', '');
  const start = hash === 'tech' ? 'tech' : (hash === 'manager' || hash === 'mgr') ? 'mgr' : store.get('role', null);
  if (start) pickRole(start); else goRole();

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  return { setSub, showSwitch, sessionExpired };
})();
