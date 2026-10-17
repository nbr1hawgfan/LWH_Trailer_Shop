/* Trailer Shop (techs only): pick your name, jobs, repairs, refresh, service worker.
   The manager side moved to the Transportation Manager app. */
window.TSApp = (function () {
  'use strict';
  const { $, toast } = TS;

  function setSub(t) { $('tbSub').textContent = t || 'Logistics Warehouse'; }
  function showSwitch(on, label) { $('btnSwitch').hidden = !on; if (label) $('btnSwitch').textContent = label; }
  function switchUser() { if (TSTech.signOut()) { showSwitch(false); TSTech.showLogin(); weather(); } }

  /* ---------- weather (current only) ---------- */
  let wxDone = false;
  function weather() {
    if (wxDone) return; wxDone = true;
    const names = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${TS.CFG.WX_LAT}&longitude=${TS.CFG.WX_LNG}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=America%2FChicago`)
      .then(r => r.json()).then(d => { $('wxLine').textContent = Math.round(d.current.temperature_2m) + '°F · ' + (names[d.current.weather_code] || '') + ' · Fort Smith'; })
      .catch(() => {});
  }

  $('btnSwitch').onclick = switchUser;
  $('btnRefresh').onclick = () => TSTech.refresh();

  // Old #manager bookmarks: point managers to their app instead
  if (/manager|mgr/.test(location.hash)) setTimeout(() => toast('The manager dashboard moved to the Transportation Manager app.'), 400);

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  return { setSub, showSwitch, weather, sessionExpired: () => {} };
})();
// Start on "pick your name" (after TSApp exists, since tech.js uses it)
TSTech.showLogin(); TSApp.weather();
