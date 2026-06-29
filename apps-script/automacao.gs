// ============================================================
// LATAM Airlines CGH — Automação de E-mails de Treinamentos
// Google Apps Script — Copie e cole no editor do Google Sheets
//
// CONFIGURAÇÃO:
//   1. Abra o Google Sheets com a planilha principal
//   2. Extensões > Apps Script
//   3. Cole este código
//   4. Crie trigger: Executar > Adicionar gatilho
//      Função: verificarEEnviarAlertas
//      Evento: Baseado em tempo > Dia > 08:00
// ============================================================

// ── CONFIGURAÇÕES ────────────────────────────────────────────

const CONFIG = {
  // Nome da aba principal com todos os dados
  ABA_PRINCIPAL: 'RELAÇÃO GERAL COLABORADORES CGH',

  // Aba de controle de envios (será criada se não existir)
  ABA_CONTROLE: 'Controle_Alertas',

  // Coluna de e-mail do colaborador (índice 0 = coluna A)
  COL_EMAIL_COLAB:   3,   // coluna D
  COL_EMAIL_GESTOR:  7,   // coluna H
  COL_NOME:          2,   // coluna C
  COL_BP:            1,   // coluna B
  COL_CARGO:         4,   // coluna E
  COL_GESTOR:        8,   // coluna I
  COL_CURSO:         11,  // coluna L
  COL_VALIDADE:      16,  // coluna Q
  COL_VENCIMENTO:    17,  // coluna R
  COL_STATUS:        18,  // coluna S

  // Remetente (deve ser e-mail do proprietário do script)
  REMETENTE_NOME: 'LATAM Airlines — Gestão de Treinamentos CGH',

  // Limites de dias para alertas
  ALERTAS: [60, 30, 15, 7, 0], // 0 = vencido

  // Não enviar novamente para o mesmo colaborador+curso no mesmo tipo de alerta
  // dentro do período em dias
  COOLDOWN_DIAS: {
    '60_DIAS': 10,
    '30_DIAS': 5,
    '15_DIAS': 3,
    '7_DIAS':  2,
    'VENCIDO': 1
  }
};

// ── FUNÇÃO PRINCIPAL ─────────────────────────────────────────

/**
 * Função principal — executada diariamente às 08:00 pelo trigger.
 * Verifica todos os vencimentos e envia e-mails conforme as regras.
 */
function verificarEEnviarAlertas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const planilha = ss.getSheetByName(CONFIG.ABA_PRINCIPAL);
  if (!planilha) {
    Logger.log('ERRO: Aba principal não encontrada: ' + CONFIG.ABA_PRINCIPAL);
    return;
  }

  // Garante aba de controle
  const controle = obterOuCriarControle(ss);

  // Lê todos os dados da planilha principal
  const dados = planilha.getDataRange().getValues();
  const headers = dados[0];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let enviados = 0;
  let erros = 0;

  Logger.log(`Iniciando verificação — ${hoje.toLocaleDateString('pt-BR')} — ${dados.length - 1} registros`);

  // Carrega mapa de alertas já enviados para evitar duplicação
  const enviados_map = carregarMapaEnviados(controle);

  // Agrupa por colaborador para enviar um único e-mail consolidado
  const colabMap = new Map();

  for (let i = 1; i < dados.length; i++) {
    const row = dados[i];
    const status = (row[CONFIG.COL_STATUS] || '').toString().toUpperCase().trim();

    // Ignora registros OK ou sem data
    if (status === 'OK') continue;

    const emailColab  = (row[CONFIG.COL_EMAIL_COLAB]  || '').toString().trim();
    const emailGestor = (row[CONFIG.COL_EMAIL_GESTOR] || '').toString().trim();
    const nome        = (row[CONFIG.COL_NOME]         || '').toString().trim();
    const bp          = (row[CONFIG.COL_BP]           || '').toString().trim();
    const cargo       = (row[CONFIG.COL_CARGO]        || '').toString().trim();
    const gestor      = (row[CONFIG.COL_GESTOR]       || '').toString().trim();
    const curso       = (row[CONFIG.COL_CURSO]        || '').toString().trim();
    const vencStr     = row[CONFIG.COL_VENCIMENTO];

    if (!emailColab || !curso || !vencStr) continue;

    // Calcula dias até o vencimento
    let vencimento = null;
    if (vencStr instanceof Date) {
      vencimento = new Date(vencStr);
      vencimento.setHours(0, 0, 0, 0);
    }

    if (!vencimento) continue;

    const diasParaVencer = Math.floor((vencimento - hoje) / (1000 * 60 * 60 * 24));
    const tipoAlerta = determinarTipoAlerta(diasParaVencer);

    if (!tipoAlerta) continue;

    // Verifica cooldown
    const chave = `${bp}|${curso}|${tipoAlerta}`;
    if (dentroDoLimite(enviados_map, chave, CONFIG.COOLDOWN_DIAS[tipoAlerta])) continue;

    // Agrupa no mapa do colaborador
    if (!colabMap.has(bp)) {
      colabMap.set(bp, {
        nome, bp, cargo, gestor,
        emailColab, emailGestor,
        cursos: []
      });
    }
    colabMap.get(bp).cursos.push({
      curso, vencimento, diasParaVencer, tipoAlerta, chave, linha: i + 1
    });
  }

  // Envia e-mails agrupados
  for (const [bp, colab] of colabMap) {
    try {
      const resultado = enviarEmailColab(colab);
      if (resultado) {
        enviados++;
        // Registra envios no controle
        colab.cursos.forEach(c => {
          registrarEnvio(controle, c.chave, c.tipoAlerta);
        });
      }
    } catch (e) {
      Logger.log(`ERRO ao enviar para ${colab.nome} (${colab.emailColab}): ${e}`);
      erros++;
    }
    Utilities.sleep(200); // evita throttling do Gmail
  }

  Logger.log(`Concluído — Enviados: ${enviados} | Erros: ${erros}`);

  // Envia resumo para os administradores
  if (enviados > 0) {
    enviarResumoAdmin(enviados, erros, colabMap);
  }
}

