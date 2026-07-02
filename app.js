/* ============================================================
   LATAM Airlines — Sistema de Gestão de Treinamentos CGH
   app.js — Aplicação Principal
   ============================================================ */

'use strict';

// ── ESTADO GLOBAL ───────────────────────────────────────────
const App = {
  currentPage: 'exec',
  charts: {},
  filters: {
    pendente_gestor: '',
    pendente_cargo:  '',
    pendente_area:   '',
    pendente_busca:  '',
    gestor_busca:    '',
    cargo_busca:     '',
    curso_busca:     '',
    curso_tipo:      '',
    busca_geral:     ''
  }
};

// ── DATA SHORTHAND ──────────────────────────────────────────
const D = () => window.LATAM_DATA;

// ── UTILITÁRIOS ─────────────────────────────────────────────

/**
 * Formata número com separador de milhar (pt-BR)
 */
function fmt(n) {
  return (n || 0).toLocaleString('pt-BR');
}

/**
 * Calcula conformidade em porcentagem
 */
function conf(ok, pend) {
  const total = (ok || 0) + (pend || 0);
  return total ? Math.round((ok / total) * 1000) / 10 : 100;
}

/**
 * Retorna cor baseada no % de conformidade
 */
function confColor(pct) {
  if (pct >= 98) return '#217346';
  if (pct >= 90) return '#E36C09';
  return '#C00000';
}

/**
 * Retorna cor baseada em dias para vencer
 */
function alertColor(dias) {
  if (dias === null || dias === undefined) return '#aaa';
  if (dias < 0)  return '#C00000';
  if (dias <= 7) return '#C00000';
  if (dias <= 15) return '#E36C09';
  if (dias <= 30) return '#F0A500';
  if (dias <= 60) return '#005B9A';
  return '#217346';
}

/**
 * Renderiza barra de progresso colorida
 */
function pgBar(pct, color) {
  const c = color || confColor(pct);
  return `<div class="pgbar"><div class="pgfill" style="width:${pct}%;background:${c}"></div></div>`;
}

/**
 * Cria badge HTML
 */
function badge(txt, cls) {
  return `<span class="badge badge-${cls || 'blue'}">${txt}</span>`;
}

/**
 * Exibe toast de notificação
 */
function toast(msg, type) {
  let el = document.getElementById('toast-global');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-global';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast show ${type || ''}`;
  setTimeout(() => el.className = 'toast', 3000);
}

/**
 * Destroy e recria chart
 */
function mkChart(id, cfg) {
  if (App.charts[id]) {
    try { App.charts[id].destroy(); } catch(e) {}
  }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  App.charts[id] = new Chart(canvas, cfg);
}

// ── NAVEGAÇÃO ───────────────────────────────────────────────

function goPage(id) {
  App.currentPage = id;

  // Esconde todas as páginas
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

  // Ativa a página e o botão do menu
  const page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');

  const btn = document.querySelector(`.nav-item[data-page="${id}"]`);
  if (btn) btn.classList.add('active');

  // Inicializa conteúdo da página se necessário
  const init = pageInits[id];
  if (init) init();
}

// ── INICIALIZADORES POR PÁGINA ──────────────────────────────

const pageInits = {
  exec:       initExec,
  ato:        initAto,
  grh:        initGrh,
  pendentes:  initPendentes,
  gestores:   initGestores,
  cargos:     initCargos,
  cursos:     initCursos,
  criticos:   initCriticos,
  automacao:  initAutomacao,
  ia:         initIA,
  respostas:  initRespostas,
  busca:      initBusca
};

let pagesRendered = {};

// ── PÁGINA: VISÃO EXECUTIVA ──────────────────────────────────

function initExec() {
  if (pagesRendered.exec) return;
  pagesRendered.exec = true;

  const s = D().summary;

  // KPIs
  setKPI('kpi-colabs',    fmt(s.total_colabs),       `${fmt(s.total_registros)} registros`);
  setKPI('kpi-ok',        fmt(s.total_ok),            'Cursos em dia');
  setKPI('kpi-pend',      fmt(s.total_pend),          `${fmt(s.colabs_com_pendencia)} colaboradores`);
  setKPI('kpi-conf',      s.conformidade + '%',       'Meta: 95% ✓');
  setKPI('kpi-venc-7',    fmt(s.vence_7),             'Vence em 7 dias');
  setKPI('kpi-venc-15',   fmt(s.vence_15),            'Vence em 15 dias');
  setKPI('kpi-venc-30',   fmt(s.vence_30),            'Vence em 30 dias');
  setKPI('kpi-venc-60',   fmt(s.vence_60),            'Vence em 60 dias');
  setKPI('kpi-vencidos',  fmt(s.vencidos),            'Registros vencidos');

  // Charts
  renderDonut();
  renderTopCursos();
  renderPendCargo();
  renderConfGestores();
  renderAreaCards();
}

function setKPI(id, val, sub) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector('.kpi-val').textContent = val;
  const s = el.querySelector('.kpi-sub');
  if (s) s.textContent = sub;
}

function renderDonut() {
  const s = D().summary;
  mkChart('chart-donut', {
    type: 'doughnut',
    data: {
      labels: ['Em Dia', 'Pendentes'],
      datasets: [{
        data: [s.total_ok, s.total_pend],
        backgroundColor: ['#217346', '#C00000'],
        borderWidth: 3,
        borderColor: '#fff',
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => ` ${c.label}: ${fmt(c.raw)}`
          }
        }
      }
    }
  });
}

