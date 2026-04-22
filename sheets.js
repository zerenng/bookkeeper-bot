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
  return new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
}

async function updateGoogleSheet(data, action) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = getCurrentMonthTab();

  // Get spreadsheet metadata to find sheetId
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error(`Sheet tab "${sheetName}" not found`);
  const sheetId = sheet.properties.sheetId;

  // Get all values to find the TOTAL row
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:A`
  });
  const rows = response.data.values || [];
  let totalRowIndex = rows.findIndex(r => r[0] && r[0].toString().toUpperCase().includes('TOTAL'));
  if (totalRowIndex === -1) totalRowIndex = rows.length; // fallback: append

  // Insert a blank row above TOTAL
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        insertDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: totalRowIndex,
            endIndex: totalRowIndex + 1
          },
          inheritFromBefore: true
        }
      }]
    }
  });

  // Calculate values
  const today = new Date().toLocaleDateString('en-MY');
  const newRow = totalRowIndex + 1; // 1-based for A1 notation
  const profitFormula = `=D${newRow}-C${newRow}`;
  const marginFormula = `=IF(C${newRow}>0,E${newRow}/C${newRow},"")`;

  // Write data into the inserted row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${newRow}:H${newRow}`,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [[
        today,
        data.item,
        data.cogs || '',
        data.soldPrice || '',
        profitFormula,
        marginFormula,
        data.km || '',
        data.tolls || ''
      ]]
    }
  });

  console.log('Sheet updated:', data.item);
}

module.exports = { updateGoogleSheet };
