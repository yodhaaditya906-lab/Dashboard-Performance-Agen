function setSafeText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Minimalist Black & White Capsule Loading Screen Controllers
let currentLoadingPercent = 0;
let loadingProgressTimer = null;

function setMinimalLoadingProgress(pct, statusMsg) {
  const clampedPct = Math.min(100, Math.max(0, Math.round(pct)));
  currentLoadingPercent = clampedPct;

  const fillEl = document.getElementById('minimal-progress-fill');
  const percentEl = document.getElementById('minimal-loading-percent');
  const statusEl = document.getElementById('loading-status-text') || document.querySelector('.minimal-loading-status');

  if (fillEl) {
    fillEl.style.width = clampedPct + '%';
  }
  if (percentEl) {
    percentEl.textContent = clampedPct + '%';
  }
  if (statusEl && statusMsg) {
    statusEl.textContent = statusMsg;
  }
}

function setLoadingScreenMessage(msg) {
  const textEl = document.getElementById('loading-status-text') || document.querySelector('.minimal-loading-status');
  if (textEl && msg) textEl.textContent = msg;
}

function startSmoothLoadingTicker() {
  setMinimalLoadingProgress(10, 'Menghubungkan ke Server & Google Sheets...');

  if (loadingProgressTimer) clearInterval(loadingProgressTimer);

  loadingProgressTimer = setInterval(() => {
    if (currentLoadingPercent < 88) {
      const remaining = 90 - currentLoadingPercent;
      const step = Math.max(1, Math.floor(remaining * 0.12));
      const nextPct = currentLoadingPercent + step;

      let msg = 'Menghubungkan ke Server & Google Sheets...';
      if (nextPct >= 35 && nextPct < 65) {
        msg = 'Mengunduh data performa agen...';
      } else if (nextPct >= 65) {
        msg = 'Menghitung kuadran & ranking unit...';
      }
      setMinimalLoadingProgress(nextPct, msg);
    }
  }, 120);
}

function hideAppLoadingScreen() {
  const loadingScreen = document.getElementById('app-loading-screen');
  if (!loadingScreen || loadingScreen.classList.contains('app-loading-hidden')) return;

  if (loadingProgressTimer) {
    clearInterval(loadingProgressTimer);
    loadingProgressTimer = null;
  }

  setMinimalLoadingProgress(100, 'Data Siap! Membuka Dashboard...');

  setTimeout(() => {
    loadingScreen.classList.add('app-loading-hidden');
    setTimeout(() => {
      loadingScreen.style.display = 'none';
    }, 500);
  }, 320);
}

// Start smooth progress ticker immediately on page load
startSmoothLoadingTicker();

// Safety net: force dismiss loading screen after 15s so user is never locked out
setTimeout(hideAppLoadingScreen, 15000);



// Bank Mandiri - Dashboard Performance Agen
// State Management
const state = {
  rawRows: [],
  headers: [],
  hasData: false,
  config: {},
  filters: {
    search: '',
    unit: '',
    sgp: ''
  },
  columnFilters: {},
  columnSort: { colKey: null, direction: null },
  pagination: {
    page: 1,
    pageSize: 20
  },
  monthlyData: [],
  unitRefData: [],
  summaryKuadranData: [],
  chartInstance: null
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initChartTabs();
  fetchDashboardData();
});

function setupEventListeners() {
  // Sync now button
  const btnSync = document.getElementById('btn-sync-now');
  if (btnSync) {
    btnSync.addEventListener('click', () => {
      fetchDashboardData(true);
    });
  }

  // Config modal
  const btnOpenConfig = document.getElementById('btn-open-config');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const modal = document.getElementById('modal-config');
  const btnSaveSheet = document.getElementById('btn-save-sheet-url');

  if (btnOpenConfig && modal) {
    btnOpenConfig.addEventListener('click', () => {
      modal.classList.add('open');
      const inputUrl = document.getElementById('input-sheet-url');
      if (inputUrl && state.config && state.config.sheetUrl) {
        inputUrl.value = state.config.sheetUrl;
      }
    });
  }

  const closeModal = () => {
    if (modal) modal.classList.remove('open');
    const statusMsg = document.getElementById('modal-status-msg');
    if (statusMsg) statusMsg.style.display = 'none';
  };

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

  if (btnSaveSheet) {
    btnSaveSheet.addEventListener('click', async () => {
      const inputUrl = document.getElementById('input-sheet-url');
      const statusMsg = document.getElementById('modal-status-msg');
      const urlVal = inputUrl ? inputUrl.value.trim() : '';

      if (!urlVal) {
        if (statusMsg) {
          statusMsg.className = 'modal-status-msg error';
          statusMsg.textContent = 'Silakan masukkan link Google Sheet terlebih dahulu.';
          statusMsg.style.display = 'block';
        }
        return;
      }

      btnSaveSheet.disabled = true;
      btnSaveSheet.textContent = 'Menyimpan & Menyinkronkan...';

      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheetUrl: urlVal })
        });
        const result = await res.json();
        if (result.success) {
          if (statusMsg) {
            statusMsg.className = 'modal-status-msg success';
            statusMsg.textContent = 'Link berhasil disimpan! Sedang mengambil data spreadsheet...';
            statusMsg.style.display = 'block';
          }
          setTimeout(() => {
            closeModal();
            fetchDashboardData(true);
          }, 800);
        } else {
          throw new Error(result.error || 'Gagal menyimpan');
        }
      } catch (err) {
        if (statusMsg) {
          statusMsg.className = 'modal-status-msg error';
          statusMsg.textContent = 'Gagal menyimpan: ' + err.message;
          statusMsg.style.display = 'block';
        }
      } finally {
        btnSaveSheet.disabled = false;
        btnSaveSheet.innerHTML = '<span class="btn-icon">💾</span> Simpan &amp; Sinkronisasi Data';
      }
    });
  }

  // Search Main Agents
  const searchAgent = document.getElementById('search-agent-main');
  if (searchAgent) {
    searchAgent.addEventListener('input', (e) => {
      state.filters.search = e.target.value.toLowerCase().trim();
      state.pagination.page = 1;
      renderMainTable();
    });
  }

  // Filter Unit (Toolbar select)
  const filterUnit = document.getElementById('filter-select-unit');
  if (filterUnit) {
    filterUnit.addEventListener('change', (e) => {
      selectUnit(e.target.value);
    });
  }

  // Top-Right Unit Search Input
  const unitSearchInput = document.getElementById('unit-search-input');
  const btnClearSearch = document.getElementById('btn-clear-unit-search');
  if (unitSearchInput) {
    unitSearchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (btnClearSearch) {
        if (val) btnClearSearch.classList.remove('hidden');
        else btnClearSearch.classList.add('hidden');
      }
      renderTableUnitSelector(val);
    });

    unitSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const firstRow = document.querySelector('#tbody-unit-selector tr[data-unit-name]');
        if (firstRow) {
          const uName = firstRow.getAttribute('data-unit-name');
          const uCode = firstRow.getAttribute('data-unit-code');
          selectUnit(uName, uCode);
        }
      }
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (unitSearchInput) unitSearchInput.value = '';
      btnClearSearch.classList.add('hidden');
      renderTableUnitSelector('');
    });
  }

  // Top-Right Unit Dropdown Select
  const unitDropdownSelect = document.getElementById('unit-dropdown-select');
  if (unitDropdownSelect) {
    unitDropdownSelect.addEventListener('change', (e) => {
      selectUnit(e.target.value);
    });
  }

  // Top-Right Reset Button
  const btnResetUnit = document.getElementById('btn-reset-unit');
  if (btnResetUnit) {
    btnResetUnit.addEventListener('click', () => {
      selectUnit('', '');
      if (unitSearchInput) unitSearchInput.value = '';
      if (btnClearSearch) btnClearSearch.classList.add('hidden');
    });
  }

  // Filter SGP
  const filterSgp = document.getElementById('filter-select-sgp');
  if (filterSgp) {
    filterSgp.addEventListener('change', (e) => {
      state.filters.sgp = e.target.value;
      state.pagination.page = 1;
      renderMainTable();
    });
  }

  // Search Unit Kuadran (Table 1)
  const searchUnitKuadran = document.getElementById('search-unit-kuadran');
  if (searchUnitKuadran) {
    searchUnitKuadran.addEventListener('input', (e) => {
      renderTableMonthlyKuadran(e.target.value.toLowerCase().trim());
    });
  }



  // Pagination buttons
  const btnPrev = document.getElementById('btn-page-prev');
  const btnNext = document.getElementById('btn-page-next');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (state.pagination.page > 1) {
        state.pagination.page--;
        renderMainTable();
      }
    });
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      state.pagination.page++;
      renderMainTable();
    });
  }

  // Export Excel
  const btnExcel = document.getElementById('btn-export-excel');
  if (btnExcel) {
    btnExcel.addEventListener('click', exportToExcel);
  }

  // Excel Column Filter click & outside dismiss
  document.addEventListener('click', (e) => {
    const filterPopupEl = document.getElementById('column-filter-popup');
    const btn = e.target.closest('.col-filter-btn');
    if (btn) {
      e.stopPropagation();
      const colKey = btn.dataset.col;
      if (activePopupColKey === colKey && filterPopupEl && !filterPopupEl.classList.contains('hidden')) {
        closeColumnFilterPopup();
      } else {
        openColumnFilterPopup(colKey, btn);
      }
      return;
    }

    if (filterPopupEl && !e.target.closest('#column-filter-popup')) {
      closeColumnFilterPopup();
    }
  });

  window.addEventListener('resize', closeColumnFilterPopup);

  const mainScroll = document.querySelector('.main-scroll');
  if (mainScroll) {
    mainScroll.addEventListener('scroll', closeColumnFilterPopup);
  }
}


