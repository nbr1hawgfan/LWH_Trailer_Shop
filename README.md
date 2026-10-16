# LWH Trailer Shop

One installable app (PWA) that replaces the separate **Tech Portal** and **Manager Dashboard** Apps Script web apps. It runs on GitHub Pages and uses the same Google Sheet as the driver inspections in the Driver Toolkit.

- **Shop / Tech**
  - Pick your name. Job counts show next to each name.
  - My Jobs.
  - Repair screen: timer, your own time entry, tap-to-check defect list, labor notes, parts, Call a Manager.
  - Save progress or mark complete. Completing emails the managers with the work order PDF.
  - Recent Work (last 35 days) with printable work orders.
- **Manager** (Dashboard PIN)
  - **Inspections:** totals, filters, CSV export, and the 5-step review panel (details → assessment → assign techs → repair log → close and work order). From the panel you can print a work order, save the PDF to Drive, resend the completion email, or email the report.
  - **Shop Analytics:** labor hours by tech and every repair session.
  - **Driver & Location:** driver activity, inactive drivers and location defect hotspots.
  - **Trailer History:** full history for one trailer number.
  - **Trailer Map:** live Samsara positions, with a by-city Summary view.

Same data as before: the Submissions, RepairLog, ShopStaff and Config tabs, the same work order PDFs in Drive, and the same completion emails.

---

## Setup

### 1. Backend (about 5 minutes)
Open the **Trailer Defect Inspection** Apps Script project. That's the driver project, the one with `Code.gs` and the `Api.gs` you added earlier.

1. Open **Api.gs**, select all, and paste in the new `gas/Api.gs` from this zip. The driver inspection routes are unchanged; manager and tech routes are added.
2. Click **＋ → Script**, name the new file `ShopApi`, and paste in `gas/ShopApi.gs`.
3. Go to **Deploy → Manage deployments → ✏️ on the existing deployment → Version: New version → Deploy**. Keep the same deployment so the URL doesn't change.
4. If Google asks for permissions, accept them.

`ShopApi.gs` is your original **Dashboard.gs** and **TechPortal.gs**, copied in unchanged. Each one is sealed in its own container so its function names (`doGet`, `getShopStaff`, `_esc`, and so on) can't clash with each other or with `Code.gs`. The old Dashboard and Tech Portal projects aren't touched and keep working until you retire them.

### 2. GitHub Pages
1. Create a repo, for example `nbr1hawgfan/LWH_Trailer_Shop`.
2. Upload everything **except the `gas/` folder**.
3. Go to **Settings → Pages → Deploy from branch → main / root**.

`config.js` already points to the trailer inspection web app URL. It also holds the two "Call a Manager" phone numbers.

### 3. Bookmarks
- Shop tablet or tech phones: `…/LWH_Trailer_Shop/#tech`
- Managers: `…/LWH_Trailer_Shop/#manager`

Each phone remembers its role, and techs' phones remember their name.

---

## Notes
- **Manager PIN:** the same **Dashboard PIN** from the Config tab. Five wrong tries locks the PIN for 15 minutes. A sign-in lasts 8 hours on that device.
- **Samsara map:** uses the `SAMSARA_API_KEY` row in the Config tab, the same as the old dashboard.
- **Work orders** open in an in-app viewer with **Print / Save PDF**, so it works from an installed phone app, where pop-up windows don't.
- **One small fix versus the old dashboard:** if an inspection was already "Reviewed" when a tech is assigned, the Sheet is now set to "Work Order Created" so it matches what the screen shows. The old dashboard left the Sheet on "Reviewed".
- **Updating:** after pushing changes to GitHub, bump `VERSION` in `sw.js`. After changing the `.gs` files, redeploy as a **New version** on the same deployment.