// ── DETERMINA TIPO DE ALERTA ─────────────────────────────────

function determinarTipoAlerta(dias) {
  if (dias < 0)  return 'VENCIDO';
  if (dias <= 7)  return '7_DIAS';
  if (dias <= 15) return '15_DIAS';
  if (dias <= 30) return '30_DIAS';
  if (dias <= 60) return '60_DIAS';
  return null;
}

// ── MONTA E ENVIA E-MAIL PARA COLABORADOR ───────────────────

function enviarEmailColab(colab) {
  const { nome, cargo, gestor, emailColab, emailGestor, cursos } = colab;

  // Determina o alerta mais urgente
  const urgencias = ['VENCIDO', '7_DIAS', '15_DIAS', '30_DIAS', '60_DIAS'];
  const alertaMaisUrgente = cursos
    .map(c => urgencias.indexOf(c.tipoAlerta))
    .reduce((a, b) => Math.min(a, b), 999);
  const tipo = urgencias[alertaMaisUrgente] || '60_DIAS';

  // Monta assunto
  const assunto = montarAssunto(tipo, nome, cursos.length);

  // Monta corpo HTML
  const corpo = montarCorpoEmail(tipo, colab);

  // Destinatários conforme regra
  const destinatarios = montarDestinatarios(tipo, emailColab, emailGestor);

  // Envia
  GmailApp.sendEmail(
    destinatarios.para,
    assunto,
    '', // corpo texto simples (sem estilo)
    {
      htmlBody: corpo,
      name: CONFIG.REMETENTE_NOME,
      cc: destinatarios.cc || '',
      noReply: true
    }
  );

  Logger.log(`✅ Enviado para ${nome} (${emailColab}) — ${tipo} — ${cursos.length} curso(s)`);
  return true;
}

function montarAssunto(tipo, nome, qtd) {
  const nomeAbrev = nome.split(' ').slice(0, 2).join(' ');
  const plural = qtd > 1 ? `${qtd} cursos` : '1 curso';
  switch (tipo) {
    case 'VENCIDO':  return `🔴 [URGENTE] Curso(s) VENCIDO(S) — ${nomeAbrev}`;
    case '7_DIAS':   return `🔴 [AÇÃO IMEDIATA] ${plural} vence em até 7 dias — ${nomeAbrev}`;
    case '15_DIAS':  return `🟠 [ATENÇÃO] ${plural} vence em até 15 dias — ${nomeAbrev}`;
    case '30_DIAS':  return `🟡 [LEMBRETE] ${plural} vence em até 30 dias — ${nomeAbrev}`;
    case '60_DIAS':  return `🔵 [AVISO] ${plural} vence em até 60 dias — ${nomeAbrev}`;
    default:         return `[Treinamentos] Alerta para ${nomeAbrev}`;
  }
}

