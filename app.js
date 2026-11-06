// Gestão de Usuários, Perfis e Autenticação
const USERS_STORAGE_KEY = 'frota_users_db';
const SESSION_KEY = 'frota_dashboard_session';
const THEME_KEY = 'frota_theme_pref';

// Paleta Oficial da Aba DASHBOARD (MODELO RELATÓRIO ABASTECIMENTO - Google Sheets)
const SHEET_COLORS = {
  navyFicha: '#1a227d',
  steelFicha: '#1f4e78',
  slateBar: '#1e4f77',
  orangePortal: '#e56619',
  greenScp: '#2d8c56',
  dieselGold: '#f2a50c',
  gasolinaCoral: '#e05133',
  arlaBlue: '#1e99e0',
  alertRed: '#d83333',
  darkRed: '#c02626',
  mutedGray: '#94a3b8'
};

// Usuários padrão iniciais do sistema
const DEFAULT_USERS = [
  {
    username: 'samuel',
    name: 'Samuel Barbosa',
    role: 'adm', // 'adm' (administrador - controle total)
    hash: 'a2e363fb1596b372d664fa81bf5fbbeb1aaab6e358df85c7973cc5ffbbe82248', // sha256('consulta')
    createdAt: '06/11/2026'
  },
  {
    username: 'davi',
    name: 'Davi',
    role: 'consulta', // 'consulta' (perfil de consulta e visualização)
    hash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', // sha256('123456')
    createdAt: '06/11/2026'
  }
];

// State
let allVehicles = [];
let filteredVehicles = [];
let selectedVehicle = null;
let indicadoresData = null;
let activeMainGuia = 'consulta'; // 'consulta' | 'dashboard'
let activeHistorySource = 'paralelo'; // 'paralelo' | 'ficha' | 'app'
let execChartInstances = {};
let videoStream = null;

// DOM Elements - Auth & Header
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('loginError');
const appContainer = document.getElementById('appContainer');
const btnLogout = document.getElementById('btnLogout');

const currentUserBadge = document.getElementById('currentUserBadge');
const navUsername = document.getElementById('navUsername');
const navUserRole = document.getElementById('navUserRole');
const btnManageUsers = document.getElementById('btnManageUsers');

// DOM Elements - Guias Principais
const btnGuiaConsulta = document.getElementById('btnGuiaConsulta');
const btnGuiaDashboard = document.getElementById('btnGuiaDashboard');
const guiaConsultaView = document.getElementById('guiaConsultaView');
const guiaDashboardView = document.getElementById('guiaDashboardView');
const badgeTotalFrota = document.getElementById('badgeTotalFrota');

// DOM Elements - Users Modal (ADM)
const usersModal = document.getElementById('usersModal');
const btnCloseUsersModal = document.getElementById('btnCloseUsersModal');
const createUserForm = document.getElementById('createUserForm');
const newUsernameInput = document.getElementById('newUsername');
const newFullNameInput = document.getElementById('newFullName');
const newPasswordInput = document.getElementById('newPassword');
const newRoleSelect = document.getElementById('newRole');
const createUserFeedback = document.getElementById('createUserFeedback');
const usersTotalCount = document.getElementById('usersTotalCount');
const usersTableBody = document.getElementById('usersTableBody');

// DOM Elements - Main Filters & Vehicles
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

  if (activeMainGuia === 'dashboard' && indicadoresData) {
    renderExecutiveCharts(document.getElementById('execFilialFilter')?.value || 'TODAS');
  }
}

// SHA-256 helper via Web Crypto API
async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Users Database Helpers
function getUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
      return [...DEFAULT_USERS];
    }
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
      return [...DEFAULT_USERS];
    }
    let updated = false;
    DEFAULT_USERS.forEach(defUser => {
      const idx = list.findIndex(u => u.username.toLowerCase() === defUser.username.toLowerCase());
      if (idx === -1) {
        list.push(defUser);
        updated = true;
      }
    });
    if (updated) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(list));
    }
    return list;
  } catch (e) {
    console.error('Erro ao ler base de usuários:', e);
    return [...DEFAULT_USERS];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function getCurrentSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    if (raw === 'true') {
      return { username: 'samuel', name: 'Samuel Barbosa', role: 'adm' };
    }
    const parsed = JSON.parse(raw);
    if (parsed && parsed.username) return parsed;
    return null;
  } catch (e) {
    return null;
  }
}

function setCurrentSession(userObj) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    username: userObj.username,
    name: userObj.name || userObj.username,
    role: userObj.role || 'consulta'
  }));
}

function clearCurrentSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// Authentication Setup
function setupAuth() {
  const session = getCurrentSession();
  if (session) {
    showDashboard();
  } else {
    showLogin();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    const inputUser = usernameInput.value.trim().toLowerCase();
    const inputPass = passwordInput.value;
    const passHash = await sha256(inputPass);

    const users = getUsers();
    const matchedUser = users.find(u => u.username.toLowerCase() === inputUser && u.hash === passHash);

    if (matchedUser) {
      setCurrentSession(matchedUser);
      showDashboard();
    } else {
      loginError.textContent = 'Usuário ou senha incorretos. Tente novamente.';
      loginError.style.display = 'block';
      passwordInput.value = '';
      passwordInput.focus();
    }
  });

  btnLogout.addEventListener('click', () => {
    clearCurrentSession();
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

function updateUserSessionUI() {
  const session = getCurrentSession();
  if (!session) {
    showLogin();
    return;
  }

  if (currentUserBadge && navUsername && navUserRole) {
    currentUserBadge.style.display = 'inline-flex';
    navUsername.textContent = session.name || session.username;

    if (session.role === 'adm') {
      navUserRole.textContent = 'ADM';
      navUserRole.className = 'role-pill role-pill-adm';
      navUserRole.title = 'Perfil: Administrador (Controle Total)';
    } else {
      navUserRole.textContent = 'CONSULTA';
      navUserRole.className = 'role-pill role-pill-consulta';
      navUserRole.title = 'Perfil: Consulta (Apenas Leitura)';
    }
  }

  if (btnManageUsers) {
    btnManageUsers.style.display = session.role === 'adm' ? 'inline-flex' : 'none';
  }
}

async function showDashboard() {
  loginOverlay.style.display = 'none';
  appContainer.style.display = 'flex';

  updateUserSessionUI();

  if (allVehicles.length === 0) {
    await loadData();
    setupDashboardEvents();
    setupMainGuiaEvents();
    setupExecutiveDashboardEvents();
    setupCameraEvents();
    setupUsersManagementEvents();
  }
}

// Alternância entre Guia 1 (Consulta de Frota) e Guia 2 (Dashboard Executivo & Indicadores)
function setupMainGuiaEvents() {
  if (btnGuiaConsulta) {
    btnGuiaConsulta.addEventListener('click', () => switchMainGuia('consulta'));
  }
  if (btnGuiaDashboard) {
    btnGuiaDashboard.addEventListener('click', () => switchMainGuia('dashboard'));
  }
}

function switchMainGuia(guia) {
  activeMainGuia = guia;
  if (btnGuiaConsulta) btnGuiaConsulta.classList.toggle('active', guia === 'consulta');
  if (btnGuiaDashboard) btnGuiaDashboard.classList.toggle('active', guia === 'dashboard');

  if (guia === 'dashboard') {
    if (guiaConsultaView) guiaConsultaView.style.display = 'none';
    if (guiaDashboardView) guiaDashboardView.style.display = 'flex';
    renderExecutiveDashboard();
  } else {
    if (guiaDashboardView) guiaDashboardView.style.display = 'none';
    if (guiaConsultaView) guiaConsultaView.style.display = 'flex';
  }
}

// Permite clicar em uma placa nas tabelas de auditoria da Guia 2 e abrir direto a Ficha Técnica na Guia 1
function jumpToVehiclePlaca(placa) {
  if (!placa) return;
  const clean = placa.trim().toUpperCase();
  switchMainGuia('consulta');

  if (filialFilter) filialFilter.value = '';
  if (familiaFilter) familiaFilter.value = '';
  if (statusFilter) statusFilter.value = '';
  if (searchInput) {
    searchInput.value = clean;
    if (clearSearchBtn) clearSearchBtn.style.display = 'block';
  }
  applyFilters();

  const target = filteredVehicles.find(v => (v.placa || '').toUpperCase() === clean || (v.bem || '').toUpperCase() === clean);
  if (target) {
    const firstCard = vehicleList.querySelector('.vehicle-card');
    selectVehicle(target, firstCard, true);
  }
}
window.jumpToVehiclePlaca = jumpToVehiclePlaca;

// User Management Implementation (Apenas ADM)
function setupUsersManagementEvents() {
  if (btnManageUsers) {
    btnManageUsers.addEventListener('click', openUsersModal);
  }
  if (btnCloseUsersModal) {
    btnCloseUsersModal.addEventListener('click', closeUsersModal);
  }
  if (usersModal) {
    usersModal.addEventListener('click', (e) => {
      if (e.target === usersModal) closeUsersModal();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && usersModal && usersModal.style.display === 'flex') {
      closeUsersModal();
    }
  });
  if (createUserForm) {
    createUserForm.addEventListener('submit', handleCreateUser);
  }
}

function openUsersModal() {
  const session = getCurrentSession();
  if (!session || session.role !== 'adm') {
    alert('Acesso negado: Somente administradores podem gerenciar usuários.');
    return;
  }
  if (createUserFeedback) {
    createUserFeedback.style.display = 'none';
    createUserFeedback.textContent = '';
  }
  if (createUserForm) createUserForm.reset();

  renderUsersList();
  usersModal.style.display = 'flex';
  if (newUsernameInput) newUsernameInput.focus();
}

function closeUsersModal() {
  if (usersModal) usersModal.style.display = 'none';
}

function renderUsersList() {
  const users = getUsers();
  const session = getCurrentSession();

  if (usersTotalCount) usersTotalCount.textContent = users.length;
  if (!usersTableBody) return;

  usersTableBody.innerHTML = '';

  users.forEach(u => {
    const tr = document.createElement('tr');
    const roleBadge = u.role === 'adm'
      ? `<span class="role-pill role-pill-adm">ADM</span>`
      : `<span class="role-pill role-pill-consulta">Consulta</span>`;

    let actionHtml = '';
    if (u.username === 'samuel') {
      actionHtml = `<span style="font-size: 0.725rem; color: var(--text-muted); font-style: italic;">Padrão</span>`;
    } else if (session && session.username === u.username) {
      actionHtml = `<span style="font-size: 0.725rem; color: var(--text-muted); font-style: italic;">Você</span>`;
    } else {
      actionHtml = `<button type="button" class="btn-delete-user" data-user="${u.username}" title="Excluir usuário">Excluir</button>`;
    }

    tr.innerHTML = `
      <td><strong>${u.username}</strong></td>
      <td>${u.name || '-'}</td>
      <td>${roleBadge}</td>
      <td style="color: var(--text-muted); font-size: 0.75rem;">${u.createdAt || '-'}</td>
      <td style="text-align: right;">${actionHtml}</td>
    `;
    usersTableBody.appendChild(tr);
  });

  usersTableBody.querySelectorAll('.btn-delete-user').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetUser = e.currentTarget.getAttribute('data-user');
      deleteUser(targetUser);
    });
  });
}

