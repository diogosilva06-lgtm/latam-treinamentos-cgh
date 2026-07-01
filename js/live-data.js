/* ============================================================
   LATAM Airlines — Sistema de Gestão de Treinamentos CGH
   live-data.js — Carregamento de Dados em Tempo Real
   ============================================================
   Este módulo busca os dados diretamente do Google Sheets
   (publicado como CSV) sempre que o dashboard é aberto,
   eliminando a necessidade de atualizar arquivos manualmente.
   ============================================================ */

'use strict';

// ── CONFIGURAÇÃO ────────────────────────────────────────────
const LIVE_CONFIG = {
  // ID da planilha do Google Sheets (extraído da URL)
  SHEET_ID: '1UgJFqDJycC38jfr1zhyacZE5O8QJSLXxd7NSgGLVdd8',

  // GID da aba "RELAÇÃO GERAL COLABORADORES CGH"
  // Para descobrir o GID de uma aba: abra a aba no navegador e veja
  // o número após "gid=" na URL
  GID_PRINCIPAL: '329276709',

  // Tempo máximo de cache em memória (evita buscar repetidamente
  // na mesma sessão) — em milissegundos
  CACHE_MS: 5 * 60 * 1000, // 5 minutos

  // Índices das colunas (0-based) — mesma estrutura da planilha original
  COL: {
    bp: 1, nome: 2, email: 3, cargo: 4,
    email_gestor: 7, gestor: 8, ativo: 9,
    curso: 11, validade: 16, vencimento: 17,
    status: 18, prox_venc: 20, area: 21
  }
};

// ── MONTA URL DE EXPORTAÇÃO CSV ─────────────────────────────

function buildCsvUrl() {
  return `https://docs.google.com/spreadsheets/d/${LIVE_CONFIG.SHEET_ID}/export?format=csv&gid=${LIVE_CONFIG.GID_PRINCIPAL}`;
}

// ── PARSER DE CSV (RFC 4180 — lida com vírgulas/aspas dentro de campos) ─

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\r') { /* ignora */ }
      else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else { field += char; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── CONVERTE DATA SERIAL DO GOOGLE SHEETS PARA YYYY-MM-DD ───

function parseDateField(val) {
  if (!val) return '';
  val = val.trim();
  if (!val) return '';

  // Formato DD/MM/YYYY (comum em exportação pt-BR)
  const brMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Formato YYYY-MM-DD já correto
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    return val.slice(0, 10);
  }

  return '';
}

// ── DETERMINA TIPO DE ALERTA ─────────────────────────────────

function determinarAlerta(dias) {
  if (dias === null || dias === undefined) return null;
  if (dias < 0) return 'VENCIDO';
  if (dias <= 7) return '7_DIAS';
  if (dias <= 15) return '15_DIAS';
  if (dias <= 30) return '30_DIAS';
  if (dias <= 60) return '60_DIAS';
  return null;
}

// ── PROCESSA LINHAS DO CSV EM ESTRUTURA DE DADOS DO DASHBOARD ─

function processarRegistros(rows) {
  const C = LIVE_CONFIG.COL;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const colabs = {};
  let totalRegistros = 0;

  for (let i = 1; i < rows.length; i++) { // pula cabeçalho
    const r = rows[i];
    if (!r || r.length < 20) continue;

    const bp = (r[C.bp] || '').trim();
    const nome = (r[C.nome] || '').trim();
    const curso = (r[C.curso] || '').trim();
    const ativo = (r[C.ativo] || '').trim().toUpperCase();

    if (!bp || !nome || !curso) continue;
    if (ativo.includes('DESLIGAD')) continue;

    totalRegistros++;

    const email = (r[C.email] || '').trim();
    const cargo = (r[C.cargo] || '').trim();
    const gestor = (r[C.gestor] || '').trim() || 'Sem Gestor';
    const email_gestor = (r[C.email_gestor] || '').trim();
    let area = (r[C.area] || '').trim().toUpperCase();
    if (area !== 'ATO' && area !== 'GRH') area = 'ATO';
    const status = (r[C.status] || 'PENDENTE').trim().toUpperCase() || 'PENDENTE';
    const vencStr = parseDateField(r[C.vencimento]);

    if (!colabs[bp]) {
      colabs[bp] = {
        bp, nome, email, cargo, gestor, email_gestor, area, cursos: []
      };
    }

    let dias = null;
    if (vencStr) {
      const vd = new Date(vencStr + 'T00:00:00');
      dias = Math.floor((vd - hoje) / 86400000);
    }
    const alerta = determinarAlerta(dias);

    colabs[bp].cursos.push({
      curso, status, vencimento_date: vencStr,
      dias_para_vencer: dias, alerta, area
    });
  }

  return { colabs, totalRegistros };
}

// ── CALCULA TODAS AS ESTATÍSTICAS (espelha gerar_data.py) ──────