// ==========================================================================
// DIRECT GOOGLE SHEETS FALLBACK (Enables 100% hosting on Vercel / GitHub Pages)
// ==========================================================================
const GOOGLE_SHEET_FALLBACK = {
  sheetId: '18bjhmtgQa1z0HRb3JPACIhhHPP8bqfNUsUczslffisg',
  gidAC: '1049890682',
  gidDB: '0',
  gidAgents: '285705934',
  gidRank: '678627785'
};

function parseCsvDirect(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim().replace(/^"|"$/g, ''));
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim().replace(/^"|"$/g, ''));
  return result;
}

async function fetchDirectGoogleSheets() {
  const { sheetId, gidAC, gidDB, gidAgents, gidRank } = GOOGLE_SHEET_FALLBACK;
  const fetchCsvText = async (gid) => {
    const u = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const r = await fetch(u);
    return await r.text();
  };

  try {
    const [acCsv, dbCsv, agentsCsv, rankCsv] = await Promise.all([
      fetchCsvText(gidAC).catch(() => ''),
      fetchCsvText(gidDB).catch(() => ''),
      fetchCsvText(gidAgents).catch(() => ''),
      fetchCsvText(gidRank).catch(() => '')
    ]);

    // 1. Table 1: Monthly Kuadran
    const table1_monthly = [];
    if (acCsv) {
      const acLines = acCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
      for (let i = 2; i < acLines.length; i++) {
        const p = parseCsvDirect(acLines[i]);
        const unit = p[0];
        const uUpper = (unit || '').toUpperCase().trim();
        if (!unit || uUpper.includes('TOTAL') || uUpper.includes('#N/A') || uUpper.includes('#REF') || uUpper === '#N/A') continue;
        table1_monthly.push({
          unit,
          septA: parseInt(p[1], 10) || 0,
          septC: parseInt(p[2], 10) || 0,
          oktA: parseInt(p[3], 10) || 0,
          oktC: parseInt(p[4], 10) || 0
        });
      }
    }

    // 2. Table 2: Units from Database
    const unitCodeToName = new Map();
    if (dbCsv) {
      const dbLines = dbCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
      for (let i = 0; i < dbLines.length; i++) {
        const p = parseCsvDirect(dbLines[i]);
        const code = p[0];
        const name = p[1];
        if (code && name && !name.startsWith('#') && !unitCodeToName.has(code)) {
          unitCodeToName.set(code, name);
        }
      }
    }
    const table2_units = Array.from(unitCodeToName.entries()).map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 3. Table 3: Agents Table
    const table3_agents = [];
    if (agentsCsv) {
      const agentLines = agentsCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (agentLines.length > 0) {
        const headers = parseCsvDirect(agentLines[0]);
        for (let i = 1; i < agentLines.length; i++) {
          const p = parseCsvDirect(agentLines[i]);
          if (p.length === 0 || !p[2]) continue;
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = p[idx] !== undefined ? p[idx] : '';
          });
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

    // 4. Table 4: Rank
    const table4_rank = [];
    if (rankCsv) {
      const rankLines = rankCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
      for (let i = 1; i < rankLines.length; i++) {
        const p = parseCsvDirect(rankLines[i]);
        const unit = p[0];
        const uUpper = (unit || '').toUpperCase().trim();
        if (!unit || uUpper.includes('TOTAL') || uUpper.includes('#N/A') || uUpper.includes('#REF') || uUpper === '#N/A') continue;
        table4_rank.push({
          unit,
          totalAC: parseInt(p[1], 10) || 0
        });
      }
    }

    return {
      success: true,
      hasData: table3_agents.length > 0 || table1_monthly.length > 0,
      table1_monthly,
      table2_units,
      table3_agents,
      table4_rank,
      source: 'Google Sheets (Direct Client)'
    };
  } catch (err) {
    console.error('Direct Google Sheets fetch error:', err);
    return { success: false, error: err.message };
  }
}

async function fetchDashboardData(force = false) {
  const pulseDot = document.getElementById('pulse-dot');
  const syncText = document.getElementById('sync-status-text');
  const syncIcon = document.getElementById('btn-sync-icon');

  if (pulseDot) pulseDot.classList.add('syncing');
  if (syncIcon) syncIcon.style.animation = 'spin 1s linear infinite';
  if (syncText) syncText.textContent = 'Menyinkronkan data Google Sheet...';
  setLoadingScreenMessage('Menghubungkan ke Server & Google Sheets...');

  try {
    let result = null;
    try {
      const url = force ? '/api/data?refresh=1' : '/api/data';
      const res = await fetch(url);
      if (res.ok) {
        result = await res.json();
      }
    } catch (e) {
      console.warn('Backend API /api/data not available, using direct Google Sheets:', e);
    }

    // Direct Google Sheets fallback (for GitHub Pages / static hosting)
    if (!result || !result.success) {
      result = await fetchDirectGoogleSheets();
    }

    state.config = result.config || {};
    const rawList = result.table3_agents || result.rows || [];
    setMinimalLoadingProgress(92, 'Memproses Data Kuadran Agen...');

    // Filter out rows where Nama SGP is empty / NULL / '-' per user request
    state.rawRows = rawList.filter(row => {
      const sgp = (row['Nama SGP'] || getVal(row, ['nama sgp', 'sgp'])).trim();
      return sgp && sgp !== 'NULL' && sgp !== 'null' && sgp !== '-';
    });

    state.hasData = !!(result.hasData && (state.rawRows.length > 0 || result.table1_monthly?.length > 0));
    state.headers = result.headers || [];

    if (result.table1_monthly && result.table1_monthly.length > 0) {
      state.monthlyData = (result.table1_monthly || []).filter(d => {
        const u = (d.unit || '').toUpperCase().trim();
        return u && !u.includes('TOTAL') && !u.includes('#N/A') && !u.includes('#REF') && u !== '#N/A';
      });
    }
    if (result.table2_units && result.table2_units.length > 0) {
      state.unitRefData = result.table2_units;
    }
    if (result.table4_rank && result.table4_rank.length > 0) {
      state.summaryKuadranData = result.table4_rank;
    } else if (state.monthlyData.length > 0) {
      state.summaryKuadranData = state.monthlyData.map(u => ({
        unit: u.unit,
        totalAC: (u.oktA + u.oktC) || (u.septA + u.septC)
      })).filter(u => u.totalAC > 0);
    }

    if (pulseDot) pulseDot.classList.remove('syncing');
    if (syncIcon) syncIcon.style.animation = '';

    if (state.hasData) {
      if (syncText) syncText.textContent = `Live Sync: Terhubung (${state.rawRows.length.toLocaleString('id-ID')} data agen aktif)`;
      populateFilters();
      renderAll();
      hideAppLoadingScreen();
    } else {
      if (syncText) {
        syncText.textContent = state.config?.sheetUrl 
          ? 'Spreadsheet terhubung tetapi data baris masih kosong'
          : 'Menunggu Data: Klik "Hubungkan Google Sheet"';
      }
      renderEmptyStates();
      hideAppLoadingScreen();
    }
  } catch (err) {
    console.error('Fetch error:', err);
    if (pulseDot) {
      pulseDot.classList.remove('syncing');
      pulseDot.classList.add('error');
    }
    if (syncIcon) syncIcon.style.animation = '';
    if (syncText) syncText.textContent = 'Gagal memuat: ' + err.message;
    renderEmptyStates();
    setMinimalLoadingProgress(100, 'Memuat data lokal...');
    hideAppLoadingScreen();
  }
}

// Case-insensitive flexible field getter
function getVal(row, keys) {
  if (!row) return '';
  for (const [k, v] of Object.entries(row)) {
    const lk = k.trim().toLowerCase();
    for (const key of keys) {
      if (lk === key || lk.includes(key)) {
        return (v !== undefined && v !== null) ? String(v).trim() : '';
      }
    }
  }
  return '';
}


function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;');
}

