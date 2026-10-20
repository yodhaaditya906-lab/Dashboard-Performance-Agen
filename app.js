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
    pageSize: 15
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

  // Filter Unit
  const filterUnit = document.getElementById('filter-select-unit');
  if (filterUnit) {
    filterUnit.addEventListener('change', (e) => {
      state.filters.unit = e.target.value;
      state.pagination.page = 1;
      renderMainTable();
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

  // Search Unit Ref (Table 2)
  const searchUnitRef = document.getElementById('search-unit-ref');
  if (searchUnitRef) {
    searchUnitRef.addEventListener('input', (e) => {
      renderTableUnitRef(e.target.value.toLowerCase().trim());
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

async function fetchDashboardData(force = false) {
  const pulseDot = document.getElementById('pulse-dot');
  const syncText = document.getElementById('sync-status-text');
  const syncIcon = document.getElementById('btn-sync-icon');

  if (pulseDot) pulseDot.classList.add('syncing');
  if (syncIcon) syncIcon.style.animation = 'spin 1s linear infinite';
  if (syncText) syncText.textContent = 'Menyinkronkan data Google Sheet...';

  try {
    const url = force ? '/api/data?refresh=1' : '/api/data';
    const res = await fetch(url);
    const result = await res.json();

    state.config = result.config || {};
    state.hasData = !!(result.hasData && result.rows && result.rows.length > 0);
    state.rawRows = result.rows || [];
    state.headers = result.headers || [];

    if (pulseDot) pulseDot.classList.remove('syncing');
    if (syncIcon) syncIcon.style.animation = '';

    if (state.hasData) {
      if (syncText) syncText.textContent = `Live Sync: Terhubung (${result.totalRows.toLocaleString('id-ID')} data agen aktif)`;
      processDataAggregations();
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

function processDataAggregations() {
  const unitMap = new Map();
  const unitRefMap = new Map();

  state.rawRows.forEach(row => {
    const unitName = getVal(row, ['nama unit', 'unit']) || 'Unit Tidak Terdefinisi';
    const unitCode = getVal(row, ['kode unit', 'id unit']) || '-';
    
    // Save Unit Ref
    if (unitName !== 'Unit Tidak Terdefinisi' && !unitRefMap.has(unitName)) {
      unitRefMap.set(unitName, unitCode);
    }

    // Monthly Kuadran processing
    if (!unitMap.has(unitName)) {
      unitMap.set(unitName, {
        unit: unitName,
        code: unitCode,
        septA: 0,
        septC: 0,
        oktA: 0,
        oktC: 0,
        totalAC: 0
      });
    }

    const item = unitMap.get(unitName);
    const kuadranVal = getVal(row, ['kuadran', 'quadrant']).toUpperCase();
    const bulanVal = getVal(row, ['bulan', 'periode', 'month']).toLowerCase();

    // Check Sept or Okt
    const isSept = bulanVal.includes('sept') || bulanVal.includes('09');
    const isOkt = bulanVal.includes('okt') || bulanVal.includes('oct') || bulanVal.includes('10') || !bulanVal;

    if (kuadranVal.includes('A')) {
      if (isSept) item.septA++;
      if (isOkt) item.oktA++;
      item.totalAC++;
    } else if (kuadranVal.includes('C')) {
      if (isSept) item.septC++;
      if (isOkt) item.oktC++;
      item.totalAC++;
    }
  });

  // Table 1 Data
  state.monthlyData = Array.from(unitMap.values()).sort((a, b) => a.unit.localeCompare(b.unit));

  // Table 2 Data
  state.unitRefData = Array.from(unitRefMap.entries()).map(([name, code]) => ({
    name,
    code
  })).sort((a, b) => a.name.localeCompare(b.name));

  // Table 4 Data (Unit, Kuadran A & C)
  state.summaryKuadranData = state.monthlyData.map(u => ({
    unit: u.unit,
    totalAC: u.totalAC || (u.oktA + u.oktC)
  })).filter(u => u.totalAC > 0);
}

function populateFilters() {
  const units = new Set();
  const sgps = new Set();

  state.rawRows.forEach(row => {
    const u = getVal(row, ['nama unit', 'unit']);
    const s = getVal(row, ['nama sgp', 'sgp']);
    if (u) units.add(u);
    if (s) sgps.add(s);
  });

  const selectUnit = document.getElementById('filter-select-unit');
  if (selectUnit) {
    const current = selectUnit.value;
    selectUnit.innerHTML = '<option value="">Semua Unit</option>' + 
      Array.from(units).sort().map(u => `<option value="${u}">${u}</option>`).join('');
    selectUnit.value = current;
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
  if (!state.hasData || state.rawRows.length === 0) {
    renderEmptyStates();
    return;
  }

  renderKPIs();
  renderTableMonthlyKuadran();
  renderTableUnitRef();
  renderMainTable();
  renderTableSummaryKuadran();
  renderChart();
}

function renderEmptyStates() {
  document.getElementById('kpi-total-agen').textContent = '0';
  document.getElementById('kpi-total-unit').textContent = '0';
  document.getElementById('kpi-kuadran-sept').textContent = '0';
  document.getElementById('kpi-kuadran-okt').textContent = '0';
  document.getElementById('kpi-total-frek').textContent = '0';

  document.getElementById('tbody-monthly-kuadran').innerHTML = `
    <tr class="empty-row">
      <td colspan="5" class="td-empty-state">
        <div class="empty-state-content">
          <span class="empty-icon">📊</span>
          <p class="empty-title">Data Unit & Kuadran Masih Kosong</p>
          <p class="empty-desc">Hubungkan Google Sheet untuk mengisi tabel perbandingan kuadran secara otomatis.</p>
        </div>
      </td>
    </tr>`;

  document.getElementById('tbody-unit-ref').innerHTML = `
    <tr class="empty-row">
      <td colspan="2" class="td-empty-state">
        <div class="empty-state-content">
          <span class="empty-icon">🏢</span>
          <p class="empty-title">Data Referensi Unit Belum Ada</p>
          <p class="empty-desc">Daftar Kode & Nama Unit akan terisi otomatis setelah Google Sheet tersinkron.</p>
        </div>
      </td>
    </tr>`;

  document.getElementById('tbody-agents-main').innerHTML = `
    <tr class="empty-row">
      <td colspan="7" class="td-empty-state large-empty">
        <div class="empty-state-content">
          <span class="empty-icon">📋</span>
          <h4 class="empty-title">Tabel Siap Menerima Data Performance Agen</h4>
          <p class="empty-desc">
            Format 7 kolom telah siap: 
            <b>Nama SGP &bull; Kode Agen &bull; Nama Usaha Agen &bull; Nama Pemilik Agen &bull; Nas komgen &bull; Funkomgen &bull; Frek + Ref</b>.
          </p>
          <p class="empty-instruction">
            Klik tombol <b>"Hubungkan Google Sheet"</b> di pojok kanan atas untuk memasukkan link spreadsheet kamu.
          </p>
        </div>
      </td>
    </tr>`;

  document.getElementById('tbody-summary-kuadran').innerHTML = `
    <tr class="empty-row">
      <td colspan="2" class="td-empty-state">
        <div class="empty-state-content">
          <span class="empty-icon">📑</span>
          <p class="empty-title">Belum Ada Rekapitulasi</p>
          <p class="empty-desc">Data Kuadran A &amp; C per unit akan dikalkulasi otomatis saat data masuk.</p>
        </div>
      </td>
    </tr>`;

  document.getElementById('agent-count-badge').textContent = '0 Agen';
  document.getElementById('page-info-text').textContent = 'Menampilkan 0 dari 0 data';
}

function renderKPIs() {
  const totalAgen = state.rawRows.length;
  const totalUnits = new Set(state.rawRows.map(r => getVal(r, ['nama unit', 'unit'])).filter(Boolean)).size;

  let septA = 0, septC = 0, oktA = 0, oktC = 0, totalFrek = 0;

  state.monthlyData.forEach(d => {
    septA += d.septA;
    septC += d.septC;
    oktA += d.oktA;
    oktC += d.oktC;
  });

  state.rawRows.forEach(r => {
    const frek = parseFloat(getVal(r, ['frek + ref', 'frek', 'transaksi']).replace(/[^0-9.-]+/g, '')) || 0;
    totalFrek += frek;
  });

  document.getElementById('kpi-total-agen').textContent = totalAgen.toLocaleString('id-ID');
  document.getElementById('kpi-total-unit').textContent = totalUnits.toLocaleString('id-ID');
  
  document.getElementById('kpi-kuadran-sept').textContent = (septA + septC).toLocaleString('id-ID');
  document.getElementById('kpi-sept-a').textContent = `A: ${septA}`;
  document.getElementById('kpi-sept-c').textContent = `C: ${septC}`;

  document.getElementById('kpi-kuadran-okt').textContent = (oktA + oktC).toLocaleString('id-ID');
  document.getElementById('kpi-okt-a').textContent = `A: ${oktA}`;
  document.getElementById('kpi-okt-c').textContent = `C: ${oktC}`;

  document.getElementById('kpi-total-frek').textContent = totalFrek.toLocaleString('id-ID');
}

// TABEL 1: Perbandingan Kuadran Bulanan (Sept vs Okt)
function renderTableMonthlyKuadran(filterQuery = '') {
  const tbody = document.getElementById('tbody-monthly-kuadran');
  if (!tbody) return;

  let list = state.monthlyData;
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
      <tr>
        <td style="font-weight:600;">${item.unit}</td>
        <td style="text-align:center;">${item.septA.toLocaleString('id-ID')}</td>
        <td style="text-align:center;">${item.septC.toLocaleString('id-ID')}</td>
        <td style="text-align:center; color:#38bdf8; font-weight:600;">${item.oktA.toLocaleString('id-ID')}</td>
        <td style="text-align:center; color:#38bdf8; font-weight:600;">${item.oktC.toLocaleString('id-ID')}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('tfoot-sept-a').textContent = totSeptA.toLocaleString('id-ID');
  document.getElementById('tfoot-sept-c').textContent = totSeptC.toLocaleString('id-ID');
  document.getElementById('tfoot-okt-a').textContent = totOktA.toLocaleString('id-ID');
  document.getElementById('tfoot-okt-c').textContent = totOktC.toLocaleString('id-ID');
}

// TABEL 2: Referensi Unit (Kode Unit, Nama Unit)
function renderTableUnitRef(filterQuery = '') {
  const tbody = document.getElementById('tbody-unit-ref');
  if (!tbody) return;

  let list = state.unitRefData;
  if (filterQuery) {
    list = list.filter(u => u.name.toLowerCase().includes(filterQuery) || u.code.toLowerCase().includes(filterQuery));
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px; color:#94a3b8;">Tidak ada data unit.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(item => `
    <tr>
      <td><code style="color:#f472b6; font-weight:600;">${item.code}</code></td>
      <td style="font-weight:600;">${item.name}</td>
    </tr>
  `).join('');

  document.getElementById('tfoot-total-unit-ref').textContent = `${list.length} Unit`;
}

// TABEL 3: Main Performance Agen
function renderMainTable() {
  const tbody = document.getElementById('tbody-agents-main');
  if (!tbody) return;

  let list = state.rawRows.filter(row => {
    const sgp = getVal(row, ['nama sgp', 'sgp']).toLowerCase();
    const kode = getVal(row, ['kode agen', 'id agen']).toLowerCase();
    const usaha = getVal(row, ['nama usaha', 'usaha', 'outlet']).toLowerCase();
    const pemilik = getVal(row, ['nama pemilik', 'pemilik', 'nama']).toLowerCase();
    const unit = getVal(row, ['nama unit', 'unit']);

    if (state.filters.unit && unit !== state.filters.unit) return false;
    if (state.filters.sgp && !sgp.includes(state.filters.sgp.toLowerCase())) return false;

    if (state.filters.search) {
      const q = state.filters.search;
      if (!sgp.includes(q) && !kode.includes(q) && !usaha.includes(q) && !pemilik.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const total = list.length;
  document.getElementById('agent-count-badge').textContent = `${total.toLocaleString('id-ID')} Agen`;

  const { page, pageSize } = state.pagination;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const startIdx = (page - 1) * pageSize;
  const pageRows = list.slice(startIdx, startIdx + pageSize);

  if (pageRows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding: 36px; color:#94a3b8;">
          Tidak ada agen yang sesuai dengan pencarian atau filter.
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = pageRows.map(row => {
      const namaSgp = getVal(row, ['nama sgp', 'sgp']) || '-';
      const kodeAgen = getVal(row, ['kode agen', 'id agen']) || '-';
      const usaha = getVal(row, ['nama usaha', 'usaha', 'outlet']) || '-';
      const pemilik = getVal(row, ['nama pemilik', 'pemilik', 'nama']) || '-';
      const nas = getVal(row, ['nas komgen', 'naskomgen', 'nas']) || '0';
      const fun = getVal(row, ['funkomgen', 'fun komgen', 'fun']) || '0';
      const frek = getVal(row, ['frek + ref', 'frek', 'transaksi']) || '0';

      return `
        <tr>
          <td style="font-weight:600;">${namaSgp}</td>
          <td><code style="color:#fb923c; font-weight:600;">${kodeAgen}</code></td>
          <td>${usaha}</td>
          <td>${pemilik}</td>
          <td style="text-align:center;">${nas}</td>
          <td style="text-align:center;">${fun}</td>
          <td style="text-align:center; font-weight:700; color:#38bdf8;">${frek}</td>
        </tr>
      `;
    }).join('');
  }

  // Calculate totals
  let totNas = 0, totFun = 0, totFrek = 0;
  list.forEach(r => {
    totNas += parseFloat(getVal(r, ['nas komgen', 'naskomgen', 'nas']).replace(/[^0-9.-]+/g, '')) || 0;
    totFun += parseFloat(getVal(r, ['funkomgen', 'fun komgen', 'fun']).replace(/[^0-9.-]+/g, '')) || 0;
    totFrek += parseFloat(getVal(r, ['frek + ref', 'frek', 'transaksi']).replace(/[^0-9.-]+/g, '')) || 0;
  });

  document.getElementById('tfoot-total-naskomgen').textContent = totNas.toLocaleString('id-ID');
  document.getElementById('tfoot-total-funkomgen').textContent = totFun.toLocaleString('id-ID');
  document.getElementById('tfoot-total-frek').textContent = totFrek.toLocaleString('id-ID');

  document.getElementById('page-info-text').textContent = 
    `Menampilkan ${total > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + pageSize, total)} dari ${total.toLocaleString('id-ID')} agen`;
  document.getElementById('page-current-num').textContent = `Halaman ${page} / ${totalPages}`;
  document.getElementById('btn-page-prev').disabled = (page <= 1);
  document.getElementById('btn-page-next').disabled = (page >= totalPages);
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

  document.getElementById('tfoot-sum-ac-total').textContent = grandTotalAC.toLocaleString('id-ID');
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
        backgroundColor: 'rgba(56, 189, 248, 0.75)',
        borderColor: '#38bdf8',
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
