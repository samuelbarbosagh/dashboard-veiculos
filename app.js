// Auth State & Hash-based credential check
// Username: samuel | Password: consulta
const AUTH_USER = 'samuel';
const AUTH_HASH = 'a2e363fb1596b372d664fa81bf5fbbeb1aaab6e358df85c7973cc5ffbbe82248'; // sha256('consulta')
const SESSION_KEY = 'frota_dashboard_session';
const THEME_KEY = 'frota_theme_pref';

// State
let allVehicles = [];
let filteredVehicles = [];
let selectedVehicle = null;
let videoStream = null;

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
const btnOpenScan = document.getElementById('btnOpenScan');
const filialFilter = document.getElementById('filialFilter');
const familiaFilter = document.getElementById('familiaFilter');
const statusFilter = document.getElementById('statusFilter');
const vehicleList = document.getElementById('vehicleList');
const resultsCount = document.getElementById('resultsCount');
const emptyState = document.getElementById('emptyState');
const vehicleDetails = document.getElementById('vehicleDetails');

// Theme Elements
const btnThemeAuto = document.getElementById('btnThemeAuto');
const btnThemeLight = document.getElementById('btnThemeLight');
const btnThemeDark = document.getElementById('btnThemeDark');

// Camera Elements
const cameraModal = document.getElementById('cameraModal');
const btnCloseCamera = document.getElementById('btnCloseCamera');
const cameraVideo = document.getElementById('cameraVideo');
const captureCanvas = document.getElementById('captureCanvas');
const btnCaptureOCR = document.getElementById('btnCaptureOCR');
const scanStatus = document.getElementById('scanStatus');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupPWA();
  setupAuth();
});

// PWA Service Worker Registration
function setupPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW registration error:', err);
    });
  }
}

