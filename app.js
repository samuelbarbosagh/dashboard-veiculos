// Auth State & Hash-based credential check
// Username: samuel | Password: consulta
const AUTH_USER = 'samuel';
const AUTH_HASH = 'a2e363fb1596b372d664fa81bf5fbbeb1aaab6e358df85c7973cc5ffbbe82248'; // sha256('consulta')
const SESSION_KEY = 'frota_dashboard_session';

// State
let allVehicles = [];
let filteredVehicles = [];
let selectedVehicle = null;

// DOM Elements
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('loginError');
const appContainer = document.getElementById('appContainer');
const btnLogout = document.getElementById('btnLogout');

const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const filialFilter = document.getElementById('filialFilter');
const familiaFilter = document.getElementById('familiaFilter');
const statusFilter = document.getElementById('statusFilter');
const vehicleList = document.getElementById('vehicleList');
const resultsCount = document.getElementById('resultsCount');
const statsBadge = document.getElementById('statsBadge');
const emptyState = document.getElementById('emptyState');
const vehicleDetails = document.getElementById('vehicleDetails');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupAuth();
});

// SHA-256 helper via Web Crypto API
async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function setupAuth() {
  const isAuth = sessionStorage.getItem(SESSION_KEY);
  if (isAuth === 'true') {
    showDashboard();
  } else {
    showLogin();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    const user = usernameInput.value.trim().toLowerCase();
    const pass = passwordInput.value;
    const passHash = await sha256(pass);

    if (user === AUTH_USER && passHash === AUTH_HASH) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      showDashboard();
    } else {
      loginError.style.display = 'block';
      passwordInput.value = '';
      passwordInput.focus();
    }
  });

  btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
  });
}

function showLogin() {
  loginOverlay.style.display = 'flex';
  appContainer.style.display = 'none';
  usernameInput.value = '';
  passwordInput.value = '';
  loginError.style.display = 'none';
  usernameInput.focus();
}

async function showDashboard() {
  loginOverlay.style.display = 'none';
  appContainer.style.display = 'flex';
  
  if (allVehicles.length === 0) {
    await loadData();
    setupDashboardEvents();
  }
}

async function loadData() {
  try {
    const res = await fetch('data/vehicles.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allVehicles = await res.json();
    
    // Sort alphabetically by placa / bem
    allVehicles.sort((a, b) => (a.placa || a.bem).localeCompare(b.placa || b.bem));

    initFilters();
    applyFilters();
    updateHeaderStats();
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
    statsBadge.innerHTML = `<span class="dot" style="background:var(--danger)"></span> Erro ao carregar dados`;
  }
}

function updateHeaderStats() {
  const total = allVehicles.length;
  const comAbast = allVehicles.filter(v => v.abastecimentos_count > 0).length;
  statsBadge.innerHTML = `<span class="dot"></span> <strong>${total}</strong> veículos cadastrados &bull; <strong>${comAbast}</strong> com abastecimentos`;
}

function initFilters() {
  // Populate Filiais
  const filiais = [...new Set(allVehicles.map(v => v.filial).filter(Boolean))].sort();
  filiais.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = getFilialLabel(f);
    filialFilter.appendChild(opt);
  });

  // Populate Famílias
  const familias = [...new Set(allVehicles.map(v => v.familia || v.nome_bem).filter(Boolean))].sort();
  familias.slice(0, 50).forEach(fam => {
    const opt = document.createElement('option');
    opt.value = fam;
    opt.textContent = fam;
    familiaFilter.appendChild(opt);
  });
}

function getFilialLabel(cod) {
  const map = {
    '0501': '0501 - Aparecida de Goiânia',
    '0201': '0201 - Uberaba MG',
    '0104': '0104 - Londrina PR',
    '0103': '0103 - Belo Horizonte MG',
    '0107': '0107 - Unaí MG',
    '0102': '0102 - Porto Velho RO',
    '0105': '0105 - Caldas Novas GO',
    '0109': '0109 - Betim MG',
    '0110': '0110 - Ariquemes RO',
    '0301': '0301 - Contagem MG',
    '0401': '0401 - Anápolis GO'
  };
  return map[cod] || `Filial ${cod}`;
}