function getUnitAgentCount(unitName, unitCode) {
  if (!unitName && !unitCode) return (state.rawRows || []).length;
  const uNorm = (unitName || '').toLowerCase().trim();
  const cNorm = (unitCode || '').toLowerCase().trim();
  let count = 0;
  (state.rawRows || []).forEach(row => {
    const aUnit = (row['Nama Unit'] || getVal(row, ['nama unit', 'unit']) || '').toLowerCase().trim();
    const aCode = (row['Kode Unit'] || getVal(row, ['kode unit']) || '').toLowerCase().trim();
    if ((cNorm && aCode === cNorm) || (uNorm && aUnit === uNorm) || (uNorm && aUnit.includes(uNorm))) {
      count++;
    }
  });
  return count;
}

function selectUnit(unitName, unitCode) {
  unitName = (unitName || '').trim();
  unitCode = (unitCode || '').trim();

  if (unitCode && !unitName) {
    const found = (state.unitRefData || []).find(u => u.code === unitCode);
    if (found) unitName = found.name;
  } else if (unitName && !unitCode) {
    const found = (state.unitRefData || []).find(u => u.name.toLowerCase() === unitName.toLowerCase());
    if (found) unitCode = found.code;
  }

  state.filters.unit = unitName;
  state.pagination.page = 1;

  // Update Status Box in Top-Right
  const selNameEl = document.getElementById('selected-unit-name');
  const selBadgeEl = document.getElementById('selected-unit-badge');
  const btnResetEl = document.getElementById('btn-reset-unit');

  if (unitName) {
    const agentCount = getUnitAgentCount(unitName, unitCode);
    if (selNameEl) selNameEl.textContent = unitCode ? `[${unitCode}] ${unitName}` : unitName;
    if (selBadgeEl) selBadgeEl.textContent = `${agentCount.toLocaleString('id-ID')} Agen`;
    if (btnResetEl) btnResetEl.classList.remove('hidden');
  } else {
    if (selNameEl) selNameEl.textContent = `Semua Unit (${(state.unitRefData || []).length} Unit)`;
    if (selBadgeEl) selBadgeEl.textContent = `${(state.rawRows || []).length.toLocaleString('id-ID')} Agen`;
    if (btnResetEl) btnResetEl.classList.add('hidden');
  }

  // Synchronize Top Dropdown
  const topDropdown = document.getElementById('unit-dropdown-select');
  if (topDropdown) {
    topDropdown.value = unitName;
  }

  // Synchronize Toolbar Dropdown
  const toolbarSelect = document.getElementById('filter-select-unit');
  if (toolbarSelect) {
    toolbarSelect.value = unitName;
  }

  // Highlight rows
  renderTableUnitSelector();
  highlightMonthlyKuadranRow(unitName);

  // Render agents table with filter
  renderMainTable();

  // Scroll smoothly to agents table if unit selected
  if (unitName) {
    const mainSection = document.querySelector('.panel-main-agents');
    if (mainSection) {
      mainSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      mainSection.classList.add('table-focus-pulse');
      setTimeout(() => mainSection.classList.remove('table-focus-pulse'), 1200);
    }
  }
}

function highlightMonthlyKuadranRow(unitName) {
  const tbody = document.getElementById('tbody-monthly-kuadran');
  if (!tbody) return;
  const uNorm = (unitName || '').toLowerCase().trim();
  tbody.querySelectorAll('tr[data-unit]').forEach(tr => {
    const trUnit = (tr.getAttribute('data-unit') || '').toLowerCase().trim();
    if (uNorm && trUnit === uNorm) {
      tr.classList.add('active-unit-row');
    } else {
      tr.classList.remove('active-unit-row');
    }
  });
}

function populateFilters() {
  const units = new Set();
  const sgps = new Set();

  if (state.unitRefData) {
    state.unitRefData.forEach(u => { if (u.name) units.add(u.name); });
  }
  if (state.monthlyData) {
    state.monthlyData.forEach(u => { if (u.unit) units.add(u.unit); });
  }

  state.rawRows.forEach(row => {
    const u = row['Nama Unit'] || getVal(row, ['nama unit', 'unit']);
    const s = row['Nama SGP'] || getVal(row, ['nama sgp', 'sgp']);
    if (u) units.add(u);
    if (s && s !== 'NULL' && s !== 'null' && s !== '-') sgps.add(s);
  });

  const selectUnit = document.getElementById('filter-select-unit');
  if (selectUnit) {
    const current = selectUnit.value;
    selectUnit.innerHTML = '<option value="">Semua Unit</option>' + 
      Array.from(units).sort().map(u => `<option value="${u}">${u}</option>`).join('');
    selectUnit.value = current;
  }

  const unitDropdown = document.getElementById('unit-dropdown-select');
  if (unitDropdown) {
    const current = unitDropdown.value;
    const sorted = Array.from(state.unitRefData || []).sort((a, b) => a.name.localeCompare(b.name));
    unitDropdown.innerHTML = '<option value="">-- Semua Unit (99 Unit) --</option>' + 
      sorted.map(u => {
        const count = getUnitAgentCount(u.name, u.code);
        return `<option value="${escapeAttr(u.name)}">[${u.code}] ${u.name} (${count} Agen)</option>`;
      }).join('');
    unitDropdown.value = state.filters.unit || current || '';
  }

  const selectSgp = document.getElementById('filter-select-sgp');
  if (selectSgp) {
    const current = selectSgp.value;
    selectSgp.innerHTML = '<option value="">Semua SGP</option>' + 
      Array.from(sgps).sort().map(s => `<option value="${s}">${s}</option>`).join('');
    selectSgp.value = current;
  }
}