function calcularEstatisticas(colabs, totalRegistros) {
  let totalOk = 0, totalPend = 0;
  const alertasCount = { VENCIDO: 0, '7_DIAS': 0, '15_DIAS': 0, '30_DIAS': 0, '60_DIAS': 0 };
  const gestorStats = {};
  const cargoStats = {};
  const cursoStats = {};
  const areaStats = { ATO: { ok: 0, pend: 0, pessoas: new Set() }, GRH: { ok: 0, pend: 0, pessoas: new Set() } };
  const colabPend = [];

  for (const bp in colabs) {
    const c = colabs[bp];
    const pendList = [];

    // Gestor / Cargo inicialização
    if (!gestorStats[c.gestor]) gestorStats[c.gestor] = { ok: 0, pend: 0, pessoas: new Set(), email: c.email_gestor };
    if (!cargoStats[c.cargo]) cargoStats[c.cargo] = { ok: 0, pend: 0, pessoas: new Set() };
    gestorStats[c.gestor].pessoas.add(bp);
    cargoStats[c.cargo].pessoas.add(bp);
    areaStats[c.area].pessoas.add(bp);

    c.cursos.forEach(cr => {
      if (!cursoStats[cr.curso]) cursoStats[cr.curso] = { ok: 0, pend: 0 };

      if (cr.status === 'OK') {
        totalOk++;
        gestorStats[c.gestor].ok++;
        cargoStats[c.cargo].ok++;
        cursoStats[cr.curso].ok++;
        areaStats[c.area].ok++;
      } else if (cr.status === 'PENDENTE') {
        totalPend++;
        gestorStats[c.gestor].pend++;
        cargoStats[c.cargo].pend++;
        cursoStats[cr.curso].pend++;
        areaStats[c.area].pend++;
        pendList.push({ curso: cr.curso, alerta: cr.alerta, dias_para_vencer: cr.dias_para_vencer });
      }

      if (cr.alerta && alertasCount[cr.alerta] !== undefined) alertasCount[cr.alerta]++;
    });

    if (pendList.length) {
      colabPend.push({
        bp: c.bp, nome: c.nome, email: c.email, cargo: c.cargo,
        gestor: c.gestor, email_gestor: c.email_gestor, area: c.area,
        pendentes: pendList, qtd_pend: pendList.length
      });
    }
  }

  colabPend.sort((a, b) => b.qtd_pend - a.qtd_pend);

  // Converte Sets para contagem
  const gestorFinal = {};
  for (const g in gestorStats) {
    gestorFinal[g] = { ok: gestorStats[g].ok, pend: gestorStats[g].pend, pessoas: gestorStats[g].pessoas.size, email: gestorStats[g].email };
  }
  const cargoFinal = {};
  for (const cg in cargoStats) {
    cargoFinal[cg] = { ok: cargoStats[cg].ok, pend: cargoStats[cg].pend, pessoas: cargoStats[cg].pessoas.size };
  }
  const areaFinal = {};
  for (const a in areaStats) {
    areaFinal[a] = { ok: areaStats[a].ok, pend: areaStats[a].pend, pessoas: areaStats[a].pessoas.size };
  }

  const conformidade = (totalOk + totalPend) ? Math.round((totalOk / (totalOk + totalPend)) * 1000) / 10 : 0;
  const hoje = new Date();

  const summary = {
    total_colabs: Object.keys(colabs).length,
    total_registros: totalRegistros,
    data_atualizacao: hoje.toLocaleDateString('pt-BR'),
    total_ok: totalOk,
    total_pend: totalPend,
    conformidade,
    vencidos: alertasCount.VENCIDO,
    vence_7: alertasCount['7_DIAS'],
    vence_15: alertasCount['15_DIAS'],
    vence_30: alertasCount['30_DIAS'],
    vence_60: alertasCount['60_DIAS'],
    colabs_com_pendencia: colabPend.length
  };

  return {
    summary,
    colab_pend: colabPend,
    gestor_stats: gestorFinal,
    cargo_stats: cargoFinal,
    curso_stats: cursoStats,
    area_stats: areaFinal,
    all_colabs: Object.values(colabs)
  };
}

// ── CARREGAMENTO PRINCIPAL ───────────────────────────────────

let liveDataCache = null;
let liveDataCacheTime = 0;

async function carregarDadosAoVivo() {
  const agora = Date.now();
  if (liveDataCache && (agora - liveDataCacheTime) < LIVE_CONFIG.CACHE_MS) {
    return liveDataCache;
  }

  const url = buildCsvUrl() + '&_=' + agora; // cache-bust
  const resp = await fetch(url);

  if (!resp.ok) {
    throw new Error(`Falha ao buscar planilha (HTTP ${resp.status}). Verifique se o link de compartilhamento está como "Qualquer pessoa com o link pode visualizar".`);
  }

  const text = await resp.text();
  const rows = parseCSV(text);
  const { colabs, totalRegistros } = processarRegistros(rows);
  const stats = calcularEstatisticas(colabs, totalRegistros);

  liveDataCache = stats;
  liveDataCacheTime = agora;
  return stats;
}

// ── INICIALIZAÇÃO — substitui window.LATAM_DATA pelos dados ao vivo ──

window.LATAM_LIVE = {
  carregar: carregarDadosAoVivo,
  config: LIVE_CONFIG
};
