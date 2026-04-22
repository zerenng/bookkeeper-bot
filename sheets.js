const { google } = require('googleapis');

async function getSheets() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

function getMonthTab() {
  const now = new Date();
  return now.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function getMonthLabel() {
  const now = new Date();
  const month = now.toLocaleString('default', { month: 'short' });
  const year = now.getFullYear().toString().slice(-2);
  return `${month}-${year}`;
}

async function ensureMonthSheet(sheets, spreadsheetId, sheetName) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
  if (existing) return existing.properties.sheetId;

  // Create new sheet tab
  const addSheet = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{ addSheet: { properties: { title: sheetName } } }]
    }
  });
  const newSheetId = addSheet.data.replies[0].addSheet.properties.sheetId;

  // Write headers and month label
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:H2`,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [
        [getMonthLabel(), 'ITEM', 'COST OF GOODS SOLD (RM)', 'SOLD PRICE (RM)', 'NET PROFIT (RM)', 'PROFIT MARGIN', 'TRAVEL (KM)', 'TOLLS'],
        ['TOTAL (RM)', '', '=SUM(C3:C1000)', '=SUM(D3:D1000)', '=SUM(E3:E1000)', '=IFERROR(E2/C2,"")', '=SUM(G3:G1000)', '=SUM(H3:H1000)']
      ]
    }
  });

  // Bold the TOTAL row (row 2)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: newSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold'
          }
        }
      ]
    }
  });

  console.log(`Created new sheet: ${sheetName}`);
  return newSheetId;
}

async function updateGoogleSheet(data, action) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = getMonthTab();

  const sheetId = await ensureMonthSheet(sheets, spreadsheetId, sheetName);

  // Get all values in column A to find TOTAL row
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:A`
  });
  const rows = response.data.values || [];
  let totalRowIndex = rows.findIndex(r => r[0] && r[0].toString().toUpperCase().includes('TOTAL'));
  if (totalRowIndex === -1) totalRowIndex = rows.length;

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

  const newRow = totalRowIndex + 1; // 1-based
  const today = new Date().toLocaleDateString('en-MY');
  const profitFormula = `=D${newRow}-C${newRow}`;
  const marginFormula = `=IFERROR(IF(D${newRow}="","",E${newRow}/C${newRow}),"")`;

  // Write data row
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

  // If profit margin is empty (no sold price), color cell F light blue
  if (!data.soldPrice) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: newRow - 1,
              endRowIndex: newRow,
              startColumnIndex: 5,
              endColumnIndex: 6
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.678, green: 0.847, blue: 0.902 }
              }
            },
            fields: 'userEnteredFormat.backgroundColor'
          }
        }]
      }
    });
  }

  console.log('Sheet updated:', data.item);
}

// Run on 1st of each month via a startup check
async function createMonthSheetIfNeeded() {
  const now = new Date();
  if (now.getDate() === 1) {
    try {
      const sheets = await getSheets();
      const spreadsheetId = process.env.SPREADSHEET_ID;
      const sheetName = getMonthTab();
      await ensureMonthSheet(sheets, spreadsheetId, sheetName);
      console.log('Monthly sheet check complete');
    } catch (err) {
      console.error('Monthly sheet creation error:', err);
    }
  }
}

createMonthSheetIfNeeded();

module.exports = { updateGoogleSheet };
