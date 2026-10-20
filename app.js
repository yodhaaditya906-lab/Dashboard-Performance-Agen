function setSafeText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

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
    } else {
      if (syncText) {
        syncText.textContent = state.config?.sheetUrl 
          ? 'Spreadsheet terhubung tetapi data baris masih kosong'
          : 'Menunggu Data: Klik "Hubungkan Google Sheet"';
      }
      renderEmptyStates();
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
  renderChart();
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

// TABEL 3: Main Performance Agen
function renderMainTable() {
  const tbody = document.getElementById('tbody-agents-main');
  if (!tbody) return;

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
      if (!sgp.includes(q) && !kode.includes(q) && !usaha.includes(q) && !pemilik.includes(q) && !unit.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

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

// Performance Chart
function renderChart() {
  const canvas = document.getElementById('performanceChart');
  const notice = document.getElementById('chart-empty-notice');
  if (!canvas) return;

  if (notice) notice.style.display = 'none';

  const topUnits = state.summaryKuadranData.slice(0, 8);
  const labels = topUnits.map(u => u.unit.replace(/^(Jakarta|Bogor|Depok)\s*/i, ''));
  const data = topUnits.map(u => u.totalAC);

  if (state.chartInstance) {
    state.chartInstance.destroy();
  }

  state.chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Kuadran A & C',
        data,
        backgroundColor: '#38bdf8',
        borderColor: '#0284c7',
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#081738',
          titleColor: '#FFB700',
          bodyColor: '#ffffff',
          borderColor: '#1e3a6a',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 10 } },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#94a3b8', font: { size: 10 } },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
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