async function handleCreateUser(e) {
  e.preventDefault();

  const session = getCurrentSession();
  if (!session || session.role !== 'adm') {
    showCreateUserFeedback('Acesso negado: apenas administradores podem criar usuários.', 'error');
    return;
  }

  const rawUsername = newUsernameInput.value.trim().toLowerCase();
  const rawFullName = newFullNameInput.value.trim();
  const rawPassword = newPasswordInput.value;
  const roleVal = newRoleSelect.value === 'adm' ? 'adm' : 'consulta';

  if (rawUsername.length < 3) {
    showCreateUserFeedback('O nome de usuário deve ter pelo menos 3 caracteres.', 'error');
    newUsernameInput.focus();
    return;
  }

  if (!/^[a-z0-9_.-]+$/.test(rawUsername)) {
    showCreateUserFeedback('O usuário deve conter apenas letras minúsculas, números, ponto ou traço.', 'error');
    newUsernameInput.focus();
    return;
  }

  if (rawPassword.length < 4) {
    showCreateUserFeedback('A senha deve ter pelo menos 4 caracteres.', 'error');
    newPasswordInput.focus();
    return;
  }

  const users = getUsers();
  const exists = users.some(u => u.username.toLowerCase() === rawUsername);
  if (exists) {
    showCreateUserFeedback(`O usuário "${rawUsername}" já está cadastrado. Escolha outro login.`, 'error');
    newUsernameInput.focus();
    return;
  }

  const passHash = await sha256(rawPassword);
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');

  const newUser = {
    username: rawUsername,
    name: rawFullName || rawUsername,
    role: roleVal,
    hash: passHash,
    createdAt: dateStr
  };

  users.push(newUser);
  saveUsers(users);

  createUserForm.reset();
  const roleName = roleVal === 'adm' ? 'Administrador' : 'Consulta';
  showCreateUserFeedback(`Usuário "${rawUsername}" (${roleName}) criado com sucesso!`, 'success');

  renderUsersList();
}

function showCreateUserFeedback(msg, type) {
  if (!createUserFeedback) return;
  createUserFeedback.textContent = msg;
  createUserFeedback.className = `form-feedback ${type === 'success' ? 'form-feedback-success' : 'form-feedback-error'}`;
  createUserFeedback.style.display = 'block';
}

function deleteUser(usernameToDelete) {
  const session = getCurrentSession();
  if (!session || session.role !== 'adm') {
    alert('Acesso negado: Somente administradores podem excluir usuários.');
    return;
  }
  if (usernameToDelete === 'samuel') {
    alert('O administrador mestre (samuel) não pode ser excluído.');
    return;
  }
  if (session.username === usernameToDelete) {
    alert('Você não pode excluir o usuário que está atualmente logado.');
    return;
  }
  const confirmDelete = confirm(`Tem certeza que deseja excluir o usuário "${usernameToDelete}"?`);
  if (!confirmDelete) return;

  let users = getUsers();
  users = users.filter(u => u.username !== usernameToDelete);
  saveUsers(users);

  showCreateUserFeedback(`Usuário "${usernameToDelete}" removido com sucesso.`, 'success');
  renderUsersList();
}

// Carregamento Consolidado de Dados (vehicles.json + indicadores.json)
async function loadData() {
  try {
    const [vehRes, indRes] = await Promise.all([
      fetch('data/vehicles.json'),
      fetch('data/indicadores.json').catch(() => null)
    ]);

    if (!vehRes.ok) throw new Error(`HTTP ${vehRes.status}`);
    allVehicles = await vehRes.json();

    if (indRes && indRes.ok) {
      indicadoresData = await indRes.json();
    }

    allVehicles.sort((a, b) => (a.placa || a.bem).localeCompare(b.placa || b.bem));

    if (badgeTotalFrota) {
      badgeTotalFrota.textContent = allVehicles.length.toLocaleString('pt-BR');
    }

    initFilters();
    applyFilters();
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
  }
}