// Theme Management (Light / Dark / Auto)
function setupTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'auto';
  setTheme(savedTheme);

  btnThemeAuto.addEventListener('click', () => setTheme('auto'));
  btnThemeLight.addEventListener('click', () => setTheme('light'));
  btnThemeDark.addEventListener('click', () => setTheme('dark'));
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);

  btnThemeAuto.classList.toggle('active', theme === 'auto');
  btnThemeLight.classList.toggle('active', theme === 'light');
  btnThemeDark.classList.toggle('active', theme === 'dark');
}

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
    setupCameraEvents();
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
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
  }
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
    if (q) {
      const matchPlaca = (v.placa || '').toLowerCase().includes(q);
      const matchBem = (v.bem || '').toLowerCase().includes(q);
      const matchModelo = (v.modelo || '').toLowerCase().includes(q);
      const matchNome = (v.nome_bem || '').toLowerCase().includes(q);
      const matchSerie = (v.serie || '').toLowerCase().includes(q);
      const matchChassi = (v.chassi || '').toLowerCase().includes(q);
      const matchMotor = (v.nro_motor || '').toLowerCase().includes(q);
      const matchChapa = (v.chapa_imob || '').toLowerCase().includes(q);

      if (!matchPlaca && !matchBem && !matchModelo && !matchNome && !matchSerie && !matchChassi && !matchMotor && !matchChapa) {
        return false;
      }
    }

    if (filial && v.filial !== filial) return false;
    if (familia && (v.familia !== familia && v.nome_bem !== familia)) return false;

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

  const toRender = filteredVehicles.slice(0, 100);
  toRender.forEach(v => {
    const card = document.createElement('div');
    card.className = `vehicle-card ${selectedVehicle && selectedVehicle.bem === v.bem ? 'active' : ''}`;
    
    const isAlerta = (v.pos_contador === '1' || v.pos_contador === 1) && v.status_bem !== 'Não listado em ST9';
    const alertBadge = isAlerta ? `<span class="badge badge-alert">Parado</span>` : '';
    const abastBadge = v.abastecimentos_count > 0 ? `<span class="badge badge-ok">${v.abastecimentos_count} abast.</span>` : '';

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
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">
          <span>Série: <strong>${v.serie || '-'}</strong></span>
          <span>Chassi: <strong>${v.chassi || '-'}</strong></span>
        </div>
        <span>${v.total_litros ? v.total_litros.toLocaleString('pt-BR') + ' L' : '0 L'}</span>
      </div>
    `;

    card.addEventListener('click', () => selectVehicle(v, card));
    vehicleList.appendChild(card);
  });

  if (!selectedVehicle && toRender.length > 0) {
    selectVehicle(toRender[0], vehicleList.firstChild);
  }
}

function selectVehicle(v, cardEl) {
  selectedVehicle = v;

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
      <div style="padding: 1.5rem; text-align: center; background: var(--bg-main); border-radius: var(--radius-md); border: 1px dashed var(--border); color: var(--text-muted);">
        Nenhum registro de abastecimento localizado para este veículo no período analisado.
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

      <!-- Barra de Ações Rápidas -->
      <div class="action-buttons-bar">
        <button id="btnShareWhatsApp" class="btn-action btn-action-whatsapp" title="Enviar resumo no WhatsApp">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z"/>
          </svg>
          WhatsApp
        </button>

        <button id="btnCopyVehicle" class="btn-action" title="Copiar ficha técnica">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copiar
        </button>

        <button id="btnPrintVehicle" class="btn-action" title="Exportar PDF / Imprimir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          PDF / Imprimir
        </button>
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
        <span class="kpi-title">Cap. Tanque</span>
        <span class="kpi-value">${v.cap_tanque ? v.cap_tanque + ' L' : '-'}</span>
        <span class="kpi-subtext">Média Padrão: ${v.media_consu || '-'} (Mín: ${v.med_minima || '-'})</span>
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

    <!-- Tabela Completa de Identificação & Ficha Técnica com todos os campos -->
    <h3 class="section-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
      </svg>
      Ficha Cadastral Completa (ST9 / Protheus)
    </h3>
    <table class="info-table">
      <tbody>
        <tr style="background: var(--primary-subtle);">
          <th>Placa</th>
          <td><strong style="color: var(--primary); font-size: 1rem;">${v.placa || '-'}</strong></td>
        </tr>
        <tr style="background: var(--primary-subtle);">
          <th>Código do Bem</th>
          <td><strong>${v.bem}</strong></td>
        </tr>
        <tr>
          <th>Chassi</th>
          <td><strong style="font-family: monospace;">${v.chassi || '<span style="color:var(--text-muted); font-weight:normal;">Não cadastrado</span>'}</strong></td>
        </tr>
        <tr>
          <th>Número de Série</th>
          <td><strong style="font-family: monospace;">${v.serie || '<span style="color:var(--text-muted); font-weight:normal;">Não informada</span>'}</strong></td>
        </tr>
        <tr>
          <th>Nro do Motor</th>
          <td><strong style="font-family: monospace;">${v.nro_motor || '<span style="color:var(--text-muted); font-weight:normal;">Não informado</span>'}</strong></td>
        </tr>
        <tr>
          <th>Ano Modelo</th>
          <td>${v.ano_modelo || '-'}</td>
        </tr>
        <tr>
          <th>Modelo</th>
          <td>${v.modelo || '-'}</td>
        </tr>
        <tr>
          <th>Nome do Bem</th>
          <td>${v.nome_bem || '-'}</td>
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
          <th>Família</th>
          <td>${v.familia || '-'}</td>
        </tr>
        <tr>
          <th>Categoria</th>
          <td>${v.categoria || '-'}</td>
        </tr>
        <tr>
          <th>Centro de Custo</th>
          <td>${v.centro_custo || '-'}</td>
        </tr>
        <tr>
          <th>Situação Bem</th>
          <td><span class="badge ${v.situacao_bem === 'Ativo' ? 'badge-ok' : 'badge-filial'}">${v.situacao_bem || '-'}</span></td>
        </tr>
        <tr>
          <th>Sit. Manutenção</th>
          <td>${v.sit_manut || '-'}</td>
        </tr>
        <tr>
          <th>Chapa Imobilizado</th>
          <td>${v.chapa_imob || '-'}</td>
        </tr>
        <tr>
          <th>Capacidade do Tanque</th>
          <td>${v.cap_tanque ? v.cap_tanque + ' Litros' : '-'}</td>
        </tr>
        <tr>
          <th>Média de Consumo Padrão</th>
          <td>${v.media_consu || '-'}</td>
        </tr>
        <tr>
          <th>Média Mínima</th>
          <td>${v.med_minima || '-'}</td>
        </tr>
        <tr>
          <th>Filial</th>
          <td>${getFilialLabel(v.filial)}</td>
        </tr>
      </tbody>
    </table>

    ${historyHtml}
  `;

  // Attach quick action listeners
  document.getElementById('btnShareWhatsApp').addEventListener('click', () => shareViaWhatsApp(v));
  document.getElementById('btnCopyVehicle').addEventListener('click', () => copyVehicleDetails(v));
  document.getElementById('btnPrintVehicle').addEventListener('click', () => window.print());
}

// Quick Actions Implementation
function formatVehicleSummary(v) {
  return `🚛 *CONSULTA DE VEÍCULO - FROTAS*
-------------------------------
• *Placa/Bem:* ${v.placa || v.bem}
• *Filial:* ${getFilialLabel(v.filial)}
• *Modelo:* ${v.modelo || v.nome_bem || '-'}
• *Chassi:* ${v.chassi || 'N/A'}
• *Série:* ${v.serie || 'N/A'}
• *Motor:* ${v.nro_motor || 'N/A'}
• *Ano Modelo:* ${v.ano_modelo || 'N/A'}
• *Cap. Tanque:* ${v.cap_tanque ? v.cap_tanque + ' L' : 'N/A'}
• *${v.tipo_contador || 'Contador'}:* ${v.pos_contador || '-'} (em ${v.ult_acomp || 'N/A'})
• *Total Abastecido:* ${v.total_litros ? v.total_litros.toLocaleString('pt-BR') + ' L' : '0 L'} (${v.abastecimentos_count} abastecimentos)
• *Centro de Custo:* ${v.centro_custo || 'N/A'}`;
}

function shareViaWhatsApp(v) {
  const text = encodeURIComponent(formatVehicleSummary(v));
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function copyVehicleDetails(v) {
  const text = formatVehicleSummary(v);
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btnCopyVehicle');
    const originalText = btn.innerHTML;
    btn.innerHTML = `✓ Copiado!`;
    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
  });
}

