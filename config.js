// Trailer Shop settings.
window.TS_CONFIG = {
  // Same Apps Script web app the Driver Toolkit uses for trailer inspections
  // (the project with Code.gs + Api.gs + ShopApi.gs).
  API_URL: 'https://script.google.com/macros/s/AKfycbyTZ4y30FAUEqoSBZR2luzCrwWWGtitmrDEAmILm1NTywV78yveXPxYSI5tBLI6QyFO/exec',

  // "Call a Manager" buttons on the tech repair screen
  MANAGERS: [
    { name: 'Chris Morland', phone: '479-652-1662' },
    { name: 'Derek Dixon',   phone: '479-651-9227' }
  ],

  // Shop parts stock (Supabase, same project as the Driver Toolkit and Transportation Manager).
  // Parts a tech picks from stock come off the shelf count when the repair is saved.
  SB_URL: 'https://tjivcqxnkftujceumdtx.supabase.co',
  SB_KEY: 'sb_publishable_PYlWSW6-Gi-QZl91IXUq0Q_W5mO3sDT',

  // Weather on the start screen (Fort Smith, AR)
  WX_LAT: 35.3859,
  WX_LNG: -94.3985
};
