# ✈ LATAM Airlines CGH — Sistema de Gestão de Treinamentos

> Plataforma corporativa completa para monitoramento, gestão e automação dos treinamentos obrigatórios da Base Congonhas (CGH).

---

## 📋 Visão Geral

Sistema desenvolvido em HTML5/CSS3/JavaScript puro, hospedável no **GitHub Pages** (sem servidor backend necessário), com automação de e-mails via **Google Apps Script** integrado ao **Google Sheets**.

### Funcionalidades

| Módulo | Descrição |
|---|---|
| **Dashboard Executivo** | KPIs, semáforo, gráficos de conformidade, top cursos e gestores |
| **ATO** | Visão completa da área de Atendimento ao Passageiro |
| **GRH** | Visão completa da área de Ground Handling (Rampa) |
| **Pendentes** | Lista filtrada de todos os colaboradores com pendências |
| **Ranking Gestores** | Conformidade e pendências por supervisor imediato |
| **Ranking Cargos** | Distribuição de pendências por função |
| **Cursos** | Status de todos os 35 cursos obrigatórios |
| **Críticos** | Colaboradores, cursos e gestores em situação crítica |
| **Automação** | Painel de alertas + Google Apps Script de e-mails |
| **IA Assistente** | Chat para consultas em linguagem natural |
| **Busca** | Pesquisa por nome, BP, cargo, gestor ou e-mail |

---

## 🗂️ Estrutura do Projeto

```
latam-treinamentos/
├── index.html                    # Aplicação principal
├── css/
│   └── main.css                  # Estilos globais e componentes
├── js/
│   ├── app.js                    # Lógica da aplicação
│   └── data.js                   # Dados processados (gerado pelo script Python)
├── apps-script/
│   └── automacao.gs              # Google Apps Script — Automação de e-mails
├── scripts/
│   └── gerar_data.py             # Script Python para gerar data.js a partir do Excel
└── README.md
```

---

## 🚀 Publicação no GitHub Pages

### Passo a Passo

1. **Crie um repositório** no GitHub (ex: `latam-treinamentos-cgh`)

2. **Faça o upload de todos os arquivos** para a branch `main`:
   ```
   index.html
   css/main.css
   js/app.js
   js/data.js
   apps-script/automacao.gs
   README.md
   ```

3. **Ative o GitHub Pages**:
   - Vá em `Settings → Pages`
   - Em **Source**, selecione `Deploy from a branch`
   - Selecione a branch `main` e a pasta `/ (root)`
   - Clique em **Save**

4. **Aguarde 1-2 minutos** — o sistema estará disponível em:
   ```
   https://SEU-USUARIO.github.io/latam-treinamentos-cgh/
   ```

---

## 🔄 Atualização dos Dados

Sempre que a planilha Excel for atualizada, siga estes passos para regenerar o `data.js`:

### Com Python (recomendado)

```bash
# Instale as dependências
pip install openpyxl

# Execute o script
python scripts/gerar_data.py --arquivo "CGH_ATUALIZADA_COM_EMAILS_COMPLETO.xlsx"

# O arquivo js/data.js será gerado automaticamente
# Faça o commit e push do novo data.js para o GitHub
git add js/data.js
git commit -m "Atualização dados $(date +%d/%m/%Y)"
git push
```

### Manualmente

Abra `js/data.js` e atualize os objetos `summary`, `colab_pend`, `gestor_stats`, `cargo_stats`, `curso_stats`, `area_stats` e `all_colabs` conforme os dados mais recentes da planilha.

---

## ⚙️ Automação de E-mails — Google Apps Script

### Regras de Notificação

| Prazo | Destinatário | Ação |
|---|---|---|
| 60 dias | Colaborador | Aviso antecipado |
| 30 dias | Colaborador | Lembrete de renovação |
| 15 dias | Colaborador | Solicitar agendamento com gestor |
| 7 dias | Colaborador **+** Gestor | Ação imediata |
| Vencido | Colaborador **+** Gestor | Urgente — habilitação em risco |

### Configuração

1. Abra o **Google Sheets** com a planilha `RELAÇÃO GERAL COLABORADORES CGH`
2. Acesse **Extensões → Apps Script**
3. Cole o conteúdo de `apps-script/automacao.gs`
4. Ajuste os e-mails dos administradores em `enviarResumoAdmin()`:
   ```javascript
   const admins = [
     'higor.oscar@latam.com',
     'flavia.maciel@latam.com'
   ];
   ```
5. Execute **`testarEnvioEmail()`** para validar o template
6. Crie o gatilho automático:
   - **Adicionar Gatilho**
   - Função: `verificarEEnviarAlertas`
   - Evento: **Baseado em tempo → Diário → 08:00–09:00**
7. Autorize as permissões quando solicitado

### Colunas Esperadas da Planilha

O script lê a aba `RELAÇÃO GERAL COLABORADORES CGH` com estas colunas:

| Col | Letra | Campo |
|---|---|---|
| B | 2 | BP (matrícula) |
| C | 3 | Nome completo |
| D | 4 | E-mail do colaborador |
| E | 5 | Cargo |
| H | 8 | E-mail do gestor |
| I | 9 | Nome do gestor |
| L | 12 | Nome do curso |
| Q | 17 | Validade (meses) |
| R | 18 | Data de vencimento |
| S | 19 | STATUS (OK / PENDENTE) |

---

## 🤖 IA Assistente — Perguntas Suportadas

O assistente integrado responde em linguagem natural:

- `"Quem está com treinamento vencido?"`
- `"Quem vence em 15 dias?"`
- `"Quem vence em 30 dias?"`
- `"Quais cursos possuem mais pendências?"`
- `"Quais gestores possuem mais colaboradores vencidos?"`
- `"Como está a conformidade geral?"`
- `"Comparativo ATO vs GRH"`

---

## 📊 Dados da Base CGH (Jun/2026)

| Indicador | Valor |
|---|---|
| Total de colaboradores | 877 |
| Total de registros | 15.617 |
| Cursos obrigatórios | 35 |
| Conformidade global | **98,3%** |
| Cursos em dia | 15.345 |
| Pendências totais | 272 |
| Colaboradores c/ pendência | 121 |
| Vencimentos ≤ 7 dias | 19 |
| Vencimentos ≤ 30 dias | 48 |
| Vencimentos ≤ 60 dias | 127 |

---

## 🎨 Identidade Visual

| Elemento | Código |
|---|---|
| Azul escuro (primary) | `#002855` |
| Azul médio | `#003366` |
| Azul claro | `#005B9A` |
| Amarelo LATAM | `#F0A500` |
| Verde (OK) | `#217346` |
| Vermelho (crítico) | `#C00000` |
| Laranja (alerta) | `#E36C09` |

---

## 🛠️ Tecnologias

- **HTML5** — Estrutura semântica
- **CSS3** — Grid, Flexbox, variáveis CSS, responsivo
- **JavaScript ES6** — Módulos, arrow functions, destructuring
- **Chart.js 4.4** — Gráficos interativos (donut, barras horizontais/verticais)
- **Google Sheets** — Fonte de dados primária
- **Google Apps Script** — Automação de e-mails diários
- **GitHub Pages** — Hospedagem gratuita

---

## 📞 Responsáveis

| Papel | Nome |
|---|---|
| Coordenador CGH | Higor Oscar |
| Regional | Flávia Maciel |
| Base | Congonhas (CGH) |

---

## 📄 Licença

Uso interno LATAM Airlines. Todos os direitos reservados.
