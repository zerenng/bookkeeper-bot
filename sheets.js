const { google } = require('googleapis');

async function getSheets() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

function getCurrentMonthTab() {
  return new Date().toLocaleString('default',{month:'long',year:'numeric'});
}

async function updateGoogleSheet(data, action) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = getCurrentMonthTab();
  const profit = (data.soldPrice || 0) - (data.cogs || 0);
  const margin = data.cogs > 0 ? (profit / data.cogs).toFixed(4) : '';
  const today = new Date().toLocaleDateString('en-MY');
  const row = [today, data.item, data.cogs||'', data.soldPrice||'',
               profit||'', margin, data.km||'', data.tolls||''];
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:H`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [row] }
  });
  console.log('Sheet updated:', data.item);
}

module.exports = { updateGoogleSheet };
