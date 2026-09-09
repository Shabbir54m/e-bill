/**
 * বিদ্যুৎ বিল হিসাব — Google Sheet Web App Backend
 * ------------------------------------------------
 * নিয়ম: Shop/Floor + Billing Month + Billing Year = ইউনিক।
 * একই key (shopSlug_year_monthNumber) দিয়ে দ্বিতীয়বার নতুন Save করা
 * যাবে না, তবে এখন HTML পেজ থেকেই সেই একই key-র রেকর্ড Update বা
 * Delete করা যাবে (action: 'update' / 'delete')।
 */

const SHEET_NAME = 'Bills';

// কলাম ইনডেক্স (0-based, header বাদে data রো-তে)
const COL_TIMESTAMP = 0;
const COL_KEY = 1;
const COL_SHOP = 2;
const COL_MONTH = 3;
const COL_YEAR = 4;
const COL_MONTHNUM = 5;
const COL_YEARNUM = 6;
const COL_DATE = 7;
const COL_CURR = 8;
const COL_PREV = 9;
const COL_USED = 10;
const COL_COST = 11;
const COL_TOTAL = 12;

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'Timestamp', 'Key', 'Shop/Floor', 'Month', 'Year',
      'MonthNum', 'YearNum', 'Date', 'CurrentUnit', 'PreviousUnit',
      'UsedUnit', 'UnitCost', 'TotalBill'
    ]);
  }
  return sheet;
}

// GET ?action=list                       -> সব ইউনিক key-র লিস্ট
// GET ?action=get&key=XXX                 -> নির্দিষ্ট একটি key-র সম্পূর্ণ রেকর্ড
// GET ?action=getMonth&yearNum=Y&monthNum=M -> নির্দিষ্ট মাস+বছরের সব রেকর্ড (সব দোকান/তলা)
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'list';
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1); // header বাদ দিয়ে

  if (action === 'get') {
    const key = e.parameter.key;
    const row = rows.find(r => r[COL_KEY] === key);
    if (!row) {
      return jsonResponse({ status: 'notfound' });
    }
    return jsonResponse({ status: 'success', record: rowToRecord(row) });
  }

  if (action === 'getMonth') {
    const yearNum = String(e.parameter.yearNum || '');
    const monthNum = String(e.parameter.monthNum || '');
    const matched = rows.filter(r =>
      String(r[COL_YEARNUM]) === yearNum && String(r[COL_MONTHNUM]) === monthNum
    );
    return jsonResponse({
      status: 'success',
      records: matched.map(rowToRecord)
    });
  }

  // default: 'list'
  const keys = rows.map(r => r[COL_KEY]).filter(k => k);
  return jsonResponse({ status: 'success', keys: keys });
}

function rowToRecord(row) {
  return {
    key: row[COL_KEY],
    shop: row[COL_SHOP],
    month: row[COL_MONTH],
    year: row[COL_YEAR],
    monthNum: row[COL_MONTHNUM],
    yearNum: row[COL_YEARNUM],
    date: row[COL_DATE],
    currUnit: row[COL_CURR],
    prevUnit: row[COL_PREV],
    usedUnit: row[COL_USED],
    unitCost: row[COL_COST],
    totalBill: row[COL_TOTAL]
  };
}

// POST body: { action: 'save' | 'update' | 'delete', key: '...', ... }
// action না দেওয়া থাকলে ডিফল্ট 'save' (পুরনো আচরণ, backward compatible)।
//   save   -> key আগে থেকে থাকলে কিছুই লেখা হয় না (duplicate)।
//   update -> key মিলে গেলে সেই রো-র মান আপডেট হয়, না মিললে error।
//   delete -> key মিলে গেলে সেই রো ডিলিট হয়, না মিললে error।
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || 'save';
    const key = payload.key;

    if (!key) {
      return jsonResponse({ status: 'error', message: 'Key পাওয়া যায়নি।' });
    }

    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);

    const rowIndex = rows.findIndex(r => r[COL_KEY] === key); // rows-এর মধ্যে ইনডেক্স
    const sheetRowNum = rowIndex + 2; // header (1) + 1-based -> +2

    if (action === 'delete') {
      if (rowIndex === -1) {
        return jsonResponse({ status: 'error', message: 'এই রেকর্ড খুঁজে পাওয়া যায়নি, হয়তো আগেই মোছা হয়েছে।' });
      }
      sheet.deleteRow(sheetRowNum);
      return jsonResponse({ status: 'success', message: 'সফলভাবে ডিলিট করা হয়েছে।' });
    }

    if (action === 'update') {
      if (rowIndex === -1) {
        return jsonResponse({ status: 'error', message: 'এই রেকর্ড খুঁজে পাওয়া যায়নি, আপডেট করা যায়নি।' });
      }
      sheet.getRange(sheetRowNum, 1, 1, 13).setValues([[
        new Date(),
        key,
        payload.shop || '',
        payload.month || '',
        payload.year || '',
        payload.monthNum || '',
        payload.yearNum || '',
        payload.date || '',
        payload.currUnit || '',
        payload.prevUnit || '',
        payload.usedUnit || '',
        payload.unitCost || '',
        payload.totalBill || ''
      ]]);
      return jsonResponse({ status: 'success', message: 'সফলভাবে আপডেট করা হয়েছে।' });
    }

    // action === 'save' (ডিফল্ট)
    const alreadyExists = rowIndex !== -1;

    if (alreadyExists) {
      // ইচ্ছাকৃতভাবে কিছুই লেখা হচ্ছে না / আপডেট হচ্ছে না।
      return jsonResponse({
        status: 'duplicate',
        message: 'এই Shop/Floor + মাস + বছরের বিল আগে থেকেই সংরক্ষিত আছে। আপডেট বা ডিলিট করতে চাইলে ওই বাটন ব্যবহার করুন।'
      });
    }

    sheet.appendRow([
      new Date(),
      key,
      payload.shop || '',
      payload.month || '',
      payload.year || '',
      payload.monthNum || '',
      payload.yearNum || '',
      payload.date || '',
      payload.currUnit || '',
      payload.prevUnit || '',
      payload.usedUnit || '',
      payload.unitCost || '',
      payload.totalBill || ''
    ]);

    return jsonResponse({ status: 'success', message: 'সফলভাবে সংরক্ষিত হয়েছে।' });

  } catch (err) {
    return jsonResponse({ status: 'error', message: 'Server error: ' + err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}