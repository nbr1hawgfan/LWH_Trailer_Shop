// ============================================================
//  TRAILER DEFECT INSPECTION — Api.gs
//  JSON entry point for:
//   • the LWH Driver Toolkit (driver inspections)
//   • the Trailer Shop PWA (shop techs + manager dashboard, via ShopApi.gs)
//
//  Add this as a NEW file. Nothing in Code.gs or Setup.gs changes:
//  doGet (the existing inspection page) keeps working exactly as before.
//  Every request reuses the existing functions — same Submissions
//  columns, same PDF, same email, same photo folder.
// ============================================================

function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'init':
        out = {
          ok: true,
          drivers: getDriverNames(),
          locations: getLocations(),
          defects: getDefects(),
          company: getConfig()['Company Name'] || ''
        };
        break;
      case 'submit':
        out = apiSubmit_(body.payload || {}, body.photo || '');
        break;
      case 'ping':
        out = { ok: true, service: 'Trailer Defect Inspection API' };
        break;
      // ---- Trailer Shop: manager (PIN sign-in, then token) ----
      case 'mgrLogin':
        out = shopMgrLogin_(body.pin);
        break;
      case 'mgrLogout':
        if (body.token) CacheService.getScriptCache().remove('shoptok_' + body.token);
        out = { ok: true };
        break;
      case 'mgr':
        shopAuth_(body.token);
        out = { ok: true, result: shopCall_(TS_MGR, SHOP_MGR_FNS, body.fn, body.args) };
        break;
      // ---- Trailer Shop: techs (pick name, same as the old Tech Portal) ----
      case 'tech':
        out = { ok: true, result: shopCall_(TS_TECH, SHOP_TECH_FNS, body.fn, body.args) };
        break;
      default:
        throw new Error('Unknown action');
    }
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiSubmit_(p, photo) {
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 500); }
  function list(v) {
    return (Array.isArray(v) ? v : [])
      .map(function (x) { return str(x, 200); })
      .filter(function (x) { return x; })
      .slice(0, 100);
  }

  var payload = {
    inspectionDate:  str(p.inspectionDate, 10),
    driverName:      str(p.driverName, 100),
    trailerNumber:   str(p.trailerNumber, 40),
    trailerLocation: str(p.trailerLocation, 120),
    defects:         list(p.defects),
    customDefects:   list(p.customDefects),
    notes:           str(p.notes, 2000),
    gpsLat:          str(p.gpsLat, 20),
    gpsLng:          str(p.gpsLng, 20),
    userAgent:       str(p.userAgent, 120) || 'LWH Driver Toolkit'
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.inspectionDate)) throw new Error('Inspection date is required.');
  if (!payload.driverName) throw new Error('Driver name is required.');
  if (!payload.trailerNumber) throw new Error('Trailer number is required.');
  if (!payload.trailerLocation) throw new Error('Trailer location is required.');

  // submitInspection picks the next empty row, so two drivers submitting at
  // the same moment could land on the same row. The lock prevents that.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('System busy — please try again.');
  var res;
  try {
    res = submitInspection(payload);
  } finally {
    lock.releaseLock();
  }
  if (!res || !res.success) return { ok: false, error: (res && res.message) || 'Submission failed.' };

  // Same two-step flow as the existing page: save the row, then attach the photo.
  var photoSaved = null;
  if (photo && photo.length > 100) {
    var up = uploadPhotoAndSave(photo, 'image/jpeg', res.rowNum, payload.trailerNumber, payload.driverName);
    photoSaved = !!(up && up.success);
  }
  return { ok: true, rowNum: res.rowNum, photoSaved: photoSaved };
}

/* ============================================================
   Trailer Shop routing (functions live in ShopApi.gs)
   ============================================================ */

// Allowed functions -> [number of arguments, writes to the Sheet?]
var SHOP_MGR_FNS = {
  getSubmissions:           [0, false],
  getShopStaff:             [0, false],
  updateSubmissionStatus:   [5, true],
  assignTech:               [3, true],
  getRepairLogForWO:        [1, false],
  generateWorkOrderHtml:    [1, true],   // may stamp a WO # on the row
  saveWorkOrderToDrive:     [1, true],
  getTrailerHistory:        [1, false],
  emailInspectionToManager: [2, false],
  getRepairLogData:         [0, false],
  resendCompletionEmail:    [1, true],
  getSamsaraTrailerPositions: [0, false]
};
var SHOP_TECH_FNS = {
  getShopStaff:             [0, false],
  getJobCountsForAllTechs:  [0, false],
  getJobsForTech:           [1, false],
  getOpenSession:           [1, false],
  startRepair:              [6, true],
  stopRepair:               [9, true],
  getRecentWorkForTech:     [2, false],
  generateTechWorkOrderHtml:[2, false]
};

function shopCall_(ns, allowed, fn, args) {
  var spec = allowed[fn];
  if (!spec || typeof ns[fn] !== 'function') throw new Error('Unknown request: ' + fn);
  var a = (Array.isArray(args) ? args : []).slice(0, spec[0]);
  while (a.length < spec[0]) a.push('');
  if (!spec[1]) return ns[fn].apply(null, a);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('System busy — please try again.');
  try { return ns[fn].apply(null, a); } finally { lock.releaseLock(); }
}

function shopMgrLogin_(pin) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('shoppinfails') || 0);
  if (fails >= 5) throw new Error('Too many attempts. Try again in 15 minutes.');
  var p = String(pin == null ? '' : pin).trim();
  if (!p || !TS_MGR.verifyPin(p)) {
    cache.put('shoppinfails', String(fails + 1), 15 * 60);
    throw new Error('Incorrect PIN.');
  }
  cache.remove('shoppinfails');
  var token = Utilities.getUuid();
  cache.put('shoptok_' + token, '1', 8 * 60 * 60); // 8-hour session
  return { ok: true, token: token };
}

function shopAuth_(token) {
  if (!token || !CacheService.getScriptCache().get('shoptok_' + token)) throw new Error('SESSION_EXPIRED');
}