function initFilters() {
  const filiais = [...new Set(allVehicles.map(v => v.filial).filter(Boolean))].sort();
  filiais.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = getFilialLabel(f);
    filialFilter.appendChild(opt);
  });

  const familias = [...new Set(allVehicles.map(v => v.familia || v.nome_bem).filter(Boolean))].sort();
  familias.slice(0, 60).forEach(fam => {
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

  setupMobileNavEvents();
}

function setMobileView(view) {
  const grid = document.getElementById('dashboardGrid');
  const tabList = document.getElementById('tabBtnList');
  const tabDetail = document.getElementById('tabBtnDetail');
  if (!grid || !tabList || !tabDetail) return;

  grid.setAttribute('data-mobile-view', view);
  if (view === 'detail') {
    tabList.classList.remove('active');
    tabDetail.classList.add('active');
    window.scrollTo({ top: grid.offsetTop - 12, behavior: 'smooth' });
  } else {
    tabDetail.classList.remove('active');
    tabList.classList.add('active');
    window.scrollTo({ top: grid.offsetTop - 12, behavior: 'smooth' });
  }
}

function setupMobileNavEvents() {
  const tabList = document.getElementById('tabBtnList');
  const tabDetail = document.getElementById('tabBtnDetail');
  if (tabList) tabList.addEventListener('click', () => setMobileView('list'));
  if (tabDetail) tabDetail.addEventListener('click', () => setMobileView('detail'));
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

    const cFicha = v.abastecimentos_count || 0;
    const cApp = v.abastecimentos_app_count || 0;

    if (status === 'alerta') {
      const isAlerta = (v.pos_contador === '1' || v.pos_contador === 1) && v.status_bem !== 'Não listado em ST9';
      if (!isAlerta) return false;
    } else if (status === 'abastecido') {
      if (cFicha === 0) return false;
    } else if (status === 'abastecido_app') {
      if (cApp === 0) return false;
    } else if (status === 'paralelo') {
      if (cFicha === 0 || cApp === 0) return false;
    } else if (status === 'so_ficha') {
      if (cFicha === 0 || cApp > 0) return false;
    } else if (status === 'so_app') {
      if (cApp === 0 || cFicha > 0) return false;
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

  const mobileCountBadge = document.getElementById('mobileCountBadge');
  if (mobileCountBadge) {
    mobileCountBadge.textContent = filteredVehicles.length;
  }

  if (filteredVehicles.length === 0) {
    vehicleList.innerHTML = `
      <div style="padding: 2rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
        Nenhum veículo encontrado para os filtros selecionados.
      </div>
    `;
    selectedVehicle = null;
    vehicleDetails.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  const toRender = filteredVehicles.slice(0, 100);
  toRender.forEach(v => {
    const card = document.createElement('div');
    card.className = `vehicle-card ${selectedVehicle && selectedVehicle.bem === v.bem ? 'active' : ''}`;

    const isAlerta = (v.pos_contador === '1' || v.pos_contador === 1) && v.status_bem !== 'Não listado em ST9';
    const alertBadge = isAlerta ? `<span class="badge badge-alert">Parado</span>` : '';
    const fichaBadge = v.abastecimentos_count > 0
      ? `<span class="badge badge-ficha-navy" title="Registros na Ficha Manual (_FC_)">${v.abastecimentos_count} Ficha</span>`
      : '';
    const appBadge = (v.abastecimentos_app_count || 0) > 0
      ? `<span class="badge badge-app-orange" title="Registros no Aplicativo Portal (_PA_)">${v.abastecimentos_app_count} App</span>`
      : '';

    const litFicha = v.total_litros ? v.total_litros.toLocaleString('pt-BR') + ' L' : '0 L';
    const litApp = v.total_litros_app ? v.total_litros_app.toLocaleString('pt-BR') + ' L' : '0 L';

    card.innerHTML = `
      <div class="card-top">
        <span class="vehicle-placa">${v.placa || v.bem}</span>
        <div style="display:flex; gap:0.22rem; flex-wrap:wrap; justify-content:flex-end;">
          <span class="badge badge-filial">${v.filial || '-'}</span>
          ${alertBadge}
          ${fichaBadge}
          ${appBadge}
        </div>
      </div>
      <div class="card-desc" title="${v.modelo || v.nome_bem || '-'}">
        ${v.modelo || v.nome_bem || 'Equipamento'}
      </div>
      <div class="card-footer">
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
          <span>Série: <strong>${v.serie || '-'}</strong></span>
        </div>
        <span title="Ficha (_FC_) vs Aplicativo (_PA_)">
          <strong style="color:#1a227d;">FC: ${litFicha}</strong> &bull; <strong style="color:#e56619;">PA: ${litApp}</strong>
        </span>
      </div>
    `;

    card.addEventListener('click', () => selectVehicle(v, card, true));
    vehicleList.appendChild(card);
  });

  const isSelectedInFiltered = selectedVehicle && filteredVehicles.some(v => v.bem === selectedVehicle.bem);
  if (!isSelectedInFiltered && toRender.length > 0) {
    selectVehicle(toRender[0], vehicleList.firstChild, false);
  }
}

function selectVehicle(v, cardEl, isUserTap = false) {
  selectedVehicle = v;

  document.querySelectorAll('.vehicle-card').forEach(c => c.classList.remove('active'));
  if (cardEl) cardEl.classList.add('active');

  const mobileDetailTabLabel = document.getElementById('mobileDetailTabLabel');
  if (mobileDetailTabLabel) {
    mobileDetailTabLabel.textContent = `Ficha: ${v.placa || v.bem}`;
  }

  renderVehicleDetails(v);

  if (isUserTap && window.innerWidth <= 768) {
    setMobileView('detail');
  }
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

  // Dados em Paralelo: Ficha Manual (_FC_) vs. Aplicativo Portal (_PA_)
  const countFicha = v.abastecimentos_count || 0;
  const litrosFicha = v.total_litros || 0;
  const countApp = v.abastecimentos_app_count || 0;
  const litrosApp = v.total_litros_app || 0;
  const diffLitros = typeof v.diferenca_litros === 'number' ? v.diferenca_litros : (litrosFicha - litrosApp);
  const taxaAdesao = typeof v.taxa_adesao_app === 'number' ? v.taxa_adesao_app : 0;
  const conciliacaoStatus = v.conciliacao_status || (countFicha > 0 && countApp > 0 ? 'Em Conciliação (Ficha + App)' : 'Sem Registro');

  const histFicha = Array.isArray(v.historico) ? v.historico : [];
  const histApp = Array.isArray(v.historico_app) ? v.historico_app : [];

  const ultFicha = histFicha.length > 0 ? `${histFicha[0].data} (${histFicha[0].litros?.toLocaleString('pt-BR')} L)` : 'Sem registro';
  const ultApp = histApp.length > 0 ? `${histApp[0].data} (${histApp[0].litros?.toLocaleString('pt-BR')} L)` : 'Sem registro';

  const consistentesCount = histFicha.filter(h => (h.validacao || '').toUpperCase().includes('CONSISTENTE') && !(h.validacao || '').toUpperCase().includes('INCONSISTENTE')).length;
  const divAppCount = histApp.filter(h => h.divergencia && h.divergencia !== 'Sem divergência').length;

  const totalCombinedVol = litrosFicha + litrosApp;
  const pctFichaBar = totalCombinedVol > 0 ? Math.round((litrosFicha / totalCombinedVol) * 100) : 50;
  const pctAppBar = totalCombinedVol > 0 ? (100 - pctFichaBar) : 50;

  // Construção da Tabela de Histórico ("Últimos Abastecimentos Registrados")
  let combinedRecords = [];
  if (activeHistorySource === 'ficha') {
    combinedRecords = histFicha.map(h => ({ ...h, _src: 'FICHA' }));
  } else if (activeHistorySource === 'app') {
    combinedRecords = histApp.map(h => ({ ...h, _src: 'APP' }));
  } else {
    combinedRecords = [
      ...histFicha.map(h => ({ ...h, _src: 'FICHA' })),
      ...histApp.map(h => ({ ...h, _src: 'APP' }))
    ];
  }

  const hasAnyRecord = (histFicha.length + histApp.length) > 0;

  let historyHtml = '';
  if (hasAnyRecord && combinedRecords.length > 0) {
    historyHtml = `
      <div class="history-header-row">
        <h3 class="section-title">Últimos Abastecimentos Registrados</h3>
        <div class="history-source-tabs">
          <button type="button" class="history-src-btn ${activeHistorySource === 'paralelo' ? 'active' : ''}" data-src="paralelo">
            Paralelo: Ficha + App (${histFicha.length + histApp.length})
          </button>
          <button type="button" class="history-src-btn ${activeHistorySource === 'ficha' ? 'active' : ''}" data-src="ficha">
            Ficha Manual _FC_ (${histFicha.length})
          </button>
          <button type="button" class="history-src-btn ${activeHistorySource === 'app' ? 'active' : ''}" data-src="app">
            Aplicativo _PA_ (${histApp.length})
          </button>
        </div>
      </div>
      <div class="history-container">
        <table class="history-table">
          <thead>
            <tr>
              <th>Origem</th>
              <th>Data</th>
              <th>Combustível</th>
              <th>Qtd. (L)</th>
              <th>Horímetro</th>
              <th>KM</th>
              <th>Motorista / Operador</th>
              <th>Frentista / Modalidade</th>
              <th>Status Auditoria / Conciliação</th>
            </tr>
          </thead>
          <tbody>
            ${combinedRecords.map(h => {
              const isApp = h._src === 'APP' || h.origem === 'APP';
              const srcBadge = isApp
                ? `<span class="badge badge-app-orange">APP (_PA_)</span>`
                : `<span class="badge badge-ficha-navy">FICHA (_FC_)</span>`;

              const resp = h.motorista || h.operador || '-';
              const frentMod = isApp
                ? `${h.modalidade || 'PORTAL'}`
                : `${h.frentista || '-'}${h.modalidade ? ' (' + h.modalidade + ')' : ''}`;

              let auditHtml = '';
              if (isApp) {
                const hasDiv = h.divergencia && h.divergencia !== 'Sem divergência';
                auditHtml = hasDiv
                  ? `<span class="badge badge-alert" title="${h.divergencia}">${h.status || 'Alerta'}: ${h.divergencia.slice(0, 38)}...</span>`
                  : `<span class="badge badge-ok">${h.status || 'Aprovado'} &bull; Concil: ${h.conciliacao_ficha || 'OK'}</span>`;
              } else {
                const isConsist = (h.validacao || '').toUpperCase() === 'CONSISTENTE';
                const valBadge = isConsist
                  ? `<span class="badge badge-ok">CONSISTENTE</span>`
                  : `<span class="badge badge-alert">${h.validacao || 'Pendente'}</span>`;
                const portBadge = (h.status_portal || '').includes('NÃO LOCALIZADO')
                  ? `<span class="badge" style="background:#fee2e2;color:#991b1b;">Não Loc. Portal</span>`
                  : (h.status_portal ? `<span class="badge badge-ok">${h.status_portal}</span>` : '');
                auditHtml = `${valBadge} ${portBadge}`;
              }

              return `
                <tr>
                  <td>${srcBadge}</td>
                  <td><strong>${h.data_hora || h.data || '-'}</strong></td>
                  <td>${h.combustivel || '-'}</td>
                  <td><strong>${h.litros ? h.litros.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'} L</strong></td>
                  <td>${h.horimetro || '-'}</td>
                  <td>${h.km || '-'}</td>
                  <td>${resp}</td>
                  <td>${frentMod}</td>
                  <td>${auditHtml}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (hasAnyRecord && combinedRecords.length === 0) {
    historyHtml = `
      <div class="history-header-row">
        <h3 class="section-title">Últimos Abastecimentos Registrados</h3>
        <div class="history-source-tabs">
          <button type="button" class="history-src-btn ${activeHistorySource === 'paralelo' ? 'active' : ''}" data-src="paralelo">
            Paralelo: Ficha + App (${histFicha.length + histApp.length})
          </button>
          <button type="button" class="history-src-btn ${activeHistorySource === 'ficha' ? 'active' : ''}" data-src="ficha">
            Ficha Manual _FC_ (${histFicha.length})
          </button>
          <button type="button" class="history-src-btn ${activeHistorySource === 'app' ? 'active' : ''}" data-src="app">
            Aplicativo _PA_ (${histApp.length})
          </button>
        </div>
      </div>
      <div style="padding: 1.5rem; text-align: center; background: var(--bg-main); border-radius: var(--radius-md); border: 1px dashed var(--border); color: var(--text-muted);">
        <strong style="display: block; font-size: 1rem; color: var(--text-main); margin-bottom: 0.35rem;">Nenhum nesta origem</strong>
        Não há registros na fonte selecionada (${activeHistorySource === 'ficha' ? 'Ficha Manual' : 'Aplicativo'}). Alterne para "Paralelo: Ficha + App".
      </div>
    `;
  } else {
    historyHtml = `
      <h3 class="section-title">Últimos Abastecimentos Registrados</h3>
      <div style="padding: 1.5rem; text-align: center; background: var(--bg-main); border-radius: var(--radius-md); border: 1px dashed var(--border); color: var(--text-muted);">
        <strong style="display: block; font-size: 1rem; color: var(--text-main); margin-bottom: 0.35rem;">Nenhum</strong>
        Nenhum registro de abastecimento localizado para este veículo (nem na Ficha Manual nem no Aplicativo) no período analisado.
      </div>
    `;
  }

  vehicleDetails.innerHTML = `
    <div class="mobile-back-bar">
      <button type="button" class="btn-back-to-list" id="btnBackToList">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>&larr; Voltar para a Lista de Veículos</span>
      </button>
    </div>
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

    <!-- KPIs Técnicos Principais -->
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
        <span class="kpi-title">Total Abastecido (Ficha)</span>
        <span class="kpi-value">${litrosFicha ? litrosFicha.toLocaleString('pt-BR') + ' L' : '0 L'}</span>
        <span class="kpi-subtext">${countFicha > 0 ? `${countFicha} abastecimento(s)` : 'Nenhum'}</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-title">Centro de Custo</span>
        <span class="kpi-value" style="font-size: 1.15rem;">${v.centro_custo || 'Não vinculado'}</span>
        <span class="kpi-subtext">Família: ${v.familia || '-'}</span>
      </div>
    </div>

    <!-- PAINEL EM PARALELO: INDICADORES DE ABASTECIMENTO DA FICHA (_FC_) E DO APLICATIVO (_PA_) -->
    <div class="parallel-section-box">
      <div class="parallel-header">
        <h3>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          Indicadores de Abastecimento em Paralelo: Ficha Manual (_FC_) vs. Aplicativo (_PA_)
        </h3>
        <span class="badge ${countFicha > 0 && countApp > 0 ? 'badge-audit-green' : 'badge-filial'}">${conciliacaoStatus}</span>
      </div>

      <div class="parallel-grid">
        <!-- Coluna 1: Ficha Manual (_FC_) -->
        <div class="parallel-col parallel-col-ficha">
          <div class="parallel-col-title">
            <span>1. Ficha Manual (_FC_)</span>
            <span class="badge badge-ficha-navy">Planilha Física</span>
          </div>
          <div class="parallel-metrics-row">
            <div>
              <span class="parallel-metric-label">Volume Ficha (L)</span>
              <span class="parallel-metric-val">${litrosFicha.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L</span>
            </div>
            <div>
              <span class="parallel-metric-label">Qtd. Registros</span>
              <span class="parallel-metric-val">${countFicha} abast.</span>
            </div>
          </div>
          <div class="parallel-foot-note">
            Último: <strong>${ultFicha}</strong> &bull; Consistentes: <strong>${consistentesCount}/${countFicha}</strong>
          </div>
        </div>

        <!-- Coluna 2: Aplicativo / Portal Almoxarifado (_PA_) -->
        <div class="parallel-col parallel-col-app">
          <div class="parallel-col-title">
            <span>2. Aplicativo Mobile (_PA_)</span>
            <span class="badge badge-app-orange">Portal Almox.</span>
          </div>
          <div class="parallel-metrics-row">
            <div>
              <span class="parallel-metric-label">Volume App (L)</span>
              <span class="parallel-metric-val">${litrosApp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L</span>
            </div>
            <div>
              <span class="parallel-metric-label">Qtd. Registros</span>
              <span class="parallel-metric-val">${countApp} abast.</span>
            </div>
          </div>
          <div class="parallel-foot-note">
            Último: <strong>${ultApp}</strong> &bull; Alertas Lacre/Cad: <strong>${divAppCount}</strong>
          </div>
        </div>

        <!-- Coluna 3: Conciliação & Divergência Paralela -->
        <div class="parallel-col parallel-col-audit">
          <div class="parallel-col-title">
            <span>3. Auditoria & Conciliação</span>
            <span class="badge ${Math.abs(diffLitros) < 1 ? 'badge-audit-green' : 'badge-audit-red'}">
              ${Math.abs(diffLitros) < 1 ? 'Conciliado' : 'Divergência'}
            </span>
          </div>
          <div class="parallel-metrics-row">
            <div>
              <span class="parallel-metric-label">Diferença (Ficha - App)</span>
              <span class="parallel-metric-val" style="color:${Math.abs(diffLitros) > 0.5 ? '#c02626' : '#2d8c56'};">
                ${diffLitros > 0 ? '+' : ''}${diffLitros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L
              </span>
            </div>
            <div>
              <span class="parallel-metric-label">Índice Adesão App</span>
              <span class="parallel-metric-val">${taxaAdesao.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%</span>
            </div>
          </div>
          <div class="parallel-foot-note">
            Confronto direto entre lançamentos de campo (_FC_) e aplicativo (_PA_)
          </div>
        </div>
      </div>

      <div class="parallel-bar-wrap">
        <div class="parallel-bar-labels">
          <span style="color:#1a227d;">Ficha Manual (_FC_): ${litrosFicha.toLocaleString('pt-BR')} L (${pctFichaBar}%)</span>
          <span style="color:#e56619;">Aplicativo Portal (_PA_): ${litrosApp.toLocaleString('pt-BR')} L (${pctAppBar}%)</span>
        </div>
        <div class="parallel-bar-track">
          <div class="parallel-bar-fill-ficha" style="width:${pctFichaBar}%;"></div>
          <div class="parallel-bar-fill-app" style="width:${pctAppBar}%;"></div>
        </div>
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

  const btnBackToList = document.getElementById('btnBackToList');
  if (btnBackToList) {
    btnBackToList.addEventListener('click', () => setMobileView('list'));
  }

  // Botões de filtro de origem nos Últimos Abastecimentos Registrados
  vehicleDetails.querySelectorAll('.history-src-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      activeHistorySource = e.currentTarget.getAttribute('data-src') || 'paralelo';
      renderVehicleDetails(v);
    });
  });
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
• *Abastecimento Ficha (_FC_):* ${v.total_litros ? v.total_litros.toLocaleString('pt-BR') + ' L' : '0 L'} (${v.abastecimentos_count || 0} reg.)
• *Abastecimento App (_PA_):* ${v.total_litros_app ? v.total_litros_app.toLocaleString('pt-BR') + ' L' : '0 L'} (${v.abastecimentos_app_count || 0} reg.)
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

/* =========================================================================
   GUIA 2: DASHBOARD EXECUTIVO & INDICADORES (AUDITORIA CONSOLIDADA)
   Baseado nas abas INDICADORES e DASHBOARD da planilha Google Sheets
   ========================================================================= */

function setupExecutiveDashboardEvents() {
  const execFilialFilter = document.getElementById('execFilialFilter');
  if (execFilialFilter) {
    execFilialFilter.addEventListener('change', () => {
      renderExecutiveDashboard();
    });
  }

  const pillsContainer = document.getElementById('execSectionPills');
  if (pillsContainer) {
    pillsContainer.querySelectorAll('.exec-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        pillsContainer.querySelectorAll('.exec-pill').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const sec = e.currentTarget.getAttribute('data-sec');
        document.querySelectorAll('#guiaDashboardView .exec-block').forEach(blk => {
          if (sec === 'all' || blk.getAttribute('data-block') === sec) {
            blk.style.display = 'flex';
          } else {
            blk.style.display = 'none';
          }
        });
      });
    });
  }

  const btnExportAuditCsv = document.getElementById('btnExportAuditCsv');
  if (btnExportAuditCsv) {
    btnExportAuditCsv.addEventListener('click', exportAuditTablesToCsv);
  }

  const btnPrintDashboard = document.getElementById('btnPrintDashboard');
  if (btnPrintDashboard) {
    btnPrintDashboard.addEventListener('click', () => window.print());
  }
}

function fmtPtBr(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '0,00';
  return Number(num).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function fmtIntPtBr(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(Number(num)).toLocaleString('pt-BR');
}

function renderPlacaBadge(placa) {
  if (!placa || placa === '-') return '-';
  return `<button type="button" class="placa-link" onclick="window.jumpToVehiclePlaca('${placa}')" title="Abrir Ficha Técnica e Auditoria da placa ${placa}">🔍 ${placa}</button>`;
}

function renderExecutiveDashboard() {
  if (!indicadoresData) return;
  const filialSel = document.getElementById('execFilialFilter')?.value || 'TODAS';

  renderExecutiveKPIs(filialSel);
  renderExecutiveCharts(filialSel);
  renderExecutiveAuditableTables(filialSel);
}

function renderExecutiveKPIs(filialSel) {
  const grid = document.getElementById('execKpisGrid');
  if (!grid || !indicadoresData) return;

  const k = indicadoresData.kpis_globais;
  const filRow = filialSel !== 'TODAS'
    ? indicadoresData.desempenho_filiais.find(f => f.cod_filial === filialSel)
    : null;
  const audRow = filialSel !== 'TODAS'
    ? indicadoresData.auditoria_conciliacao.find(f => f.cod_filial === filialSel)
    : indicadoresData.total_rede_auditoria;

  const abast = filRow ? filRow.abastecimentos_fmt : k.total_abastecimentos_fmt;
  const frota = filRow ? filRow.veiculos_distintos_fmt : k.frota_ativa_total_fmt;
  const volFicha = filRow ? filRow.volume_fichas_fmt : k.volume_total_abastecido_fmt;
  const volPortal = filRow ? filRow.volume_portal_fmt : k.volume_total_portal_fmt;
  const diffVol = filRow
    ? fmtPtBr(filRow.volume_fichas - filRow.volume_portal)
    : fmtPtBr(k.volume_total_abastecido - k.volume_total_portal);
  const kmTotal = filRow ? filRow.total_km_fmt : k.total_km_percorrido_fmt;
  const horasTotal = filRow ? filRow.total_horas_fmt : k.total_horas_trabalhadas_fmt;
  const eficApp = filRow ? filRow.taxa_eficiencia_app_fmt : k.taxa_media_eficiencia_app_fmt;
  const consist = filRow ? filRow.taxa_consistencia_fmt : k.taxa_media_consistencia_fmt;
  const adesao = filRow ? filRow.taxa_adesao_portal_fmt : k.taxa_media_adesao_portal_fmt;
  const saldoKmL = filRow ? filRow.saldo_km_l_fmt : k.saldo_global_km_l_fmt;
  const frentAtivos = filRow ? String(filRow.frentistas_ativos) : k.total_frentistas_ativos_fmt;

  grid.innerHTML = `
    <div class="exec-kpi-card">
      <span class="exec-kpi-label">Total de Abastecimentos</span>
      <span class="exec-kpi-val">${abast}</span>
      <span class="exec-kpi-sub">${filialSel === 'TODAS' ? 'Consolidado 6 Filiais' : `Filial ${filialSel}`}</span>
    </div>
    <div class="exec-kpi-card kpi-sky">
      <span class="exec-kpi-label">Frota Ativa Abastecida</span>
      <span class="exec-kpi-val">${frota} veíc.</span>
      <span class="exec-kpi-sub">Base Total: ${allVehicles.length} cadastrados</span>
    </div>
    <div class="exec-kpi-card">
      <span class="exec-kpi-label">Volume Fichas (_FC_)</span>
      <span class="exec-kpi-val" style="color:#1a227d;">${volFicha} L</span>
      <span class="exec-kpi-sub">Part. Rede: ${filRow ? filRow.part_fichas_fmt : '100,00%'}</span>
    </div>
    <div class="exec-kpi-card kpi-orange">
      <span class="exec-kpi-label">Volume App Portal (_PA_)</span>
      <span class="exec-kpi-val" style="color:#e56619;">${volPortal} L</span>
      <span class="exec-kpi-sub">Reg. App: ${audRow ? audRow.registros_portal_app_fmt : '2.518'} lançamentos</span>
    </div>
    <div class="exec-kpi-card kpi-red">
      <span class="exec-kpi-label">Gap Volume (Ficha - App)</span>
      <span class="exec-kpi-val" style="color:#c02626;">${diffVol} L</span>
      <span class="exec-kpi-sub">Não loc. Portal: ${audRow ? audRow.fichas_nao_localizadas_portal_fmt : '3.795'} fichas</span>
    </div>
    <div class="exec-kpi-card kpi-green">
      <span class="exec-kpi-label">Taxa Média Consistência</span>
      <span class="exec-kpi-val" style="color:#2d8c56;">${consist}</span>
      <span class="exec-kpi-sub">Fichas Consistentes: ${audRow ? audRow.fichas_consistentes_fmt : '3.522'}</span>
    </div>
    <div class="exec-kpi-card kpi-orange">
      <span class="exec-kpi-label">Taxa Adesão & Efic. App</span>
      <span class="exec-kpi-val">${adesao}</span>
      <span class="exec-kpi-sub">Eficiência App: ${eficApp}</span>
    </div>
    <div class="exec-kpi-card kpi-gold">
      <span class="exec-kpi-label">Total KM Percorrido</span>
      <span class="exec-kpi-val">${kmTotal}</span>
      <span class="exec-kpi-sub">Horas Trab: ${horasTotal} h</span>
    </div>
    <div class="exec-kpi-card kpi-red">
      <span class="exec-kpi-label">Saldo Global KM/L</span>
      <span class="exec-kpi-val">${saldoKmL} L</span>
      <span class="exec-kpi-sub">Frentistas Ativos: ${frentAtivos}</span>
    </div>
  `;
}

function destroyExecChart(id) {
  if (execChartInstances[id]) {
    execChartInstances[id].destroy();
    delete execChartInstances[id];
  }
}

function createExecChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === 'undefined') return;
  destroyExecChart(id);
  execChartInstances[id] = new Chart(canvas.getContext('2d'), config);
}

function renderExecutiveCharts(filialSel) {
  if (!indicadoresData || typeof Chart === 'undefined') return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (document.documentElement.getAttribute('data-theme') === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const textColor = isDark ? '#cbd5e1' : '#334155';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(226, 232, 240, 0.85)';

  Chart.defaults.color = textColor;
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 11;

  const filiaisDesempenho = filialSel === 'TODAS'
    ? indicadoresData.desempenho_filiais
    : indicadoresData.desempenho_filiais.filter(f => f.cod_filial === filialSel);

  const filiaisEficiencia = filialSel === 'TODAS'
    ? indicadoresData.eficiencia_combustivel
    : indicadoresData.eficiencia_combustivel.filter(f => f.cod_filial === filialSel);

  const filiaisAuditoria = filialSel === 'TODAS'
    ? indicadoresData.auditoria_conciliacao
    : indicadoresData.auditoria_conciliacao.filter(f => f.cod_filial === filialSel);

  const filiaisStatusPortal = filialSel === 'TODAS'
    ? indicadoresData.auditoria_status_portal_filial.filter(f => f.cod_filial !== '0106')
    : indicadoresData.auditoria_status_portal_filial.filter(f => f.cod_filial === filialSel);

  // 1. Volume Abastecido por Filial: Fichas (_FC_) vs. Portal (_PA_)
  createExecChart('chartVolFichaVsPortal', {
    type: 'bar',
    data: {
      labels: filiaisDesempenho.map(f => f.nome_filial),
      datasets: [
        {
          label: 'Volume Fichas (_FC_) (Litros)',
          data: filiaisDesempenho.map(f => f.volume_fichas),
          backgroundColor: SHEET_COLORS.navyFicha,
          borderRadius: 4
        },
        {
          label: 'Volume Portal (_PA_) (Litros)',
          data: filiaisDesempenho.map(f => f.volume_portal),
          backgroundColor: SHEET_COLORS.orangePortal,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { grid: { color: gridColor } },
        y: { grid: { color: gridColor }, beginAtZero: true }
      }
    }
  });

  // 2. Volume Abastecido (L) vs. Taxa de Adesão ao Portal (%) (Combo Chart)
  createExecChart('chartVolVsAdesao', {
    type: 'bar',
    data: {
      labels: filiaisDesempenho.map(f => f.cod_filial),
      datasets: [
        {
          type: 'bar',
          label: 'Volume Fichas (_FC_) (L)',
          data: filiaisDesempenho.map(f => f.volume_fichas),
          backgroundColor: SHEET_COLORS.navyFicha,
          yAxisID: 'y',
          borderRadius: 4
        },
        {
          type: 'line',
          label: 'Taxa Consistência (%)',
          data: filiaisDesempenho.map(f => f.taxa_consistencia_pct),
          borderColor: SHEET_COLORS.greenScp,
          backgroundColor: SHEET_COLORS.greenScp,
          borderWidth: 2.5,
          tension: 0.3,
          yAxisID: 'y1'
        },
        {
          type: 'line',
          label: 'Taxa Adesão Portal (%)',
          data: filiaisDesempenho.map(f => f.taxa_adesao_portal_pct),
          borderColor: SHEET_COLORS.orangePortal,
          backgroundColor: SHEET_COLORS.orangePortal,
          borderWidth: 2.5,
          tension: 0.3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: gridColor } },
        y: { type: 'linear', position: 'left', beginAtZero: true, grid: { color: gridColor } },
        y1: { type: 'linear', position: 'right', beginAtZero: true, max: 105, grid: { drawOnChartArea: false } }
      }
    }
  });

  // 3. Comparativo de Registros: Qtd Fichas Manual vs. Qtd App Portal
  createExecChart('chartQtdFichaVsPortal', {
    type: 'bar',
    data: {
      labels: filiaisStatusPortal.map(f => `Filial ${f.cod_filial}`),
      datasets: [
        {
          label: 'Qtd. Fichas (_FC_)',
          data: filiaisStatusPortal.map(f => f.qtd_fichas),
          backgroundColor: SHEET_COLORS.steelFicha,
          borderRadius: 4
        },
        {
          label: 'Qtd. Portal App (_PA_)',
          data: filiaisStatusPortal.map(f => f.qtd_portal),
          backgroundColor: SHEET_COLORS.orangePortal,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: gridColor } },
        y: { beginAtZero: true, grid: { color: gridColor } }
      }
    }
  });

  // 4. Auditoria de Conciliação: Status das Fichas vs. Portal
  createExecChart('chartStatusConciliacao', {
    type: 'bar',
    data: {
      labels: filiaisAuditoria.map(f => f.cod_filial),
      datasets: [
        {
          label: 'Fichas Consistentes',
          data: filiaisAuditoria.map(f => f.fichas_consistentes),
          backgroundColor: SHEET_COLORS.greenScp
        },
        {
          label: 'Fichas Inconsistentes',
          data: filiaisAuditoria.map(f => f.fichas_inconsistentes),
          backgroundColor: SHEET_COLORS.dieselGold
        },
        {
          label: 'Localizadas no Portal',
          data: filiaisAuditoria.map(f => f.fichas_localizadas_portal),
          backgroundColor: SHEET_COLORS.arlaBlue
        },
        {
          label: 'Não Localizadas no Portal',
          data: filiaisAuditoria.map(f => f.fichas_nao_localizadas_portal),
          backgroundColor: SHEET_COLORS.darkRed
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: gridColor } },
        y: { stacked: true, grid: { color: gridColor } }
      }
    }
  });

  // 5. Evolução Mensal: Fichas (_FC_) vs. Portal (_PA_)
  const mensalFP = indicadoresData.evolucao_mensal_ficha_portal || [];
  createExecChart('chartMensalFichaPortal', {
    type: 'bar',
    data: {
      labels: mensalFP.map(m => m.mes_ano),
      datasets: [
        {
          label: '1_FC_FICHAS (Litros)',
          data: mensalFP.map(m => m.fichas),
          backgroundColor: SHEET_COLORS.navyFicha,
          borderRadius: 5
        },
        {
          label: '2_PA_PORTAL (Litros)',
          data: mensalFP.map(m => m.portal),
          backgroundColor: SHEET_COLORS.orangePortal,
          borderRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: gridColor } },
        y: { beginAtZero: true, grid: { color: gridColor } }
      }
    }
  });

  // 6. Auditoria Comparativa Empilhada Lado a Lado: Fichas (_FC_) vs. Portal (_PA_)
  const empData = filialSel === 'TODAS'
    ? indicadoresData.auditoria_empilhada
    : indicadoresData.auditoria_empilhada.filter(x => x.filial_tipo.startsWith(filialSel));

  createExecChart('chartAuditoriaEmpilhada', {
    type: 'bar',
    data: {
      labels: empData.map(x => x.filial_tipo),
      datasets: [
        {
          label: 'Consistentes / No Portal',
          data: empData.map(x => x.fichas_consistentes),
          backgroundColor: SHEET_COLORS.steelFicha
        },
        {
          label: 'Inconsistentes / Divergentes',
          data: empData.map(x => x.fichas_inconsistentes),
          backgroundColor: SHEET_COLORS.orangePortal
        },
        {
          label: 'Localizadas / Conciliadas',
          data: empData.map(x => x.fichas_localizadas_portal),
          backgroundColor: SHEET_COLORS.greenScp
        },
        {
          label: 'Não Localizadas / Duplicados',
          data: empData.map(x => x.fichas_nao_localizadas_portal),
          backgroundColor: SHEET_COLORS.darkRed
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: gridColor } },
        y: { stacked: true, beginAtZero: true, grid: { color: gridColor } }
      }
    }
  });

  // 7. Matriz Energética: Consumo por Combustível e Filial (Litros)
  createExecChart('chartMatrizFilial', {
    type: 'bar',
    data: {
      labels: filiaisEficiencia.map(f => f.cod_filial),
      datasets: [
        {
          label: 'Diesel (L)',
          data: filiaisEficiencia.map(f => f.diesel_litros),
          backgroundColor: SHEET_COLORS.dieselGold
        },
        {
          label: 'Gasolina (L)',
          data: filiaisEficiencia.map(f => f.gasolina_litros),
          backgroundColor: SHEET_COLORS.gasolinaCoral
        },
        {
          label: 'Arla 32 (L)',
          data: filiaisEficiencia.map(f => f.arla_litros),
          backgroundColor: SHEET_COLORS.arlaBlue
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: gridColor } },
        y: { stacked: true, beginAtZero: true, grid: { color: gridColor } }
      }
    }
  });

  // 8. Sazonalidade: Consumo por Dia da Semana (1=Dom a 7=Sáb)
  const diaSem = indicadoresData.consumo_dia_semana || [];
  createExecChart('chartDiaSemanaComb', {
    type: 'bar',
    data: {
      labels: diaSem.map(d => d.dia_semana),
      datasets: [
        {
          label: 'DIESEL (L)',
          data: diaSem.map(d => d.diesel),
          backgroundColor: SHEET_COLORS.dieselGold
        },
        {
          label: 'GASOLINA (L)',
          data: diaSem.map(d => d.gasolina),
          backgroundColor: SHEET_COLORS.gasolinaCoral
        },
        {
          label: 'ARLA 32 (L)',
          data: diaSem.map(d => d.arla),
          backgroundColor: SHEET_COLORS.arlaBlue
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: gridColor } },
        y: { stacked: true, beginAtZero: true, grid: { color: gridColor } }
      }
    }
  });

  // 9. Evolução Mensal Consolidada por Combustível
  const mensalComb = indicadoresData.evolucao_mensal_combustivel || [];
  createExecChart('chartMensalComb', {
    type: 'bar',
    data: {
      labels: mensalComb.map(m => m.mes_ano),
      datasets: [
        {
          label: 'DIESEL',
          data: mensalComb.map(m => m.diesel),
          backgroundColor: SHEET_COLORS.dieselGold
        },
        {
          label: 'GASOLINA',
          data: mensalComb.map(m => m.gasolina),
          backgroundColor: SHEET_COLORS.gasolinaCoral
        },
        {
          label: 'ARLA',
          data: mensalComb.map(m => m.arla),
          backgroundColor: SHEET_COLORS.arlaBlue
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: gridColor } },
        y: { beginAtZero: true, grid: { color: gridColor } }
      }
    }
  });

  // 10. Evolução Diária do Consumo por Combustível (01/10 a 04/11)
  const evoDiaria = indicadoresData.evolucao_diaria_combustivel || [];
  createExecChart('chartEvolucaoDiariaComb', {
    type: 'line',
    data: {
      labels: evoDiaria.map(d => d.data),
      datasets: [
        {
          label: 'DIESEL (L)',
          data: evoDiaria.map(d => d.diesel),
          borderColor: SHEET_COLORS.dieselGold,
          backgroundColor: 'rgba(242, 165, 12, 0.15)',
          borderWidth: 2.5,
          tension: 0.25,
          fill: true
        },
        {
          label: 'GASOLINA (L)',
          data: evoDiaria.map(d => d.gasolina),
          borderColor: SHEET_COLORS.gasolinaCoral,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.25
        },
        {
          label: 'ARLA (L)',
          data: evoDiaria.map(d => d.arla),
          borderColor: SHEET_COLORS.arlaBlue,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: gridColor } },
        y: { beginAtZero: true, grid: { color: gridColor } }
      }
    }
  });

  // 11 & 12. Sazonalidade Semanal 3 Fontes (Ficha vs. Portal vs. SCP) - Diesel & Gasolina
  const sem3 = indicadoresData.comparativo_dia_semana_fontes || [];
  createExecChart('chartSemanalDiesel3Fontes', {
    type: 'bar',
    data: {
      labels: sem3.map(d => d.dia_semana),
      datasets: [
        { label: 'Ficha (_FC_) - Diesel', data: sem3.map(d => d.ficha_diesel), backgroundColor: SHEET_COLORS.steelFicha },
        { label: 'Portal (_PA_) - Diesel', data: sem3.map(d => d.portal_diesel), backgroundColor: SHEET_COLORS.orangePortal },
        { label: 'SCP - Diesel', data: sem3.map(d => d.scp_diesel), backgroundColor: SHEET_COLORS.greenScp }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { grid: { color: gridColor } }, y: { beginAtZero: true, grid: { color: gridColor } } }
    }
  });

  createExecChart('chartSemanalGasolina3Fontes', {
    type: 'bar',
    data: {
      labels: sem3.map(d => d.dia_semana),
      datasets: [
        { label: 'Ficha (_FC_) - Gasolina', data: sem3.map(d => d.ficha_gasolina), backgroundColor: SHEET_COLORS.steelFicha },
        { label: 'Portal (_PA_) - Gasolina', data: sem3.map(d => d.portal_gasolina), backgroundColor: SHEET_COLORS.orangePortal },
        { label: 'SCP - Gasolina', data: sem3.map(d => d.scp_gasolina), backgroundColor: SHEET_COLORS.greenScp }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { grid: { color: gridColor } }, y: { beginAtZero: true, grid: { color: gridColor } } }
    }
  });

  // 13 & 14. Evolução Diária 3 Fontes (Ficha vs. Portal vs. SCP) - Diesel & Gasolina
  const dia3 = indicadoresData.comparativo_evolucao_diaria_fontes || [];
  createExecChart('chartDiarioDiesel3Fontes', {
    type: 'line',
    data: {
      labels: dia3.map(d => d.data),
      datasets: [
        { label: 'Ficha (_FC_) - Diesel', data: dia3.map(d => d.ficha_diesel), borderColor: SHEET_COLORS.steelFicha, borderWidth: 2.2, tension: 0.25 },
        { label: 'Portal (_PA_) - Diesel', data: dia3.map(d => d.portal_diesel), borderColor: SHEET_COLORS.orangePortal, borderWidth: 2.2, tension: 0.25 },
        { label: 'SCP - Diesel', data: dia3.map(d => d.scp_diesel), borderColor: SHEET_COLORS.greenScp, borderWidth: 2.2, tension: 0.25 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { grid: { color: gridColor } }, y: { beginAtZero: true, grid: { color: gridColor } } }
    }
  });

  createExecChart('chartDiarioGasolina3Fontes', {
    type: 'line',
    data: {
      labels: dia3.map(d => d.data),
      datasets: [
        { label: 'Ficha (_FC_) - Gasolina', data: dia3.map(d => d.ficha_gasolina), borderColor: SHEET_COLORS.steelFicha, borderWidth: 2.2, tension: 0.25 },
        { label: 'Portal (_PA_) - Gasolina', data: dia3.map(d => d.portal_gasolina), borderColor: SHEET_COLORS.orangePortal, borderWidth: 2.2, tension: 0.25 },
        { label: 'SCP - Gasolina', data: dia3.map(d => d.scp_gasolina), borderColor: SHEET_COLORS.greenScp, borderWidth: 2.2, tension: 0.25 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { grid: { color: gridColor } }, y: { beginAtZero: true, grid: { color: gridColor } } }
    }
  });

  // 15. Top 10 Veículos Maiores Consumidores da Rede
  const top10Cons = indicadoresData.top10_maiores_consumidores || [];
  createExecChart('chartTop10Consumidores', {
    type: 'bar',
    data: {
      labels: top10Cons.map(v => v.placa),
      datasets: [
        {
          label: 'Total Litros Abastecidos (L)',
          data: top10Cons.map(v => v.total_litros),
          backgroundColor: SHEET_COLORS.navyFicha,
          borderRadius: 4
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          jumpToVehiclePlaca(top10Cons[idx]?.placa);
        }
      },
      scales: { x: { beginAtZero: true, grid: { color: gridColor } }, y: { grid: { color: gridColor } } }
    }
  });

  // 16. Top 10 Placas com Divergência de Volume (Fichas vs. Portal)
  const top10DivPlacas = indicadoresData.top10_divergencia_placas || [];
  createExecChart('chartTop10DivergenciaPlacas', {
    type: 'bar',
    data: {
      labels: top10DivPlacas.map(p => p.placa),
      datasets: [
        { label: 'Litros Fichas (_FC_)', data: top10DivPlacas.map(p => p.litros_fichas), backgroundColor: SHEET_COLORS.steelFicha },
        { label: 'Litros Portal (_PA_)', data: top10DivPlacas.map(p => p.litros_portal), backgroundColor: SHEET_COLORS.orangePortal },
        { label: 'Diferença (L)', data: top10DivPlacas.map(p => p.diferenca), backgroundColor: SHEET_COLORS.darkRed }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          jumpToVehiclePlaca(top10DivPlacas[idx]?.placa);
        }
      },
      scales: { x: { grid: { color: gridColor } }, y: { grid: { color: gridColor } } }
    }
  });

  // 17. Top 10 Veículos Ofensores no Portal (Qtd. Alertas/Divergências)
  const top10OfPortal = indicadoresData.top10_ofensores_portal || [];
  createExecChart('chartTop10OfensoresPortal', {
    type: 'bar',
    data: {
      labels: top10OfPortal.map(p => `${p.placa} (${p.filial})`),
      datasets: [
        {
          label: 'Qtd. Divergências no Portal',
          data: top10OfPortal.map(p => p.qtd_divergencias),
          backgroundColor: SHEET_COLORS.alertRed,
          borderRadius: 4
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          jumpToVehiclePlaca(top10OfPortal[idx]?.placa);
        }
      },
      scales: { x: { beginAtZero: true, grid: { color: gridColor } }, y: { grid: { color: gridColor } } }
    }
  });

  // 18. Share de Volume por Modalidade (Interno vs. Comboio)
  const modData = indicadoresData.desempenho_modalidade || [];
  createExecChart('chartModalidadeDonut', {
    type: 'doughnut',
    data: {
      labels: modData.map(m => `${m.modalidade} (${m.total_litros_fmt} L)`),
      datasets: [
        {
          data: modData.map(m => m.total_litros),
          backgroundColor: [SHEET_COLORS.navyFicha, SHEET_COLORS.orangePortal, SHEET_COLORS.greenScp],
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // 19. Top 10 Operações / Equipamentos Consumidores (Litros)
  const top10Op = indicadoresData.top10_operacoes_equipamentos || [];
  createExecChart('chartTop10Operacoes', {
    type: 'bar',
    data: {
      labels: top10Op.map(o => o.equipamento_operacao.slice(0, 28)),
      datasets: [
        {
          label: 'Total Litros (L)',
          data: top10Op.map(o => o.total_litros),
          backgroundColor: SHEET_COLORS.slateBar,
          borderRadius: 4
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { beginAtZero: true, grid: { color: gridColor } }, y: { grid: { color: gridColor } } }
    }
  });

  // 20, 21, 22. Top 10 Centros de Custo por Combustível (Diesel, Gasolina, Arla 32)
  const ccDiesel = indicadoresData.centro_custo_combustivel?.diesel || [];
  createExecChart('chartCCDiesel', {
    type: 'bar',
    data: {
      labels: ccDiesel.map(c => c.label.slice(0, 28)),
      datasets: [{ label: 'Litros Diesel', data: ccDiesel.map(c => c.litros), backgroundColor: SHEET_COLORS.steelFicha, borderRadius: 4 }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, grid: { color: gridColor } }, y: { grid: { color: gridColor } } } }
  });

  const ccGas = indicadoresData.centro_custo_combustivel?.gasolina || [];
  createExecChart('chartCCGasolina', {
    type: 'bar',
    data: {
      labels: ccGas.map(c => c.label.slice(0, 28)),
      datasets: [{ label: 'Litros Gasolina', data: ccGas.map(c => c.litros), backgroundColor: SHEET_COLORS.orangePortal, borderRadius: 4 }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, grid: { color: gridColor } }, y: { grid: { color: gridColor } } } }
  });

  const ccArla = indicadoresData.centro_custo_combustivel?.arla || [];
  createExecChart('chartCCArla', {
    type: 'bar',
    data: {
      labels: ccArla.map(c => c.label.slice(0, 28)),
      datasets: [{ label: 'Litros Arla 32', data: ccArla.map(c => c.litros), backgroundColor: SHEET_COLORS.greenScp, borderRadius: 4 }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, grid: { color: gridColor } }, y: { grid: { color: gridColor } } } }
  });

  // 23. Ranking de Frentistas: Litros Fichas (_FC_) vs. Litros Portal (_PA_) e Divergências
  const frentList = filialSel === 'TODAS'
    ? indicadoresData.ranking_frentistas
    : indicadoresData.ranking_frentistas.filter(f => f.filial === filialSel || f.frentista.startsWith(filialSel));

  createExecChart('chartRankingFrentistas', {
    type: 'bar',
    data: {
      labels: frentList.map(f => f.frentista),
      datasets: [
        {
          type: 'bar',
          label: 'Litros Fichas (_FC_)',
          data: frentList.map(f => f.litros_fichas),
          backgroundColor: SHEET_COLORS.steelFicha,
          yAxisID: 'y',
          borderRadius: 4
        },
        {
          type: 'bar',
          label: 'Litros Portal (_PA_)',
          data: frentList.map(f => f.litros_portal),
          backgroundColor: SHEET_COLORS.orangePortal,
          yAxisID: 'y',
          borderRadius: 4
        },
        {
          type: 'line',
          label: 'Qtd. Divergências no Portal',
          data: frentList.map(f => f.divergencias_portal),
          borderColor: SHEET_COLORS.alertRed,
          backgroundColor: SHEET_COLORS.alertRed,
          borderWidth: 2.5,
          yAxisID: 'y1',
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: gridColor } },
        y: { type: 'linear', position: 'left', beginAtZero: true, grid: { color: gridColor } },
        y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } }
      }
    }
  });
}

// Renderiza todas as Tabelas Consolidada e Auditáveis da aba INDICADORES
function renderExecutiveAuditableTables(filialSel) {
  const container = document.getElementById('execAuditableTablesContainer');
  if (!container || !indicadoresData) return;

  const dFiliais = filialSel === 'TODAS'
    ? indicadoresData.desempenho_filiais
    : indicadoresData.desempenho_filiais.filter(f => f.cod_filial === filialSel);
  const tRede = indicadoresData.total_rede_desempenho;

  const eFiliais = filialSel === 'TODAS'
    ? indicadoresData.eficiencia_combustivel
    : indicadoresData.eficiencia_combustivel.filter(f => f.cod_filial === filialSel);
  const tEfic = indicadoresData.total_rede_eficiencia;

  const aFiliais = filialSel === 'TODAS'
    ? indicadoresData.auditoria_conciliacao
    : indicadoresData.auditoria_conciliacao.filter(f => f.cod_filial === filialSel);
  const tAud = indicadoresData.total_rede_auditoria;

  const statusFiliais = filialSel === 'TODAS'
    ? indicadoresData.auditoria_status_portal_filial
    : indicadoresData.auditoria_status_portal_filial.filter(f => f.cod_filial === filialSel);

  const frentRows = filialSel === 'TODAS'
    ? indicadoresData.ranking_frentistas
    : indicadoresData.ranking_frentistas.filter(f => f.filial === filialSel || f.frentista.startsWith(filialSel));
  const tFrent = indicadoresData.total_rede_frentistas;

  container.innerHTML = `
    <div class="exec-block-header">
      <div>
        <h3>5. Base Consolidada e Auditável de Indicadores (Espelho Completo da Aba INDICADORES)</h3>
        <p>Clique em qualquer <strong>Placa</strong> abaixo para abrir instantaneamente a Ficha Técnica e o Histórico Paralelo (Ficha x App) do veículo</p>
      </div>
      <span class="exec-block-tag">Quadros 1 a 20 &bull; Auditável</span>
    </div>

    <div class="audit-tables-wrapper">
      <!-- QUADRO 1: DESEMPENHO GERAL E GOVERNANÇA POR FILIAL (PARALELO FICHA X PORTAL) -->
      <div class="audit-table-card">
        <div class="audit-table-titlebar">
          <h4>1. DESEMPENHO GERAL E GOVERNANÇA POR FILIAL (EM PARALELO: FICHAS _FC_ vs. PORTAL _PA_)</h4>
          <span>Visão Consolidada Rede</span>
        </div>
        <div class="audit-table-scroll">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Cód. Filial</th>
                <th>Nome Filial / Aba</th>
                <th>Abastecimentos</th>
                <th>Veículos Distintos</th>
                <th>Volume Fichas (_FC_) (L)</th>
                <th>% Part. Fichas</th>
                <th>Volume Portal (_PA_) (L)</th>
                <th>% Part. Portal</th>
                <th>Total KM Percorrido</th>
                <th>Total Horas Trab.</th>
                <th>Taxa Efic. APP</th>
                <th>Taxa Consistência</th>
                <th>Taxa Adesão Portal</th>
                <th>Saldo KM/L (L)</th>
                <th>Saldo L/H (L)</th>
                <th>Placa Maior Consumidor</th>
                <th>Volume Maior Cons. (L)</th>
                <th>Frentistas Ativos</th>
              </tr>
            </thead>
            <tbody>
              ${dFiliais.map(r => `
                <tr>
                  <td><strong>${r.cod_filial}</strong></td>
                  <td>${r.nome_filial}</td>
                  <td>${r.abastecimentos_fmt}</td>
                  <td>${r.veiculos_distintos_fmt}</td>
                  <td><strong style="color:#1a227d;">${r.volume_fichas_fmt}</strong></td>
                  <td>${r.part_fichas_fmt}</td>
                  <td><strong style="color:#e56619;">${r.volume_portal_fmt}</strong></td>
                  <td>${r.part_portal_fmt}</td>
                  <td>${r.total_km_fmt}</td>
                  <td>${r.total_horas_fmt}</td>
                  <td>${r.taxa_eficiencia_app_fmt}</td>
                  <td><span class="badge badge-ok">${r.taxa_consistencia_fmt}</span></td>
                  <td>${r.taxa_adesao_portal_fmt}</td>
                  <td>${r.saldo_km_l_fmt}</td>
                  <td>${r.saldo_l_h_fmt}</td>
                  <td>${renderPlacaBadge(r.placa_maior_consumidor)}</td>
                  <td>${r.volume_maior_consumidor_fmt}</td>
                  <td>${r.frentistas_ativos}</td>
                </tr>
              `).join('')}
              ${tRede && filialSel === 'TODAS' ? `
                <tr class="audit-total-row">
                  <td>${tRede.cod_filial}</td>
                  <td>${tRede.nome_filial}</td>
                  <td>${tRede.abastecimentos_fmt}</td>
                  <td>${tRede.veiculos_distintos_fmt}</td>
                  <td>${tRede.volume_fichas_fmt}</td>
                  <td>${tRede.part_fichas_fmt}</td>
                  <td>${tRede.volume_portal_fmt}</td>
                  <td>${tRede.part_portal_fmt}</td>
                  <td>${tRede.total_km_fmt}</td>
                  <td>${tRede.total_horas_fmt}</td>
                  <td>${tRede.taxa_eficiencia_app_fmt}</td>
                  <td>${tRede.taxa_consistencia_fmt}</td>
                  <td>${tRede.taxa_adesao_portal_fmt}</td>
                  <td>${tRede.saldo_km_l_fmt}</td>
                  <td>${tRede.saldo_l_h_fmt}</td>
                  <td>${renderPlacaBadge(tRede.placa_maior_consumidor)}</td>
                  <td>${tRede.volume_maior_consumidor_fmt}</td>
                  <td>${tRede.frentistas_ativos}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- QUADRO 3 & 10: AUDITORIA DE CONCILIAÇÃO E DIVERGÊNCIAS (FICHAS X PORTAL ALMOXARIFADO X S.A.) -->
      <div class="audit-table-card">
        <div class="audit-table-titlebar">
          <h4>3. AUDITORIA DE CONCILIAÇÃO E DIVERGÊNCIAS (FICHAS _FC_ X PORTAL ALMOXARIFADO _PA_ X S.A.)</h4>
          <span>Rastreabilidade de Lançamentos</span>
        </div>
        <div class="audit-table-scroll">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Cód. Filial</th>
                <th>Nome Filial / Aba</th>
                <th>Fichas Consistentes</th>
                <th>Fichas Inconsistentes</th>
                <th>Fichas Localizadas no Portal</th>
                <th>Fichas Não Localizadas no Portal</th>
                <th>Registros no Portal (App)</th>
                <th>Portal Conciliado (OK)</th>
                <th>Portal Pendente / Divergente</th>
                <th>Duplicados no Portal</th>
                <th>Abast. sem S.A. (Pendente)</th>
                <th>Saldo Fin. KM/L (R$)</th>
                <th>Saldo Fin. L/H (R$)</th>
              </tr>
            </thead>
            <tbody>
              ${aFiliais.map(r => `
                <tr>
                  <td><strong>${r.cod_filial}</strong></td>
                  <td>${r.nome_filial}</td>
                  <td><span class="badge badge-ok">${r.fichas_consistentes_fmt}</span></td>
                  <td><span class="badge badge-alert">${r.fichas_inconsistentes_fmt}</span></td>
                  <td>${r.fichas_localizadas_portal_fmt}</td>
                  <td><strong style="color:#c02626;">${r.fichas_nao_localizadas_portal_fmt}</strong></td>
                  <td><strong style="color:#e56619;">${r.registros_portal_app_fmt}</strong></td>
                  <td>${r.portal_conciliado_ok_fmt}</td>
                  <td>${r.portal_pendente_divergente_fmt}</td>
                  <td>${r.portal_duplicados_fmt}</td>
                  <td>${r.sa_pendente_fmt}</td>
                  <td>${r.saldo_fin_km_l_fmt}</td>
                  <td>${r.saldo_fin_l_h_fmt}</td>
                </tr>
              `).join('')}
              ${tAud && filialSel === 'TODAS' ? `
                <tr class="audit-total-row">
                  <td>${tAud.cod_filial}</td>
                  <td>${tAud.nome_filial}</td>
                  <td>${tAud.fichas_consistentes_fmt}</td>
                  <td>${tAud.fichas_inconsistentes_fmt}</td>
                  <td>${tAud.fichas_localizadas_portal_fmt}</td>
                  <td>${tAud.fichas_nao_localizadas_portal_fmt}</td>
                  <td>${tAud.registros_portal_app_fmt}</td>
                  <td>${tAud.portal_conciliado_ok_fmt}</td>
                  <td>${tAud.portal_pendente_divergente_fmt}</td>
                  <td>${tAud.portal_duplicados_fmt}</td>
                  <td>${tAud.sa_pendente_fmt}</td>
                  <td>${tAud.saldo_fin_km_l_fmt}</td>
                  <td>${tAud.saldo_fin_l_h_fmt}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- QUADRO 2: EFICIÊNCIA ENERGÉTICA POR MATRIZ DE COMBUSTÍVEL -->
      <div class="audit-table-card">
        <div class="audit-table-titlebar">
          <h4>2. EFICIÊNCIA ENERGÉTICA POR MATRIZ DE COMBUSTÍVEL (DIESEL, GASOLINA E ARLA 32)</h4>
          <span>KM, Horas, Litros e Médias</span>
        </div>
        <div class="audit-table-scroll">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Filial</th>
                <th>Unidade</th>
                <th style="background:#b45309;">Diesel KM</th>
                <th style="background:#b45309;">Diesel Horas</th>
                <th style="background:#b45309;">Diesel Litros</th>
                <th style="background:#b45309;">Diesel Méd L/Ab</th>
                <th style="background:#b45309;">Diesel KM/L</th>
                <th style="background:#c2410c;">Gasolina KM</th>
                <th style="background:#c2410c;">Gasolina Litros</th>
                <th style="background:#c2410c;">Gasolina KM/L</th>
                <th style="background:#0369a1;">Arla 32 KM</th>
                <th style="background:#0369a1;">Arla 32 Litros</th>
                <th style="background:#0369a1;">Arla 32 KM/L</th>
              </tr>
            </thead>
            <tbody>
              ${eFiliais.map(r => `
                <tr>
                  <td><strong>${r.cod_filial}</strong></td>
                  <td>${r.nome_filial}</td>
                  <td>${r.diesel_km_fmt}</td>
                  <td>${r.diesel_horas_fmt}</td>
                  <td><strong>${r.diesel_litros_fmt}</strong></td>
                  <td>${r.diesel_media_abast_fmt}</td>
                  <td>${r.diesel_efic_km_l_fmt}</td>
                  <td>${r.gasolina_km_fmt}</td>
                  <td><strong>${r.gasolina_litros_fmt}</strong></td>
                  <td>${r.gasolina_efic_km_l_fmt}</td>
                  <td>${r.arla_km_fmt}</td>
                  <td><strong>${r.arla_litros_fmt}</strong></td>
                  <td>${r.arla_efic_km_l_fmt}</td>
                </tr>
              `).join('')}
              ${tEfic && filialSel === 'TODAS' ? `
                <tr class="audit-total-row">
                  <td>${tEfic.cod_filial}</td>
                  <td>${tEfic.nome_filial}</td>
                  <td>${tEfic.diesel_km_fmt}</td>
                  <td>${tEfic.diesel_horas_fmt}</td>
                  <td>${tEfic.diesel_litros_fmt}</td>
                  <td>${tEfic.diesel_media_abast_fmt}</td>
                  <td>${tEfic.diesel_efic_km_l_fmt}</td>
                  <td>${tEfic.gasolina_km_fmt}</td>
                  <td>${tEfic.gasolina_litros_fmt}</td>
                  <td>${tEfic.gasolina_efic_km_l_fmt}</td>
                  <td>${tEfic.arla_km_fmt}</td>
                  <td>${tEfic.arla_litros_fmt}</td>
                  <td>${tEfic.arla_efic_km_l_fmt}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- QUADROS 4, 11 e 6 (LADO A LADO): TOP 10 CONSUMIDORES, DIVERGÊNCIAS E OFENSORES PORTAL -->
      <div class="audit-two-col">
        <!-- Quadro 4 -->
        <div class="audit-table-card">
          <div class="audit-table-titlebar">
            <h4>4. TOP 10 VEÍCULOS MAIORES CONSUMIDORES DA REDE</h4>
            <span>Clique na placa para auditar</span>
          </div>
          <div class="audit-table-scroll">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Equipamento</th>
                  <th>Comb.</th>
                  <th>Qtd. Abast.</th>
                  <th>Total Litros</th>
                  <th>Total KM</th>
                </tr>
              </thead>
              <tbody>
                ${indicadoresData.top10_maiores_consumidores.map(v => `
                  <tr>
                    <td>${renderPlacaBadge(v.placa)}</td>
                    <td>${v.equipamento}</td>
                    <td>${v.combustivel}</td>
                    <td>${v.qtd_abast}</td>
                    <td><strong>${v.total_litros_fmt} L</strong></td>
                    <td>${v.total_km_fmt}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Quadro 11 -->
        <div class="audit-table-card">
          <div class="audit-table-titlebar">
            <h4>11. TOP 10 PLACAS COM DIVERGÊNCIA (FICHAS _FC_ VS. PORTAL _PA_)</h4>
            <span>Confronto Direto por Placa</span>
          </div>
          <div class="audit-table-scroll">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Litros Fichas (_FC_)</th>
                  <th>Litros Portal (_PA_)</th>
                  <th>Diferença (Ficha - Portal)</th>
                </tr>
              </thead>
              <tbody>
                ${indicadoresData.top10_divergencia_placas.map(p => `
                  <tr>
                    <td>${renderPlacaBadge(p.placa)}</td>
                    <td><strong style="color:#1a227d;">${p.litros_fichas_fmt} L</strong></td>
                    <td><strong style="color:#e56619;">${p.litros_portal_fmt} L</strong></td>
                    <td><strong style="color:#c02626;">${p.diferenca_fmt} L</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- QUADROS 6 (DIREITA) E 10: TOP 10 OFENSORES DO PORTAL + STATUS CONCILIAÇÃO FILIAL -->
      <div class="audit-two-col">
        <div class="audit-table-card">
          <div class="audit-table-titlebar">
            <h4>6. TOP 10 VEÍCULOS OFENSORES DO PORTAL (ALERTAS / DIVERGÊNCIAS)</h4>
            <span>Ocorrências de Lacre e Cadastro</span>
          </div>
          <div class="audit-table-scroll">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Placa Ofensora</th>
                  <th>Filial</th>
                  <th>Qtd. Divergências</th>
                  <th>Volume no Portal (L)</th>
                  <th>Principal Ocorrência Detectada</th>
                </tr>
              </thead>
              <tbody>
                ${indicadoresData.top10_ofensores_portal.map(p => `
                  <tr>
                    <td>${renderPlacaBadge(p.placa)}</td>
                    <td><strong>${p.filial}</strong></td>
                    <td><span class="badge badge-alert">${p.qtd_divergencias}</span></td>
                    <td><strong>${p.volume_portal_fmt} L</strong></td>
                    <td>${p.principal_ocorrencia}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="audit-table-card">
          <div class="audit-table-titlebar">
            <h4>10. AUDITORIA DE CONCILIAÇÃO POR FILIAL (STATUS NO PORTAL) & OFENSOR KM/L</h4>
            <span>Quadro 10 & Quadro 5</span>
          </div>
          <div class="audit-table-scroll">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Cód. Filial</th>
                  <th>Qtd. Fichas</th>
                  <th>Qtd. Portal</th>
                  <th>Litros Fichas (_FC_)</th>
                  <th>Litros Portal (_PA_)</th>
                  <th>Diferença (L)</th>
                  <th>Status Conciliação</th>
                </tr>
              </thead>
              <tbody>
                ${statusFiliais.map(s => `
                  <tr>
                    <td><strong>${s.cod_filial}</strong></td>
                    <td>${s.qtd_fichas_fmt}</td>
                    <td>${s.qtd_portal_fmt}</td>
                    <td>${s.litros_fichas_fmt}</td>
                    <td>${s.litros_portal_fmt}</td>
                    <td><strong>${s.diferenca_fmt}</strong></td>
                    <td>
                      <span class="badge ${s.status.includes('FALTA') ? 'badge-alert' : 'badge-app-orange'}">${s.status}</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div style="padding:0.75rem 1rem; border-top:1px solid var(--border); background:var(--bg-main); font-size:0.78rem;">
            <strong>5. Maior Ofensor de Desperdício (Saldo KM/L Negativo):</strong>
            ${indicadoresData.top10_ofensores_desperdicio.map(o => `
              Placa ${renderPlacaBadge(o.placa)} (${o.combustivel}) &bull; Consumido: <strong>${o.litros_consumidos_fmt} L</strong> &bull;
              Média Real: <strong>${o.media_km_l_real_fmt} KM/L</strong> &bull; Saldo KM/L Acumulado: <strong style="color:#c02626;">${o.saldo_km_l_acumulado_fmt} L</strong>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- QUADROS 12 E 13: IMPACTO FINANCEIRO POR FILIAL & DESEMPENHO POR MODALIDADE -->
      <div class="audit-two-col">
        <div class="audit-table-card">
          <div class="audit-table-titlebar">
            <h4>12. IMPACTO FINANCEIRO DE DESPERDÍCIO POR FILIAL (R$)</h4>
            <span>Saldo KM/L e L/H em Reais</span>
          </div>
          <div class="audit-table-scroll">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Filial</th>
                  <th>Total Litros</th>
                  <th>Saldo KM/L (L)</th>
                  <th>Saldo KM/L (R$)</th>
                  <th>Saldo L/H (R$)</th>
                </tr>
              </thead>
              <tbody>
                ${indicadoresData.impacto_financeiro_filial.map(i => `
                  <tr>
                    <td><strong>${i.filial}</strong></td>
                    <td>${i.total_litros_fmt} L</td>
                    <td>${i.saldo_km_l_litros_fmt} L</td>
                    <td><strong style="color:${i.saldo_km_l_reais < 0 ? '#c02626' : '#2d8c56'};">${i.saldo_km_l_reais_fmt}</strong></td>
                    <td><strong style="color:${i.saldo_l_h_reais < 0 ? '#c02626' : '#2d8c56'};">${i.saldo_l_h_reais_fmt}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="audit-table-card">
          <div class="audit-table-titlebar">
            <h4>13. DESEMPENHO POR MODALIDADE DE ABASTECIMENTO (INTERNO X COMBOIO)</h4>
            <span>Volume e Média por Modalidade</span>
          </div>
          <div class="audit-table-scroll">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Modalidade</th>
                  <th>Qtd. Abast.</th>
                  <th>Total Litros (L)</th>
                  <th>Média L/Abast.</th>
                  <th>Total KM</th>
                  <th>Saldo KM/L (L)</th>
                </tr>
              </thead>
              <tbody>
                ${indicadoresData.desempenho_modalidade.map(m => `
                  <tr>
                    <td><strong>${m.modalidade}</strong></td>
                    <td>${m.qtd_abast_fmt}</td>
                    <td><strong>${m.total_litros_fmt} L</strong></td>
                    <td>${m.media_l_abast_fmt} L</td>
                    <td>${m.total_km_fmt}</td>
                    <td>${m.saldo_km_l_fmt}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- QUADROS 14 E 15: TOP 10 EQUIPAMENTOS/OPERAÇÕES & COMPARATIVO DIA DA SEMANA 3 FONTES -->
      <div class="audit-two-col">
        <div class="audit-table-card">
          <div class="audit-table-titlebar">
            <h4>14. TOP 10 OPERAÇÕES / EQUIPAMENTOS CONSUMIDORES</h4>
            <span>Volume Consolidado</span>
          </div>
          <div class="audit-table-scroll">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Equipamento / Operação</th>
                  <th>Qtd. Abast.</th>
                  <th>Total Litros (L)</th>
                </tr>
              </thead>
              <tbody>
                ${indicadoresData.top10_operacoes_equipamentos.map(op => `
                  <tr>
                    <td><strong>${op.equipamento_operacao}</strong></td>
                    <td>${op.qtd_abast_fmt}</td>
                    <td><strong>${op.total_litros_fmt} L</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="audit-table-card">
          <div class="audit-table-titlebar">
            <h4>15. COMPARATIVO SEMANAL: FICHAS (_FC_) vs. PORTAL (_PA_) vs. SCP</h4>
            <span>Confronto das 3 Fontes por Dia da Semana</span>
          </div>
          <div class="audit-table-scroll">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Dia da Semana</th>
                  <th>Ficha Diesel</th>
                  <th>Portal Diesel</th>
                  <th>SCP Diesel</th>
                  <th>Ficha Gasolina</th>
                  <th>Portal Gasolina</th>
                  <th>SCP Gasolina</th>
                </tr>
              </thead>
              <tbody>
                ${indicadoresData.comparativo_dia_semana_fontes.map(d => `
                  <tr>
                    <td><strong>${d.dia_semana}</strong></td>
                    <td style="color:#1a227d;font-weight:700;">${fmtPtBr(d.ficha_diesel)}</td>
                    <td style="color:#e56619;font-weight:700;">${fmtPtBr(d.portal_diesel)}</td>
                    <td style="color:#2d8c56;font-weight:700;">${fmtPtBr(d.scp_diesel)}</td>
                    <td>${fmtPtBr(d.ficha_gasolina)}</td>
                    <td>${fmtPtBr(d.portal_gasolina)}</td>
                    <td>${fmtPtBr(d.scp_gasolina)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- QUADROS 17, 18 E 19: TOP 10 CENTROS DE CUSTO POR COMBUSTÍVEL -->
      <div class="audit-three-col">
        <div class="audit-table-card">
          <div class="audit-table-titlebar">
            <h4>17. CONSUMO DIESEL POR C.C.</h4>
            <span>Litros</span>
          </div>
          <div class="audit-table-scroll">
            <table class="audit-table">
              <thead>
                <tr><th>C.C.</th><th>Descrição</th><th>Litros Diesel</th></tr>
              </thead>
              <tbody>
                ${(indicadoresData.centro_custo_combustivel?.diesel || []).map(c => `
                  <tr><td><strong>${c.cc}</strong></td><td>${c.descricao}</td><td><strong>${c.litros_fmt} L</strong></td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="audit-table-card">
          <div class="audit-table-titlebar">
            <h4>18. CONSUMO GASOLINA POR C.C.</h4>
            <span>Litros</span>
          </div>
          <div class="audit-table-scroll">
            <table class="audit-table">
              <thead>
                <tr><th>C.C.</th><th>Descrição</th><th>Litros Gasolina</th></tr>
              </thead>
              <tbody>
                ${(indicadoresData.centro_custo_combustivel?.gasolina || []).map(c => `
                  <tr><td><strong>${c.cc}</strong></td><td>${c.descricao}</td><td><strong>${c.litros_fmt} L</strong></td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="audit-table-card">
          <div class="audit-table-titlebar">
            <h4>19. CONSUMO ARLA 32 POR C.C.</h4>
            <span>Litros</span>
          </div>
          <div class="audit-table-scroll">
            <table class="audit-table">
              <thead>
                <tr><th>C.C.</th><th>Descrição</th><th>Litros Arla 32</th></tr>
              </thead>
              <tbody>
                ${(indicadoresData.centro_custo_combustivel?.arla || []).map(c => `
                  <tr><td><strong>${c.cc}</strong></td><td>${c.descricao}</td><td><strong>${c.litros_fmt} L</strong></td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- QUADRO 20: RANKING DE PRODUTIVIDADE, EFICIÊNCIA E AUDITORIA POR FRENTISTA -->
      <div class="audit-table-card">
        <div class="audit-table-titlebar">
          <h4>20. COMPARATIVO DE DESEMPENHO, EFICIÊNCIA E AUDITORIA POR FRENTISTA (EM PARALELO: FICHA x PORTAL)</h4>
          <span>11 Frentistas Auditados</span>
        </div>
        <div class="audit-table-scroll">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Frentista</th>
                <th>Filial</th>
                <th>Qtde Abast. Total</th>
                <th>Total Litros (L)</th>
                <th>Abast. Fichas (_FC_)</th>
                <th>Abast. Portal (_PA_)</th>
                <th>Litros Fichas (_FC_)</th>
                <th>Litros Portal (_PA_)</th>
                <th>Divergências Portal</th>
                <th>Index Adesão App</th>
                <th>Index Adesão Ficha</th>
                <th>% Eficiência</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${frentRows.map(f => `
                <tr>
                  <td><strong>#${f.rank}</strong></td>
                  <td><strong>${f.frentista}</strong></td>
                  <td><span class="badge badge-filial">${f.filial}</span></td>
                  <td>${f.qtd_abast_fmt}</td>
                  <td><strong>${f.total_litros_fmt} L</strong></td>
                  <td>${f.abast_fichas_fmt}</td>
                  <td>${f.abast_portal_fmt}</td>
                  <td style="color:#1a227d;font-weight:700;">${f.litros_fichas_fmt} L</td>
                  <td style="color:#e56619;font-weight:700;">${f.litros_portal_fmt} L</td>
                  <td><span class="badge ${f.divergencias_portal > 50 ? 'badge-alert' : 'badge-filial'}">${f.divergencias_portal_fmt}</span></td>
                  <td>${f.index_adesao_app_fmt}</td>
                  <td>${f.index_adesao_ficha_fmt}</td>
                  <td><strong>${f.eficiencia_fmt}</strong></td>
                  <td>
                    <span class="badge ${f.status === 'REGULAR' ? 'badge-ok' : 'badge-alert'}">${f.status}</span>
                  </td>
                </tr>
              `).join('')}
              ${tFrent && filialSel === 'TODAS' ? `
                <tr class="audit-total-row">
                  <td>${tFrent.rank}</td>
                  <td>${tFrent.frentista}</td>
                  <td>${tFrent.filial}</td>
                  <td>${tFrent.qtd_abast_fmt}</td>
                  <td>${tFrent.total_litros_fmt} L</td>
                  <td>${tFrent.abast_fichas_fmt}</td>
                  <td>${tFrent.abast_portal_fmt}</td>
                  <td>${tFrent.litros_fichas_fmt} L</td>
                  <td>${tFrent.litros_portal_fmt} L</td>
                  <td>${tFrent.divergencias_portal_fmt}</td>
                  <td>${tFrent.index_adesao_app_fmt}</td>
                  <td>${tFrent.index_adesao_ficha_fmt}</td>
                  <td>${tFrent.eficiencia_fmt}</td>
                  <td>${tFrent.status}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// Exporta relatório consolidado e auditável em CSV
function exportAuditTablesToCsv() {
  if (!indicadoresData) return;

  const lines = [];
  lines.push('RELATORIO CONSOLIDADO E AUDITAVEL DE ABASTECIMENTO - FICHAS (_FC_) X APLICATIVO PORTAL (_PA_)');
  lines.push(`Periodo;${indicadoresData.meta.data_inicial} a ${indicadoresData.meta.data_final}`);
  lines.push('');
  lines.push('1. DESEMPENHO GERAL E GOVERNANCA POR FILIAL');
  lines.push('Cod Filial;Nome Filial;Abastecimentos;Veiculos Distintos;Volume Fichas (L);% Part Fichas;Volume Portal (L);% Part Portal;Taxa Consistencia;Taxa Adesao Portal;Placa Maior Consumidor');
  indicadoresData.desempenho_filiais.forEach(r => {
    lines.push(`${r.cod_filial};${r.nome_filial};${r.abastecimentos_fmt};${r.veiculos_distintos_fmt};${r.volume_fichas_fmt};${r.part_fichas_fmt};${r.volume_portal_fmt};${r.part_portal_fmt};${r.taxa_consistencia_fmt};${r.taxa_adesao_portal_fmt};${r.placa_maior_consumidor}`);
  });
  lines.push('');
  lines.push('20. AUDITORIA POR FRENTISTA');
  lines.push('Rank;Frentista;Filial;Qtd Abast;Total Litros;Abast Fichas;Abast Portal;Litros Fichas;Litros Portal;Divergencias Portal;Status');
  indicadoresData.ranking_frentistas.forEach(f => {
    lines.push(`${f.rank};${f.frentista};${f.filial};${f.qtd_abast_fmt};${f.total_litros_fmt};${f.abast_fichas_fmt};${f.abast_portal_fmt};${f.litros_fichas_fmt};${f.litros_portal_fmt};${f.divergencias_portal_fmt};${f.status}`);
  });

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'auditoria_abastecimento_ficha_vs_app.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Camera Scanner & OCR Logic
const cameraFileInput = document.getElementById('cameraFileInput');

function setupCameraEvents() {
  btnOpenScan.addEventListener('click', startCamera);
  btnCloseCamera.addEventListener('click', stopCamera);
  btnCaptureOCR.addEventListener('click', captureAndRecognizePlate);

  if (cameraFileInput) {
    cameraFileInput.addEventListener('change', handleFileInputPhoto);
  }

  const btnTriggerPhoto = document.getElementById('btnTriggerPhoto');
  if (btnTriggerPhoto) {
    btnTriggerPhoto.addEventListener('click', () => {
      if (cameraFileInput) cameraFileInput.click();
    });
  }
}

async function startCamera() {
  cameraModal.style.display = 'flex';
  scanStatus.innerHTML = `<span class="scan-spinner"></span> Conectando à câmera...`;
  btnCaptureOCR.style.display = 'inline-flex';

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Navegador sem suporte direto a streaming de vídeo');
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    } catch (e1) {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }

    videoStream = stream;
    cameraVideo.srcObject = videoStream;
    scanStatus.innerHTML = `Enquadre a placa dentro da moldura e toque em <strong>Reconhecer Vídeo</strong> ou <strong>Tirar Foto</strong>`;
  } catch (err) {
    console.warn('Erro ao abrir streaming de vídeo:', err);
    btnCaptureOCR.style.display = 'none';
    scanStatus.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid var(--danger); border-radius: 8px; padding: 0.85rem; text-align: left; margin: 0.5rem 0;">
        <div style="color: var(--danger); font-weight: 700; font-size: 0.9rem; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.4rem;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          Streaming de Vídeo não autorizado no navegador
        </div>
        <p style="font-size: 0.82rem; margin: 0 0 0.65rem 0; color: var(--text-main); line-height: 1.4;">
          O navegador impediu o acesso ao vídeo ao vivo (comum em prévias ou se a permissão foi negada anteriormente).
        </p>
        <button type="button" onclick="document.getElementById('cameraFileInput').click()" style="width: 100%; background: #2563eb; color: #ffffff; border: none; padding: 0.75rem 1rem; border-radius: 8px; font-weight: 600; font-size: 0.95rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; box-shadow: 0 2px 4px rgba(37,99,235,0.3);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
          Tirar Foto com a Câmera Nativa (Sem Erro)
        </button>
        <div style="margin-top: 0.65rem; font-size: 0.725rem; color: var(--text-muted); line-height: 1.3;">
          💡 <em>Para habilitar o vídeo: toque no ícone 🔒 na barra de endereços do navegador &gt; Permissões &gt; Câmera &gt; Permitir.</em>
        </div>
      </div>
    `;
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

    const plateMatch = rawText.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/) || rawText.match(/[A-Z]{3}[0-9]{4}/);
    const candidate = plateMatch ? plateMatch[0] : (rawText.length >= 7 ? rawText.slice(0, 7) : rawText);

    if (candidate && candidate.length >= 4) {
      scanStatus.innerHTML = `✓ Placa identificada: <strong>${candidate}</strong>! Buscando...`;
      setTimeout(() => {
        stopCamera();
        switchMainGuia('consulta');
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