function renderAll() {
  if (!state.hasData || (state.rawRows.length === 0 && state.monthlyData.length === 0)) {
    renderEmptyStates();
    return;
  }

  renderTableMonthlyKuadran();
  renderTableUnitSelector();
  renderMainTable();
  renderTableSummaryKuadran();
  renderAllCharts();
}

function renderEmptyStates() {
  const t1 = document.getElementById('tbody-monthly-kuadran');
  if (t1) {
    t1.innerHTML = `
      <tr class="placeholder-row"><td class="td-unit">-</td><td class="text-center">-</td><td class="text-center">-</td><td class="text-center">-</td><td class="text-center">-</td></tr>
      <tr class="placeholder-row"><td class="td-unit">-</td><td class="text-center">-</td><td class="text-center">-</td><td class="text-center">-</td><td class="text-center">-</td></tr>
      <tr class="placeholder-row"><td class="td-unit">-</td><td class="text-center">-</td><td class="text-center">-</td><td class="text-center">-</td><td class="text-center">-</td></tr>
    `;
  }

  const t2 = document.getElementById('tbody-unit-ref');
  if (t2) {
    t2.innerHTML = `
      <tr class="placeholder-row"><td class="text-center">-</td><td>-</td></tr>
      <tr class="placeholder-row"><td class="text-center">-</td><td>-</td></tr>
      <tr class="placeholder-row"><td class="text-center">-</td><td>-</td></tr>
    `;
  }

  const t3 = document.getElementById('tbody-agents-main');
  if (t3) {
    t3.innerHTML = `
      <tr class="placeholder-row"><td class="text-center">-</td><td>-</td><td class="text-center">-</td><td>-</td><td>-</td><td class="text-center">-</td><td class="text-center">-</td><td class="text-center">-</td></tr>
      <tr class="placeholder-row"><td class="text-center">-</td><td>-</td><td class="text-center">-</td><td>-</td><td>-</td><td class="text-center">-</td><td class="text-center">-</td><td class="text-center">-</td></tr>
      <tr class="placeholder-row"><td class="text-center">-</td><td>-</td><td class="text-center">-</td><td>-</td><td>-</td><td class="text-center">-</td><td class="text-center">-</td><td class="text-center">-</td></tr>
    `;
  }

  const t4 = document.getElementById('tbody-summary-kuadran');
  if (t4) {
    t4.innerHTML = `
      <tr class="placeholder-row"><td>-</td><td class="text-center">-</td></tr>
      <tr class="placeholder-row"><td>-</td><td class="text-center">-</td></tr>
      <tr class="placeholder-row"><td>-</td><td class="text-center">-</td></tr>
    `;
  }

  setSafeText('page-info-text', 'Menampilkan 0 dari 0 data');
  setSafeText('page-current-num', 'Halaman 1');
}

// TABEL 1: Perbandingan Kuadran Bulanan (Sept vs Okt)
function renderTableMonthlyKuadran(filterQuery = '') {
  const tbody = document.getElementById('tbody-monthly-kuadran');
  if (!tbody) return;

  let list = (state.monthlyData || []).filter(d => {
    const u = (d.unit || '').toUpperCase().trim();
    return u && !u.includes('TOTAL') && !u.includes('#N/A') && !u.includes('#REF') && u !== '#N/A';
  });
  if (filterQuery) {
    list = list.filter(d => d.unit.toLowerCase().includes(filterQuery));
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#94a3b8;">Tidak ada data unit.</td></tr>';
    return;
  }

  let totSeptA = 0, totSeptC = 0, totOktA = 0, totOktC = 0;

  tbody.innerHTML = list.map(item => {
    totSeptA += item.septA;
    totSeptC += item.septC;
    totOktA += item.oktA;
    totOktC += item.oktC;

    return `
      <tr data-unit="${escapeAttr(item.unit)}" class="${state.filters.unit && state.filters.unit.toLowerCase() === item.unit.toLowerCase() ? 'active-unit-row' : ''}">
        <td style="font-weight:600;">${item.unit}</td>
        <td style="text-align:center;">${item.septA.toLocaleString('id-ID')}</td>
        <td style="text-align:center;">${item.septC.toLocaleString('id-ID')}</td>
        <td style="text-align:center; color:#000000; font-weight:600;">${item.oktA.toLocaleString('id-ID')}</td>
        <td style="text-align:center; color:#000000; font-weight:600;">${item.oktC.toLocaleString('id-ID')}</td>
      </tr>
    `;
  }).join('');

  setSafeText('tfoot-sept-a', totSeptA.toLocaleString('id-ID'));
  setSafeText('tfoot-sept-c', totSeptC.toLocaleString('id-ID'));
  setSafeText('tfoot-okt-a', totOktA.toLocaleString('id-ID'));
  setSafeText('tfoot-okt-c', totOktC.toLocaleString('id-ID'));

  // Attach click listener on Table 1 rows to filter agents
  tbody.querySelectorAll('tr[data-unit]').forEach(tr => {
    tr.addEventListener('click', () => {
      const u = tr.getAttribute('data-unit');
      if (state.filters.unit && state.filters.unit.toLowerCase() === u.toLowerCase()) {
        selectUnit('', '');
      } else {
        selectUnit(u);
      }
    });
  });
}

// TABEL 2: Menu Pencarian & Seleksi Unit (Search Bar + Dropdown + Clickable List)
function renderTableUnitSelector(filterQuery = '') {
  const tbody = document.getElementById('tbody-unit-selector');
  if (!tbody) return;

  let list = state.unitRefData || [];
  if (filterQuery) {
    const q = filterQuery.toLowerCase().trim();
    list = list.filter(u => u.name.toLowerCase().includes(q) || u.code.toLowerCase().includes(q));
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:18px; color:#000000; background:#c8c8c8; font-weight:600;">Tidak ada unit ditemukan.</td></tr>';
    setSafeText('tfoot-unit-count', '0 Unit');
    setSafeText('tfoot-unit-agents-total', '0');
    return;
  }

  const activeUnit = (state.filters.unit || '').toLowerCase().trim();

  tbody.innerHTML = list.map(item => {
    const count = getUnitAgentCount(item.name, item.code);
    const isActive = activeUnit && (item.name.toLowerCase().trim() === activeUnit || item.code.toLowerCase().trim() === activeUnit);
    return `
      <tr data-unit-name="${escapeAttr(item.name)}" data-unit-code="${escapeAttr(item.code)}" class="${isActive ? 'active-unit-row' : ''}">
        <td style="text-align:center;"><code style="font-weight:700;">${item.code}</code></td>
        <td style="font-weight:600;" title="${escapeAttr(item.name)}">${item.name}</td>
        <td style="text-align:center; font-weight:700;">${count.toLocaleString('id-ID')}</td>
      </tr>
    `;
  }).join('');

  // Attach click handler on all rows
  tbody.querySelectorAll('tr[data-unit-name]').forEach(tr => {
    tr.addEventListener('click', () => {
      const uName = tr.getAttribute('data-unit-name');
      const uCode = tr.getAttribute('data-unit-code');
      if (state.filters.unit && state.filters.unit.toLowerCase() === uName.toLowerCase()) {
        selectUnit('', '');
      } else {
        selectUnit(uName, uCode);
      }
    });
  });

  setSafeText('tfoot-unit-count', `${list.length} Unit`);
  let totalAgents = 0;
  list.forEach(u => { totalAgents += getUnitAgentCount(u.name, u.code); });
  setSafeText('tfoot-unit-agents-total', totalAgents.toLocaleString('id-ID'));
}