function renderTopCursos() {
  const cursos = D().curso_stats;
  const sorted = Object.entries(cursos)
    .filter(([, v]) => v.pend > 0)
    .sort((a, b) => b[1].pend - a[1].pend)
    .slice(0, 10);

  const max = sorted[0]?.[1]?.pend || 1;
  const el = document.getElementById('top-cursos-exec');
  if (!el) return;

  el.innerHTML = sorted.map(([c, v]) => {
    const pct = conf(v.ok, v.pend);
    const short = c.length > 36 ? c.slice(0, 36) + '…' : c;
    const barW = Math.round((v.pend / max) * 100);
    const col = v.pend >= 20 ? '#C00000' : v.pend >= 10 ? '#E36C09' : '#F0A500';
    return `<div class="hbar-wrap">
      <div class="hbar-label">
        <span title="${c}">${short}</span>
        <span style="color:${col};font-weight:700">${v.pend} pend.</span>
      </div>
      <div class="hbar">
        <div class="hbar-fill" style="width:${barW}%;background:${col}">
          <span>${pct}%</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderPendCargo() {
  const cargos = D().cargo_stats;
  const sorted = Object.entries(cargos)
    .filter(([, v]) => v.pend > 0)
    .sort((a, b) => b[1].pend - a[1].pend);

  const max = sorted[0]?.[1]?.pend || 1;
  const el = document.getElementById('pend-cargo-exec');
  if (!el) return;

  el.innerHTML = sorted.map(([c, v]) => {
    const pct = conf(v.ok, v.pend);
    const short = c.replace('AGENTE AEROPORTO CONTROLE OPERACIONAL', 'AG.AERO CTRL')
      .replace('AGENTE AEROPORTO LIDER', 'AG.AERO LÍDER')
      .replace('AGENTE AEROPORTO VIAGENS', 'AG.AERO VIAGENS')
      .replace('AGENTE AEROPORTO BAGAGENS', 'AG.AERO BAGAGENS')
      .replace('AGENTE AEROPORTO', 'AG. AEROPORTO')
      .replace('AGENTE BAGAGEM E RAMPA', 'AG. BAGAGEM/RAMPA')
      .replace('OPERADOR EQUIPAMENTOS', 'OP. EQUIPAMENTOS')
      .replace('SUPERVISOR AEROPORTO OPERACIONAL', 'SUP. AEROPORTO')
      .replace('SUPERVISOR OPERACIONAL RAMPA', 'SUP. RAMPA');
    const barW = Math.round((v.pend / max) * 100);
    const col = v.pend >= 50 ? '#C00000' : v.pend >= 20 ? '#E36C09' : '#F0A500';
    return `<div class="hbar-wrap">
      <div class="hbar-label">
        <span>${short} <small style="color:#aaa">(${v.pessoas}p)</small></span>
        <span style="color:${col};font-weight:700">${v.pend} pend.</span>
      </div>
      <div class="hbar">
        <div class="hbar-fill" style="width:${barW}%;background:${col}">
          <span>${pct}%</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderConfGestores() {
  const gestores = D().gestor_stats;
  const sorted = Object.entries(gestores)
    .sort((a, b) => b[1].pend - a[1].pend)
    .slice(0, 15);

  const max = sorted[0]?.[1]?.pend || 1;
  const el = document.getElementById('conf-gestores-exec');
  if (!el) return;

  el.innerHTML = sorted.map(([g, v]) => {
    const pct = conf(v.ok, v.pend);
    const barW = Math.round(((v.ok) / (v.ok + v.pend)) * 100);
    const col = confColor(pct);
    const short = g.split(' ').slice(0, 3).join(' ');
    return `<div class="hbar-wrap">
      <div class="hbar-label">
        <span title="${g}">${short} <small style="color:#aaa">(${v.pessoas}p)</small></span>
        <span style="color:${col};font-weight:700">${pct}% | ${v.pend} pend.</span>
      </div>
      <div class="hbar">
        <div class="hbar-fill" style="width:${barW}%;background:${col}">
          <span>${pct}%</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderAreaCards() {
  const area = D().area_stats;
  ['ATO', 'GRH'].forEach(a => {
    const v = area[a] || { ok: 0, pend: 0, pessoas: 0 };
    const pct = conf(v.ok, v.pend);
    const el = document.getElementById(`area-${a.toLowerCase()}`);
    if (!el) return;
    el.querySelector('.kpi-val').textContent = pct + '%';
    el.querySelector('.kpi-sub').textContent = `${v.pend} pend. | ${v.pessoas} colabs`;
  });
}

// ── PÁGINA: ATO ──────────────────────────────────────────────

function initAto() {
  if (pagesRendered.ato) return;
  pagesRendered.ato = true;
  renderAreaPage('ATO');
}

function initGrh() {
  if (pagesRendered.grh) return;
  pagesRendered.grh = true;
  renderAreaPage('GRH');
}

function renderAreaPage(area) {
  const prefix = area.toLowerCase();
  const colab_pend = D().colab_pend.filter(c => c.area === area);
  const gestor_stats = D().gestor_stats;
  const curso_stats  = D().curso_stats;

  // KPI resumo área
  const v = D().area_stats[area] || {};
  const pct = conf(v.ok, v.pend);
  setKPI(`kpi-${prefix}-conf`,   pct + '%',       'Conformidade');
  setKPI(`kpi-${prefix}-pend`,   fmt(v.pend),      'Pendências');
  setKPI(`kpi-${prefix}-colabs`, fmt(v.pessoas),   'Colaboradores');
  setKPI(`kpi-${prefix}-cpend`,  fmt(colab_pend.length), 'Colabs c/ pendência');

  // Tabela pendentes desta área
  const tbody = document.getElementById(`tbody-${prefix}-pend`);
  if (tbody) {
    tbody.innerHTML = colab_pend.map((c, i) => {
      const chips = c.pendentes.map(p => `<span class="chip">${p.curso}</span>`).join('');
      return `<tr>
        <td class="center" style="color:#999;font-size:10px">${i + 1}</td>
        <td class="mono">${c.bp}</td>
        <td><strong>${c.nome}</strong></td>
        <td><span style="font-size:10px;color:#777">${c.cargo}</span></td>
        <td>${c.gestor.split(' ').slice(0,2).join(' ')}</td>
        <td class="center"><strong style="color:#C00000">${c.qtd_pend}</strong></td>
        <td>${chips}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="empty-state"><p>Nenhuma pendência nesta área</p></td></tr>';
  }

  // Top cursos desta área
  const elCursos = document.getElementById(`top-cursos-${prefix}`);
  if (elCursos) {
    const sorted = Object.entries(curso_stats)
      .filter(([, v]) => v.pend > 0)
      .sort((a, b) => b[1].pend - a[1].pend)
      .slice(0, 8);
    const max = sorted[0]?.[1]?.pend || 1;
    elCursos.innerHTML = sorted.map(([c, v]) => {
      const p = conf(v.ok, v.pend);
      const bw = Math.round((v.pend / max) * 100);
      const col = v.pend >= 15 ? '#C00000' : v.pend >= 8 ? '#E36C09' : '#F0A500';
      return `<div class="hbar-wrap">
        <div class="hbar-label"><span title="${c}">${c.length > 38 ? c.slice(0,38)+'…' : c}</span>
        <span style="color:${col};font-weight:700">${v.pend} pend.</span></div>
        <div class="hbar"><div class="hbar-fill" style="width:${bw}%;background:${col}">
        <span>${p}%</span></div></div>
      </div>`;
    }).join('');
  }

  // Gráfico gestores desta área
  const gestAreaMap = {};
  D().colab_pend.filter(c => c.area === area).forEach(c => {
    const g = c.gestor;
    gestAreaMap[g] = (gestAreaMap[g] || 0) + c.qtd_pend;
  });
  const topGest = Object.entries(gestAreaMap).sort((a,b) => b[1]-a[1]).slice(0, 10);

  mkChart(`chart-${prefix}-gest`, {
    type: 'bar',
    data: {
      labels: topGest.map(([g]) => g.split(' ').slice(0, 2).join(' ')),
      datasets: [{
        label: 'Pendências',
        data: topGest.map(([,v]) => v),
        backgroundColor: '#C00000',
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });
}

// ── PÁGINA: PENDENTES ────────────────────────────────────────

let pendFilteredCache = null;

function initPendentes() {
  // Popula filtros
  const gestores = [...new Set(D().colab_pend.map(c => c.gestor))].sort();
  const cargos   = [...new Set(D().colab_pend.map(c => c.cargo))].sort();
  const areas    = ['ATO', 'GRH'];

  populateSelect('f-pend-gestor', gestores, 'Todos os Gestores');
  populateSelect('f-pend-cargo',  cargos,   'Todos os Cargos');
  populateSelect('f-pend-area',   areas,    'Todas as Áreas');

  renderPendentes();
}

function renderPendentes() {
  const fg = document.getElementById('f-pend-gestor')?.value || '';
  const fc = document.getElementById('f-pend-cargo')?.value || '';
  const fa = document.getElementById('f-pend-area')?.value || '';
  const fq = (document.getElementById('f-pend-busca')?.value || '').toLowerCase();

  let list = D().colab_pend;
  if (fg) list = list.filter(c => c.gestor === fg);
  if (fc) list = list.filter(c => c.cargo === fc);
  if (fa) list = list.filter(c => c.area === fa);
  if (fq) list = list.filter(c =>
    c.nome.toLowerCase().includes(fq) ||
    c.bp.includes(fq) ||
    c.gestor.toLowerCase().includes(fq) ||
    c.pendentes.some(p => p.curso.toLowerCase().includes(fq))
  );

  pendFilteredCache = list;

  // Atualiza contador
  const counter = document.getElementById('pend-count');
  if (counter) counter.textContent = `${list.length} colaboradores · ${list.reduce((s,c) => s + c.qtd_pend, 0)} pendências`;

  const tbody = document.getElementById('tbody-pendentes');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🔍</div><p>Nenhum resultado para os filtros selecionados</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = list.map((c, i) => {
    const chips = c.pendentes.map(p => `<span class="chip">${p.curso}</span>`).join('');
    const areaBadge = c.area === 'GRH'
      ? '<span class="badge badge-orange" style="font-size:9px">GRH</span>'
      : '<span class="badge badge-blue" style="font-size:9px">ATO</span>';
    return `<tr>
      <td class="center" style="color:#999;font-size:10px">${i + 1}</td>
      <td class="mono">${c.bp}</td>
      <td><strong>${c.nome}</strong><br><span style="font-size:9px;color:#999">${c.email}</span></td>
      <td><span style="font-size:10px;color:#777">${c.cargo}</span></td>
      <td>${c.gestor.split(' ').slice(0,3).join(' ')}</td>
      <td class="center">${areaBadge}</td>
      <td class="center"><strong style="color:#C00000;font-size:14px">${c.qtd_pend}</strong></td>
      <td>${chips}</td>
    </tr>`;
  }).join('');
}

function populateSelect(id, options, placeholder) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    options.map(o => `<option value="${o}">${o}</option>`).join('');
}

// ── PÁGINA: GESTORES ─────────────────────────────────────────

function initGestores() {
  if (pagesRendered.gestores) return;
  pagesRendered.gestores = true;
  renderGestores();
}

function renderGestores() {
  const fq = (document.getElementById('f-gest-busca')?.value || '').toLowerCase();
  const gestores = D().gestor_stats;

  let list = Object.entries(gestores)
    .filter(([g]) => !fq || g.toLowerCase().includes(fq))
    .sort((a, b) => b[1].pend - a[1].pend);

  const tbody = document.getElementById('tbody-gestores');
  if (tbody) {
    tbody.innerHTML = list.map(([g, v], i) => {
      const pct = conf(v.ok, v.pend);
      const col = confColor(pct);
      const sem = pct >= 98 ? '🟢' : pct >= 90 ? '🟡' : '🔴';
      return `<tr>
        <td class="center" style="color:#999;font-size:10px">${i + 1}</td>
        <td><strong>${g}</strong></td>
        <td class="center">${v.pessoas}</td>
        <td class="center"><span style="color:#C00000;font-weight:700">${v.pend}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <span>${sem}</span>
            <div style="flex:1">${pgBar(pct, col)}</div>
            <span style="font-size:10px;color:${col};font-weight:700;width:36px;text-align:right">${pct}%</span>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // Ranking gráfico — top 12 com mais pendências
  const top = list.slice(0, 12);
  mkChart('chart-gestores', {
    type: 'bar',
    data: {
      labels: top.map(([g]) => g.split(' ').slice(0, 2).join(' ')),
      datasets: [{
        label: 'Pendências',
        data: top.map(([, v]) => v.pend),
        backgroundColor: top.map(([, v]) => v.pend >= 10 ? '#C00000' : v.pend >= 5 ? '#E36C09' : '#F0A500'),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { font: { size: 10 } } },
                y: { ticks: { font: { size: 10 } } } }
    }
  });
}

// ── PÁGINA: CARGOS ───────────────────────────────────────────

function initCargos() {
  if (pagesRendered.cargos) return;
  pagesRendered.cargos = true;
  renderCargos();
}

function renderCargos() {
  const cargos = D().cargo_stats;
  const list = Object.entries(cargos).sort((a, b) => b[1].pend - a[1].pend);

  const tbody = document.getElementById('tbody-cargos');
  if (tbody) {
    tbody.innerHTML = list.map(([c, v], i) => {
      const pct = conf(v.ok, v.pend);
      const col = confColor(pct);
      return `<tr>
        <td class="center" style="color:#999;font-size:10px">${i + 1}</td>
        <td><strong>${c}</strong></td>
        <td class="center">${v.pessoas}</td>
        <td class="center">${v.ok + v.pend}</td>
        <td class="center"><span style="color:#C00000;font-weight:700">${v.pend}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1">${pgBar(pct, col)}</div>
            <span style="font-size:10px;color:${col};font-weight:700;width:36px;text-align:right">${pct}%</span>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // Gráfico
  mkChart('chart-cargos', {
    type: 'bar',
    data: {
      labels: list.slice(0,10).map(([c]) => c.replace('AGENTE AEROPORTO ', 'AG.ARP ').replace('AGENTE BAGAGEM E RAMPA','AG.BAGAGEM').replace('OPERADOR EQUIPAMENTOS','OP.EQUIP')),
      datasets: [{
        label: 'Pendências',
        data: list.slice(0,10).map(([,v]) => v.pend),
        backgroundColor: '#C00000',
        borderRadius: 4
      }, {
        label: 'Em Dia',
        data: list.slice(0,10).map(([,v]) => v.ok),
        backgroundColor: '#217346',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 10 } } } },
      scales: { x: { ticks: { font: { size: 9 } } }, y: { beginAtZero: true } }
    }
  });
}

// ── PÁGINA: CURSOS ───────────────────────────────────────────

function initCursos() {
  renderCursos();
}

function renderCursos() {
  const fq   = (document.getElementById('f-curso-busca')?.value || '').toLowerCase();
  const ftipo = document.getElementById('f-curso-tipo')?.value || '';
  const cursos = D().curso_stats;

  let list = Object.entries(cursos).filter(([c, v]) => {
    if (fq && !c.toLowerCase().includes(fq)) return false;
    if (ftipo === 'pend' && v.pend === 0) return false;
    if (ftipo === 'ok'   && v.pend > 0)   return false;
    return true;
  }).sort((a, b) => b[1].pend - a[1].pend);

  const tbody = document.getElementById('tbody-cursos');
  if (!tbody) return;

  tbody.innerHTML = list.map(([c, v], i) => {
    const pct = conf(v.ok, v.pend);
    const total = v.ok + v.pend;
    const col = confColor(pct);
    const pendCell = v.pend > 0
      ? `<span style="color:#C00000;font-weight:700">${v.pend}</span>`
      : `<span style="color:#217346">0</span>`;
    return `<tr>
      <td class="center" style="color:#999">${i + 1}</td>
      <td><strong>${c}</strong></td>
      <td class="center">${total}</td>
      <td class="center">${v.ok}</td>
      <td class="center">${pendCell}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1">${pgBar(pct, col)}</div>
          <span style="font-size:10px;color:${col};font-weight:700;width:36px;text-align:right">${pct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6"><div class="empty-state"><p>Nenhum curso encontrado</p></div></td></tr>';
}

// ── PÁGINA: CURSOS CRÍTICOS / COLABORADORES CRÍTICOS ─────────

function initCriticos() {
  if (pagesRendered.criticos) return;
  pagesRendered.criticos = true;

  // Top cursos críticos
  const cursos = D().curso_stats;
  const topCursos = Object.entries(cursos)
    .filter(([,v]) => v.pend > 0)
    .sort((a, b) => b[1].pend - a[1].pend)
    .slice(0, 15);

  const tcEl = document.getElementById('tbody-cursos-crit');
  if (tcEl) {
    tcEl.innerHTML = topCursos.map(([c, v], i) => {
      const pct = conf(v.ok, v.pend);
      const num = i + 1;
      const medal = num === 1 ? '🥇' : num === 2 ? '🥈' : num === 3 ? '🥉' : num;
      return `<tr>
        <td class="center">${medal}</td>
        <td><strong>${c}</strong></td>
        <td class="center">${v.ok + v.pend}</td>
        <td class="center"><span style="color:#C00000;font-weight:700">${v.pend}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1">${pgBar(pct)}</div>
            <span style="font-size:10px;font-weight:700;width:36px;text-align:right;color:${confColor(pct)}">${pct}%</span>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // Top colaboradores críticos
  const topColabs = D().colab_pend.slice(0, 20);
  const tcColabs = document.getElementById('tbody-colabs-crit');
  if (tcColabs) {
    tcColabs.innerHTML = topColabs.map((c, i) => {
      const num = i + 1;
      const medal = num <= 3 ? ['🥇','🥈','🥉'][num-1] : num;
      const alert = c.qtd_pend >= 10 ? '🔴' : c.qtd_pend >= 5 ? '🟠' : '🟡';
      return `<tr>
        <td class="center">${medal}</td>
        <td class="mono">${c.bp}</td>
        <td><strong>${c.nome}</strong><br><span style="font-size:9px;color:#999">${c.email}</span></td>
        <td><span style="font-size:10px;color:#777">${c.cargo}</span></td>
        <td>${c.gestor.split(' ').slice(0,3).join(' ')}</td>
        <td class="center">${alert} <strong style="color:#C00000">${c.qtd_pend}</strong></td>
      </tr>`;
    }).join('');
  }

  // Ranking gestores com mais pendências
  const topGest = Object.entries(D().gestor_stats)
    .sort((a,b) => b[1].pend - a[1].pend)
    .slice(0, 10);

  const tgEl = document.getElementById('ranking-gestores-crit');
  if (tgEl) {
    tgEl.innerHTML = topGest.map(([g, v], i) => {
      const num = i + 1;
      const cls = num === 1 ? 'gold' : num === 2 ? 'silver' : num === 3 ? 'bronze' : '';
      return `<div class="rank-item">
        <div class="rank-num ${cls}">${num}</div>
        <div class="rank-info">
          <div class="rank-name" title="${g}">${g.split(' ').slice(0,3).join(' ')}</div>
          <div class="rank-sub">${v.pessoas} colaboradores</div>
        </div>
        <div class="rank-val">${v.pend}</div>
      </div>`;
    }).join('');
  }
}

// ── PÁGINA: AUTOMAÇÃO ─────────────────────────────────────────

function initAutomacao() {
  if (pagesRendered.automacao) return;
  pagesRendered.automacao = true;

  // Popula tabela de alertas programados
  const alertas = D().all_colabs
    .flatMap(c => c.cursos.filter(cr => cr.alerta).map(cr => ({
      ...c, curso: cr.curso, vencimento: cr.vencimento_date,
      dias: cr.dias_para_vencer, alerta: cr.alerta
    })))
    .sort((a, b) => (a.dias || 999) - (b.dias || 999));

  const tbody = document.getElementById('tbody-alertas');
  if (tbody) {
    tbody.innerHTML = alertas.slice(0, 100).map(a => {
      const col = alertColor(a.dias);
      const label = a.alerta === 'VENCIDO' ? '🔴 VENCIDO'
        : a.alerta === '7_DIAS'  ? '🔴 7 dias'
        : a.alerta === '15_DIAS' ? '🟠 15 dias'
        : a.alerta === '30_DIAS' ? '🟡 30 dias'
        : '🔵 60 dias';
      const diasStr = a.dias !== null && a.dias !== undefined
        ? (a.dias < 0 ? `${Math.abs(a.dias)}d vencido` : `em ${a.dias}d`)
        : '-';
      return `<tr>
        <td><span style="font-weight:700;color:${col}">${label}</span></td>
        <td class="mono">${a.bp}</td>
        <td><strong>${a.nome}</strong></td>
        <td>${a.cargo}</td>
        <td>${a.gestor.split(' ').slice(0,2).join(' ')}</td>
        <td>${a.curso}</td>
        <td style="color:${col};font-weight:600">${diasStr}</td>
        <td style="font-size:10px;color:#777">${a.email}</td>
      </tr>`;
    }).join('');
  }

  // Contadores por tipo de alerta
  const counts = { VENCIDO: 0, '7_DIAS': 0, '15_DIAS': 0, '30_DIAS': 0, '60_DIAS': 0 };
  alertas.forEach(a => { if (counts[a.alerta] !== undefined) counts[a.alerta]++; });

  document.getElementById('cnt-vencido')?.textContent !== undefined &&
    (document.getElementById('cnt-vencido').textContent = counts.VENCIDO);
  document.getElementById('cnt-7')?.textContent !== undefined &&
    (document.getElementById('cnt-7').textContent = counts['7_DIAS']);
  document.getElementById('cnt-15')?.textContent !== undefined &&
    (document.getElementById('cnt-15').textContent = counts['15_DIAS']);
  document.getElementById('cnt-30')?.textContent !== undefined &&
    (document.getElementById('cnt-30').textContent = counts['30_DIAS']);
  document.getElementById('cnt-60')?.textContent !== undefined &&
    (document.getElementById('cnt-60').textContent = counts['60_DIAS']);
}

// ── PÁGINA: IA ASSISTENTE ─────────────────────────────────────

function initIA() {
  if (pagesRendered.ia) return;
  pagesRendered.ia = true;
  // Chat já inicializado via HTML
}

function sendAIQuestion(question) {
  if (!question) {
    const input = document.getElementById('ai-input');
    question = input?.value?.trim();
    if (!question) return;
    if (input) input.value = '';
  }

  appendAIMsg(question, 'user');

  // Mostra typing
  const typing = document.getElementById('ai-typing');
  if (typing) typing.classList.add('visible');

  setTimeout(() => {
    const resp = generateAIResponse(question);
    if (typing) typing.classList.remove('visible');
    appendAIMsg(resp, 'bot');
  }, 600);
}

function appendAIMsg(msg, type) {
  const chat = document.getElementById('ai-chat');
  if (!chat) return;
  const div = document.createElement('div');
  div.className = `ai-msg ${type}`;
  div.innerHTML = msg;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function generateAIResponse(q) {
  const ql = q.toLowerCase();
  const D_ = D();

  // Quem está vencido
  if (ql.includes('vencido') || ql.includes('expirado')) {
    const venc = D_.colab_pend.filter(c =>
      c.pendentes.some(p => p.alerta === 'VENCIDO')
    ).slice(0, 10);

    if (!venc.length) return '✅ Nenhum colaborador com cursos vencidos no momento!';

    const rows = venc.map(c => {
      const pendVenc = c.pendentes.filter(p => p.alerta === 'VENCIDO');
      return `<tr><td>${c.bp}</td><td>${c.nome}</td><td>${c.cargo.slice(0,20)}</td><td style="color:#C00000">${pendVenc.length}</td></tr>`;
    }).join('');

    return `⚠️ Encontrei <strong>${D_.summary.vencidos}</strong> registros vencidos em <strong>${venc.length}</strong> colaboradores (mostrando top 10):<br><table style="margin-top:8px;width:100%"><tr><th>BP</th><th>Nome</th><th>Cargo</th><th>Qtd</th></tr>${rows}</table>`;
  }

  // Vence em 15 dias
  if (ql.includes('15 dia') || ql.includes('quinze dia')) {
    const list = D_.all_colabs
      .flatMap(c => c.cursos.filter(cr => cr.alerta === '15_DIAS').map(cr => ({ ...c, curso: cr.curso, vencimento: cr.vencimento_date })))
      .slice(0, 10);

    if (!list.length) return '✅ Nenhum curso vencendo em 15 dias!';
    const rows = list.map(c => `<tr><td>${c.nome}</td><td>${c.curso.slice(0,30)}</td><td style="color:#E36C09">${c.vencimento}</td></tr>`).join('');
    return `🟠 <strong>${D_.summary.vence_15}</strong> cursos vencem em até 15 dias:<br><table style="margin-top:8px;width:100%"><tr><th>Colaborador</th><th>Curso</th><th>Vencimento</th></tr>${rows}</table>`;
  }

  // Vence em 30 dias
  if (ql.includes('30 dia') || ql.includes('trinta')) {
    const cnt = D_.summary.vence_30;
    return `🟡 <strong>${cnt}</strong> cursos vencem em até 30 dias. Acesse a aba <strong>⚙️ Automação</strong> para ver a lista completa e os e-mails programados.`;
  }

  // Cursos com mais pendências
  if (ql.includes('curso') && (ql.includes('pend') || ql.includes('probl'))) {
    const top = Object.entries(D_.curso_stats)
      .sort((a,b) => b[1].pend - a[1].pend)
      .slice(0, 8);
    const rows = top.map(([c,v], i) => `<tr><td>${i+1}</td><td>${c}</td><td style="color:#C00000;font-weight:700">${v.pend}</td><td>${conf(v.ok,v.pend)}%</td></tr>`).join('');
    return `📚 Top cursos com mais pendências:<br><table style="margin-top:8px;width:100%"><tr><th>#</th><th>Curso</th><th>Pend.</th><th>Conf.</th></tr>${rows}</table>`;
  }

  // Gestores com mais vencidos
  if (ql.includes('gestor') && (ql.includes('vencido') || ql.includes('pend') || ql.includes('ruim') || ql.includes('probl'))) {
    const top = Object.entries(D_.gestor_stats)
      .sort((a,b) => b[1].pend - a[1].pend)
      .slice(0, 8);
    const rows = top.map(([g,v], i) => `<tr><td>${i+1}</td><td>${g.split(' ').slice(0,3).join(' ')}</td><td>${v.pessoas}</td><td style="color:#C00000;font-weight:700">${v.pend}</td><td>${conf(v.ok,v.pend)}%</td></tr>`).join('');
    return `👥 Gestores com mais pendências:<br><table style="margin-top:8px;width:100%"><tr><th>#</th><th>Gestor</th><th>Equipe</th><th>Pend.</th><th>Conf.</th></tr>${rows}</table>`;
  }

  // Conformidade geral
  if (ql.includes('conformidade') || ql.includes('índice') || ql.includes('resultado') || ql.includes('situação')) {
    const s = D_.summary;
    return `📊 Situação atual da Base CGH:<br><br>
      • Conformidade Geral: <strong>${s.conformidade}%</strong><br>
      • Colaboradores: <strong>${fmt(s.total_colabs)}</strong><br>
      • Cursos em dia: <strong>${fmt(s.total_ok)}</strong><br>
      • Pendências: <strong>${fmt(s.total_pend)}</strong><br>
      • Colabs c/ pendência: <strong>${fmt(s.colabs_com_pendencia)}</strong><br>
      • Vence em 7 dias: <strong>${s.vence_7}</strong><br>
      • Vence em 30 dias: <strong>${s.vence_30}</strong>`;
  }

  // Área ATO vs GRH
  if (ql.includes('ato') || ql.includes('grh') || ql.includes('area') || ql.includes('área')) {
    const ato = D_.area_stats.ATO || {};
    const grh = D_.area_stats.GRH || {};
    return `📍 Comparativo por Área:<br><br>
      <table style="width:100%"><tr><th>Área</th><th>Colaboradores</th><th>Pendências</th><th>Conf.</th></tr>
      <tr><td>ATO</td><td>${ato.pessoas}</td><td style="color:#C00000">${ato.pend}</td><td>${conf(ato.ok,ato.pend)}%</td></tr>
      <tr><td>GRH</td><td>${grh.pessoas}</td><td style="color:#C00000">${grh.pend}</td><td>${conf(grh.ok,grh.pend)}%</td></tr>
      </table>`;
  }

  // Busca por nome
  if (ql.includes('colaborador') || ql.includes('funcionário') || ql.includes('funcionario')) {
    return `🔍 Para buscar um colaborador específico, acesse a aba <strong>🔍 Buscar</strong> no menu lateral e digite o nome, BP, cargo ou gestor.`;
  }

  // Ajuda
  return `🤖 Posso responder sobre:<br><br>
    • "Quem está <strong>vencido</strong>?"<br>
    • "Quem vence em <strong>15 dias</strong>?"<br>
    • "Quem vence em <strong>30 dias</strong>?"<br>
    • "Quais <strong>cursos</strong> têm mais pendências?"<br>
    • "Quais <strong>gestores</strong> têm mais colaboradores pendentes?"<br>
    • "Como está a <strong>conformidade</strong>?"<br>
    • "Comparativo <strong>ATO vs GRH</strong>"<br><br>
    Pode digitar diretamente ou clicar nos atalhos acima!`;
}

// ── PÁGINA: RESPOSTAS ────────────────────────────────────────

// ID da planilha e GID da aba Respostas_Formulario
const SHEET_ID_RESPOSTAS = '1UgJFqDJycC38jfr1zhyacZE5O8QJSLXxd7NSgGLVdd8';
const GID_RESPOSTAS = ''; // será descoberto automaticamente pelo nome da aba

let respostasCache = [];

function initRespostas() {
  carregarRespostas(false);
}

async function carregarRespostas(forcar) {
  if (respostasCache.length && !forcar) {
    renderRespostas(respostasCache);
    return;
  }

  document.getElementById('respostas-loading').style.display = 'block';
  document.getElementById('tbody-respostas').innerHTML = '';

  try {
    // Busca todas as abas para encontrar Respostas_Formulario
    const urlCSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID_RESPOSTAS}/gviz/tq?tqx=out:csv&sheet=Respostas_Formulario`;
    const resp = await fetch(urlCSV + '&_=' + Date.now());

    if (!resp.ok) throw new Error('Aba não encontrada ou planilha não compartilhada');

    const text = await resp.text();

    // Parser CSV simples
    const rows = text.trim().split('\n').map(r => {
      const cols = [];
      let field = '', inQ = false;
      for (let i = 0; i < r.length; i++) {
        const c = r[i];
        if (c === '"') { inQ = !inQ; }
        else if (c === ',' && !inQ) { cols.push(field.trim()); field = ''; }
        else { field += c; }
      }
      cols.push(field.trim());
      return cols;
    });

    // Remove cabeçalho
    const dados = rows.slice(1).filter(r => r.length >= 6 && r[0]);

    respostasCache = dados.map(r => ({
      data:       r[0] || '',
      hora:       r[1] || '',
      bp:         r[2] || '',
      nome:       r[3] || '',
      curso:      r[4] || '',
      gestor:     r[5] || '',
      situacao:   r[6] || '',
      observacao: r[7] || '',
      email_gestor: r[8] || ''
    }));

    renderRespostas(respostasCache);
    atualizarKPIsRespostas(respostasCache);

    // Atualiza badge no menu
    const badge = document.getElementById('badge-respostas');
    if (badge && respostasCache.length) {
      badge.textContent = respostasCache.length;
      badge.style.display = 'inline';
    }

    toast(`${respostasCache.length} respostas carregadas!`, 'success');

  } catch(err) {
    const erroEl = document.getElementById('respostas-erro');
    erroEl.style.display = 'block';
    erroEl.innerHTML = `<div class="alert-banner yellow">
      ⚠️ <strong>Atenção:</strong> ${
        err.message.includes('não encontrada')
          ? 'A aba "Respostas_Formulario" ainda não existe — ela será criada automaticamente após a primeira resposta do formulário.'
          : 'Não foi possível carregar as respostas. Verifique se a planilha está compartilhada como "Qualquer pessoa com o link".'
      }
    </div>`;
    document.getElementById('tbody-respostas').innerHTML = `
      <tr><td colspan="8"><div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>Nenhuma resposta disponível ainda.<br>As respostas aparecerão aqui após os colaboradores preencherem o formulário.</p>
      </div></td></tr>`;
  } finally {
    document.getElementById('respostas-loading').style.display = 'none';
  }
}

function renderRespostas(dados) {
  const fSit = document.getElementById('f-resp-situacao')?.value || '';
  const fBusca = (document.getElementById('f-resp-busca')?.value || '').toLowerCase();

  let list = dados;
  if (fSit)   list = list.filter(r => r.situacao === fSit);
  if (fBusca) list = list.filter(r =>
    r.nome.toLowerCase().includes(fBusca) ||
    r.bp.includes(fBusca) ||
    r.curso.toLowerCase().includes(fBusca) ||
    r.gestor.toLowerCase().includes(fBusca)
  );

  const tbody = document.getElementById('tbody-respostas');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
      <div class="empty-icon">🔍</div><p>Nenhuma resposta encontrada</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.reverse().map(r => {
    const sit = r.situacao;
    const sitBadge = sit === 'aprovado'
      ? '<span class="badge badge-ok">✅ Aprovado</span>'
      : sit === 'agendando'
        ? '<span class="badge badge-blue">⏳ Agendando</span>'
        : sit === 'nao_aprovado'
          ? '<span class="badge badge-pend">❌ Não Aprovado</span>'
          : '<span class="badge badge-warn">🚫 Não Realizou</span>';

    return `<tr>
      <td style="font-size:10px;white-space:nowrap">${r.data}</td>
      <td style="font-size:10px">${r.hora}</td>
      <td class="mono">${r.bp}</td>
      <td><strong>${r.nome}</strong></td>
      <td style="font-size:11px">${r.curso}</td>
      <td style="font-size:11px">${r.gestor.split(' ').slice(0,3).join(' ')}</td>
      <td class="center">${sitBadge}</td>
      <td style="font-size:11px;color:#777;font-style:italic">${r.observacao || '—'}</td>
    </tr>`;
  }).join('');
}

function atualizarKPIsRespostas(dados) {
  const counts = { aprovado: 0, agendando: 0, nao_aprovado: 0, nao_realizou: 0 };
  dados.forEach(r => { if (counts[r.situacao] !== undefined) counts[r.situacao]++; });

  document.getElementById('kpi-resp-aprovado').querySelector('.kpi-val').textContent = counts.aprovado;
  document.getElementById('kpi-resp-agendando').querySelector('.kpi-val').textContent = counts.agendando;
  document.getElementById('kpi-resp-nao-aprovado').querySelector('.kpi-val').textContent = counts.nao_aprovado;
  document.getElementById('kpi-resp-nao-realizou').querySelector('.kpi-val').textContent = counts.nao_realizou;
  document.getElementById('kpi-resp-total').querySelector('.kpi-val').textContent = dados.length;
}

function filtrarRespostas() {
  renderRespostas(respostasCache);
}

function exportarRespostasCSV() {
  if (!respostasCache.length) { toast('Sem respostas para exportar', 'error'); return; }
  const data = respostasCache.map(r => ({
    Data: r.data, Hora: r.hora, BP: r.bp, Nome: r.nome,
    Curso: r.curso, Gestor: r.gestor, Situacao: r.situacao,
    Observacao: r.observacao
  }));
  exportCSV(data, 'LATAM_CGH_Respostas_Formulario_' + new Date().toISOString().slice(0,10));
}

// ── PÁGINA: BUSCA ─────────────────────────────────────────────

function initBusca() {
  renderBusca();
}

function renderBusca() {
  const q = (document.getElementById('busca-q')?.value || '').trim().toLowerCase();
  const el = document.getElementById('busca-result');
  if (!el) return;

  if (q.length < 2) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>Digite ao menos 2 caracteres para buscar...</p></div>';
    return;
  }

  const results = D().all_colabs.filter(c =>
    c.nome.toLowerCase().includes(q) ||
    c.bp.includes(q) ||
    c.cargo.toLowerCase().includes(q) ||
    c.gestor.toLowerCase().includes(q) ||
    (c.email && c.email.toLowerCase().includes(q))
  ).slice(0, 20);

  if (!results.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">😕</div><p>Nenhum colaborador encontrado</p></div>';
    return;
  }

  el.innerHTML = results.map(c => {
    const pend = c.cursos.filter(cr => (cr.status || '').toUpperCase() === 'PENDENTE');
    const ok   = c.cursos.filter(cr => (cr.status || '').toUpperCase() === 'OK');
    const pct  = conf(ok.length, pend.length);
    const confCol = confColor(pct);
    const chips = pend.length
      ? pend.map(cr => `<span class="chip">${cr.curso}</span>`).join('')
      : '<span class="badge badge-ok">✅ Todos em dia</span>';
    return `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div>
          <div style="font-size:13px;font-weight:700;margin-bottom:3px">${c.nome}</div>
          <div style="font-size:10px;color:#777">BP: ${c.bp} · ${c.cargo}</div>
          <div style="font-size:10px;color:#777;margin-top:1px">Gestor: ${c.gestor} · Área: ${c.area}</div>
          <div style="font-size:10px;color:#999;margin-top:1px">${c.email}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:18px;font-weight:700;color:${confCol}">${pct}%</div>
          <div style="font-size:9px;color:#aaa">conformidade</div>
          <div style="font-size:10px;margin-top:2px">
            <span style="color:#217346">${ok.length} OK</span> · 
            <span style="color:#C00000">${pend.length} pend.</span>
          </div>
        </div>
      </div>
      ${pend.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #f0f0f0">
        <div style="font-size:9px;color:#999;margin-bottom:4px;text-transform:uppercase;font-weight:600">Cursos Pendentes</div>
        ${chips}
      </div>` : ''}
    </div>`;
  }).join('');
}

// ── EXPORTAÇÃO ───────────────────────────────────────────────

function exportCSV(data, filename) {
  if (!data || !data.length) { toast('Sem dados para exportar', 'error'); return; }
  const keys = Object.keys(data[0]);
  const rows = [keys.join(';'), ...data.map(r => keys.map(k => `"${(r[k] || '').toString().replace(/"/g,'""')}"`).join(';'))];
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename + '.csv';
  a.click();
  toast('CSV exportado com sucesso!', 'success');
}

function exportPendentesCSV() {
  const list = pendFilteredCache || D().colab_pend;
  const data = list.map(c => ({
    BP: c.bp, Nome: c.nome, Email: c.email,
    Cargo: c.cargo, Gestor: c.gestor, Area: c.area,
    Qtd_Pendentes: c.qtd_pend,
    Cursos_Pendentes: c.pendentes.map(p => p.curso).join(' | ')
  }));
  exportCSV(data, 'LATAM_CGH_Pendentes_' + new Date().toISOString().slice(0,10));
}

function exportGestoresCSV() {
  const data = Object.entries(D().gestor_stats).map(([g, v]) => ({
    Gestor: g, Pessoas: v.pessoas, OK: v.ok,
    Pendentes: v.pend, Conformidade: conf(v.ok, v.pend) + '%'
  }));
  exportCSV(data, 'LATAM_CGH_Gestores_' + new Date().toISOString().slice(0,10));
}

function exportCursosCSV() {
  const data = Object.entries(D().curso_stats).map(([c, v]) => ({
    Curso: c, Total: v.ok + v.pend, OK: v.ok,
    Pendentes: v.pend, Conformidade: conf(v.ok, v.pend) + '%'
  }));
  exportCSV(data, 'LATAM_CGH_Cursos_' + new Date().toISOString().slice(0,10));
}

function printPage() {
  window.print();
}

// ── CLOCK ────────────────────────────────────────────────────

function updateClock() {
  const el = document.getElementById('topbar-clock-val');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString('pt-BR', {
    dateStyle: 'short', timeStyle: 'short'
  });
}

// ── INICIALIZAÇÃO ────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Relógio
  updateClock();
  setInterval(updateClock, 30000);

  // Nota: a inicialização da página (goPage) e o badge de pendentes
  // são controlados pelo script de carregamento ao vivo no index.html,
  // que executa após os dados da planilha serem buscados.
});