function setupDashboardEvents() {
  searchInput.addEventListener('input', () => {
    clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
    applyFilters();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchInput.focus();
    applyFilters();
  });

  filialFilter.addEventListener('change', applyFilters);
  familiaFilter.addEventListener('change', applyFilters);
  statusFilter.addEventListener('change', applyFilters);
}

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  const filial = filialFilter.value;
  const familia = familiaFilter.value;
  const status = statusFilter.value;

  filteredVehicles = allVehicles.filter(v => {
    // Search query: Placa, Bem, Modelo, Nome, Número de Série, Chassi
    if (q) {
      const matchPlaca = (v.placa || '').toLowerCase().includes(q);
      const matchBem = (v.bem || '').toLowerCase().includes(q);
      const matchModelo = (v.modelo || '').toLowerCase().includes(q);
      const matchNome = (v.nome_bem || '').toLowerCase().includes(q);
      const matchSerie = (v.serie || '').toLowerCase().includes(q);
      const matchChassi = (v.chassi || '').toLowerCase().includes(q);

      if (!matchPlaca && !matchBem && !matchModelo && !matchNome && !matchSerie && !matchChassi) {
        return false;
      }
    }

    // Filial filter
    if (filial && v.filial !== filial) return false;

    // Familia filter
    if (familia && (v.familia !== familia && v.nome_bem !== familia)) return false;

    // Status filter
    if (status === 'alerta') {
      const isAlerta = (v.pos_contador === '1' || v.pos_contador === 1) && v.status_bem !== 'Não listado em ST9';
      if (!isAlerta) return false;
    } else if (status === 'abastecido') {
      if (v.abastecimentos_count === 0) return false;
    } else if (status === 'chassi') {
      if (!v.chassi) return false;
    }

    return true;
  });

  renderVehicleList();
}

function renderVehicleList() {
  vehicleList.innerHTML = '';
  resultsCount.textContent = `${filteredVehicles.length} veículo${filteredVehicles.length === 1 ? '' : 's'} encontrado${filteredVehicles.length === 1 ? '' : 's'}`;

  if (filteredVehicles.length === 0) {
    vehicleList.innerHTML = `
      <div style="padding: 2rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
        Nenhum veículo encontrado para os filtros selecionados.
      </div>
    `;
    return;
  }

  // Render top 100 to keep UI ultra snappy
  const toRender = filteredVehicles.slice(0, 100);
  toRender.forEach(v => {
    const card = document.createElement('div');
    card.className = `vehicle-card ${selectedVehicle && selectedVehicle.bem === v.bem ? 'active' : ''}`;
    
    const isAlerta = (v.pos_contador === '1' || v.pos_contador === 1) && v.status_bem !== 'Não listado em ST9';
    const alertBadge = isAlerta ? `<span class="badge badge-alert">Parado</span>` : '';
    const abastBadge = v.abastecimentos_count > 0 ? `<span class="badge badge-ok">${v.abastecimentos_count} abast.</span>` : '';

    // Badge de chassi ou série quando presentes
    let identBadge = '';
    if (v.chassi) {
      identBadge = `<span class="badge" style="background:#e0e7ff; color:#3730a3;" title="Chassi: ${v.chassi}">Chassi</span>`;
    }

    card.innerHTML = `
      <div class="card-top">
        <span class="vehicle-placa">${v.placa || v.bem}</span>
        <div style="display:flex; gap:0.25rem;">
          <span class="badge badge-filial">${v.filial || '-'}</span>
          ${identBadge}
          ${alertBadge}
          ${abastBadge}
        </div>
      </div>
      <div class="card-desc" title="${v.modelo || v.nome_bem || '-'}">
        ${v.modelo || v.nome_bem || 'Equipamento'}
      </div>
      <div class="card-footer">
        <span>Série: <strong>${v.serie || '-'}</strong></span>
        <span>${v.total_litros ? v.total_litros.toLocaleString('pt-BR') + ' L' : '0 L'}</span>
      </div>
    `;

    card.addEventListener('click', () => selectVehicle(v, card));
    vehicleList.appendChild(card);
  });

  // If none selected and list not empty, select first
  if (!selectedVehicle && toRender.length > 0) {
    selectVehicle(toRender[0], vehicleList.firstChild);
  }
}

function selectVehicle(v, cardEl) {
  selectedVehicle = v;

  // Highlight active card
  document.querySelectorAll('.vehicle-card').forEach(c => c.classList.remove('active'));
  if (cardEl) cardEl.classList.add('active');

  renderVehicleDetails(v);
}

