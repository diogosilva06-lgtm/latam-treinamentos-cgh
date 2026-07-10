/* ============================================================
   LATAM Airlines — Sistema de Gestão de Treinamentos CGH
   live-data.js — Carregamento de Dados em Tempo Real (v2)
   ============================================================
   Busca os dados direto do Apps Script (Web App) via JSONP.
   JSONP usa uma tag <script>, não um fetch/XHR — por isso NÃO
   sofre bloqueio de CORS, ao contrário do CSV export do Google
   Sheets usado na versão anterior.
   ============================================================ */

'use strict';

// ── CONFIGURAÇÃO ────────────────────────────────────────────
const LIVE_CONFIG = {
  // Mesma URL do Web App usada no formulario.html (.../exec)
 WEBAPP_URL: 'https://script.google.com/a/macros/latam.com/s/AKfycbwyaViTLEvfMWgTi3_esNzEFM9R4faG-GHO29Kn6JuFg7BlVP1GUi5oIZNXEnsKUu6zRA/exec',

  // Cache em memória para não buscar de novo a cada troca de aba
  CACHE_MS: 5 * 60 * 1000, // 5 minutos

  // Tempo máximo esperando resposta do Apps Script
  TIMEOUT_MS: 15000
};

// ── JSONP GENÉRICO ──────────────────────────────────────────
let jsonpCounter = 0;

function jsonpRequest(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'latamCallback_' + Date.now() + '_' + (jsonpCounter++);
    const script = document.createElement('script');
    let finished = false;

    const limpar = () => {
      delete window[callbackName];
      script.remove();
      clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      limpar();
      reject(new Error('Tempo esgotado ao buscar dados da planilha.'));
    }, LIVE_CONFIG.TIMEOUT_MS);

    window[callbackName] = (data) => {
      if (finished) return;
      finished = true;
      limpar();
      resolve(data);
    };

    script.onerror = () => {
      if (finished) return;
      finished = true;
      limpar();
      reject(new Error('Falha ao carregar dados (verifique a URL do Apps Script e o deployment).'));
    };

    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + callbackName;
    document.body.appendChild(script);
  });
}

// ── CARREGAMENTO PRINCIPAL ───────────────────────────────────
let liveDataCache = null;
let liveDataCacheTime = 0;

async function carregarDadosAoVivo() {
  const agora = Date.now();
  if (liveDataCache && (agora - liveDataCacheTime) < LIVE_CONFIG.CACHE_MS) {
    return liveDataCache;
  }

  const url = `${LIVE_CONFIG.WEBAPP_URL}?acao=dados&_=${agora}`;
  const resposta = await jsonpRequest(url);

  if (!resposta || resposta.ok !== true) {
    throw new Error((resposta && resposta.dados && resposta.dados.erro) || 'Resposta inválida do backend.');
  }

  liveDataCache = resposta.dados;
  liveDataCacheTime = agora;
  return resposta.dados;
}

// ── EXPÕE PARA O index.html ──────────────────────────────────
window.LATAM_LIVE = {
  carregar: carregarDadosAoVivo,
  config: LIVE_CONFIG
};
