const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');

let inMemoryCache = null;
let lastSyncTime = null;

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading config.json:', err.message);
  }
  return {
    sheetUrl: '',
    lastSyncTime: null,
    dashboardTitle: 'Dashboard Performance Agen Mandiri'
  };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving config.json:', err.message);
  }
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, ''));
  return result;
}

function parseCsv(csvText) {
  if (!csvText) return { headers: [], rows: [] };
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const rawHeaders = parseCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0) continue;

    const rowObj = {};
    rawHeaders.forEach((h, idx) => {
      const cleanHeader = h.trim();
      rowObj[cleanHeader] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    rows.push(rowObj);
  }
  return { headers: rawHeaders, rows };
}

function fetchGoogleSheetCsv(url) {
  return new Promise((resolve, reject) => {
    let csvUrl = url;
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      const sheetId = match[1];
      let gid = '0';
      const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
      if (gidMatch) gid = gidMatch[1];
      csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    }

    const client = csvUrl.startsWith('https') ? https : http;
    client.get(csvUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchGoogleSheetCsv(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} saat mengambil Google Sheet. Pastikan set publik (Anyone with the link can view).`));
      }
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => resolve(rawData));
    }).on('error', reject);
  });
}

async function handler(req, res) {
  const method = req.method;
  const config = getConfig();

  // POST: Update config (e.g. Sheet URL)
  if (method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (payload.sheetUrl !== undefined) {
          config.sheetUrl = payload.sheetUrl.trim();
          inMemoryCache = null; // Clear cache
        }
        if (payload.dashboardTitle) config.dashboardTitle = payload.dashboardTitle;
        saveConfig(config);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Link Google Sheet berhasil disimpan', config }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET: Return data
  const parsedUrl = new URL(req.url, 'http://localhost');
  const forceRefresh = parsedUrl.searchParams.get('refresh') === '1';

  if (!config.sheetUrl) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({
      success: true,
      hasData: false,
      message: 'Belum ada Google Sheet terhubung. Silakan masukkan link sheet.',
      config,
      headers: [],
      rows: []
    }));
  }

  const now = Date.now();
  if (!forceRefresh && inMemoryCache && (now - lastSyncTime < 30000)) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify(inMemoryCache));
  }

  try {
    const csvData = await fetchGoogleSheetCsv(config.sheetUrl);
    const parsed = parseCsv(csvData);

    const payload = {
      success: true,
      hasData: parsed.rows.length > 0,
      totalRows: parsed.rows.length,
      headers: parsed.headers,
      lastSync: new Date().toISOString(),
      rows: parsed.rows
    };

    inMemoryCache = payload;
    lastSyncTime = Date.now();
    config.lastSyncTime = new Date().toISOString();
    config.totalRows = parsed.rows.length;
    saveConfig(config);

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      success: false,
      hasData: false,
      error: err.message,
      config,
      headers: [],
      rows: []
    }));
  }
}

module.exports = handler;
