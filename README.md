# LWH Trailer Shop (techs)

The shop's app. A tech picks their name and sees their assigned repairs. Each repair has a timer, their own time entry, a tap-to-check defect list, labor notes, parts, and Call a Manager. Techs can save progress or mark a repair complete; completing emails the managers with the work order PDF. Recent Work shows the last 35 days with printable work orders.

**The manager side moved to the Transportation Manager app** (Trailer Inspections tile). This app no longer has a role screen or a manager option. Old `#manager` bookmarks show a note pointing there.

## Updating the existing Trailer Shop repo
Upload these files over the old ones:
- `index.html`
- `js/app.js`
- `sw.js`
- `manifest.json`
- `README.md`

Then delete `js/mgr.js`, `js/reports.js` and `js/map.js` from the repo. Nothing changes in Apps Script.

`config.js` still points to the trailer inspection web app, and it holds the two "Call a Manager" phone numbers.

Each phone remembers the last tech who used it. After pushing changes, bump `VERSION` in `sw.js`.