// Camera Scanner & OCR Logic
const cameraFileInput = document.getElementById('cameraFileInput');

function setupCameraEvents() {
  btnOpenScan.addEventListener('click', startCamera);
  btnCloseCamera.addEventListener('click', stopCamera);
  btnCaptureOCR.addEventListener('click', captureAndRecognizePlate);
  
  // Captura direta via foto (100% garantido no celular mesmo se travar getUserMedia)
  if (cameraFileInput) {
    cameraFileInput.addEventListener('change', handleFileInputPhoto);
  }
}

async function startCamera() {
  cameraModal.style.display = 'flex';
  scanStatus.innerHTML = `<span class="scan-spinner"></span> Iniciando câmera...`;
  btnCaptureOCR.style.display = 'inline-flex';

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Navegador sem suporte a getUserMedia');
    }

    // Tenta primeiro a câmera traseira; se falhar, tenta genérica
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
    } catch (e1) {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }

    videoStream = stream;
    cameraVideo.srcObject = videoStream;
    scanStatus.innerHTML = `Enquadre a placa dentro da moldura e toque em Reconhecer`;
  } catch (err) {
    console.warn('Erro ao abrir streaming de vídeo:', err);
    scanStatus.innerHTML = `
      <div style="color:var(--text-main); font-size: 0.85rem;">
        O acesso ao vídeo direto está bloqueado nas permissões do navegador.<br>
        <strong>Toque em "Tirar Foto" abaixo</strong> para usar a câmera nativa do celular.
      </div>
    `;
    btnCaptureOCR.style.display = 'none';
  }
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  cameraModal.style.display = 'none';
}

function handleFileInputPhoto(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  scanStatus.innerHTML = `<span class="scan-spinner"></span> Analisando foto da placa...`;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      processImageOCR(img);
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

async function captureAndRecognizePlate() {
  if (!videoStream) return;

  scanStatus.innerHTML = `<span class="scan-spinner"></span> Capturando frame...`;
  btnCaptureOCR.disabled = true;

  try {
    const ctx = captureCanvas.getContext('2d');
    captureCanvas.width = cameraVideo.videoWidth || 640;
    captureCanvas.height = cameraVideo.videoHeight || 480;
    ctx.drawImage(cameraVideo, 0, 0, captureCanvas.width, captureCanvas.height);

    await processImageOCR(captureCanvas);
  } catch (err) {
    console.error('OCR Error:', err);
    scanStatus.innerHTML = `<span style="color:var(--danger)">Erro no processamento. Toque em "Tirar Foto".</span>`;
  } finally {
    btnCaptureOCR.disabled = false;
  }
}

async function processImageOCR(imageSource) {
  scanStatus.innerHTML = `<span class="scan-spinner"></span> Identificando caracteres da placa...`;

  try {
    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract OCR não carregado.');
    }

    const res = await Tesseract.recognize(imageSource, 'por');
    const rawText = (res.data.text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    console.log('OCR Output raw:', rawText);

    // Regex para padrão Mercosul (ex: BRA2E19) ou Padrão antigo (ex: ABC1234)
    const plateMatch = rawText.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/) || rawText.match(/[A-Z]{3}[0-9]{4}/);
    const candidate = plateMatch ? plateMatch[0] : (rawText.length >= 7 ? rawText.slice(0, 7) : rawText);

    if (candidate && candidate.length >= 4) {
      scanStatus.innerHTML = `✓ Placa identificada: <strong>${candidate}</strong>! Buscando...`;
      setTimeout(() => {
        stopCamera();
        searchInput.value = candidate;
        clearSearchBtn.style.display = 'block';
        applyFilters();
      }, 700);
    } else {
      scanStatus.innerHTML = `
        <span style="color:var(--warning)">
          Imagem com baixa nitidez ou reflexo.<br>Tente aproximar mais da placa e clique em "Tirar Foto".
        </span>
      `;
    }
  } catch (err) {
    console.error('Process OCR Error:', err);
    scanStatus.innerHTML = `<span style="color:var(--danger)">Erro no reconhecimento OCR: ${err.message || 'Falha ao processar'}.</span>`;
  }
}