// Column value getter for agents table
function getAgentColValue(row, colKey) {
  if (!row) return '';
  switch (colKey) {
    case 'sgp':
      return (row['Nama SGP'] || getVal(row, ['nama sgp', 'sgp']) || '-').trim();
    case 'kode':
      return (row['Kode Agen'] || getVal(row, ['kode agen', 'id agen']) || '-').trim();
    case 'usaha':
      return (row['Nama Usaha Agen'] || getVal(row, ['nama usaha', 'usaha', 'outlet']) || '-').trim();
    case 'pemilik':
      return (row['Nama Pemilik Agen'] || getVal(row, ['nama pemilik', 'pemilik', 'nama']) || '-').trim();
    case 'naskomgen': {
      const v = row['Nas komgen'] || getVal(row, ['nas komgen', 'naskomgen', 'nas']) || '0';
      return String(v).trim();
    }
    case 'funkomgen': {
      const v = row['Funding Naskomgen'] || row['Funkomgen'] || getVal(row, ['funkomgen', 'fun komgen', 'fun']) || '0';
      return String(v).trim();
    }
    case 'frek': {
      const v = row['Frekuensi + Ref Input'] || getVal(row, ['frekuensi + ref input', 'frek + ref', 'frek', 'transaksi']) || '0';
      return String(v).trim();
    }
    default:
      return '';
  }
}

function parseCleanNumber(val) {
  if (typeof val === 'number') return val;
  const cleaned = String(val || '').replace(/[^0-9.-]+/g, '');
  return parseFloat(cleaned) || 0;
}

let activePopupColKey = null;

function updateColumnFilterButtonsUI() {
  document.querySelectorAll('.table-agents-detail .col-filter-btn').forEach(btn => {
    const colKey = btn.dataset.col;
    const isFiltered = state.columnFilters && state.columnFilters[colKey] instanceof Set;
    const isSorted = state.columnSort && state.columnSort.colKey === colKey && state.columnSort.direction;
    if (isFiltered || isSorted) {
      btn.classList.add('active');
      if (isSorted) {
        btn.textContent = state.columnSort.direction === 'asc' ? '▲' : '▼';
      } else {
        btn.textContent = '▼';
      }
    } else {
      btn.classList.remove('active');
      btn.textContent = '▼';
    }
  });
}

