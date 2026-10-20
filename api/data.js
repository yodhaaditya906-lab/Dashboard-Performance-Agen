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
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

function fetchCsv(url) {
  return new Promise((resolve, reject) => {
    function makeReq(targetUrl) {
      const client = targetUrl.startsWith('https') ? https : http;
      client.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeReq(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} saat mengambil sheet`));
        }
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => resolve(rawData));
      }).on('error', reject);
    }
    makeReq(url);
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
      table1_monthly: [],
      table2_units: [],
      table3_agents: [],
      table4_rank: [],
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
    const match = config.sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = match ? match[1] : null;

    if (!sheetId) {
      throw new Error('Format link Google Sheet tidak valid.');
    }

    // Tab GIDs
    const GID_AC = '1049890682';    // Sheet "AC unit sept & okt"
    const GID_DB = '0';             // Sheet "Database"
    const GID_AGENTS = '285705934'; // Sheet "Tabel Data Agen"
    const GID_RANK = '678627785';   // Sheet "Rank Unit"

    const [acCsv, dbCsv, agentsCsv, rankCsv] = await Promise.all([
      fetchCsv(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${GID_AC}`).catch(err => {
        console.warn('Gagal ambil AC tab:', err.message);
        return '';
      }),
      fetchCsv(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${GID_DB}`).catch(err => {
        console.warn('Gagal ambil DB tab:', err.message);
        return '';
      }),
      fetchCsv(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${GID_AGENTS}`).catch(err => {
        console.warn('Gagal ambil Agents tab:', err.message);
        return '';
      }),
      fetchCsv(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${GID_RANK}`).catch(err => {
        console.warn('Gagal ambil Rank tab:', err.message);
        return '';
      })
    ]);

    // 1. Parse Table 1 (Monthly AC Kuadran)
    const table1_monthly = [];
    if (acCsv) {
      const acLines = acCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
      for (let i = 2; i < acLines.length; i++) {
        const p = parseCsvLine(acLines[i]);
        const unit = p[0];
        const unitUpper = (unit || '').toUpperCase().trim();
        if (!unit || unitUpper.includes('TOTAL') || unitUpper.includes('#N/A') || unitUpper.includes('#REF') || unitUpper.includes('#VAL') || unitUpper === '#N/A') continue;
        table1_monthly.push({
          unit,
          septA: parseInt(p[1], 10) || 0,
          septC: parseInt(p[2], 10) || 0,
          oktA: parseInt(p[3], 10) || 0,
          oktC: parseInt(p[4], 10) || 0
        });
      }
    }

    // 2. Parse Table 2 & Mapping (Referensi Unit from Database)
    const unitCodeToName = new Map();
    if (dbCsv) {
      const dbLines = dbCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
      for (let i = 0; i < dbLines.length; i++) {
        const p = parseCsvLine(dbLines[i]);
        const code = p[0];
        const name = p[1];
        if (code && name && !name.startsWith('#') && !unitCodeToName.has(code)) {
          unitCodeToName.set(code, name);
        }
      }
    }
    const table2_units = Array.from(unitCodeToName.entries()).map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 3. Parse Table 3 (Agents Main Table)
    const table3_agents = [];
    let headers = [];
    if (agentsCsv) {
      const agentLines = agentsCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (agentLines.length > 0) {
        headers = parseCsvLine(agentLines[0]);
        for (let i = 1; i < agentLines.length; i++) {
          const p = parseCsvLine(agentLines[i]);
          if (p.length === 0 || !p[2]) continue;
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = p[idx] !== undefined ? p[idx] : '';
          });

          // Match unit name & code from PIC (e.g. MBM 13383A)
          const pic = row['PIC'] || '';
          let matchedUnitName = '';
          let matchedUnitCode = '';
          for (const [c, n] of unitCodeToName.entries()) {
            if (pic.includes(c)) {
              matchedUnitName = n;
              matchedUnitCode = c;
              break;
            }
          }
          row['Nama Unit'] = matchedUnitName || row['Nama Unit'] || '';
          row['Kode Unit'] = matchedUnitCode || row['Kode Unit'] || '';
          table3_agents.push(row);
        }
      }
    }

    // 4. Parse Table 4 (Rank Unit)
    const table4_rank = [];
    if (rankCsv) {
      const rankLines = rankCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
      for (let i = 1; i < rankLines.length; i++) {
        const p = parseCsvLine(rankLines[i]);
        const unit = p[0];
        const unitUpper = (unit || '').toUpperCase().trim();
        if (!unit || unitUpper.includes('TOTAL') || unitUpper.includes('#N/A') || unitUpper.includes('#REF') || unitUpper.includes('#VAL') || unitUpper === '#N/A') continue;
        table4_rank.push({
          unit,
          totalAC: parseInt(p[1], 10) || 0
        });
      }
    }

    const payload = {
      success: true,
      hasData: table3_agents.length > 0 || table1_monthly.length > 0,
      totalRows: table3_agents.length,
      headers,
      lastSync: new Date().toISOString(),
      table1_monthly,
      table2_units,
      table3_agents,
      table4_rank,
      rows: table3_agents
    };

    inMemoryCache = payload;
    lastSyncTime = Date.now();
    config.lastSyncTime = new Date().toISOString();
    config.totalRows = table3_agents.length;
    saveConfig(config);

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error('API Error:', err);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      success: false,
      hasData: false,
      error: err.message,
      config,
      table1_monthly: [],
      table2_units: [],
      table3_agents: [],
      table4_rank: [],
      rows: []
    }));
  }
}

module.exports = handler;