function montarDestinatarios(tipo, emailColab, emailGestor) {
  // 60 dias: só colaborador
  // 30 dias: só colaborador
  // 15 dias: só colaborador (solicitar agendamento com gestor)
  // 7 dias: colaborador + gestor
  // vencido: colaborador + gestor
  if (tipo === '7_DIAS' || tipo === 'VENCIDO') {
    return { para: emailColab, cc: emailGestor };
  }
  return { para: emailColab, cc: '' };
}

function montarCorpoEmail(tipo, colab) {
  const { nome, cargo, gestor, cursos } = colab;

  const corHeader = tipo === 'VENCIDO' || tipo === '7_DIAS' ? '#C00000'
    : tipo === '15_DIAS' ? '#E36C09'
    : tipo === '30_DIAS' ? '#F0A500'
    : '#005B9A';

  const icone = tipo === 'VENCIDO' ? '🔴'
    : tipo === '7_DIAS'  ? '🔴'
    : tipo === '15_DIAS' ? '🟠'
    : tipo === '30_DIAS' ? '🟡' : '🔵';

  const mensagemPrincipal = {
    'VENCIDO':  `Seu(s) treinamento(s) abaixo <strong>já estão VENCIDOS</strong>. É necessário regularizá-los com <strong>urgência</strong>. Cursos vencidos impactam sua habilitação operacional.`,
    '7_DIAS':   `Atenção! Seu(s) treinamento(s) abaixo vencem em <strong>até 7 dias</strong>. Entre em contato imediatamente com seu gestor <strong>${gestor.split(' ')[0]}</strong> para agendar a renovação.`,
    '15_DIAS':  `Seu(s) treinamento(s) vencem em <strong>até 15 dias</strong>. Solicitamos que você <strong>agende a renovação junto ao seu gestor</strong> com a maior brevidade possível.`,
    '30_DIAS':  `Lembrete: seu(s) treinamento(s) vencem em <strong>até 30 dias</strong>. Fique atento para realizar a renovação dentro do prazo.`,
    '60_DIAS':  `Aviso antecipado: seu(s) treinamento(s) vencem em <strong>até 60 dias</strong>. Organize sua agenda para renovar com antecedência.`
  }[tipo];

  const linhasCursos = cursos.map(c => {
    const vencStr = c.vencimento instanceof Date
      ? c.vencimento.toLocaleDateString('pt-BR')
      : c.vencimento;
    const diasStr = c.diasParaVencer < 0
      ? `<span style="color:#C00000;font-weight:bold">${Math.abs(c.diasParaVencer)} dias vencido</span>`
      : c.diasParaVencer <= 7
        ? `<span style="color:#C00000;font-weight:bold">Em ${c.diasParaVencer} dia(s)</span>`
        : `<span style="color:#666">Em ${c.diasParaVencer} dias</span>`;
    return `<tr>
      <td style="padding:8px;border:1px solid #eee;font-size:13px">${c.curso}</td>
      <td style="padding:8px;border:1px solid #eee;text-align:center;font-size:13px">${vencStr}</td>
      <td style="padding:8px;border:1px solid #eee;text-align:center;font-size:13px">${diasStr}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f7fa;margin:0;padding:20px">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#002855,#005B9A);padding:24px;text-align:center">
    <div style="font-size:28px">✈️</div>
    <h1 style="color:#fff;font-size:16px;margin:8px 0 2px;font-weight:700">LATAM Airlines — Base CGH</h1>
    <p style="color:rgba(255,255,255,.7);font-size:11px;margin:0">Gestão de Treinamentos Obrigatórios</p>
  </div>

  <!-- ALERTA BANNER -->
  <div style="background:${corHeader};padding:12px 24px;color:#fff;font-size:13px;font-weight:700;text-align:center">
    ${icone} ${tipo === 'VENCIDO' ? 'TREINAMENTO VENCIDO — AÇÃO URGENTE NECESSÁRIA'
               : tipo === '7_DIAS' ? 'VENCIMENTO EM 7 DIAS — AÇÃO IMEDIATA'
               : tipo === '15_DIAS' ? 'VENCIMENTO EM 15 DIAS — AGENDAR RENOVAÇÃO'
               : tipo === '30_DIAS' ? 'LEMBRETE DE VENCIMENTO — 30 DIAS'
               : 'AVISO ANTECIPADO — 60 DIAS'}
  </div>

  <!-- CORPO -->
  <div style="padding:24px">
    <p style="font-size:14px;color:#333;margin-bottom:8px">Olá, <strong>${nome.split(' ')[0]}</strong>!</p>
    <p style="font-size:13px;color:#555;line-height:1.6;margin-bottom:16px">${mensagemPrincipal}</p>

    <!-- TABELA DE CURSOS -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead>
        <tr style="background:#002855;color:#fff">
          <th style="padding:10px;text-align:left;font-size:12px">Curso</th>
          <th style="padding:10px;text-align:center;font-size:12px;width:120px">Vencimento</th>
          <th style="padding:10px;text-align:center;font-size:12px;width:120px">Situação</th>
        </tr>
      </thead>
      <tbody>${linhasCursos}</tbody>
    </table>

    <!-- DADOS DO COLABORADOR -->
    <div style="background:#f5f7fa;border-radius:6px;padding:14px;margin-bottom:16px;font-size:12px;color:#666;border-left:4px solid #005B9A">
      <strong style="color:#333">Seus dados:</strong><br>
      BP: ${colab.bp} · Cargo: ${cargo}<br>
      Gestor: ${gestor}
    </div>

    <!-- INSTRUÇÕES ESPECÍFICAS -->
    ${tipo === '15_DIAS' || tipo === '7_DIAS' || tipo === 'VENCIDO' ? `
    <div style="background:#FEE8E8;border-radius:6px;padding:14px;margin-bottom:16px;font-size:12px;border-left:4px solid #C00000">
      <strong style="color:#C00000">📋 Como proceder:</strong><br>
      1. Entre em contato com seu gestor imediatamente<br>
      2. Solicite o agendamento da renovação do curso<br>
      3. Guarde o comprovante de realização<br>
      4. Comunique a conclusão ao RH/Treinamentos
    </div>` : ''}

    <p style="font-size:11px;color:#999;margin-top:20px;padding-top:16px;border-top:1px solid #eee">
      Este é um e-mail automático do Sistema de Gestão de Treinamentos da LATAM Airlines — Base Congonhas (CGH).<br>
      Em caso de dúvidas, entre em contato com seu gestor ou com a equipe de Treinamentos.
    </p>
  </div>

  <!-- FOOTER -->
  <div style="background:#002855;padding:14px;text-align:center">
    <p style="color:rgba(255,255,255,.5);font-size:10px;margin:0">
      ✈ LATAM Airlines · Base Congonhas (CGH) · Coordenador: Higor Oscar
    </p>
  </div>
</div>
</body>
</html>`;
}

// ── RESUMO PARA ADMINISTRADORES ───────────────────────────────

function enviarResumoAdmin(totalEnviados, totalErros, colabMap) {
  // Substitua pelos e-mails dos administradores
  const admins = [
    'higor.oscar@latam.com',
    'flavia.maciel@latam.com'
  ];

  const hoje = new Date().toLocaleDateString('pt-BR');
  const assunto = `[LATAM CGH] Relatório Diário de Treinamentos — ${hoje}`;

  // Conta por tipo
  const countTipo = { VENCIDO: 0, '7_DIAS': 0, '15_DIAS': 0, '30_DIAS': 0, '60_DIAS': 0 };
  for (const [, colab] of colabMap) {
    colab.cursos.forEach(c => { if (countTipo[c.tipoAlerta] !== undefined) countTipo[c.tipoAlerta]++; });
  }

  const corpo = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:20px">
  <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #ddd">
    <h2 style="color:#002855;font-size:16px;border-bottom:2px solid #F0A500;padding-bottom:8px">
      ✈ LATAM CGH — Relatório Diário de Alertas — ${hoje}
    </h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><th style="background:#002855;color:#fff;padding:8px;text-align:left">Tipo</th>
          <th style="background:#002855;color:#fff;padding:8px;text-align:center">Qtd. E-mails</th></tr>
      <tr><td style="padding:8px;border:1px solid #eee">🔴 Vencidos</td><td style="padding:8px;border:1px solid #eee;text-align:center;color:#C00000;font-weight:bold">${countTipo.VENCIDO}</td></tr>
      <tr><td style="padding:8px;border:1px solid #eee">🔴 7 dias</td><td style="padding:8px;border:1px solid #eee;text-align:center">${countTipo['7_DIAS']}</td></tr>
      <tr><td style="padding:8px;border:1px solid #eee">🟠 15 dias</td><td style="padding:8px;border:1px solid #eee;text-align:center">${countTipo['15_DIAS']}</td></tr>
      <tr><td style="padding:8px;border:1px solid #eee">🟡 30 dias</td><td style="padding:8px;border:1px solid #eee;text-align:center">${countTipo['30_DIAS']}</td></tr>
      <tr><td style="padding:8px;border:1px solid #eee">🔵 60 dias</td><td style="padding:8px;border:1px solid #eee;text-align:center">${countTipo['60_DIAS']}</td></tr>
      <tr style="background:#f5f7fa"><td style="padding:8px;border:1px solid #eee"><strong>Total enviados</strong></td>
          <td style="padding:8px;border:1px solid #eee;text-align:center;font-weight:bold">${totalEnviados}</td></tr>
    </table>
    ${totalErros > 0 ? `<p style="color:#C00000;font-size:12px">⚠ ${totalErros} erro(s) ao enviar. Verifique o log do Apps Script.</p>` : ''}
    <p style="font-size:11px;color:#999">Sistema Automático de Treinamentos · LATAM Airlines Base CGH</p>
  </div>
  </body></html>`;

  admins.forEach(admin => {
    try {
      GmailApp.sendEmail(admin, assunto, '', { htmlBody: corpo, name: CONFIG.REMETENTE_NOME });
    } catch(e) {
      Logger.log('Erro ao enviar resumo para ' + admin + ': ' + e);
    }
  });
}

// ── CONTROLE DE ENVIOS ────────────────────────────────────────

function obterOuCriarControle(ss) {
  let aba = ss.getSheetByName(CONFIG.ABA_CONTROLE);
  if (!aba) {
    aba = ss.insertSheet(CONFIG.ABA_CONTROLE);
    aba.appendRow(['Chave', 'Tipo_Alerta', 'Data_Envio', 'Timestamp']);
    aba.setFrozenRows(1);
    Logger.log('Aba de controle criada: ' + CONFIG.ABA_CONTROLE);
  }
  return aba;
}

function carregarMapaEnviados(aba) {
  const dados = aba.getDataRange().getValues();
  const mapa = new Map();
  for (let i = 1; i < dados.length; i++) {
    const chave = dados[i][0];
    const data  = dados[i][3]; // timestamp
    if (chave && data) {
      mapa.set(chave, new Date(data));
    }
  }
  return mapa;
}

function dentroDoLimite(mapa, chave, cooldownDias) {
  if (!mapa.has(chave)) return false;
  const ultimoEnvio = mapa.get(chave);
  const agora = new Date();
  const diffDias = (agora - ultimoEnvio) / (1000 * 60 * 60 * 24);
  return diffDias < cooldownDias;
}

function registrarEnvio(aba, chave, tipo) {
  const agora = new Date();
  aba.appendRow([
    chave,
    tipo,
    agora.toLocaleDateString('pt-BR'),
    agora
  ]);
}

// ── FUNÇÃO DE TESTE (execute manualmente para testar) ────────

/**
 * Testa o envio de um e-mail de alerta (use para validar o template).
 * Modifique o e-mail abaixo antes de executar.
 */
function testarEnvioEmail() {
  const colab = {
    nome: 'COLABORADOR TESTE',
    bp: '0000000',
    cargo: 'AGENTE AEROPORTO',
    gestor: 'GESTOR TESTE',
    emailColab: Session.getActiveUser().getEmail(), // envia para você mesmo
    emailGestor: '',
    cursos: [
      { curso: 'AVSEC PARA ATENDIMENTO AO PASSAGEIRO', vencimento: new Date(), diasParaVencer: -3, tipoAlerta: 'VENCIDO', chave: 'test', linha: 1 },
      { curso: 'CRM (CORPORATE RESOURCE MANAGEMENT)',  vencimento: new Date(Date.now() + 5*86400000), diasParaVencer: 5, tipoAlerta: '7_DIAS', chave: 'test2', linha: 2 }
    ]
  };

  try {
    enviarEmailColab(colab);
    SpreadsheetApp.getUi().alert('✅ E-mail de teste enviado para ' + colab.emailColab);
  } catch(e) {
    SpreadsheetApp.getUi().alert('❌ Erro: ' + e.toString());
  }
}

/**
 * Mostra estatísticas do último ciclo de alertas.
 */
function mostrarEstatisticasAlertas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const controle = ss.getSheetByName(CONFIG.ABA_CONTROLE);
  if (!controle) {
    SpreadsheetApp.getUi().alert('Aba de controle não encontrada. Execute verificarEEnviarAlertas primeiro.');
    return;
  }
  const dados = controle.getDataRange().getValues();
  SpreadsheetApp.getUi().alert(`Total de alertas registrados: ${dados.length - 1}`);
}
