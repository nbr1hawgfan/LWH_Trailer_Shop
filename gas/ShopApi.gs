// ============================================================
//  TRAILER SHOP — ShopApi.gs
//  Lets the Trailer Shop PWA use the existing Manager Dashboard and
//  Tech Portal logic from this project.
//
//  The two blocks below are the ORIGINAL Dashboard.gs and TechPortal.gs,
//  copied in unchanged. Each one is wrapped in its own container
//  (TS_MGR / TS_TECH) so their function names (doGet, getShopStaff,
//  _esc, ...) stay private and can't collide with Code.gs or each other.
//  Same Sheet, same columns, same PDFs and emails as the old web apps.
//
//  Api.gs (doPost) routes requests here. The old Dashboard and Tech
//  Portal projects keep working on their own; nothing there changes.
// ============================================================

/* ===================== ORIGINAL Dashboard.gs ===================== */
var TS_MGR = (function () {
  //
  //  TRAILER DEFECT INSPECTION   Dashboard.gs
  //  Manager/Shop dashboard: PIN auth, submissions loader,
  //  status updates, work order generation, email sender.
  //
  var SHEET_ID = '197oRs4T23q3u8zc6ydWWESLBmBMaZuBLNeJfLjK3Haw';

  // Column index map (1-based)   matches Submissions sheet
  var COL = {
    TIMESTAMP:    1,
    DATE:         2,
    DRIVER:       3,
    TRAILER:      4,
    LOCATION:     5,
    DEFECTS:      6,
    NOTES:        7,
    PHOTO_URL:    8,
    GPS_COORDS:   9,
    GPS_LINK:     10,
    PDF_URL:      11,
    USER_AGENT:   12,
    STATUS:       13,
    MGR_NOTES:    14,
    WO_NUMBER:    15,
    REVIEWED_BY:  16,
    REVIEWED_TS:  17,
    ASSIGNED_TECH:18,
    ASSIGNED_TS:  19
  };

  //    Serve the dashboard                                        
  function doGet(e) {
    return HtmlService.createHtmlOutputFromFile('Dashboard')
      .setTitle('Inspection Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  }

  //    PIN verification                                           
  function verifyPin(pin) {
    try {
      var config = _getConfig();
      var correctPin = (config['Dashboard PIN'] || '1234').toString().trim();
      return pin.toString().trim() === correctPin;
    } catch (err) {
      Logger.log('verifyPin error: ' + err);
      return false;
    }
  }

  //    Load all submissions                                       
  function getSubmissions() {
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('Submissions');
      if (!sheet || sheet.getLastRow() < 2) return [];

      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 19).getValues();
      var rows = [];

      data.forEach(function(r, i) {
        // Skip completely empty rows
        if (!r[0] && !r[2]) return;
        rows.push({
          rowIndex:    i + 2,  // 1-based sheet row
          timestamp:   r[COL.TIMESTAMP - 1]   ? r[COL.TIMESTAMP - 1].toString()   : '',
          date:        r[COL.DATE - 1]         ? r[COL.DATE - 1].toString()         : '',
          driver:      r[COL.DRIVER - 1]       ? r[COL.DRIVER - 1].toString()       : '',
          trailer:     r[COL.TRAILER - 1]      ? r[COL.TRAILER - 1].toString()      : '',
          location:    r[COL.LOCATION - 1]     ? r[COL.LOCATION - 1].toString()     : '',
          defects:     r[COL.DEFECTS - 1]      ? r[COL.DEFECTS - 1].toString()      : '',
          notes:       r[COL.NOTES - 1]        ? r[COL.NOTES - 1].toString()        : '',
          photoUrl:    r[COL.PHOTO_URL - 1]    ? r[COL.PHOTO_URL - 1].toString()    : '',
          gpsCoords:   r[COL.GPS_COORDS - 1]   ? r[COL.GPS_COORDS - 1].toString()   : '',
          gpsLink:     r[COL.GPS_LINK - 1]     ? r[COL.GPS_LINK - 1].toString()     : '',
          pdfUrl:      r[COL.PDF_URL - 1]      ? r[COL.PDF_URL - 1].toString()      : '',
          status:      r[COL.STATUS - 1]       ? r[COL.STATUS - 1].toString()       : 'Pending',
          mgrNotes:    r[COL.MGR_NOTES - 1]    ? r[COL.MGR_NOTES - 1].toString()    : '',
          woNumber:    r[COL.WO_NUMBER - 1]    ? r[COL.WO_NUMBER - 1].toString()    : '',
          reviewedBy:  r[COL.REVIEWED_BY - 1]  ? r[COL.REVIEWED_BY - 1].toString()  : '',
          reviewedTs:   r[COL.REVIEWED_TS - 1]   ? r[COL.REVIEWED_TS - 1].toString()   : '',
          assignedTech: r[COL.ASSIGNED_TECH - 1] ? r[COL.ASSIGNED_TECH - 1].toString() : '',
          assignedTs:   r[COL.ASSIGNED_TS - 1]   ? r[COL.ASSIGNED_TS - 1].toString()   : ''
        });
      });

      // Newest first
      rows.reverse();
      return rows;
    } catch (err) {
      Logger.log('getSubmissions error: ' + err);
      return [];
    }
  }

  //    Load shop staff names                                     
  function getShopStaff() {
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('ShopStaff');
      if (!sheet || sheet.getLastRow() < 2) return [];
      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      return data
        .map(function(r) { return { name: r[0] ? r[0].toString().trim() : '', role: r[1] ? r[1].toString().trim() : '' }; })
        .filter(function(r) { return r.name !== ''; });
    } catch (err) {
      Logger.log('getShopStaff error: ' + err);
      return [];
    }
  }

  //    Assign tech to a submission                                
  function assignTech(rowIndex, techName, woNumber) {
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('Submissions');
      if (!sheet) return { success: false };
      var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      sheet.getRange(rowIndex, COL.ASSIGNED_TECH).setValue(techName);
      sheet.getRange(rowIndex, COL.ASSIGNED_TS).setValue(ts);

      // Write Work Order # if provided and not already set
      var finalWoNum = '';
      if (woNumber && woNumber.toString().trim()) {
        var existingWO = sheet.getRange(rowIndex, COL.WO_NUMBER).getValue().toString().trim();
        if (!existingWO) {
          sheet.getRange(rowIndex, COL.WO_NUMBER).setValue(woNumber.toString().trim());
          finalWoNum = woNumber.toString().trim();
        } else {
          finalWoNum = existingWO;
        }
      }

      // Auto-set status to Work Order Created if still Pending
      var currentStatus = sheet.getRange(rowIndex, COL.STATUS).getValue().toString();
      if (!currentStatus || currentStatus === 'Pending') {
        sheet.getRange(rowIndex, COL.STATUS).setValue('Work Order Created')
          .setBackground('#FDF2F8').setFontColor('#6C3483').setFontWeight('bold');
      }
      return { success: true, timestamp: ts, woNumber: finalWoNum };
    } catch (err) {
      Logger.log('assignTech error: ' + err);
      return { success: false, message: err.toString() };
    }
  }

  //    Get repair log entries for a work order                    
  function getRepairLogForWO(woNumber) {
    try {
      if (!woNumber) return [];
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('RepairLog');
      if (!sheet || sheet.getLastRow() < 2) return [];
      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues();
      var entries = [];
      data.forEach(function(r) {
        if (r[1] && r[1].toString().trim() === woNumber.trim()) {
          entries.push({
            logId:       r[0]  ? r[0].toString()  : '',
            woNumber:    r[1]  ? r[1].toString()  : '',
            trailer:     r[2]  ? r[2].toString()  : '',
            location:    r[3]  ? r[3].toString()  : '',
            techName:    r[4]  ? r[4].toString()  : '',
            startTs:     r[5]  ? r[5].toString()  : '',
            startGps:    r[6]  ? r[6].toString()  : '',
            startLink:   r[7]  ? r[7].toString()  : '',
            endTs:       r[8]  ? r[8].toString()  : '',
            endGps:      r[9]  ? r[9].toString()  : '',
            endLink:     r[10] ? r[10].toString() : '',
            totalMins:   r[11] ? r[11].toString() : '',
            parts:       r[12] ? r[12].toString() : '',
            laborNotes:  r[13] ? r[13].toString() : '',
            repairStatus:r[14] ? r[14].toString() : ''
          });
        }
      });
      return entries;
    } catch (err) {
      Logger.log('getRepairLogForWO error: ' + err);
      return [];
    }
  }

  //    Update status / manager notes on a submission row          
  function updateSubmissionStatus(rowIndex, status, mgrNotes, woNumber, reviewedBy) {
    try {
      var ss  = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('Submissions');
      if (!sheet) return { success: false, message: 'Submissions sheet not found.' };

      var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

      sheet.getRange(rowIndex, COL.STATUS).setValue(status || '');
      sheet.getRange(rowIndex, COL.MGR_NOTES).setValue(mgrNotes || '');
      sheet.getRange(rowIndex, COL.WO_NUMBER).setValue(woNumber || '');
      sheet.getRange(rowIndex, COL.REVIEWED_BY).setValue(reviewedBy || '');
      sheet.getRange(rowIndex, COL.REVIEWED_TS).setValue(ts);

      // Color-code the status cell
      var statusCell = sheet.getRange(rowIndex, COL.STATUS);
      var colors = {
        'Pending':           ['#FEF9E7', '#7D6608'],
        'Reviewed':          ['#EBF5FB', '#1A5276'],
        'Work Order Created':['#FDF2F8', '#6C3483'],
        'In Progress':       ['#FFF3E0', '#E65100'],
        'Completed':         ['#EAFAF1', '#1E8449'],
        'No Action Needed':  ['#F2F3F4', '#566573']
      };
      var clr = colors[status] || ['#FFFFFF', '#2C3E50'];
      statusCell.setBackground(clr[0]).setFontColor(clr[1]).setFontWeight('bold');

      return { success: true, timestamp: ts };
    } catch (err) {
      Logger.log('updateSubmissionStatus error: ' + err);
      return { success: false, message: err.toString() };
    }
  }

  //    Generate work order HTML (for print dialog)                
  function generateWorkOrderHtml(rowIndex) {
    try {
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('Submissions');
      if (!sheet) { return { success: false, html: '' }; }

      var rowData     = sheet.getRange(rowIndex, 1, 1, 19).getValues()[0];
      var config      = _getConfig();
      var companyName = config['Company Name'] || 'Logistics Warehouse';

      var defectsRaw = rowData[COL.DEFECTS-1] ? rowData[COL.DEFECTS-1].toString() : '';
      var defectList = defectsRaw !== 'No defects selected' ? defectsRaw.split(' | ').filter(Boolean) : [];
      var hasDefects = defectList.length > 0;
      var woNum      = rowData[COL.WO_NUMBER-1] ? rowData[COL.WO_NUMBER-1].toString() : '';
      if (!woNum) {
        var d  = new Date();
        woNum  = 'WO-' + Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + rowIndex;
        sheet.getRange(rowIndex, COL.WO_NUMBER).setValue(woNum);
      }

      var gpsCoords   = rowData[COL.GPS_COORDS-1] ? rowData[COL.GPS_COORDS-1].toString() : '';
      var gpsLink     = rowData[COL.GPS_LINK-1]   ? rowData[COL.GPS_LINK-1].toString()   : '';
      var photoUrl    = rowData[COL.PHOTO_URL-1]  ? rowData[COL.PHOTO_URL-1].toString()  : '';
      var driverNotes = rowData[COL.NOTES-1]      ? rowData[COL.NOTES-1].toString()      : '';
      var mgrNotes    = rowData[COL.MGR_NOTES-1]  ? rowData[COL.MGR_NOTES-1].toString()  : '';
      var printDate   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');
      var isComplete  = (rowData[COL.STATUS-1] || '').toString() === 'Completed';

      // Repair sessions
      var sessions       = getRepairLogForWO(woNum);
      var totalLaborMins = 0;
      var i, sess;
      for (i = 0; i < sessions.length; i++) { totalLaborMins += parseInt(sessions[i].totalMins) || 0; }
      var sHH = Math.floor(totalLaborMins / 60);
      var sMM = totalLaborMins % 60;
      var totalLaborStr = totalLaborMins > 0 ? (sHH > 0 ? sHH + 'h ' + sMM + 'm' : sMM + 'm') : '--';

      // Photo thumbnail (small, inline)
      var photoImgTag = '';
      if (photoUrl) {
        try {
          var photoFileId = photoUrl.match(/[-\w]{25,}/);
          if (photoFileId) {
            var photoFile = DriveApp.getFileById(photoFileId[0]);
            var photoBlob = photoFile.getBlob();
            var photoB64  = Utilities.base64Encode(photoBlob.getBytes());
            var photoMime = photoBlob.getContentType() || 'image/jpeg';
            photoImgTag   = '<img src="data:' + photoMime + ';base64,' + photoB64 + '" width="110" height="80" style="border:1px solid #D1D9E0;" alt="Photo">';
          }
        } catch (pe) {
          Logger.log('Photo embed (non-fatal): ' + pe);
          photoImgTag = '';
        }
      }

      // Defect rows
      var defectRows = '';
      if (hasDefects) {
        for (i = 0; i < defectList.length; i++) {
          var bg = i % 2 === 0 ? '#ffffff' : '#F8F9FA';
          defectRows +=
            '<tr style="background:' + bg + ';">' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;width:24px;text-align:center;font-size:11px;">&#9633;</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:11px;">' + _esc(defectList[i]) + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;width:140px;font-size:10px;color:#999999;">Initials/notes</td>' +
            '</tr>';
        }
      } else {
        defectRows = '<tr><td colspan="3" style="border:1px solid #D1D9E0;padding:8px;font-size:11px;color:#27AE60;">No defects reported.</td></tr>';
      }

      // Repair sessions table + parts collection
      var allPartsUsed = [];
      var repairRows   = '';
      if (sessions.length > 0) {
        for (i = 0; i < sessions.length; i++) {
          sess = sessions[i];
          var sm  = parseInt(sess.totalMins) || 0;
          var sh  = Math.floor(sm / 60);
          var smm = sm % 60;
          var tStr = sm > 0 ? (sh > 0 ? sh + 'h ' + smm + 'm' : smm + 'm') : '--';

          var startStr = sess.startTs ? sess.startTs.substring(0,16) : '--';
          var endStr   = sess.endTs   ? sess.endTs.substring(0,16)   : '--';

          var gStr = '';
          if (sess.startLink) { gStr += '<a href="' + sess.startLink + '" style="color:#2980B9;">Start</a>'; }
          if (sess.endLink)   { gStr += (gStr ? ' / ' : '') + '<a href="' + sess.endLink + '" style="color:#2980B9;">End</a>'; }
          if (!gStr) { gStr = '--'; }

          if (sess.parts) {
            try {
              var pp = JSON.parse(sess.parts);
              for (var j = 0; j < pp.length; j++) { if (pp[j].desc) { allPartsUsed.push(pp[j]); } }
            } catch (ex) {}
          }

          var bg2 = i % 2 === 0 ? '#ffffff' : '#F8F9FA';
          repairRows +=
            '<tr style="background:' + bg2 + ';">' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:11px;font-weight:bold;">' + _esc(sess.techName || '--') + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:10px;">' + startStr + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:10px;">' + endStr + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:11px;font-weight:bold;">' + tStr + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:10px;">' + gStr + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:10px;">' + _esc(sess.laborNotes || '--') + '</td>' +
            '</tr>';
        }
      } else {
        repairRows = '<tr><td colspan="6" style="border:1px solid #D1D9E0;padding:8px;font-size:11px;color:#7F8C8D;text-align:center;">No repair sessions recorded.</td></tr>';
      }

      var partsRows = '';
      if (allPartsUsed.length > 0) {
        for (i = 0; i < allPartsUsed.length; i++) {
          var pt  = allPartsUsed[i];
          var bg3 = i % 2 === 0 ? '#ffffff' : '#F8F9FA';
          partsRows +=
            '<tr style="background:' + bg3 + ';">' +
            '<td style="border:1px solid #D1D9E0;padding:4px 8px;font-size:11px;">' + _esc(pt.desc  || '') + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 8px;font-size:11px;width:60px;">' + _esc(pt.qty   || '') + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 8px;font-size:11px;">' + _esc(pt.notes || '') + '</td>' +
            '</tr>';
        }
      }

      // CSS - minimal, table-based layout (no flex/grid - poor support in
      // Drive's HTML-to-PDF conversion via Google Docs)
      var css =
        '<style>' +
        '@page{size:letter;margin:12mm 10mm;}' +
        'body{font-family:Arial,sans-serif;font-size:11px;color:#2C3E50;margin:0;padding:0;}' +
        '@media print{.no-print{display:none!important;}}' +
        'table{border-collapse:collapse;}' +
        '.sec{font-size:10px;font-weight:bold;color:#ffffff;background:#1E3A5F;padding:4px 8px;text-transform:uppercase;letter-spacing:0.4px;}' +
        '.lbl{font-size:8px;font-weight:bold;color:#7F8C8D;text-transform:uppercase;letter-spacing:0.3px;}' +
        '.val{font-size:11px;border-bottom:1px solid #D1D9E0;padding-bottom:2px;}' +
        '</style>';

      var statusColor = isComplete ? '#1E8449' : '#C0392B';
      var statusBg    = isComplete ? '#EAFAF1' : '#FDEDEC';
      var statusText  = isComplete ? 'COMPLETED' : ('STATUS: ' + _esc((rowData[COL.STATUS-1] || 'Pending').toString()));
      var laborLabel  = isComplete ? 'Total Labor: ' : 'Labor so far: ';

      var printBtns =
        '<div class="no-print" style="text-align:right;padding:8px 14px;background:#F8F9FA;border-bottom:1px solid #D1D9E0;">' +
        '<button onclick="window.print()" style="background:#1E3A5F;color:#fff;border:none;padding:8px 18px;border-radius:5px;font-size:13px;font-weight:bold;cursor:pointer;margin-right:6px;">Print / Save PDF</button>' +
        '<button onclick="window.close()" style="background:#ECF0F1;color:#2C3E50;border:none;padding:8px 14px;border-radius:5px;font-size:13px;cursor:pointer;">Close</button>' +
        '</div>';

      var dateVal     = rowData[COL.DATE-1]    ? rowData[COL.DATE-1].toString().substring(0,10) : '';
      var driverVal   = rowData[COL.DRIVER-1]  ? rowData[COL.DRIVER-1].toString()  : '';
      var trailerVal  = rowData[COL.TRAILER-1] ? rowData[COL.TRAILER-1].toString() : '';
      var locationVal = rowData[COL.LOCATION-1]? rowData[COL.LOCATION-1].toString(): '';
      var statusVal   = rowData[COL.STATUS-1]  ? rowData[COL.STATUS-1].toString()  : '';

      // Outer page wrapper table (everything inside one table for stable PDF layout)
      var body =
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:8px 12px;">' +

        // Header row: company / WO number
        '<tr><td style="border-bottom:3px solid #1E3A5F;padding-bottom:6px;">' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td style="font-size:16px;font-weight:bold;color:#1E3A5F;">' + _esc(companyName) +
        '<div style="font-size:9px;color:#7F8C8D;text-transform:uppercase;letter-spacing:0.5px;font-weight:normal;">Trailer Defect Work Order</div></td>' +
        '<td align="right" style="font-size:16px;font-weight:bold;color:#1E3A5F;">' + _esc(woNum) +
        '<div style="font-size:9px;color:#7F8C8D;font-weight:normal;">Printed: ' + printDate + '</div></td>' +
        '</tr></table>' +
        '</td></tr>' +

        // Status bar
        '<tr><td style="padding:6px 0;">' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + statusBg + ';border-left:4px solid ' + statusColor + ';">' +
        '<tr><td style="padding:5px 10px;font-size:10px;font-weight:bold;color:' + statusColor + ';">' + statusText + '</td>' +
        '<td align="right" style="padding:5px 10px;font-size:10px;font-weight:bold;color:' + statusColor + ';">' + laborLabel + totalLaborStr + '</td></tr>' +
        '</table>' +
        '</td></tr>' +

        // Info grid - 3 columns x 2 rows
        '<tr><td style="padding:6px 0;">' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
        '<tr>' +
        '<td width="33%" style="padding:2px 6px;"><div class="lbl">Date</div><div class="val">' + _esc(dateVal) + '</div></td>' +
        '<td width="33%" style="padding:2px 6px;"><div class="lbl">Driver</div><div class="val">' + _esc(driverVal) + '</div></td>' +
        '<td width="34%" style="padding:2px 6px;"><div class="lbl">Trailer #</div><div class="val">' + _esc(trailerVal) + '</div></td>' +
        '</tr>' +
        '<tr>' +
        '<td width="33%" style="padding:2px 6px;"><div class="lbl">Location</div><div class="val">' + _esc(locationVal) + (gpsLink ? ' <a href="' + gpsLink + '" style="color:#2980B9;font-size:9px;">[Map]</a>' : '') + '</div></td>' +
        '<td width="33%" style="padding:2px 6px;"><div class="lbl">WO Status</div><div class="val">' + _esc(statusVal) + '</div></td>' +
        '<td width="34%" style="padding:2px 6px;"><div class="lbl">GPS Coordinates</div><div class="val">' + (gpsCoords ? _esc(gpsCoords) : '--') + '</div></td>' +
        '</tr>' +
        '</table>' +
        '</td></tr>' +

        // Defects + Photo/Notes side by side using a 2-column table
        '<tr><td style="padding:4px 0;">' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +

        // Left: Defects
        '<td width="65%" valign="top" style="padding-right:8px;">' +
        '<div class="sec">Defects - Action Required</div>' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
        '<tr style="background:#2C4F7A;"><th style="border:1px solid #D1D9E0;padding:4px 6px;width:24px;color:#fff;font-size:9px;"></th>' +
        '<th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Defect</th>' +
        '<th style="border:1px solid #D1D9E0;padding:4px 6px;width:140px;color:#fff;font-size:9px;text-align:left;">Action Taken</th></tr>' +
        defectRows +
        '</table>' +
        '</td>' +

        // Right: Photo + Notes
        '<td width="35%" valign="top">' +
        (photoImgTag ? '<div style="margin-bottom:6px;">' + photoImgTag + '</div>' : '') +
        (driverNotes ? '<div class="lbl" style="margin-bottom:2px;">Driver Notes</div><div style="border:1px solid #D1D9E0;background:#FAFBFC;padding:5px 7px;font-size:11px;margin-bottom:6px;">' + _esc(driverNotes) + '</div>' : '') +
        '<div class="lbl" style="margin-bottom:2px;">Shop / Manager Notes</div>' +
        '<div style="border:1px solid #D1D9E0;background:#FAFBFC;padding:5px 7px;font-size:11px;min-height:24px;">' + (mgrNotes ? _esc(mgrNotes) : '&nbsp;') + '</div>' +
        '</td>' +

        '</tr></table>' +
        '</td></tr>' +

        // Repair sessions
        '<tr><td style="padding:6px 0 0;">' +
        '<div class="sec">Repair Sessions</div>' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
        '<tr style="background:#2C4F7A;">' +
        '<th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Tech</th>' +
        '<th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Started</th>' +
        '<th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Ended</th>' +
        '<th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Time</th>' +
        '<th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">GPS</th>' +
        '<th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Labor Notes</th>' +
        '</tr>' + repairRows + '</table>' +
        '</td></tr>' +

        // Parts (only if any)
        (allPartsUsed.length > 0 ?
          '<tr><td style="padding:6px 0 0;">' +
          '<div class="sec">Parts Used</div>' +
          '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
          '<tr style="background:#2C4F7A;">' +
          '<th style="border:1px solid #D1D9E0;padding:4px 8px;color:#fff;font-size:9px;text-align:left;">Description</th>' +
          '<th style="border:1px solid #D1D9E0;padding:4px 8px;width:60px;color:#fff;font-size:9px;text-align:left;">Qty</th>' +
          '<th style="border:1px solid #D1D9E0;padding:4px 8px;color:#fff;font-size:9px;text-align:left;">Notes / Vendor</th>' +
          '</tr>' + partsRows + '</table>' +
          '</td></tr>' : '') +

        // Signature row
        '<tr><td style="padding-top:14px;">' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td width="33%" style="border-top:1px solid #2C3E50;padding-top:4px;font-size:9px;color:#7F8C8D;">Technician Signature &amp; Date</td>' +
        '<td width="2%"></td>' +
        '<td width="31%" style="border-top:1px solid #2C3E50;padding-top:4px;font-size:9px;color:#7F8C8D;">Shop Supervisor Signature &amp; Date</td>' +
        '<td width="2%"></td>' +
        '<td width="32%" style="border-top:1px solid #2C3E50;padding-top:4px;font-size:9px;color:#7F8C8D;">Driver Acknowledgment &amp; Date</td>' +
        '</tr></table>' +
        '</td></tr>' +

        // Footer
        '<tr><td style="padding-top:8px;border-top:1px solid #ECF0F1;margin-top:8px;text-align:center;font-size:8px;color:#BDC3C7;">' +
        'Generated by ' + _esc(companyName) + ' Trailer Inspection System | ' + _esc(woNum) + ' | ' + printDate +
        '</td></tr>' +

        '</table>';

      var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">' + css + '</head><body>' + printBtns + body + '</body></html>';

      return { success: true, html: fullHtml, woNumber: woNum };
    } catch (err) {
      Logger.log('generateWorkOrderHtml error: ' + err);
      return { success: false, html: '', message: err.toString() };
    }
  }



  function saveWorkOrderToDrive(rowIndex) {
    try {
      // Generate the same rich HTML used for the print dialog
      var result = generateWorkOrderHtml(rowIndex);
      if (!result.success) { return { success: false, message: 'Could not generate work order HTML.' }; }

      var woNum      = result.woNumber || ('WO-' + rowIndex);
      var folderName = 'Trailer Work Orders';
      var folders    = DriveApp.getFoldersByName(folderName);
      var folder     = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

      var ss      = SpreadsheetApp.openById(SHEET_ID);
      var sheet   = ss.getSheetByName('Submissions');
      var rowData = sheet.getRange(rowIndex, 1, 1, 19).getValues()[0];
      var trailer = (rowData[COL.TRAILER-1] || 'TRL').toString().replace(/[^a-zA-Z0-9_-]/g, '');
      var pdfName = woNum + '_' + trailer + '.pdf';

      // Strip the print button from the HTML before saving (no-print div is CSS only, 
      // but remove the button markup so it doesn't appear in the PDF)
      var cleanHtml = result.html.replace(/<div class="no-print"[^]*?<\/div>/, '');

      // Upload HTML as Google Doc via Drive API then export as PDF
      var token    = ScriptApp.getOAuthToken();
      var CRLF     = '\r\n';
      var boundary = 'wobnd' + rowIndex;
      var metaJson = JSON.stringify({ name: '_TMP_WO_' + woNum, mimeType: 'application/vnd.google-apps.document' });

      var fullPayload = '--' + boundary + CRLF +
        'Content-Type: application/json; charset=UTF-8' + CRLF + CRLF +
        metaJson + CRLF +
        '--' + boundary + CRLF +
        'Content-Type: text/html; charset=UTF-8' + CRLF + CRLF +
        cleanHtml + CRLF +
        '--' + boundary + '--';

      var uploadResp = UrlFetchApp.fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'multipart/related; boundary=' + boundary
          },
          payload: Utilities.newBlob(fullPayload, 'application/octet-stream').getBytes(),
          muteHttpExceptions: true
        }
      );

      Logger.log('WO upload status: ' + uploadResp.getResponseCode());
      var uploadJson = JSON.parse(uploadResp.getContentText());
      var docId      = uploadJson.id;

      if (!docId) {
        Logger.log('WO Drive upload failed: ' + uploadResp.getContentText().substring(0, 300));
        return { success: false, message: 'Drive upload failed. Check execution log.' };
      }

      var pdfResp = UrlFetchApp.fetch(
        'https://www.googleapis.com/drive/v3/files/' + docId + '/export?mimeType=application/pdf',
        { headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true }
      );

      Logger.log('WO PDF export status: ' + pdfResp.getResponseCode());
      var pdfBlob = pdfResp.getBlob().setName(pdfName);
      var pdfFile = folder.createFile(pdfBlob);
      pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      try { DriveApp.getFileById(docId).setTrashed(true); } catch(te) {}

      var pdfUrl = pdfFile.getUrl();
      sheet.getRange(rowIndex, COL.WO_NUMBER).setNote('PDF: ' + pdfUrl);

      Logger.log('WO PDF saved: ' + pdfUrl);
      return { success: true, pdfUrl: pdfUrl, woNumber: woNum };
    } catch (err) {
      Logger.log('saveWorkOrderToDrive error: ' + err);
      return { success: false, message: err.toString() };
    }
  }


  //    Trailer history lookup                                      
  function getTrailerHistory(trailerNumber) {
    try {
      if (!trailerNumber) { return { inspections: [], repairSessions: [] }; }
      var ss      = SpreadsheetApp.openById(SHEET_ID);
      var subSheet = ss.getSheetByName('Submissions');
      var repSheet = ss.getSheetByName('RepairLog');
      var trailer  = trailerNumber.toString().trim().toLowerCase();

      var inspections = [];
      if (subSheet && subSheet.getLastRow() >= 2) {
        var subData = subSheet.getRange(2, 1, subSheet.getLastRow() - 1, 19).getValues();
        for (var i = 0; i < subData.length; i++) {
          var row = subData[i];
          if (!row[COL.TRAILER-1]) { continue; }
          if (row[COL.TRAILER-1].toString().trim().toLowerCase() !== trailer) { continue; }
          inspections.push({
            rowIndex:    i + 2,
            timestamp:   row[COL.TIMESTAMP-1]  ? row[COL.TIMESTAMP-1].toString()  : '',
            date:        row[COL.DATE-1]        ? row[COL.DATE-1].toString()        : '',
            driver:      row[COL.DRIVER-1]      ? row[COL.DRIVER-1].toString()      : '',
            trailer:     row[COL.TRAILER-1]     ? row[COL.TRAILER-1].toString()     : '',
            location:    row[COL.LOCATION-1]    ? row[COL.LOCATION-1].toString()    : '',
            defects:     row[COL.DEFECTS-1]     ? row[COL.DEFECTS-1].toString()     : '',
            notes:       row[COL.NOTES-1]       ? row[COL.NOTES-1].toString()       : '',
            photoUrl:    row[COL.PHOTO_URL-1]   ? row[COL.PHOTO_URL-1].toString()   : '',
            gpsLink:     row[COL.GPS_LINK-1]    ? row[COL.GPS_LINK-1].toString()    : '',
            pdfUrl:      row[COL.PDF_URL-1]     ? row[COL.PDF_URL-1].toString()     : '',
            status:      row[COL.STATUS-1]      ? row[COL.STATUS-1].toString()      : 'Pending',
            woNumber:    row[COL.WO_NUMBER-1]   ? row[COL.WO_NUMBER-1].toString()   : '',
            assignedTech:row[COL.ASSIGNED_TECH-1]?row[COL.ASSIGNED_TECH-1].toString():'',
            mgrNotes:    row[COL.MGR_NOTES-1]   ? row[COL.MGR_NOTES-1].toString()   : ''
          });
        }
      }
      inspections.sort(function(a, b) { return b.timestamp.localeCompare(a.timestamp); });

      var repairSessions = [];
      if (repSheet && repSheet.getLastRow() >= 2) {
        var repData = repSheet.getRange(2, 1, repSheet.getLastRow() - 1, 16).getValues();
        for (var j = 0; j < repData.length; j++) {
          var rep = repData[j];
          if (!rep[2]) { continue; }
          if (rep[2].toString().trim().toLowerCase() !== trailer) { continue; }
          repairSessions.push({
            logId:        rep[0]  ? rep[0].toString()  : '',
            woNumber:     rep[1]  ? rep[1].toString()  : '',
            techName:     rep[4]  ? rep[4].toString()  : '',
            startTs:      rep[5]  ? rep[5].toString()  : '',
            endTs:        rep[8]  ? rep[8].toString()  : '',
            totalMins:    rep[11] ? rep[11].toString()  : '0',
            parts:        rep[12] ? rep[12].toString()  : '',
            laborNotes:   rep[13] ? rep[13].toString()  : '',
            repairStatus: rep[14] ? rep[14].toString()  : ''
          });
        }
      }
      repairSessions.sort(function(a, b) { return b.startTs.localeCompare(a.startTs); });

      // Calculate summary stats
      var totalInspections  = inspections.length;
      var totalDefectEvents = 0;
      var defectFrequency   = {};
      var totalRepairMins   = 0;
      var completedRepairs  = 0;

      for (var di = 0; di < inspections.length; di++) {
        var defRaw = inspections[di].defects;
        if (defRaw && defRaw !== 'No defects selected') {
          var dArr = defRaw.split(' | ');
          totalDefectEvents += dArr.length;
          for (var dk = 0; dk < dArr.length; dk++) {
            var def = dArr[dk].trim();
            defectFrequency[def] = (defectFrequency[def] || 0) + 1;
          }
        }
      }

      for (var ri = 0; ri < repairSessions.length; ri++) {
        totalRepairMins += parseInt(repairSessions[ri].totalMins) || 0;
        if (repairSessions[ri].repairStatus === 'Completed') { completedRepairs++; }
      }

      var topDefects = [];
      for (var defKey in defectFrequency) {
        if (defectFrequency.hasOwnProperty(defKey)) {
          topDefects.push({ name: defKey, count: defectFrequency[defKey] });
        }
      }
      topDefects.sort(function(a, b) { return b.count - a.count; });

      return {
        inspections:      inspections,
        repairSessions:   repairSessions,
        stats: {
          totalInspections:  totalInspections,
          totalDefectEvents: totalDefectEvents,
          totalRepairMins:   totalRepairMins,
          completedRepairs:  completedRepairs,
          topDefects:        topDefects.slice(0, 8)
        }
      };
    } catch (err) {
      Logger.log('getTrailerHistory error: ' + err);
      return { inspections: [], repairSessions: [], stats: {} };
    }
  }

  //    Email inspection report to a manager                      
  function emailInspectionToManager(rowIndex, toEmail) {
    try {
      if (!toEmail || toEmail.indexOf('@') < 0) {
        return { success: false, message: 'Invalid email address.' };
      }
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('Submissions');
      if (!sheet) return { success: false, message: 'Sheet not found.' };

      var r = sheet.getRange(rowIndex, 1, 1, 19).getValues()[0];
      var config      = _getConfig();
      var companyName = config['Company Name'] || 'Logistics Warehouse';

      var defectsRaw = r[COL.DEFECTS - 1] ? r[COL.DEFECTS - 1].toString() : '';
      var defectList = defectsRaw !== 'No defects selected' ? defectsRaw.split(' | ').filter(Boolean) : [];
      var hasDefects = defectList.length > 0;
      var statusColor = hasDefects ? '#C0392B' : '#27AE60';
      var statusLabel = hasDefects ? '   DEFECTS REPORTED' : '  CLEAR';

      var defectRowsHtml = '';
      if (hasDefects) {
        defectList.forEach(function(d, i) {
          var bg = i % 2 === 0 ? '#F8F9FA' : '#FFFFFF';
          defectRowsHtml += '<tr style="background:' + bg + ';"><td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #ECF0F1;">   ' + _esc(d) + '</td></tr>';
        });
      } else {
        defectRowsHtml = '<tr><td style="padding:10px 12px;font-size:13px;color:#27AE60;">  No defects reported.</td></tr>';
      }

      var gpsLink   = r[COL.GPS_LINK - 1]  ? r[COL.GPS_LINK - 1].toString()  : '';
      var gpsCoords = r[COL.GPS_COORDS - 1] ? r[COL.GPS_COORDS - 1].toString() : '';
      var pdfUrl    = r[COL.PDF_URL - 1]   ? r[COL.PDF_URL - 1].toString()   : '';
      var photoUrl  = r[COL.PHOTO_URL - 1] ? r[COL.PHOTO_URL - 1].toString() : '';
      var woNum     = r[COL.WO_NUMBER - 1] ? r[COL.WO_NUMBER - 1].toString() : 'N/A';
      var status    = r[COL.STATUS - 1]    ? r[COL.STATUS - 1].toString()    : 'Pending';

      var subject = '[Work Order] Trailer ' + _esc(r[COL.TRAILER-1] ? r[COL.TRAILER-1].toString() : '') +
                    '   ' + _esc(r[COL.DRIVER-1] ? r[COL.DRIVER-1].toString() : '') +
                    '   ' + _esc(r[COL.DATE-1] ? r[COL.DATE-1].toString() : '');

      var htmlBody =
        '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#EAECEF;margin:0;padding:24px 0;">' +
        '<table width="600" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.12);">' +
        '<tr><td style="background:#1E3A5F;padding:20px 24px;">' +
        '<p style="margin:0;font-size:18px;font-weight:bold;color:#fff;">' + _esc(companyName) + '</p>' +
        '<p style="margin:4px 0 0;font-size:12px;color:#BDC9D9;">Trailer Defect Inspection   Manager Copy</p>' +
        '</td></tr>' +
        '<tr><td style="background:' + (hasDefects ? '#FDEDEC' : '#EAFAF1') + ';border-bottom:3px solid ' + statusColor + ';padding:10px 24px;">' +
        '<p style="margin:0;font-size:13px;font-weight:bold;color:' + statusColor + ';">' + statusLabel + ' &nbsp;|&nbsp; Status: ' + _esc(status) + (woNum !== 'N/A' ? ' &nbsp;|&nbsp; WO#: ' + _esc(woNum) : '') + '</p>' +
        '</td></tr>' +
        '<tr><td style="padding:20px 24px;">' +

        // Info table
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8F9FA;border-radius:6px;margin-bottom:16px;">' +
        '<tr style="background:#1E3A5F;"><td colspan="2" style="padding:8px 14px;font-size:12px;font-weight:bold;color:#fff;border-radius:6px 6px 0 0;">INSPECTION DETAILS</td></tr>' +
        _infoRow2('Date', r[COL.DATE-1] ? r[COL.DATE-1].toString() : '') +
        _infoRow2('Driver', r[COL.DRIVER-1] ? r[COL.DRIVER-1].toString() : '') +
        _infoRow2('Trailer #', r[COL.TRAILER-1] ? r[COL.TRAILER-1].toString() : '') +
        _infoRow2('Location', r[COL.LOCATION-1] ? r[COL.LOCATION-1].toString() : '') +
        (gpsCoords ? _infoRow2('GPS', gpsCoords + (gpsLink ? ' <a href="' + gpsLink + '" style="color:#2980B9;">  Map</a>' : '')) : '') +
        (pdfUrl    ? _infoRow2('Full Report', '<a href="' + pdfUrl + '" style="color:#2980B9;">  View PDF</a>') : '') +
        (photoUrl  ? _infoRow2('Photo', '<a href="' + photoUrl + '" style="color:#2980B9;">  View Photo</a>') : '') +
        '</table>' +

        // Defects
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:6px;overflow:hidden;margin-bottom:16px;">' +
        '<tr style="background:' + (hasDefects ? '#922B21' : '#1E8449') + ';"><td style="padding:8px 12px;font-size:12px;font-weight:bold;color:#fff;">' +
        (hasDefects ? '   DEFECTS (' + defectList.length + ')' : '  DEFECTS') + '</td></tr>' +
        defectRowsHtml +
        '</table>' +

        // Notes
        (r[COL.NOTES-1] ? '<p style="font-size:13px;"><strong>Driver Notes:</strong> ' + _esc(r[COL.NOTES-1].toString()) + '</p>' : '') +
        (r[COL.MGR_NOTES-1] ? '<p style="font-size:13px;"><strong>Manager Notes:</strong> ' + _esc(r[COL.MGR_NOTES-1].toString()) + '</p>' : '') +

        '</td></tr>' +
        '<tr><td style="background:#F8F9FA;border-top:1px solid #ECF0F1;padding:12px 24px;text-align:center;font-size:11px;color:#95A5A6;">Sent from ' + companyName + ' Trailer Inspection Dashboard</td></tr>' +
        '</table></body></html>';

      // Attach PDF if available
      var attachments = [];
      if (pdfUrl) {
        try {
          var pdfFileId = pdfUrl.match(/[-\w]{25,}/);
          if (pdfFileId) {
            var pdfFile = DriveApp.getFileById(pdfFileId[0]);
            attachments.push(pdfFile.getBlob().setName(pdfFile.getName()));
          }
        } catch (e) { Logger.log('PDF attach error: ' + e); }
      }

      MailApp.sendEmail({ to: toEmail, subject: subject, htmlBody: htmlBody, attachments: attachments });
      return { success: true, message: 'Email sent to ' + toEmail };
    } catch (err) {
      Logger.log('emailInspectionToManager error: ' + err);
      return { success: false, message: err.toString() };
    }
  }

  //    Load full repair log for analytics                        
  function getRepairLogData() {
    try {
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('RepairLog');
      if (!sheet || sheet.getLastRow() < 2) return [];
      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues();
      var rows = [];
      data.forEach(function(r) {
        if (!r[0] && !r[1]) return; // skip empty rows
        rows.push({
          logId:        r[0]  ? r[0].toString()  : '',
          woNumber:     r[1]  ? r[1].toString()  : '',
          trailer:      r[2]  ? r[2].toString()  : '',
          location:     r[3]  ? r[3].toString()  : '',
          techName:     r[4]  ? r[4].toString()  : '',
          startTs:      r[5]  ? r[5].toString()  : '',
          startGps:     r[6]  ? r[6].toString()  : '',
          startLink:    r[7]  ? r[7].toString()  : '',
          endTs:        r[8]  ? r[8].toString()  : '',
          endGps:       r[9]  ? r[9].toString()  : '',
          endLink:      r[10] ? r[10].toString() : '',
          totalMins:    r[11] ? r[11].toString() : '0',
          parts:        r[12] ? r[12].toString() : '',
          laborNotes:   r[13] ? r[13].toString() : '',
          repairStatus: r[14] ? r[14].toString() : '',
          subRowIndex:  r[15] ? r[15].toString() : ''
        });
      });
      return rows;
    } catch (err) {
      Logger.log('getRepairLogData error: ' + err);
      return [];
    }
  }

  //    Helpers                                                    
  function _getConfig() {
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('Config');
      if (!sheet) return {};
      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      var cfg = {};
      data.forEach(function(r) { if (r[0]) cfg[r[0].toString().trim()] = r[1] ? r[1].toString().trim() : ''; });
      return cfg;
    } catch (e) { return {}; }
  }

  function _esc(str) {
    if (!str) return '';
    return str.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _infoRow2(label, value) {
    return '<tr style="border-bottom:1px solid #ECF0F1;">' +
      '<td style="padding:8px 14px;font-size:12px;font-weight:bold;color:#5D6D7E;width:35%;">' + label + '</td>' +
      '<td style="padding:8px 14px;font-size:13px;color:#2C3E50;">' + value + '</td></tr>';
  }

  function testSaveWorkOrderToDrive() {
    try {
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('Submissions');
      if (!sheet || sheet.getLastRow() < 2) {
        Logger.log('TEST FAIL: No submissions found.');
        return;
      }

      // Find first row that has a WO number, or just use row 2
      var testRowIndex = 2;
      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues();
      for (var i = 0; i < data.length; i++) {
        if (data[i][14] && data[i][14].toString().trim()) {
          testRowIndex = i + 2;
          break;
        }
      }

      Logger.log('Testing saveWorkOrderToDrive on row ' + testRowIndex);
      Logger.log('Running test on row ' + testRowIndex + '...');

      var result = saveWorkOrderToDrive(testRowIndex);

      Logger.log('Test result: ' + JSON.stringify(result));

      if (result && result.success) {
        // Email the PDF to tjennings
        var pdfFileId = result.pdfUrl.match(/[-\w]{25,}/);
        var emailBody = 'Work Order PDF test from Dashboard.gs saveWorkOrderToDrive().\n\n' +
          'Row tested: ' + testRowIndex + '\n' +
          'WO Number: ' + (result.woNumber || 'N/A') + '\n' +
          'PDF URL: ' + result.pdfUrl + '\n\n' +
          'If the PDF is attached below it worked correctly.';

        var attachments = [];
        if (pdfFileId) {
          try {
            var pdfFile = DriveApp.getFileById(pdfFileId[0]);
            attachments.push(pdfFile.getBlob().setName(pdfFile.getName()));
          } catch(ae) {
            Logger.log('Could not attach PDF: ' + ae);
            emailBody += '\n\nNote: PDF was saved to Drive but could not be attached to this email.';
          }
        }

        MailApp.sendEmail({
          to: 'tjennings@logistics-warehouse.com',
          subject: '[TEST] Work Order PDF - ' + (result.woNumber || 'Row ' + testRowIndex),
          body: emailBody,
          attachments: attachments
        });

        Logger.log('TEST SUCCESS - WO: ' + result.woNumber + ' | PDF: ' + result.pdfUrl + ' | Email sent.');
      } else {
        Logger.log('TEST FAILED: ' + (result ? result.message : 'Unknown error'));
      }
    } catch (err) {
      Logger.log('testSaveWorkOrderToDrive error: ' + err);
      Logger.log('TEST ERROR: ' + err.toString());
    }
  }

  // -- Resend completion email with work order PDF (manager-triggered) --
  // Useful when the automatic email from the Tech Portal glitched, was
  // missed, or needs to go out again after a correction.
  function resendCompletionEmail(rowIndex) {
    try {
      var ss      = SpreadsheetApp.openById(SHEET_ID);
      var sheet   = ss.getSheetByName('Submissions');
      if (!sheet) return { success: false, message: 'Submissions sheet not found.' };

      var rowData = sheet.getRange(rowIndex, 1, 1, 19).getValues()[0];
      var status  = rowData[COL.STATUS-1] ? rowData[COL.STATUS-1].toString() : '';
      if (status !== 'Completed') {
        return { success: false, message: 'This job is not marked Completed.' };
      }

      var config      = _getConfig();
      var company     = config['Company Name']    || 'Logistics Warehouse';
      var mgr1        = config['Manager Email 1'] || '';
      var mgr2        = config['Manager Email 2'] || '';
      var recipients  = [mgr1, mgr2].filter(function(e) { return e && e.indexOf('@') > -1; });
      if (recipients.length === 0) return { success: false, message: 'No manager emails configured.' };

      var woNum     = rowData[COL.WO_NUMBER-1]   ? rowData[COL.WO_NUMBER-1].toString()   : '';
      var trailer   = rowData[COL.TRAILER-1]     ? rowData[COL.TRAILER-1].toString()     : '';
      var location  = rowData[COL.LOCATION-1]    ? rowData[COL.LOCATION-1].toString()    : '';
      var driver    = rowData[COL.DRIVER-1]      ? rowData[COL.DRIVER-1].toString()      : '';
      var tech      = rowData[COL.ASSIGNED_TECH-1] ? rowData[COL.ASSIGNED_TECH-1].toString() : '';

      // Generate (or re-generate) the work order PDF and attach it
      var woResult = saveWorkOrderToDrive(rowIndex);
      if (!woResult || !woResult.success || !woResult.pdfUrl) {
        return { success: false, message: 'Could not generate work order PDF: ' + (woResult ? woResult.message : 'unknown error') };
      }

      var pdfUrl       = woResult.pdfUrl;
      var attachments  = [];
      var pdfFileId    = pdfUrl.match(/[-\w]{25,}/);
      if (pdfFileId) {
        try {
          var pdfFile = DriveApp.getFileById(pdfFileId[0]);
          attachments.push(pdfFile.getBlob().setName(pdfFile.getName()));
        } catch (ae) { Logger.log('Resend: could not attach PDF blob: ' + ae); }
      }

      var subject = '[Repair Complete - Resent] WO# ' + woNum + ' - Trailer ' + trailer;

      var htmlBody = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#EAECEF;margin:0;padding:20px 0;">' +
        '<table width="600" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.12);">' +
        '<tr><td style="background:#1E3A5F;padding:20px 24px;">' +
        '<p style="margin:0;font-size:18px;font-weight:bold;color:#fff;">' + _esc(company) + '</p>' +
        '<p style="margin:4px 0 0;font-size:12px;color:#BDC9D9;">Work Order Resent - Manager Dashboard</p>' +
        '</td></tr>' +
        '<tr><td style="background:#EAFAF1;border-bottom:3px solid #27AE60;padding:10px 24px;">' +
        '<p style="margin:0;font-size:13px;font-weight:bold;color:#1E8449;">REPAIR COMPLETED (Resent)</p>' +
        '</td></tr>' +
        '<tr><td style="padding:20px 24px;">' +
        '<table width="100%" style="border-collapse:collapse;background:#F8F9FA;border-radius:6px;margin-bottom:14px;">' +
        '<tr style="background:#1E3A5F;"><td colspan="2" style="padding:8px 14px;font-size:12px;font-weight:bold;color:#fff;border-radius:6px 6px 0 0;">REPAIR DETAILS</td></tr>' +
        _infoRow2('Work Order #', woNum) +
        _infoRow2('Trailer', trailer) +
        _infoRow2('Location', location) +
        _infoRow2('Driver', driver) +
        _infoRow2('Assigned Tech', tech || 'Not recorded') +
        '</table>' +
        '<p style="font-size:13px;color:#5D6D7E;">The full work order PDF is attached and also available below.</p>' +
        '<p><a href="' + pdfUrl + '" style="background:#1E3A5F;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold;">View Full Work Order PDF</a></p>' +
        '</td></tr>' +
        '<tr><td style="background:#F8F9FA;border-top:1px solid #ECF0F1;padding:12px 24px;text-align:center;font-size:11px;color:#95A5A6;">Resent by ' + _esc(company) + ' Manager Dashboard</td></tr>' +
        '</table></body></html>';

      MailApp.sendEmail({ to: recipients.join(','), subject: subject, htmlBody: htmlBody, attachments: attachments });

      return { success: true, pdfUrl: pdfUrl };
    } catch (err) {
      Logger.log('resendCompletionEmail error: ' + err);
      return { success: false, message: err.toString() };
    }
  }

  // ── Samsara trailer positions ─────────────────────────────────
  function getSamsaraTrailerPositions() {
    try {
      var config = _getConfig();
      var apiKey = config['SAMSARA_API_KEY'] || '';
      if (!apiKey) {
        return { success: false, message: 'SAMSARA_API_KEY not found in Config sheet. Add it as a row with key SAMSARA_API_KEY.' };
      }

      var results = [];
      var afterCursor = null;
      var hasNext = true;
      var pages = 0;

      while (hasNext && pages < 20) {
        var url = 'https://api.samsara.com/fleet/trailers/stats?types=gps&limit=200';
        if (afterCursor) { url += '&after=' + encodeURIComponent(afterCursor); }

        var resp = UrlFetchApp.fetch(url, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + apiKey.trim(), 'Accept': 'application/json' },
          muteHttpExceptions: true
        });

        if (resp.getResponseCode() !== 200) {
          Logger.log('Samsara trailer positions error: ' + resp.getResponseCode() + ' ' + resp.getContentText().substring(0, 300));
          return { success: false, message: 'Samsara API error ' + resp.getResponseCode() };
        }

        var data = JSON.parse(resp.getContentText());
        if (Array.isArray(data.data)) {
          data.data.forEach(function(trailer) {
            if (!trailer.gps || !trailer.gps.latitude || !trailer.gps.longitude) { return; }
            var gps = trailer.gps;
            var lastSeen = gps.time ? new Date(gps.time) : null;
            var minutesAgo = lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 60000) : null;
            var freshness = 'unknown';
            if (minutesAgo !== null) {
              if (minutesAgo < 60)        { freshness = minutesAgo + 'm ago'; }
              else if (minutesAgo < 1440) { freshness = Math.round(minutesAgo/60) + 'h ago'; }
              else                        { freshness = Math.round(minutesAgo/1440) + 'd ago'; }
            }
            results.push({
              id:        trailer.id   ? trailer.id.toString()   : '',
              name:      trailer.name ? trailer.name.toString() : trailer.id.toString(),
              lat:       gps.latitude,
              lng:       gps.longitude,
              address:   gps.reverseGeo ? gps.reverseGeo.formattedLocation : '',
              speed:     gps.speedMilesPerHour || 0,
              heading:   gps.headingDegrees    || 0,
              lastSeen:  gps.time || '',
              freshness: freshness,
              moving:    (gps.speedMilesPerHour || 0) > 1
            });
          });
        }

        hasNext = !!(data.pagination && data.pagination.hasNextPage);
        afterCursor = data.pagination ? data.pagination.endCursor : null;
        pages++;
      }

      Logger.log('Samsara trailer positions loaded: ' + results.length);
      return { success: true, trailers: results, count: results.length };
    } catch (err) {
      Logger.log('getSamsaraTrailerPositions error: ' + err);
      return { success: false, message: err.toString() };
    }
  }

  return {
    verifyPin: verifyPin,
    getSubmissions: getSubmissions,
    getShopStaff: getShopStaff,
    assignTech: assignTech,
    getRepairLogForWO: getRepairLogForWO,
    updateSubmissionStatus: updateSubmissionStatus,
    generateWorkOrderHtml: generateWorkOrderHtml,
    saveWorkOrderToDrive: saveWorkOrderToDrive,
    getTrailerHistory: getTrailerHistory,
    emailInspectionToManager: emailInspectionToManager,
    getRepairLogData: getRepairLogData,
    resendCompletionEmail: resendCompletionEmail,
    getSamsaraTrailerPositions: getSamsaraTrailerPositions
  };
})();