function openColumnFilterPopup(colKey, anchorBtn) {
  const filterPopupEl = document.getElementById('column-filter-popup');
  if (!filterPopupEl) return;

  activePopupColKey = colKey;

  // Base filtered dataset
  let baseDataset = state.rawRows.filter(row => {
    const sgp = (row['Nama SGP'] || getVal(row, ['nama sgp', 'sgp'])).toLowerCase();
    const kode = (row['Kode Agen'] || getVal(row, ['kode agen', 'id agen'])).toLowerCase();
    const usaha = (row['Nama Usaha Agen'] || getVal(row, ['nama usaha', 'usaha', 'outlet'])).toLowerCase();
    const pemilik = (row['Nama Pemilik Agen'] || getVal(row, ['nama pemilik', 'pemilik', 'nama'])).toLowerCase();
    const unit = row['Nama Unit'] || getVal(row, ['nama unit', 'unit']);
    const unitCode = row['Kode Unit'] || getVal(row, ['kode unit']);

    if (state.filters.unit) {
      const selected = state.filters.unit.toLowerCase().trim();
      const uNorm = (unit || '').toLowerCase().trim();
      const cNorm = (unitCode || '').toLowerCase().trim();
      if (uNorm !== selected && cNorm !== selected && !uNorm.includes(selected)) {
        return false;
      }
    }
    if (state.filters.sgp && !sgp.includes(state.filters.sgp.toLowerCase())) return false;

    if (state.filters.search) {
      const q = state.filters.search;
      if (!sgp.includes(q) && !kode.includes(q) && !usaha.includes(q) && !pemilik.includes(q) && !(unit || '').toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Apply other column filters except this colKey
  if (state.columnFilters) {
    Object.keys(state.columnFilters).forEach(otherKey => {
      if (otherKey !== colKey && state.columnFilters[otherKey] instanceof Set) {
        const allowedSet = state.columnFilters[otherKey];
        baseDataset = baseDataset.filter(r => allowedSet.has(getAgentColValue(r, otherKey)));
      }
    });
  }

  // Count distinct values
  const valueCounts = {};
  baseDataset.forEach(r => {
    const val = getAgentColValue(r, colKey);
    valueCounts[val] = (valueCounts[val] || 0) + 1;
  });

  const isNumeric = ['naskomgen', 'funkomgen', 'frek'].includes(colKey);
  const distinctValues = Object.keys(valueCounts).sort((a, b) => {
    if (isNumeric) {
      return parseCleanNumber(b) - parseCleanNumber(a);
    }
    return a.localeCompare(b, 'id-ID', { numeric: true });
  });

  const sortAscLabel = isNumeric ? '🔼 Urutkan Terkecil ke Terbesar' : '🔼 Urutkan A ke Z';
  const sortDescLabel = isNumeric ? '🔽 Urutkan Terbesar ke Terkecil' : '🔽 Urutkan Z ke A';

  const currentSort = (state.columnSort && state.columnSort.colKey === colKey) ? state.columnSort.direction : null;
  const currentFilterSet = state.columnFilters ? state.columnFilters[colKey] : null;

  filterPopupEl.innerHTML = `
    <div class="excel-filter-sort-section">
      <button class="excel-filter-sort-btn ${currentSort === 'asc' ? 'active' : ''}" data-sort="asc">
        ${sortAscLabel}
      </button>
      <button class="excel-filter-sort-btn ${currentSort === 'desc' ? 'active' : ''}" data-sort="desc">
        ${sortDescLabel}
      </button>
    </div>
    <div class="excel-filter-divider"></div>
    <input type="text" class="excel-filter-search-box" id="popup-search-box" placeholder="Cari nilai...">
    <div class="excel-filter-list custom-scrollbar" id="popup-checkbox-list-container"></div>
    <div class="excel-filter-footer">
      <button class="excel-filter-action-btn excel-filter-btn-clear" id="popup-btn-clear">Hapus Filter</button>
      <button class="excel-filter-action-btn excel-filter-btn-apply" id="popup-btn-apply">Terapkan</button>
    </div>
  `;

  // Position popup directly under the target TH header cell
  const thCell = anchorBtn.closest('th') || anchorBtn;
  const thRect = thCell.getBoundingClientRect();
  const POPUP_WIDTH = Math.max(230, Math.min(270, thRect.width + 40));

  filterPopupEl.style.width = `${POPUP_WIDTH}px`;
  filterPopupEl.style.top = `${thRect.bottom + 4}px`;

  let popupLeft = thRect.left;
  if (popupLeft + POPUP_WIDTH > window.innerWidth - 10) {
    popupLeft = thRect.right - POPUP_WIDTH;
  }
  if (popupLeft < 10) popupLeft = 10;
  filterPopupEl.style.left = `${popupLeft}px`;

  filterPopupEl.classList.remove('hidden');

  function renderPopupCheckboxList(query = '') {
    const container = document.getElementById('popup-checkbox-list-container');
    if (!container) return;

    const q = query.toLowerCase().trim();
    const filteredDistinct = q
      ? distinctValues.filter(v => v.toLowerCase().includes(q))
      : distinctValues;

    const MAX_ITEMS = 150;
    const isCapped = filteredDistinct.length > MAX_ITEMS;
    const visibleValues = isCapped ? filteredDistinct.slice(0, MAX_ITEMS) : filteredDistinct;

    let html = `
      <label class="excel-filter-item">
        <input type="checkbox" id="popup-select-all" ${!currentFilterSet ? 'checked' : ''}>
        <span class="excel-filter-item-text" style="font-weight: 700; color: #ffffff;">(Pilih Semua)</span>
      </label>
    `;

    html += visibleValues.map(val => {
      const isChecked = !currentFilterSet || currentFilterSet.has(val);
      return `
        <label class="excel-filter-item" data-val="${escapeAttr(val)}">
          <input type="checkbox" class="popup-item-cb" data-val="${escapeAttr(val)}" ${isChecked ? 'checked' : ''}>
          <span class="excel-filter-item-text" title="${escapeAttr(val)}">${escapeAttr(val)}</span>
          <span class="excel-filter-item-count">(${valueCounts[val]})</span>
        </label>
      `;
    }).join('');

    if (isCapped) {
      html += `
        <div style="font-size: 10px; color: #38bdf8; font-style: italic; padding: 4px; text-align: center;">
          Menampilkan 150 dari ${filteredDistinct.length} nilai. Ketik di pencarian untuk menyaring.
        </div>
      `;
    }

    container.innerHTML = html;

    const selectAllCb = document.getElementById('popup-select-all');
    if (selectAllCb) {
      selectAllCb.addEventListener('change', (e) => {
        const checked = e.target.checked;
        container.querySelectorAll('.popup-item-cb').forEach(cb => {
          cb.checked = checked;
        });
      });
    }
  }

  renderPopupCheckboxList('');

  const searchBox = document.getElementById('popup-search-box');
  if (searchBox) {
    searchBox.focus();
    searchBox.addEventListener('input', (e) => {
      renderPopupCheckboxList(e.target.value);
    });
  }

  // Sort buttons
  filterPopupEl.querySelectorAll('.excel-filter-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.sort;
      if (!state.columnSort) state.columnSort = { colKey: null, direction: null };
      if (state.columnSort.colKey === colKey && state.columnSort.direction === dir) {
        state.columnSort.colKey = null;
        state.columnSort.direction = null;
      } else {
        state.columnSort.colKey = colKey;
        state.columnSort.direction = dir;
      }
      renderMainTable();
      closeColumnFilterPopup();
    });
  });

  // Clear button
  document.getElementById('popup-btn-clear').addEventListener('click', () => {
    if (!state.columnFilters) state.columnFilters = {};
    state.columnFilters[colKey] = null;
    if (state.columnSort && state.columnSort.colKey === colKey) {
      state.columnSort.colKey = null;
      state.columnSort.direction = null;
    }
    renderMainTable();
    closeColumnFilterPopup();
  });

  // Apply button
  document.getElementById('popup-btn-apply').addEventListener('click', () => {
    const selectedSet = new Set();
    const container = document.getElementById('popup-checkbox-list-container');
    const itemCbs = container ? container.querySelectorAll('.popup-item-cb') : [];

    itemCbs.forEach(cb => {
      if (cb.checked) {
        selectedSet.add(cb.dataset.val);
      }
    });

    const selectAllCb = document.getElementById('popup-select-all');
    if (!state.columnFilters) state.columnFilters = {};

    if ((selectAllCb && selectAllCb.checked) || selectedSet.size === distinctValues.length) {
      state.columnFilters[colKey] = null;
    } else {
      state.columnFilters[colKey] = selectedSet;
    }

    renderMainTable();
    closeColumnFilterPopup();
  });
}

function closeColumnFilterPopup() {
  const filterPopupEl = document.getElementById('column-filter-popup');
  if (filterPopupEl) {
    filterPopupEl.classList.add('hidden');
    activePopupColKey = null;
  }
}

// TABEL 3: Main Performance Agen
function renderMainTable() {
  const tbody = document.getElementById('tbody-agents-main');
  if (!tbody) return;

  // 1. Base filtering (unit, sgp, search)
  let list = state.rawRows.filter(row => {
    const sgp = (row['Nama SGP'] || getVal(row, ['nama sgp', 'sgp'])).toLowerCase();
    const kode = (row['Kode Agen'] || getVal(row, ['kode agen', 'id agen'])).toLowerCase();
    const usaha = (row['Nama Usaha Agen'] || getVal(row, ['nama usaha', 'usaha', 'outlet'])).toLowerCase();
    const pemilik = (row['Nama Pemilik Agen'] || getVal(row, ['nama pemilik', 'pemilik', 'nama'])).toLowerCase();
    const unit = row['Nama Unit'] || getVal(row, ['nama unit', 'unit']);
    const unitCode = row['Kode Unit'] || getVal(row, ['kode unit']);

    if (state.filters.unit) {
      const selected = state.filters.unit.toLowerCase().trim();
      const uNorm = (unit || '').toLowerCase().trim();
      const cNorm = (unitCode || '').toLowerCase().trim();
      if (uNorm !== selected && cNorm !== selected && !uNorm.includes(selected)) {
        return false;
      }
    }
    if (state.filters.sgp && !sgp.includes(state.filters.sgp.toLowerCase())) return false;

    if (state.filters.search) {
      const q = state.filters.search;
      if (!sgp.includes(q) && !kode.includes(q) && !usaha.includes(q) && !pemilik.includes(q) && !(unit || '').toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  // 2. Excel column filters
  if (state.columnFilters) {
    Object.keys(state.columnFilters).forEach(colKey => {
      const allowedSet = state.columnFilters[colKey];
      if (allowedSet instanceof Set) {
        list = list.filter(row => allowedSet.has(getAgentColValue(row, colKey)));
      }
    });
  }

  // 3. Excel column sorting
  if (state.columnSort && state.columnSort.colKey && state.columnSort.direction) {
    const { colKey, direction } = state.columnSort;
    const isNumeric = ['naskomgen', 'funkomgen', 'frek'].includes(colKey);
    list.sort((a, b) => {
      if (isNumeric) {
        const numA = parseCleanNumber(getAgentColValue(a, colKey));
        const numB = parseCleanNumber(getAgentColValue(b, colKey));
        return direction === 'asc' ? numA - numB : numB - numA;
      } else {
        const strA = getAgentColValue(a, colKey);
        const strB = getAgentColValue(b, colKey);
        return direction === 'asc' 
          ? strA.localeCompare(strB, 'id-ID', { numeric: true })
          : strB.localeCompare(strA, 'id-ID', { numeric: true });
      }
    });
  }

  // Update UI active buttons in table headers
  updateColumnFilterButtonsUI();

  const total = list.length;
  setSafeText('agent-count-badge', `${total.toLocaleString('id-ID')} Agen`);

  // Render all rows in 1 single slide/page (scrollable table)
  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding: 36px; color:#94a3b8;">
          Tidak ada agen yang sesuai dengan pencarian atau filter.
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = list.map((row, idx) => {
      const rowNum = idx + 1;
      const namaSgp = row['Nama SGP'] || getVal(row, ['nama sgp', 'sgp']) || '-';
      const kodeAgen = row['Kode Agen'] || getVal(row, ['kode agen', 'id agen']) || '-';
      const usaha = row['Nama Usaha Agen'] || getVal(row, ['nama usaha', 'usaha', 'outlet']) || '-';
      const pemilik = row['Nama Pemilik Agen'] || getVal(row, ['nama pemilik', 'pemilik', 'nama']) || '-';
      const nas = row['Nas komgen'] || getVal(row, ['nas komgen', 'naskomgen', 'nas']) || '0';
      const fun = row['Funding Naskomgen'] || row['Funkomgen'] || getVal(row, ['funkomgen', 'fun komgen', 'fun']) || '0';
      const frek = row['Frekuensi + Ref Input'] || getVal(row, ['frekuensi + ref input', 'frek + ref', 'frek', 'transaksi']) || '0';

      const formattedNas = Number(nas) ? Number(nas).toLocaleString('id-ID') : nas;
      const formattedFun = Number(fun) ? Number(fun).toLocaleString('id-ID') : fun;
      const formattedFrek = Number(frek) ? Number(frek).toLocaleString('id-ID') : frek;

      return `
        <tr>
          <td style="text-align:center; color:#94a3b8; font-weight:600;">${rowNum}</td>
          <td style="font-weight:600; color:#e2e8f0;">${namaSgp}</td>
          <td style="text-align:center;"><code style="color:#fb923c; font-weight:600;">${kodeAgen}</code></td>
          <td style="color:#f8fafc;">${usaha}</td>
          <td style="color:#cbd5e1;">${pemilik}</td>
          <td style="text-align:center;">${formattedNas}</td>
          <td style="text-align:center;">${formattedFun}</td>
          <td style="text-align:center; font-weight:700; color:#38bdf8;">${formattedFrek}</td>
        </tr>
      `;
    }).join('');
  }

  // Calculate totals
  let totNas = 0, totFun = 0, totFrek = 0;
  list.forEach(r => {
    const rawNas = r['Nas komgen'] || getVal(r, ['nas komgen', 'naskomgen', 'nas']);
    const rawFun = r['Funding Naskomgen'] || r['Funkomgen'] || getVal(r, ['funkomgen', 'fun komgen', 'fun']);
    const rawFrek = r['Frekuensi + Ref Input'] || getVal(r, ['frekuensi + ref input', 'frek + ref', 'frek', 'transaksi']);
    
    totNas += parseFloat(String(rawNas).replace(/[^0-9.-]+/g, '')) || 0;
    totFun += parseFloat(String(rawFun).replace(/[^0-9.-]+/g, '')) || 0;
    totFrek += parseFloat(String(rawFrek).replace(/[^0-9.-]+/g, '')) || 0;
  });

  setSafeText('tfoot-total-naskomgen', totNas.toLocaleString('id-ID'));
  setSafeText('tfoot-total-funkomgen', totFun.toLocaleString('id-ID'));
  setSafeText('tfoot-total-frek', totFrek.toLocaleString('id-ID'));
}

// TABEL 4: Rekapitulasi Kuadran A & C per Unit
function renderTableSummaryKuadran() {
  const tbody = document.getElementById('tbody-summary-kuadran');
  if (!tbody) return;

  const list = state.summaryKuadranData;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px; color:#94a3b8;">Belum ada rekapitulasi kuadran.</td></tr>';
    return;
  }

  let grandTotalAC = 0;

  tbody.innerHTML = list.map(item => {
    grandTotalAC += item.totalAC;
    return `
      <tr>
        <td style="font-weight:600;">${item.unit}</td>
        <td style="text-align:center; font-weight:700; color:#facc15;">${item.totalAC.toLocaleString('id-ID')}</td>
      </tr>
    `;
  }).join('');

  setSafeText('tfoot-sum-ac-total', grandTotalAC.toLocaleString('id-ID'));
}


// =====================================================================
// BUSINESS ANALYTICS CHARTS (CHART.JS SUITE)
// 1. Grouped Bar: Tren Bulanan Kuadran A vs C (Sept vs Okt)
// 2. Horizontal Bar: Ranking Unit Terbaik Kuadran A & C
// 3. Top N Bar: Top 10 SGP / Outlet Kontributor Utama
// =====================================================================

const chartInstances = {
  tren: null,
  ranking: null,
  topAgen: null
};

let activeChartTab = 'tab-tren';

function initChartTabs() {
  const pillButtons = document.querySelectorAll('#chart-tab-pills .chart-pill-btn');
  const subControls = document.getElementById('top-agen-controls');
  const modeSelect = document.getElementById('select-top-mode');
  const metricSelect = document.getElementById('select-top-metric');

  pillButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      if (!targetTab || targetTab === activeChartTab) return;
      activeChartTab = targetTab;

      // Update active pill button
      pillButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update panes
      document.querySelectorAll('.chart-tab-pane').forEach(p => p.classList.remove('active'));
      const activePane = document.getElementById('pane-' + targetTab);
      if (activePane) activePane.classList.add('active');

      // Show/hide sub controls for top 10 agen
      if (subControls) {
        subControls.style.display = (targetTab === 'tab-top-agen') ? 'flex' : 'none';
      }

      // Re-render target chart with proper size
      renderActiveChart();
    });
  });

  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
      renderChartTopAgen();
    });
  }
  if (metricSelect) {
    metricSelect.addEventListener('change', () => {
      renderChartTopAgen();
    });
  }
}

