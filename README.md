# LWH Trailer Shop (techs)

The shop's app. A tech picks their name and sees their assigned repairs. Each repair has a timer, their own time entry, a tap-to-check defect list, labor notes, parts, and Call a Manager. Techs can save progress or mark a repair complete; completing emails the managers with the work order PDF. Recent Work shows the last 35 days with printable work orders.

**Parts Stock (v1.3.0):** a tab with the shop's parts and what's on the shelf (search, bins, low stock). On a repair, start typing a part and pick it from the list: it comes off stock when the repair is saved or completed, and reopening the job shows the parts already entered. Parts that aren't on the list can still be typed in. Stock lives in Supabase and managers keep it in Transportation Manager > Shop Inventory. Nothing changes in Apps Script: the parts still save on the RepairLog row as before (with a `part_id` on stocked parts).

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