/* ===================== ORIGINAL TechPortal.gs ===================== */
var TS_TECH = (function () {
  // ============================================================
  //  TRAILER INSPECTION — TechPortal.gs
  //  Standalone GAS project. Deploy as Web App separately.
  //  Reads/writes to the same Sheet ID as the main project.
  // ============================================================

  var SHEET_ID = '197oRs4T23q3u8zc6ydWWESLBmBMaZuBLNeJfLjK3Haw';

  // ── Serve the tech portal ─────────────────────────────────────
  function doGet(e) {
    return HtmlService.createHtmlOutputFromFile('TechPortal')
      .setTitle('Tech Repair Portal')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
  }

  // ── Load shop staff list ──────────────────────────────────────
  function getShopStaff() {
    try {
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('ShopStaff');
      if (!sheet || sheet.getLastRow() < 2) return [];
      var data  = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      return data
        .map(function(r) { return { name: r[0] ? r[0].toString().trim() : '', role: r[1] ? r[1].toString().trim() : '' }; })
        .filter(function(r) { return r.name !== ''; });
    } catch (err) {
      Logger.log('getShopStaff error: ' + err);
      return [];
    }
  }

  // ── Get open job counts for every tech name, keyed by name ────
  function getJobCountsForAllTechs() {
    try {
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('Submissions');
      if (!sheet || sheet.getLastRow() < 2) return {};

      var data   = sheet.getRange(2, 1, sheet.getLastRow() - 1, 19).getValues();
      var counts = {};

      data.forEach(function(r) {
        var status = r[12] ? r[12].toString().trim() : 'Pending';
        if (status === 'Completed') return;
        var assignedTech = r[17] ? r[17].toString().trim() : '';
        if (!assignedTech) return;
        assignedTech.split(',').map(function(t) { return t.trim(); }).filter(Boolean).forEach(function(n) {
          var key = n.toLowerCase();
          counts[key] = (counts[key] || 0) + 1;
        });
      });
      return counts;
    } catch (err) {
      Logger.log('getJobCountsForAllTechs error: ' + err);
      return {};
    }
  }

  // ── Load jobs assigned to a specific tech ─────────────────────
  function getJobsForTech(techName) {
    try {
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('Submissions');
      if (!sheet || sheet.getLastRow() < 2) return [];
      var data  = sheet.getRange(2, 1, sheet.getLastRow() - 1, 19).getValues();
      var jobs  = [];

      data.forEach(function(r, i) {
        var assignedTech = r[17] ? r[17].toString().trim() : '';
        var assignedList = assignedTech.split(',').map(function(t) { return t.trim().toLowerCase(); });
        if (assignedList.indexOf(techName.toLowerCase()) < 0) return;
        var status = r[12] ? r[12].toString().trim() : 'Pending';
        if (status === 'Completed') return;

        var defectsRaw = r[5] ? r[5].toString() : '';
        var defectList = (defectsRaw && defectsRaw !== 'No defects selected')
          ? defectsRaw.split(' | ').filter(Boolean) : [];

        jobs.push({
          rowIndex:    i + 2,
          woNumber:    r[14] ? r[14].toString() : '',
          date:        r[1]  ? r[1].toString().substring(0, 10) : '',
          trailer:     r[3]  ? r[3].toString() : '',
          location:    r[4]  ? r[4].toString() : '',
          defects:     defectList,
          driverNotes: r[6]  ? r[6].toString() : '',
          status:      status,
          mgrNotes:    r[13] ? r[13].toString() : '',
          gpsLink:     r[9]  ? r[9].toString()  : ''
        });
      });

      var order = { 'In Progress': 0, 'Work Order Created': 1, 'Reviewed': 2 };
      jobs.sort(function(a, b) {
        var ao = order[a.status] !== undefined ? order[a.status] : 9;
        var bo = order[b.status] !== undefined ? order[b.status] : 9;
        return ao - bo;
      });
      return jobs;
    } catch (err) {
      Logger.log('getJobsForTech error: ' + err);
      return [];
    }
  }

  // ── Check if tech has an open (in-progress) repair session ────
  function getOpenSession(techName) {
    try {
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('RepairLog');
      if (!sheet || sheet.getLastRow() < 2) return null;
      var data  = sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues();
      for (var i = data.length - 1; i >= 0; i--) {
        var r = data[i];
        if (r[4] && r[4].toString().trim().toLowerCase() === techName.toLowerCase()
            && r[14] && r[14].toString().trim() === 'In Progress') {
          return {
            logId:    r[0]  ? r[0].toString()  : '',
            woNumber: r[1]  ? r[1].toString()  : '',
            trailer:  r[2]  ? r[2].toString()  : '',
            location: r[3]  ? r[3].toString()  : '',
            startTs:  r[5]  ? r[5].toString()  : '',
            startGps: r[6]  ? r[6].toString()  : '',
            rowIndex: i + 2
          };
        }
      }
      return null;
    } catch (err) {
      Logger.log('getOpenSession error: ' + err);
      return null;
    }
  }

  // ── Start a repair session ────────────────────────────────────
  function startRepair(techName, woNumber, trailer, location, gpsLat, gpsLng) {
    try {
      var ss       = SpreadsheetApp.openById(SHEET_ID);
      var repSheet = ss.getSheetByName('RepairLog');
      var subSheet = ss.getSheetByName('Submissions');
      if (!repSheet) return { success: false, message: 'RepairLog sheet not found. Run Setup.' };

      var now     = new Date();
      var ts      = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
      var logId   = 'LOG-' + dateStr + '-' + Math.floor(Math.random() * 1000);

      var gpsCoords = (gpsLat && gpsLng) ? gpsLat + ', ' + gpsLng : '';
      var gpsLink   = (gpsLat && gpsLng) ? buildMapsLink_(gpsLat, gpsLng) : '';

      var row = [
        logId, woNumber || '', trailer || '', location || '', techName,
        ts, gpsCoords, gpsLink, '', '', '', '', '', '', 'In Progress', ''
      ];
      repSheet.appendRow(row);
      var newRow = repSheet.getLastRow();

      if (subSheet) {
        var subData = subSheet.getRange(2, 1, subSheet.getLastRow() - 1, 15).getValues();
        for (var i = 0; i < subData.length; i++) {
          if (subData[i][14] && subData[i][14].toString().trim() === woNumber.trim()) {
            var subRow = i + 2;
            subSheet.getRange(subRow, 13).setValue('In Progress')
              .setBackground('#FFF3E0').setFontColor('#E65100').setFontWeight('bold');
            repSheet.getRange(newRow, 16).setValue(subRow);
            break;
          }
        }
      }

      return { success: true, logId: logId, startTs: ts, repairLogRow: newRow };
    } catch (err) {
      Logger.log('startRepair error: ' + err);
      return { success: false, message: err.toString() };
    }
  }

  // ── Stop a repair session and save all details ────────────────
  function stopRepair(repairLogRow, techName, woNumber, gpsLat, gpsLng, parts, laborNotes, markComplete, techReportedMins) {
    try {
      var ss       = SpreadsheetApp.openById(SHEET_ID);
      var repSheet = ss.getSheetByName('RepairLog');
      var subSheet = ss.getSheetByName('Submissions');
      if (!repSheet) return { success: false, message: 'RepairLog sheet not found.' };

      var now    = new Date();
      var endTs  = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

      var startTsStr = repSheet.getRange(repairLogRow, 6).getValue().toString();
      var totalMins  = 0;
      if (startTsStr) {
        var startDate = new Date(startTsStr);
        totalMins     = Math.round((now - startDate) / 60000);
      }

      var endGpsCoords = (gpsLat && gpsLng) ? gpsLat + ', ' + gpsLng : '';
      var endGpsLink   = (gpsLat && gpsLng) ? buildMapsLink_(gpsLat, gpsLng) : '';
      var partsJson    = parts ? JSON.stringify(parts) : '';
      var finalStatus  = markComplete ? 'Completed' : 'In Progress';

      // Build labor notes with tech-reported time appended
      var fullLaborNotes = laborNotes || '';
      if (techReportedMins && techReportedMins > 0) {
        var trh = Math.floor(techReportedMins / 60);
        var trm = techReportedMins % 60;
        var trStr = trh > 0 ? trh + 'h ' + trm + 'm' : trm + 'm';
        fullLaborNotes += (fullLaborNotes ? '\n' : '') + '[Tech-reported time: ' + trStr + ']';
      }

      repSheet.getRange(repairLogRow, 9).setValue(endTs);
      repSheet.getRange(repairLogRow, 10).setValue(endGpsCoords);
      repSheet.getRange(repairLogRow, 11).setValue(endGpsLink);
      repSheet.getRange(repairLogRow, 12).setValue(totalMins);
      repSheet.getRange(repairLogRow, 13).setValue(partsJson);
      repSheet.getRange(repairLogRow, 14).setValue(fullLaborNotes);
      repSheet.getRange(repairLogRow, 15).setValue(finalStatus);

      if (subSheet && markComplete) {
        var subRowUpdated = false;
        var finalSubRow   = 0;

        try {
          var subRowIdx = parseInt(repSheet.getRange(repairLogRow, 16).getValue());
          if (subRowIdx && subRowIdx > 1) {
            subSheet.getRange(subRowIdx, 13).setValue('Completed')
              .setBackground('#EAFAF1').setFontColor('#1E8449').setFontWeight('bold');
            subRowUpdated = true;
            finalSubRow   = subRowIdx;
          }
        } catch (se) { Logger.log('subRowIndex lookup failed: ' + se); }

        if (!subRowUpdated) {
          var subData2 = subSheet.getRange(2, 1, subSheet.getLastRow() - 1, 19).getValues();
          for (var j = 0; j < subData2.length; j++) {
            var woCell = subData2[j][14] ? subData2[j][14].toString().trim() : '';
            if (woCell && woCell.toLowerCase() === woNumber.toString().trim().toLowerCase()) {
              var subRow2 = j + 2;
              subSheet.getRange(subRow2, 13).setValue('Completed')
                .setBackground('#EAFAF1').setFontColor('#1E8449').setFontWeight('bold');
              finalSubRow = subRow2;
              break;
            }
          }
        }

        _sendCompletionEmail_(techName, woNumber, repairLogRow, totalMins, parts, fullLaborNotes, endTs, finalSubRow, techReportedMins);
      }

      return { success: true, totalMins: totalMins, endTs: endTs };
    } catch (err) {
      Logger.log('stopRepair error: ' + err);
      return { success: false, message: err.toString() };
    }
  }

  // ── Completion email to both managers ────────────────────────
  function _sendCompletionEmail_(techName, woNumber, repairLogRow, totalMins, parts, laborNotes, endTs, subRowIndex, techReportedMins) {
    try {
      var config   = _getConfig_();
      var company  = config['Company Name']    || 'Logistics Warehouse';
      var mgr1     = config['Manager Email 1'] || '';
      var mgr2     = config['Manager Email 2'] || '';
      var recipients = [mgr1, mgr2].filter(function(e) { return e && e.indexOf('@') > -1; });
      if (recipients.length === 0) return;

      var ss       = SpreadsheetApp.openById(SHEET_ID);
      var repSheet = ss.getSheetByName('RepairLog');
      var repRow   = repSheet.getRange(repairLogRow, 1, 1, 16).getValues()[0];

      var hh = Math.floor(totalMins / 60);
      var mm = totalMins % 60;
      var timeStr = hh > 0 ? hh + 'h ' + mm + 'm' : mm + 'm';

      var techTimeStr = '';
      if (techReportedMins && techReportedMins > 0) {
        var trh = Math.floor(techReportedMins / 60);
        var trm = techReportedMins % 60;
        techTimeStr = trh > 0 ? trh + 'h ' + trm + 'm' : trm + 'm';
      }

      var startGpsLink = repRow[7] ? repRow[7].toString() : '';
      var endGpsLink   = repRow[10] ? repRow[10].toString() : '';

      var partsHtml = '';
      if (parts && parts.length > 0) {
        var hasRealPart = parts.some(function(p) { return p.desc && p.desc.trim(); });
        if (hasRealPart) {
          partsHtml = '<h4 style="margin:14px 0 6px;font-size:13px;color:#1E3A5F;">Parts Used</h4>' +
            '<table width="100%" style="border-collapse:collapse;border:1px solid #D1D9E0;">' +
            '<tr style="background:#F0F4FA;"><th style="padding:7px 12px;font-size:11px;text-align:left;">Description</th>' +
            '<th style="padding:7px 12px;font-size:11px;text-align:left;width:60px;">Qty</th>' +
            '<th style="padding:7px 12px;font-size:11px;text-align:left;">Notes</th></tr>';
          parts.forEach(function(p, idx) {
            if (!p.desc || !p.desc.trim()) return;
            var bg = idx % 2 === 0 ? '#FFFFFF' : '#F8F9FA';
            partsHtml += '<tr style="background:' + bg + ';">' +
              '<td style="padding:7px 12px;font-size:13px;">' + _esc_(p.desc) + '</td>' +
              '<td style="padding:7px 12px;font-size:13px;">' + _esc_(p.qty || '') + '</td>' +
              '<td style="padding:7px 12px;font-size:13px;">' + _esc_(p.notes || '') + '</td></tr>';
          });
          partsHtml += '</table>';
        }
      }

      var subject = '[Repair Complete] WO# ' + woNumber + ' — Trailer ' + repRow[2] + ' — ' + techName;

      var timeCompare = techTimeStr
        ? '<tr style="border-bottom:1px solid #ECF0F1;background:#FAFBFC;">' +
          '<td style="padding:8px 14px;font-size:12px;font-weight:bold;color:#5D6D7E;width:38%;">Tech-Reported Time</td>' +
          '<td style="padding:8px 14px;font-size:13px;">' + techTimeStr +
          (techTimeStr !== timeStr ? ' <span style="color:#E67E22;font-size:11px;">(timer: ' + timeStr + ')</span>' : ' <span style="color:#27AE60;font-size:11px;">✓ matches timer</span>') +
          '</td></tr>'
        : '';

      var htmlBody = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#EAECEF;margin:0;padding:20px 0;">' +
        '<table width="600" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.12);">' +
        '<tr><td style="background:#1E3A5F;padding:20px 24px;">' +
        '<p style="margin:0;font-size:18px;font-weight:bold;color:#fff;">' + _esc_(company) + '</p>' +
        '<p style="margin:4px 0 0;font-size:12px;color:#BDC9D9;">Repair Completed — Tech Portal</p>' +
        '</td></tr>' +
        '<tr><td style="background:#EAFAF1;border-bottom:3px solid #27AE60;padding:10px 24px;">' +
        '<p style="margin:0;font-size:13px;font-weight:bold;color:#1E8449;">✅ REPAIR COMPLETED</p>' +
        '</td></tr>' +
        '<tr><td style="padding:20px 24px;">' +
        '<table width="100%" style="border-collapse:collapse;background:#F8F9FA;border-radius:6px;margin-bottom:14px;">' +
        '<tr style="background:#1E3A5F;"><td colspan="2" style="padding:8px 14px;font-size:12px;font-weight:bold;color:#fff;">REPAIR DETAILS</td></tr>' +
        _row_('Work Order #', woNumber) +
        _row_('Technician', techName) +
        _row_('Trailer', repRow[2] ? repRow[2].toString() : '') +
        _row_('Location', repRow[3] ? repRow[3].toString() : '') +
        _row_('Timer Duration', timeStr) +
        timeCompare +
        _row_('Completed', endTs) +
        _row_('Start Location', startGpsLink ? '<a href="' + startGpsLink + '" style="color:#2980B9;">View on Maps</a>' : 'Not recorded') +
        _row_('End Location',   endGpsLink   ? '<a href="' + endGpsLink   + '" style="color:#2980B9;">View on Maps</a>' : 'Not recorded') +
        '</table>' +
        (laborNotes ? '<h4 style="margin:0 0 6px;font-size:13px;color:#1E3A5F;">Labor Notes</h4>' +
          '<div style="background:#F8F9FA;border-radius:6px;padding:10px 14px;font-size:13px;margin-bottom:14px;">' + _esc_(laborNotes) + '</div>' : '') +
        partsHtml +
        '</td></tr>' +
        '<tr><td style="background:#F8F9FA;border-top:1px solid #ECF0F1;padding:12px 24px;text-align:center;font-size:11px;color:#95A5A6;">Auto-generated by ' + _esc_(company) + ' Tech Portal</td></tr>' +
        '</table></body></html>';

      var attachments = [];
      var pdfUrl = '';
      if (subRowIndex && subRowIndex > 1) {
        try {
          var woResult = saveWorkOrderToDrive(subRowIndex);
          if (woResult && woResult.success && woResult.pdfUrl) {
            pdfUrl = woResult.pdfUrl;
            var pdfFileId = pdfUrl.match(/[-\w]{25,}/);
            if (pdfFileId) {
              var pdfFile = DriveApp.getFileById(pdfFileId[0]);
              attachments.push(pdfFile.getBlob().setName(pdfFile.getName()));
            }
          }
        } catch (pdfErr) {
          Logger.log('Completion email PDF generation FAILED: ' + pdfErr);
        }
      }

      if (pdfUrl) {
        htmlBody = htmlBody.replace('</table></body></html>',
          '<tr><td style="padding:0 24px 20px;text-align:center;"><a href="' + pdfUrl + '" style="background:#1E3A5F;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold;">View Full Work Order PDF</a></td></tr></table></body></html>');
      }

      MailApp.sendEmail({ to: recipients.join(','), subject: subject, htmlBody: htmlBody, attachments: attachments });
    } catch (err) {
      Logger.log('_sendCompletionEmail_ error: ' + err);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  function buildMapsLink_(lat, lng) {
    return 'https://maps.apple.com/?ll=' + lat + ',' + lng + '&q=Trailer+Inspection';
  }

  function _getConfig_() {
    try {
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('Config');
      if (!sheet) return {};
      var data  = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      var cfg   = {};
      data.forEach(function(r) { if (r[0]) cfg[r[0].toString().trim()] = r[1] ? r[1].toString().trim() : ''; });
      return cfg;
    } catch (e) { return {}; }
  }

  function _esc_(str) {
    if (!str) return '';
    return str.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _row_(label, value) {
    return '<tr style="border-bottom:1px solid #ECF0F1;">' +
      '<td style="padding:8px 14px;font-size:12px;font-weight:bold;color:#5D6D7E;width:38%;">' + label + '</td>' +
      '<td style="padding:8px 14px;font-size:13px;">' + value + '</td></tr>';
  }

  // ── Get completed repair sessions for a tech (last N days) ────
  function getRecentWorkForTech(techName, days) {
    try {
      var ss       = SpreadsheetApp.openById(SHEET_ID);
      var repSheet = ss.getSheetByName('RepairLog');
      var subSheet = ss.getSheetByName('Submissions');
      if (!repSheet || repSheet.getLastRow() < 2) return [];

      var cutoff    = new Date();
      cutoff.setDate(cutoff.getDate() - (days || 35));
      var cutoffStr = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy-MM-dd');

      var data    = repSheet.getRange(2, 1, repSheet.getLastRow() - 1, 16).getValues();
      var results = [];

      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        if (!row[4]) continue;
        if (row[4].toString().trim().toLowerCase() !== techName.toLowerCase()) continue;
        if (row[14] && row[14].toString().trim() !== 'Completed') continue;
        var startTs = row[5] ? row[5].toString() : '';
        if (startTs && startTs.substring(0, 10) < cutoffStr) continue;

        var woNum     = row[1] ? row[1].toString() : '';
        var trailer   = row[2] ? row[2].toString() : '';
        var location  = row[3] ? row[3].toString() : '';
        var defects   = '';
        var subRowIdx = row[15] ? parseInt(row[15]) : 0;

        if (subSheet && subRowIdx > 1) {
          try {
            var subRow = subSheet.getRange(subRowIdx, 1, 1, 15).getValues()[0];
            defects = subRow[5] ? subRow[5].toString() : '';
          } catch (se) {}
        }

        var mins = parseInt(row[11]) || 0;
        var hh   = Math.floor(mins / 60);
        var mm   = mins % 60;

        var partsArr = [];
        if (row[12]) {
          try {
            var pp = JSON.parse(row[12].toString());
            for (var j = 0; j < pp.length; j++) { if (pp[j].desc) partsArr.push(pp[j]); }
          } catch (ex) {}
        }

        results.push({
          logId:        row[0]  ? row[0].toString() : '',
          woNumber:     woNum,
          trailer:      trailer,
          location:     location,
          defects:      defects,
          startTs:      startTs,
          endTs:        row[8]  ? row[8].toString() : '',
          startLink:    row[7]  ? row[7].toString() : '',
          endLink:      row[10] ? row[10].toString() : '',
          totalMins:    mins,
          totalTimeStr: hh > 0 ? hh + 'h ' + mm + 'm' : mm + 'm',
          parts:        partsArr,
          laborNotes:   row[13] ? row[13].toString() : '',
          subRowIndex:  subRowIdx
        });
      }

      results.sort(function(a, b) { return b.startTs.localeCompare(a.startTs); });
      return results;
    } catch (err) {
      Logger.log('getRecentWorkForTech error: ' + err);
      return [];
    }
  }

  // ── Generate printable work order HTML for a tech's session ───
  function generateTechWorkOrderHtml(logId, techName) {
    try {
      var ss       = SpreadsheetApp.openById(SHEET_ID);
      var repSheet = ss.getSheetByName('RepairLog');
      var subSheet = ss.getSheetByName('Submissions');
      var config   = _getConfig_();
      var company  = config['Company Name'] || 'Logistics Warehouse';
      if (!repSheet) return { success: false, html: '' };

      var repRow = null;
      var subRowIdx = 0;
      if (repSheet.getLastRow() >= 2) {
        var repData = repSheet.getRange(2, 1, repSheet.getLastRow() - 1, 16).getValues();
        for (var i = 0; i < repData.length; i++) {
          if (repData[i][0] && repData[i][0].toString() === logId) {
            repRow    = repData[i];
            subRowIdx = repData[i][15] ? parseInt(repData[i][15]) : 0;
            break;
          }
        }
      }
      if (!repRow) return { success: false, html: '', message: 'Session not found.' };

      var woNum     = repRow[1]  ? repRow[1].toString()  : 'N/A';
      var trailer   = repRow[2]  ? repRow[2].toString()  : 'N/A';
      var location  = repRow[3]  ? repRow[3].toString()  : 'N/A';
      var startTs   = repRow[5]  ? repRow[5].toString()  : '';
      var endTs     = repRow[8]  ? repRow[8].toString()  : '';
      var startLink = repRow[7]  ? repRow[7].toString()  : '';
      var endLink   = repRow[10] ? repRow[10].toString() : '';
      var mins      = parseInt(repRow[11]) || 0;
      var hh        = Math.floor(mins / 60);
      var mm        = mins % 60;
      var timeStr   = mins > 0 ? (hh > 0 ? hh + 'h ' + mm + 'm' : mm + 'm') : 'Not recorded';
      var laborNotes  = repRow[13] ? repRow[13].toString() : '';
      var printDate   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');

      var partsArr = [];
      if (repRow[12]) {
        try {
          var pp = JSON.parse(repRow[12].toString());
          for (var pi = 0; pi < pp.length; pi++) { if (pp[pi].desc) partsArr.push(pp[pi]); }
        } catch (ex) {}
      }

      var defects = '', driverName = '', inspDate = '', driverNotes = '', photoUrl = '';
      if (subSheet && subRowIdx > 1) {
        try {
          var subRow = subSheet.getRange(subRowIdx, 1, 1, 19).getValues()[0];
          defects     = subRow[5] ? subRow[5].toString() : '';
          driverName  = subRow[2] ? subRow[2].toString() : '';
          inspDate    = subRow[1] ? subRow[1].toString() : '';
          driverNotes = subRow[6] ? subRow[6].toString() : '';
          photoUrl    = subRow[7] ? subRow[7].toString() : '';
        } catch (se) {}
      }

      var defArr = (defects && defects !== 'No defects selected') ? defects.split(' | ').filter(Boolean) : [];

      var defectHtml = '';
      if (defArr.length > 0) {
        for (var di = 0; di < defArr.length; di++) {
          var bg = di % 2 === 0 ? '#FFFFFF' : '#F8F9FA';
          defectHtml += '<tr style="background:' + bg + ';">' +
            '<td style="padding:7px 10px;font-size:13px;">' + _esc_(defArr[di]) + '</td>' +
            '<td style="padding:7px 10px;font-size:13px;width:200px;color:#BDC3C7;border-left:1px solid #F0F2F5;">____________</td></tr>';
        }
      } else {
        defectHtml = '<tr><td colspan="2" style="padding:10px;font-size:13px;color:#27AE60;">No defects reported.</td></tr>';
      }

      var partsHtml = '';
      if (partsArr.length > 0) {
        for (var pai = 0; pai < partsArr.length; pai++) {
          var pb = pai % 2 === 0 ? '#FFFFFF' : '#F8F9FA';
          partsHtml += '<tr style="background:' + pb + ';">' +
            '<td style="padding:7px 10px;font-size:13px;">' + _esc_(partsArr[pai].desc || '') + '</td>' +
            '<td style="padding:7px 10px;font-size:13px;width:80px;">' + _esc_(partsArr[pai].qty || '') + '</td>' +
            '<td style="padding:7px 10px;font-size:13px;">' + _esc_(partsArr[pai].notes || '') + '</td></tr>';
        }
      } else {
        partsHtml = '<tr><td colspan="3" style="padding:10px;font-size:13px;color:#7F8C8D;">No parts recorded.</td></tr>';
      }

      var photoTag = '';
      if (photoUrl) {
        try {
          var photoFileId = photoUrl.match(/[-\w]{25,}/);
          if (photoFileId) {
            var photoFile = DriveApp.getFileById(photoFileId[0]);
            var photoB64  = Utilities.base64Encode(photoFile.getBlob().getBytes());
            var photoMime = photoFile.getBlob().getContentType() || 'image/jpeg';
            photoTag = '<img src="data:' + photoMime + ';base64,' + photoB64 + '" style="max-width:260px;max-height:180px;border-radius:6px;border:1px solid #D1D9E0;" alt="Inspection Photo">';
          }
        } catch (pe) {
          photoTag = photoUrl ? '<a href="' + photoUrl + '" style="color:#2980B9;">View photo</a>' : '';
        }
      }

      var css = '<style>body{font-family:Arial,sans-serif;margin:0;padding:0;color:#2C3E50;background:#fff;}' +
        '@media print{.no-print{display:none!important;}}' +
        '.page{max-width:760px;margin:0 auto;padding:24px 32px;}' +
        'table{border-collapse:collapse;width:100%;}' +
        'h2{margin:14px 0 10px;font-size:15px;color:#1E3A5F;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #1E3A5F;padding-bottom:5px;}' +
        '.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1E3A5F;padding-bottom:14px;margin-bottom:18px;}' +
        '.co{font-size:20px;font-weight:bold;color:#1E3A5F;}.co-sub{font-size:11px;color:#7F8C8D;text-transform:uppercase;margin-top:2px;}' +
        '.wo{font-size:20px;font-weight:bold;color:#1E3A5F;text-align:right;}.wo-d{font-size:11px;color:#7F8C8D;text-align:right;margin-top:2px;}' +
        '.grid{display:flex;gap:20px;margin-bottom:12px;flex-wrap:wrap;}' +
        '.fld{flex:1;min-width:140px;}.fld label{display:block;font-size:10px;font-weight:bold;color:#7F8C8D;text-transform:uppercase;margin-bottom:3px;}' +
        '.fld .val{font-size:13px;border-bottom:1px solid #D1D9E0;padding-bottom:3px;min-height:18px;}' +
        '.sig{display:flex;gap:24px;margin-top:28px;}' +
        '.sig div{flex:1;border-top:1px solid #2C3E50;padding-top:5px;font-size:10px;color:#7F8C8D;}' +
        '.tech-band{background:#1E3A5F;color:#fff;padding:8px 14px;border-radius:6px;margin-bottom:14px;font-size:13px;font-weight:bold;}' +
        '</style>';

      var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' + css + '</head><body><div class="page">' +
        '<div class="no-print" style="text-align:right;margin-bottom:16px;">' +
        '<button onclick="window.print()" style="background:#1E3A5F;color:#fff;border:none;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:bold;cursor:pointer;margin-right:8px;">Print / Save PDF</button>' +
        '<button onclick="window.close()" style="background:#ECF0F1;color:#2C3E50;border:none;padding:10px 18px;border-radius:6px;font-size:14px;cursor:pointer;">Close</button>' +
        '</div>' +
        '<div class="hdr">' +
        '<div><div class="co">' + _esc_(company) + '</div><div class="co-sub">Repair Work Order - Tech Copy</div></div>' +
        '<div><div class="wo">' + _esc_(woNum) + '</div><div class="wo-d">Printed: ' + printDate + '</div></div>' +
        '</div>' +
        '<div class="tech-band">Technician: ' + _esc_(techName) + '   |   Trailer: ' + _esc_(trailer) + '   |   Date: ' + (startTs ? startTs.substring(0,10) : '--') + '</div>' +
        '<h2>Job Info</h2>' +
        '<div class="grid">' +
        '<div class="fld"><label>Inspection Date</label><div class="val">' + _esc_(inspDate ? inspDate.toString().substring(0,10) : '--') + '</div></div>' +
        '<div class="fld"><label>Driver</label><div class="val">' + _esc_(driverName) + '</div></div>' +
        '<div class="fld"><label>Trailer #</label><div class="val">' + _esc_(trailer) + '</div></div>' +
        '</div>' +
        '<div class="grid">' +
        '<div class="fld"><label>Location</label><div class="val">' + _esc_(location) + '</div></div>' +
        '<div class="fld"><label>Work Started</label><div class="val">' + _esc_(startTs ? startTs.substring(0,16) : '--') + (startLink ? ' <a href="' + startLink + '" style="color:#2980B9;font-size:11px;">[Map]</a>' : '') + '</div></div>' +
        '<div class="fld"><label>Work Completed</label><div class="val">' + _esc_(endTs ? endTs.substring(0,16) : '--') + (endLink ? ' <a href="' + endLink + '" style="color:#2980B9;font-size:11px;">[Map]</a>' : '') + '</div></div>' +
        '</div>' +
        '<div class="grid"><div class="fld"><label>Total Labor Time</label><div class="val" style="font-weight:bold;font-size:15px;">' + timeStr + '</div></div></div>' +
        '<h2>Defects Addressed</h2>' +
        '<table style="border:1px solid #D1D9E0;margin-bottom:14px;">' +
        '<tr style="background:#1E3A5F;"><th style="padding:8px;font-size:11px;color:#fff;text-align:left;">Defect</th>' +
        '<th style="padding:8px;font-size:11px;color:#fff;text-align:left;width:200px;">Action Taken</th></tr>' +
        defectHtml + '</table>' +
        '<h2>Parts Used</h2>' +
        '<table style="border:1px solid #D1D9E0;margin-bottom:14px;">' +
        '<tr style="background:#1E3A5F;">' +
        '<th style="padding:8px;font-size:11px;color:#fff;text-align:left;">Description</th>' +
        '<th style="padding:8px;font-size:11px;color:#fff;text-align:left;width:80px;">Qty</th>' +
        '<th style="padding:8px;font-size:11px;color:#fff;text-align:left;">Vendor / Notes</th>' +
        '</tr>' + partsHtml + '</table>' +
        '<h2>Labor Notes</h2>' +
        '<div style="border:1px solid #D1D9E0;border-radius:6px;padding:10px 14px;min-height:50px;font-size:13px;margin-bottom:14px;">' + _esc_(laborNotes || 'None recorded') + '</div>' +
        (driverNotes ? '<h2>Driver Notes</h2><div style="border:1px solid #D1D9E0;border-radius:6px;padding:10px 14px;font-size:13px;margin-bottom:14px;">' + _esc_(driverNotes) + '</div>' : '') +
        (photoTag ? '<h2>Inspection Photo</h2><div style="margin-bottom:14px;">' + photoTag + '</div>' : '') +
        '<div class="sig">' +
        '<div>Technician Signature &amp; Date</div>' +
        '<div>Shop Supervisor Signature &amp; Date</div>' +
        '</div>' +
        '</div></body></html>';

      return { success: true, html: html };
    } catch (err) {
      Logger.log('generateTechWorkOrderHtml error: ' + err);
      return { success: false, html: '', message: err.toString() };
    }
  }

  // ── Work order PDF generation ─────────────────────────────────

  function getRepairLogForWO(woNumber) {
    try {
      if (!woNumber) return [];
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('RepairLog');
      if (!sheet || sheet.getLastRow() < 2) return [];
      var data    = sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues();
      var entries = [];
      data.forEach(function(r) {
        if (r[1] && r[1].toString().trim() === woNumber.trim()) {
          entries.push({
            logId:       r[0]  ? r[0].toString() : '',
            woNumber:    r[1]  ? r[1].toString() : '',
            trailer:     r[2]  ? r[2].toString() : '',
            location:    r[3]  ? r[3].toString() : '',
            techName:    r[4]  ? r[4].toString() : '',
            startTs:     r[5]  ? r[5].toString() : '',
            startGps:    r[6]  ? r[6].toString() : '',
            startLink:   r[7]  ? r[7].toString() : '',
            endTs:       r[8]  ? r[8].toString() : '',
            endGps:      r[9]  ? r[9].toString() : '',
            endLink:     r[10] ? r[10].toString() : '',
            totalMins:   r[11] ? r[11].toString() : '',
            parts:       r[12] ? r[12].toString() : '',
            laborNotes:  r[13] ? r[13].toString() : '',
            repairStatus:r[14] ? r[14].toString() : ''
          });
        }
      });
      return entries;
    } catch (err) {
      Logger.log('getRepairLogForWO error: ' + err);
      return [];
    }
  }

  var COL = {
    TIMESTAMP: 1, DATE: 2, DRIVER: 3, TRAILER: 4, LOCATION: 5,
    DEFECTS: 6, NOTES: 7, PHOTO_URL: 8, GPS_COORDS: 9, GPS_LINK: 10,
    PDF_URL: 11, USER_AGENT: 12, STATUS: 13, MGR_NOTES: 14, WO_NUMBER: 15,
    REVIEWED_BY: 16, REVIEWED_TS: 17, ASSIGNED_TECH: 18, ASSIGNED_TS: 19
  };

  function generateWorkOrderHtml(rowIndex) {
    try {
      var ss          = SpreadsheetApp.openById(SHEET_ID);
      var sheet       = ss.getSheetByName('Submissions');
      if (!sheet) return { success: false, html: '' };

      var rowData     = sheet.getRange(rowIndex, 1, 1, 19).getValues()[0];
      var config      = _getConfig();
      var companyName = config['Company Name'] || 'Logistics Warehouse';

      var defectsRaw = rowData[COL.DEFECTS-1] ? rowData[COL.DEFECTS-1].toString() : '';
      var defectList = defectsRaw !== 'No defects selected' ? defectsRaw.split(' | ').filter(Boolean) : [];
      var hasDefects = defectList.length > 0;
      var woNum      = rowData[COL.WO_NUMBER-1] ? rowData[COL.WO_NUMBER-1].toString() : '';
      if (!woNum) {
        var d = new Date();
        woNum = 'WO-' + Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + rowIndex;
        sheet.getRange(rowIndex, COL.WO_NUMBER).setValue(woNum);
      }

      var gpsCoords   = rowData[COL.GPS_COORDS-1] ? rowData[COL.GPS_COORDS-1].toString() : '';
      var gpsLink     = rowData[COL.GPS_LINK-1]   ? rowData[COL.GPS_LINK-1].toString()   : '';
      var photoUrl    = rowData[COL.PHOTO_URL-1]  ? rowData[COL.PHOTO_URL-1].toString()  : '';
      var driverNotes = rowData[COL.NOTES-1]      ? rowData[COL.NOTES-1].toString()      : '';
      var mgrNotes    = rowData[COL.MGR_NOTES-1]  ? rowData[COL.MGR_NOTES-1].toString()  : '';
      var printDate   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');
      var isComplete  = (rowData[COL.STATUS-1] || '').toString() === 'Completed';

      var sessions       = getRepairLogForWO(woNum);
      var totalLaborMins = 0;
      var i, sess;
      for (i = 0; i < sessions.length; i++) { totalLaborMins += parseInt(sessions[i].totalMins) || 0; }
      var sHH = Math.floor(totalLaborMins / 60);
      var sMM = totalLaborMins % 60;
      var totalLaborStr = totalLaborMins > 0 ? (sHH > 0 ? sHH + 'h ' + sMM + 'm' : sMM + 'm') : '--';

      var photoImgTag = '';
      if (photoUrl) {
        try {
          var photoFileId = photoUrl.match(/[-\w]{25,}/);
          if (photoFileId) {
            var photoFile = DriveApp.getFileById(photoFileId[0]);
            var photoBlob = photoFile.getBlob();
            var photoB64  = Utilities.base64Encode(photoBlob.getBytes());
            var photoMime = photoBlob.getContentType() || 'image/jpeg';
            photoImgTag   = '<img src="data:' + photoMime + ';base64,' + photoB64 + '" width="110" height="80" style="border:1px solid #D1D9E0;" alt="Photo">';
          }
        } catch (pe) { Logger.log('Photo embed: ' + pe); }
      }

      var defectRows = '';
      if (hasDefects) {
        for (i = 0; i < defectList.length; i++) {
          var bg = i % 2 === 0 ? '#ffffff' : '#F8F9FA';
          defectRows += '<tr style="background:' + bg + ';">' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;width:24px;text-align:center;font-size:11px;">&#9633;</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:11px;">' + _esc(defectList[i]) + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;width:140px;font-size:10px;color:#999999;">Initials/notes</td></tr>';
        }
      } else {
        defectRows = '<tr><td colspan="3" style="border:1px solid #D1D9E0;padding:8px;font-size:11px;color:#27AE60;">No defects reported.</td></tr>';
      }

      var allPartsUsed = [];
      var repairRows   = '';
      if (sessions.length > 0) {
        for (i = 0; i < sessions.length; i++) {
          sess = sessions[i];
          var sm   = parseInt(sess.totalMins) || 0;
          var sh   = Math.floor(sm / 60);
          var smm  = sm % 60;
          var tStr = sm > 0 ? (sh > 0 ? sh + 'h ' + smm + 'm' : smm + 'm') : '--';
          var startStr = sess.startTs ? sess.startTs.substring(0,16) : '--';
          var endStr   = sess.endTs   ? sess.endTs.substring(0,16)   : '--';
          var gStr = '';
          if (sess.startLink) gStr += '<a href="' + sess.startLink + '" style="color:#2980B9;">Start</a>';
          if (sess.endLink)   gStr += (gStr ? ' / ' : '') + '<a href="' + sess.endLink + '" style="color:#2980B9;">End</a>';
          if (!gStr) gStr = '--';
          if (sess.parts) {
            try { var pp = JSON.parse(sess.parts); for (var j = 0; j < pp.length; j++) { if (pp[j].desc) allPartsUsed.push(pp[j]); } } catch (ex) {}
          }
          var bg2 = i % 2 === 0 ? '#ffffff' : '#F8F9FA';
          repairRows += '<tr style="background:' + bg2 + ';">' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:11px;font-weight:bold;">' + _esc(sess.techName || '--') + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:10px;">' + startStr + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:10px;">' + endStr + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:11px;font-weight:bold;">' + tStr + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:10px;">' + gStr + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 6px;font-size:10px;">' + _esc(sess.laborNotes || '--') + '</td></tr>';
        }
      } else {
        repairRows = '<tr><td colspan="6" style="border:1px solid #D1D9E0;padding:8px;font-size:11px;color:#7F8C8D;text-align:center;">No repair sessions recorded.</td></tr>';
      }

      var partsRows = '';
      if (allPartsUsed.length > 0) {
        for (i = 0; i < allPartsUsed.length; i++) {
          var pt  = allPartsUsed[i];
          var bg3 = i % 2 === 0 ? '#ffffff' : '#F8F9FA';
          partsRows += '<tr style="background:' + bg3 + ';">' +
            '<td style="border:1px solid #D1D9E0;padding:4px 8px;font-size:11px;">' + _esc(pt.desc  || '') + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 8px;font-size:11px;width:60px;">' + _esc(pt.qty   || '') + '</td>' +
            '<td style="border:1px solid #D1D9E0;padding:4px 8px;font-size:11px;">' + _esc(pt.notes || '') + '</td></tr>';
        }
      }

      var css = '<style>@page{size:letter;margin:12mm 10mm;}body{font-family:Arial,sans-serif;font-size:11px;color:#2C3E50;margin:0;padding:0;}@media print{.no-print{display:none!important;}}table{border-collapse:collapse;}.sec{font-size:10px;font-weight:bold;color:#ffffff;background:#1E3A5F;padding:4px 8px;text-transform:uppercase;letter-spacing:0.4px;}.lbl{font-size:8px;font-weight:bold;color:#7F8C8D;text-transform:uppercase;letter-spacing:0.3px;}.val{font-size:11px;border-bottom:1px solid #D1D9E0;padding-bottom:2px;}</style>';
      var statusColor = isComplete ? '#1E8449' : '#C0392B';
      var statusBg    = isComplete ? '#EAFAF1' : '#FDEDEC';
      var statusText  = isComplete ? 'COMPLETED' : ('STATUS: ' + _esc((rowData[COL.STATUS-1] || 'Pending').toString()));
      var laborLabel  = isComplete ? 'Total Labor: ' : 'Labor so far: ';
      var printBtns   = '<div class="no-print" style="text-align:right;padding:8px 14px;background:#F8F9FA;border-bottom:1px solid #D1D9E0;"><button onclick="window.print()" style="background:#1E3A5F;color:#fff;border:none;padding:8px 18px;border-radius:5px;font-size:13px;font-weight:bold;cursor:pointer;margin-right:6px;">Print / Save PDF</button><button onclick="window.close()" style="background:#ECF0F1;color:#2C3E50;border:none;padding:8px 14px;border-radius:5px;font-size:13px;cursor:pointer;">Close</button></div>';

      var dateVal     = rowData[COL.DATE-1]    ? rowData[COL.DATE-1].toString().substring(0,10) : '';
      var driverVal   = rowData[COL.DRIVER-1]  ? rowData[COL.DRIVER-1].toString()  : '';
      var trailerVal  = rowData[COL.TRAILER-1] ? rowData[COL.TRAILER-1].toString() : '';
      var locationVal = rowData[COL.LOCATION-1]? rowData[COL.LOCATION-1].toString(): '';
      var statusVal   = rowData[COL.STATUS-1]  ? rowData[COL.STATUS-1].toString()  : '';

      var body =
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:8px 12px;">' +
        '<tr><td style="border-bottom:3px solid #1E3A5F;padding-bottom:6px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td style="font-size:16px;font-weight:bold;color:#1E3A5F;">' + _esc(companyName) + '<div style="font-size:9px;color:#7F8C8D;text-transform:uppercase;letter-spacing:0.5px;font-weight:normal;">Trailer Defect Work Order</div></td>' +
        '<td align="right" style="font-size:16px;font-weight:bold;color:#1E3A5F;">' + _esc(woNum) + '<div style="font-size:9px;color:#7F8C8D;font-weight:normal;">Printed: ' + printDate + '</div></td>' +
        '</tr></table></td></tr>' +
        '<tr><td style="padding:6px 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + statusBg + ';border-left:4px solid ' + statusColor + ';"><tr><td style="padding:5px 10px;font-size:10px;font-weight:bold;color:' + statusColor + ';">' + statusText + '</td><td align="right" style="padding:5px 10px;font-size:10px;font-weight:bold;color:' + statusColor + ';">' + laborLabel + totalLaborStr + '</td></tr></table></td></tr>' +
        '<tr><td style="padding:6px 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td width="33%" style="padding:2px 6px;"><div class="lbl">Date</div><div class="val">' + _esc(dateVal) + '</div></td>' +
        '<td width="33%" style="padding:2px 6px;"><div class="lbl">Driver</div><div class="val">' + _esc(driverVal) + '</div></td>' +
        '<td width="34%" style="padding:2px 6px;"><div class="lbl">Trailer #</div><div class="val">' + _esc(trailerVal) + '</div></td>' +
        '</tr><tr>' +
        '<td width="33%" style="padding:2px 6px;"><div class="lbl">Location</div><div class="val">' + _esc(locationVal) + (gpsLink ? ' <a href="' + gpsLink + '" style="color:#2980B9;font-size:9px;">[Map]</a>' : '') + '</div></td>' +
        '<td width="33%" style="padding:2px 6px;"><div class="lbl">WO Status</div><div class="val">' + _esc(statusVal) + '</div></td>' +
        '<td width="34%" style="padding:2px 6px;"><div class="lbl">GPS Coordinates</div><div class="val">' + (gpsCoords ? _esc(gpsCoords) : '--') + '</div></td>' +
        '</tr></table></td></tr>' +
        '<tr><td style="padding:4px 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td width="65%" valign="top" style="padding-right:8px;"><div class="sec">Defects - Action Required</div><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr style="background:#2C4F7A;"><th style="border:1px solid #D1D9E0;padding:4px 6px;width:24px;color:#fff;font-size:9px;"></th><th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Defect</th><th style="border:1px solid #D1D9E0;padding:4px 6px;width:140px;color:#fff;font-size:9px;text-align:left;">Action Taken</th></tr>' + defectRows + '</table></td>' +
        '<td width="35%" valign="top">' + (photoImgTag ? '<div style="margin-bottom:6px;">' + photoImgTag + '</div>' : '') + (driverNotes ? '<div class="lbl" style="margin-bottom:2px;">Driver Notes</div><div style="border:1px solid #D1D9E0;background:#FAFBFC;padding:5px 7px;font-size:11px;margin-bottom:6px;">' + _esc(driverNotes) + '</div>' : '') + '<div class="lbl" style="margin-bottom:2px;">Shop / Manager Notes</div><div style="border:1px solid #D1D9E0;background:#FAFBFC;padding:5px 7px;font-size:11px;min-height:24px;">' + (mgrNotes ? _esc(mgrNotes) : '&nbsp;') + '</div></td>' +
        '</tr></table></td></tr>' +
        '<tr><td style="padding:6px 0 0;"><div class="sec">Repair Sessions</div><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr style="background:#2C4F7A;"><th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Tech</th><th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Started</th><th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Ended</th><th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Time</th><th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">GPS</th><th style="border:1px solid #D1D9E0;padding:4px 6px;color:#fff;font-size:9px;text-align:left;">Labor Notes</th></tr>' + repairRows + '</table></td></tr>' +
        (allPartsUsed.length > 0 ? '<tr><td style="padding:6px 0 0;"><div class="sec">Parts Used</div><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr style="background:#2C4F7A;"><th style="border:1px solid #D1D9E0;padding:4px 8px;color:#fff;font-size:9px;text-align:left;">Description</th><th style="border:1px solid #D1D9E0;padding:4px 8px;width:60px;color:#fff;font-size:9px;text-align:left;">Qty</th><th style="border:1px solid #D1D9E0;padding:4px 8px;color:#fff;font-size:9px;text-align:left;">Notes / Vendor</th></tr>' + partsRows + '</table></td></tr>' : '') +
        '<tr><td style="padding-top:14px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="33%" style="border-top:1px solid #2C3E50;padding-top:4px;font-size:9px;color:#7F8C8D;">Technician Signature &amp; Date</td><td width="2%"></td><td width="31%" style="border-top:1px solid #2C3E50;padding-top:4px;font-size:9px;color:#7F8C8D;">Shop Supervisor Signature &amp; Date</td><td width="2%"></td><td width="32%" style="border-top:1px solid #2C3E50;padding-top:4px;font-size:9px;color:#7F8C8D;">Driver Acknowledgment &amp; Date</td></tr></table></td></tr>' +
        '<tr><td style="padding-top:8px;border-top:1px solid #ECF0F1;text-align:center;font-size:8px;color:#BDC3C7;">Generated by ' + _esc(companyName) + ' Trailer Inspection System | ' + _esc(woNum) + ' | ' + printDate + '</td></tr>' +
        '</table>';

      var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">' + css + '</head><body>' + printBtns + body + '</body></html>';
      return { success: true, html: fullHtml, woNumber: woNum };
    } catch (err) {
      Logger.log('generateWorkOrderHtml error: ' + err);
      return { success: false, html: '', message: err.toString() };
    }
  }

  function saveWorkOrderToDrive(rowIndex) {
    try {
      var result = generateWorkOrderHtml(rowIndex);
      if (!result.success) return { success: false, message: 'Could not generate work order HTML.' };

      var woNum      = result.woNumber || ('WO-' + rowIndex);
      var folderName = 'Trailer Work Orders';
      var folders    = DriveApp.getFoldersByName(folderName);
      var folder     = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

      var ss      = SpreadsheetApp.openById(SHEET_ID);
      var sheet   = ss.getSheetByName('Submissions');
      var rowData = sheet.getRange(rowIndex, 1, 1, 19).getValues()[0];
      var trailer = (rowData[COL.TRAILER-1] || 'TRL').toString().replace(/[^a-zA-Z0-9_-]/g, '');
      var pdfName = woNum + '_' + trailer + '.pdf';

      var cleanHtml = result.html.replace(/<div class="no-print"[^]*?<\/div>/, '');
      var token    = ScriptApp.getOAuthToken();
      var CRLF     = '\r\n';
      var boundary = 'wobnd' + rowIndex;
      var metaJson = JSON.stringify({ name: '_TMP_WO_' + woNum, mimeType: 'application/vnd.google-apps.document' });

      var fullPayload = '--' + boundary + CRLF +
        'Content-Type: application/json; charset=UTF-8' + CRLF + CRLF +
        metaJson + CRLF +
        '--' + boundary + CRLF +
        'Content-Type: text/html; charset=UTF-8' + CRLF + CRLF +
        cleanHtml + CRLF +
        '--' + boundary + '--';

      var uploadResp = UrlFetchApp.fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
          payload: Utilities.newBlob(fullPayload, 'application/octet-stream').getBytes(),
          muteHttpExceptions: true
        }
      );

      var uploadJson = JSON.parse(uploadResp.getContentText());
      var docId      = uploadJson.id;
      if (!docId) return { success: false, message: 'Drive upload failed.' };

      var pdfResp = UrlFetchApp.fetch(
        'https://www.googleapis.com/drive/v3/files/' + docId + '/export?mimeType=application/pdf',
        { headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true }
      );

      var pdfBlob = pdfResp.getBlob().setName(pdfName);
      var pdfFile = folder.createFile(pdfBlob);
      pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      try { DriveApp.getFileById(docId).setTrashed(true); } catch(te) {}

      var pdfUrl = pdfFile.getUrl();
      sheet.getRange(rowIndex, COL.WO_NUMBER).setNote('PDF: ' + pdfUrl);
      return { success: true, pdfUrl: pdfUrl, woNumber: woNum };
    } catch (err) {
      Logger.log('saveWorkOrderToDrive error: ' + err);
      return { success: false, message: err.toString() };
    }
  }

  function _getConfig() {
    try {
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName('Config');
      if (!sheet) return {};
      var data  = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      var cfg   = {};
      data.forEach(function(r) { if (r[0]) cfg[r[0].toString().trim()] = r[1] ? r[1].toString().trim() : ''; });
      return cfg;
    } catch (e) { return {}; }
  }

  function _esc(str) {
    if (!str) return '';
    return str.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    getShopStaff: getShopStaff,
    getJobCountsForAllTechs: getJobCountsForAllTechs,
    getJobsForTech: getJobsForTech,
    getOpenSession: getOpenSession,
    startRepair: startRepair,
    stopRepair: stopRepair,
    getRecentWorkForTech: getRecentWorkForTech,
    generateTechWorkOrderHtml: generateTechWorkOrderHtml
  };
})();