function renderAllCharts() {
  const notice = document.getElementById('chart-empty-notice');
  if (notice) notice.style.display = 'none';

  renderChartTrenBulanan();
  renderChartRankingUnit();
  renderChartTopAgen();
}

function renderActiveChart() {
  if (activeChartTab === 'tab-tren') {
    renderChartTrenBulanan();
  } else if (activeChartTab === 'tab-ranking') {
    renderChartRankingUnit();
  } else if (activeChartTab === 'tab-top-agen') {
    renderChartTopAgen();
  }
}

// -------------------------------------------------------------
// CHART 1: Tren Bulanan Kuadran A vs C (Grouped Bar Chart)
// -------------------------------------------------------------
function renderChartTrenBulanan() {
  const canvas = document.getElementById('chartTrenBulanan');
  if (!canvas) return;

  let totalSeptA = 0, totalSeptC = 0, totalOktA = 0, totalOktC = 0;
  (state.monthlyData || []).forEach(d => {
    totalSeptA += Number(d.septA) || 0;
    totalSeptC += Number(d.septC) || 0;
    totalOktA += Number(d.oktA) || 0;
    totalOktC += Number(d.oktC) || 0;
  });

  if (chartInstances.tren) {
    chartInstances.tren.destroy();
  }

  // Custom Plugin: Always-Visible Direct Data Labels (Matching User Reference)
  // Menampilkan angka total di atas bar & persentase di dalam bar secara permanen tanpa perlu di-hover
  const alwaysVisibleLabelsPlugin = {
    id: 'alwaysVisibleLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const totalSept = (totalSeptA + totalSeptC) || 1;
      const totalOkt = (totalOktA + totalOktC) || 1;

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden) return;

        meta.data.forEach((bar, index) => {
          const val = dataset.data[index] || 0;
          if (val === 0) return;

          const totalBulan = index === 0 ? totalSept : totalOkt;
          const pct = Math.round((val / totalBulan) * 100) + '%';
          const formattedVal = val.toLocaleString('id-ID');

          ctx.save();
          ctx.textAlign = 'center';

          // 1. ANGKANYA LANGSUNG MUNCUL DI ATAS BAR (Tanpa perlu hover kursor)
          ctx.font = '700 13px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 4;
          ctx.fillText(formattedVal, bar.x, bar.y - 8);

          // 2. PERSENTASE DI DALAM BAR (Sesuai gambar referensi: putih di navy, hitam di gold)
          const barHeight = bar.base - bar.y;
          if (barHeight > 28) {
            ctx.shadowBlur = 0;
            ctx.font = '800 15px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            // Kuadran A (Navy/Blue) -> teks putih; Kuadran C (Gold) -> teks hitam
            ctx.fillStyle = (datasetIndex === 0) ? '#ffffff' : '#000000';
            
            const textY = bar.y + (barHeight * 0.45);
            ctx.fillText(pct, bar.x, textY);
          }

          ctx.restore();
        });
      });
    }
  };

  chartInstances.tren = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['September', 'Oktober'],
      datasets: [
        {
          label: 'Kuadran A (High Performer)',
          data: [totalSeptA, totalOktA],
          backgroundColor: '#003D79', // Deep Mandiri Navy Blue (seperti gambar)
          borderColor: '#38bdf8',
          borderWidth: 1.5,
          borderRadius: { topLeft: 4, topRight: 4 },
          barPercentage: 0.85,
          categoryPercentage: 0.6
        },
        {
          label: 'Kuadran C (Growing / Potential)',
          data: [totalSeptC, totalOktC],
          backgroundColor: '#FFB700', // Mandiri Golden Yellow (seperti gambar)
          borderColor: '#d97706',
          borderWidth: 1.5,
          borderRadius: { topLeft: 4, topRight: 4 },
          barPercentage: 0.85,
          categoryPercentage: 0.6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 26,
          left: 10,
          right: 10
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#cbd5e1',
            font: { size: 11, weight: '600' },
            boxWidth: 14,
            padding: 14
          }
        },
        tooltip: {
          backgroundColor: '#081738',
          titleColor: '#FFB700',
          bodyColor: '#ffffff',
          borderColor: '#1e3a6a',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(ctx) {
              const val = ctx.raw || 0;
              const totalBulan = ctx.dataIndex === 0 ? (totalSeptA + totalSeptC) : (totalOktA + totalOktC);
              const pct = totalBulan > 0 ? ((val / totalBulan) * 100).toFixed(1) : 0;
              return ` ${ctx.dataset.label}: ${val.toLocaleString('id-ID')} Agen (${pct}%)`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#f1f5f9', font: { size: 12, weight: '700' } },
          grid: { display: false }
        },
        y: {
          grace: '20%', // Memberikan ruang lega di atas bar agar angka tidak terpotong
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            callback: function(v) { return v.toLocaleString('id-ID'); }
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        }
      }
    },
    plugins: [alwaysVisibleLabelsPlugin]
  });
}