function renderVehicleDetails(v) {
  emptyState.style.display = 'none';
  vehicleDetails.style.display = 'block';

  const isAlerta = (v.pos_contador === '1' || v.pos_contador === 1) && v.status_bem !== 'Não listado em ST9';

  let alertBannerHtml = '';
  if (isAlerta) {
    alertBannerHtml = `
      <div class="alert-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <div>
          <strong>Atenção: Horímetro Estagnado / Posição 1</strong><br>
          Este equipamento está registrado na base com contador <strong>${v.pos_contador}</strong> desde ${v.ult_acomp || 'data não informada'} sem avanço registrado.
        </div>
      </div>
    `;
  }

  // History rows
  let historyHtml = '';
  if (v.historico && v.historico.length > 0) {
    historyHtml = `
      <h3 class="section-title">Últimos Abastecimentos Registrados (Ficha)</h3>
      <div class="history-container">
        <table class="history-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Combustível</th>
              <th>Qtd. (L)</th>
              <th>Horímetro</th>
              <th>KM</th>
              <th>Motorista</th>
              <th>Frentista</th>
            </tr>
          </thead>
          <tbody>
            ${v.historico.map(h => `
              <tr>
                <td><strong>${h.data}</strong></td>
                <td>${h.combustivel || '-'}</td>
                <td><strong>${h.litros ? h.litros.toLocaleString('pt-BR') : '-'} L</strong></td>
                <td>${h.horimetro || '-'}</td>
                <td>${h.km || '-'}</td>
                <td>${h.motorista || '-'}</td>
                <td>${h.frentista || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    historyHtml = `
      <h3 class="section-title">Últimos Abastecimentos Registrados</h3>
      <div style="padding: 1.5rem; text-align: center; background: #f8fafc; border-radius: var(--radius-md); border: 1px dashed var(--border); color: var(--text-muted);">
        Nenhum registro de abastecimento localizado para este veículo no período analisado (Out/Nov 2026).
      </div>
    `;
  }

  vehicleDetails.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">
        <h2>
          ${v.placa || v.bem}
          <span class="badge ${v.situacao_bem === 'Ativo' ? 'badge-ok' : 'badge-filial'}">${v.situacao_bem || 'Cadastrado'}</span>
        </h2>
        <div class="detail-subtitle">
          ${v.nome_bem || v.modelo || 'Sem descrição cadastrada'} &bull; ${getFilialLabel(v.filial)}
        </div>
      </div>
    </div>

    ${alertBannerHtml}

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <span class="kpi-title">${v.tipo_contador || 'Contador Atual'}</span>
        <span class="kpi-value">${v.pos_contador || '-'}</span>
        <span class="kpi-subtext">Últ. Acomp: ${v.ult_acomp || 'Não informado'}</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-title">Total Abastecido</span>
        <span class="kpi-value">${v.total_litros ? v.total_litros.toLocaleString('pt-BR') + ' L' : '0 L'}</span>
        <span class="kpi-subtext">${v.abastecimentos_count} abastecimento(s)</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-title">Centro de Custo</span>
        <span class="kpi-value" style="font-size: 1.15rem;">${v.centro_custo || 'Não vinculado'}</span>
        <span class="kpi-subtext">Família: ${v.familia || '-'}</span>
      </div>
    </div>

    <!-- Identificação Principal (Destaque Chassi & Série) -->
    <h3 class="section-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
      </svg>
      Identificação & Ficha Técnica (ST9 / Protheus)
    </h3>
    <table class="info-table">
      <tbody>
        <tr style="background: #eff6ff;">
          <th>Chassi</th>
          <td><strong style="color: var(--primary); font-family: monospace; font-size: 0.95rem;">${v.chassi || '<span style="color:#94a3b8; font-weight:normal;">Não cadastrado</span>'}</strong></td>
        </tr>
        <tr style="background: #eff6ff;">
          <th>Número de Série</th>
          <td><strong style="color: var(--primary); font-family: monospace; font-size: 0.95rem;">${v.serie || '<span style="color:#94a3b8; font-weight:normal;">Não informada</span>'}</strong></td>
        </tr>
        <tr>
          <th>Código do Bem (Protheus)</th>
          <td><strong>${v.bem}</strong></td>
        </tr>
        <tr>
          <th>Placa</th>
          <td>${v.placa || '-'}</td>
        </tr>
        <tr>
          <th>Modelo / Descrição</th>
          <td>${v.modelo || v.nome_bem || '-'}</td>
        </tr>
        <tr>
          <th>Fabricante</th>
          <td>${v.fabricante || '-'}</td>
        </tr>
        <tr>
          <th>Tipo Modelo</th>
          <td>${v.tipo_modelo || '-'}</td>
        </tr>
        <tr>
          <th>Status do Bem</th>
          <td>${v.status_bem || '-'}</td>
        </tr>
      </tbody>
    </table>

    ${historyHtml}
  `;
}