// -------------------------------------------------------------
// CHART 2: Ranking Unit Terbaik Kuadran A & C (Horizontal Bar)
// -------------------------------------------------------------
function renderChartRankingUnit() {
  const canvas = document.getElementById('chartRankingUnit');
  if (!canvas) return;

  const sortedUnits = (state.summaryKuadranData || [])
    .slice()
    .sort((a, b) => b.totalAC - a.totalAC)
    .slice(0, 10);

  const labels = sortedUnits.map(u => u.unit.replace(/^(Jakarta|Bogor|Depok)\s*/i, ''));
  const values = sortedUnits.map(u => u.totalAC);

  if (chartInstances.ranking) {
    chartInstances.ranking.destroy();
  }

  chartInstances.ranking = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Kuadran A & C',
        data: values,
        backgroundColor: 'rgba(0, 120, 212, 0.85)',
        borderColor: '#38bdf8',
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#081738',
          titleColor: '#FFB700',
          bodyColor: '#ffffff',
          borderColor: '#1e3a6a',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(ctx) {
              return ` ${ctx.dataset.label}: ${(ctx.raw || 0).toLocaleString('id-ID')} Agen`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            callback: function(v) { return v.toLocaleString('id-ID'); }
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        },
        y: {
          ticks: {
            color: '#e2e8f0',
            font: { size: 10.5, weight: '500' }
          },
          grid: { display: false }
        }
      }
    }
  });
}

// -------------------------------------------------------------
// CHART 3: Top N Bar Chart (Performa Agen / SGP Terbaik)
// -------------------------------------------------------------
function renderChartTopAgen() {
  const canvas = document.getElementById('chartTopAgen');
  if (!canvas) return;

  const mode = document.getElementById('select-top-mode')?.value || 'sgp';
  const metric = document.getElementById('select-top-metric')?.value || 'frek';

  let items = [];
  let metricLabel = 'Frek + Ref Input';
  let barColor = 'rgba(16, 185, 129, 0.85)';
  let borderColor = '#34d399';

  if (metric === 'fun') {
    metricLabel = 'Funding Naskomgen';
    barColor = 'rgba(255, 183, 0, 0.85)';
    borderColor = '#fbbf24';
  } else if (metric === 'nas') {
    metricLabel = 'Nas komgen';
    barColor = 'rgba(56, 189, 248, 0.85)';
    borderColor = '#0284c7';
  }

  if (mode === 'sgp') {
    // Aggregate by SGP
    const sgpMap = {};
    (state.rawRows || []).forEach(r => {
      const name = (r['Nama SGP'] || getVal(r, ['nama sgp', 'sgp']) || '').trim();
      if (!name || name === '-' || name.toLowerCase() === 'null') return;

      let val = 0;
      if (metric === 'frek') {
        const raw = r['Frekuensi + Ref Input'] || getVal(r, ['frekuensi + ref input', 'frek + ref', 'frek', 'transaksi']);
        val = parseFloat(String(raw).replace(/[^0-9.-]+/g, '')) || 0;
      } else if (metric === 'fun') {
        const raw = r['Funding Naskomgen'] || r['Funkomgen'] || getVal(r, ['funkomgen', 'fun komgen', 'fun']);
        val = parseFloat(String(raw).replace(/[^0-9.-]+/g, '')) || 0;
      } else {
        const raw = r['Nas komgen'] || getVal(r, ['nas komgen', 'naskomgen', 'nas']);
        val = parseFloat(String(raw).replace(/[^0-9.-]+/g, '')) || 0;
      }

      if (!sgpMap[name]) {
        sgpMap[name] = { name, total: 0, count: 0 };
      }
      sgpMap[name].total += val;
      sgpMap[name].count += 1;
    });

    items = Object.values(sgpMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  } else {
    // Individual Outlet (Nama Usaha Agen)
    items = (state.rawRows || []).map(r => {
      const name = r['Nama Usaha Agen'] || getVal(r, ['nama usaha', 'usaha', 'outlet']) || 'Agen';
      const sgp = r['Nama SGP'] || getVal(r, ['nama sgp', 'sgp']) || '';
      let val = 0;
      if (metric === 'frek') {
        const raw = r['Frekuensi + Ref Input'] || getVal(r, ['frekuensi + ref input', 'frek + ref', 'frek', 'transaksi']);
        val = parseFloat(String(raw).replace(/[^0-9.-]+/g, '')) || 0;
      } else if (metric === 'fun') {
        const raw = r['Funding Naskomgen'] || r['Funkomgen'] || getVal(r, ['funkomgen', 'fun komgen', 'fun']);
        val = parseFloat(String(raw).replace(/[^0-9.-]+/g, '')) || 0;
      } else {
        const raw = r['Nas komgen'] || getVal(r, ['nas komgen', 'naskomgen', 'nas']);
        val = parseFloat(String(raw).replace(/[^0-9.-]+/g, '')) || 0;
      }
      return {
        name: name.length > 22 ? name.substring(0, 20) + '...' : name,
        fullName: name,
        sgp,
        total: val
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  }

  const labels = items.map(i => i.name);
  const values = items.map(i => i.total);

  if (chartInstances.topAgen) {
    chartInstances.topAgen.destroy();
  }

  chartInstances.topAgen = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: metricLabel,
        data: values,
        backgroundColor: barColor,
        borderColor: borderColor,
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#081738',
          titleColor: '#FFB700',
          bodyColor: '#ffffff',
          borderColor: '#1e3a6a',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: function(ctx) {
              const idx = ctx[0].dataIndex;
              const item = items[idx];
              return item?.fullName ? item.fullName : (ctx[0].label || '');
            },
            label: function(ctx) {
              const idx = ctx.dataIndex;
              const item = items[idx];
              const val = (ctx.raw || 0).toLocaleString('id-ID');
              const sgpSub = item?.sgp ? ` (SGP: ${item.sgp})` : '';
              const countSub = item?.count ? ` (${item.count} agen didampingi)` : '';
              return ` ${metricLabel}: ${val}${sgpSub}${countSub}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            callback: function(v) { return v.toLocaleString('id-ID'); }
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        },
        y: {
          ticks: {
            color: '#e2e8f0',
            font: { size: 10.5, weight: '500' }
          },
          grid: { display: false }
        }
      }
    }
  });
}

function exportToExcel() {
  if (!state.hasData || state.rawRows.length === 0) {
    alert('Belum ada data untuk diekspor!');
    return;
  }
  const ws = XLSX.utils.json_to_sheet(state.rawRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Performance Agen");
  XLSX.writeFile(wb, "Mandiri_Performance_Agen_" + new Date().toISOString().slice(0, 10) + ".xlsx");
}
