import * as store from '../store.js';
import { getConfig } from '../config.js';
import { recomendar, derivar, criterioP, rotuloNutriente } from '../calc.js';
import { CULTURAS, getCultura, modalidadeId } from '../data/culturas.js';
import { CRITERIOS_P, CRITERIOS_K, CLASSES_ARGILA, classeArgila } from '../data/interpretacao.js';
import { extrairArquivo, iaDisponivel } from '../extract/index.js';
import { textoResumo } from './relatorio.js';
import { esc, num, fmt, fmtInput, moeda, chipNivel, toast, debounce, aviso } from '../ui.js';
import { icone } from '../icons.js';

const IDENT = [
  ['info.talhao', 'Talhão / área'],
  ['info.areaHa', 'Área', 'num', 'ha'],
  ['info.produtor', 'Produtor'],
  ['info.propriedade', 'Propriedade'],
  ['info.municipio', 'Município'],
  ['info.dataColeta', 'Data da coleta', 'date'],
  ['info.profundidade', 'Profundidade', 'text', 'cm'],
  ['info.laboratorio', 'Laboratório'],
  ['info.codigo', 'Nº da amostra'],
];

const GRUPOS = [
  ['Acidez', [
    ['phCaCl2', 'pH CaCl₂'], ['phH2O', 'pH H₂O'], ['phSMP', 'pH SMP'],
    ['al', 'Alumínio (Al³⁺)', 'cmolc'], ['hal', 'H+Al', 'cmolc'],
  ]],
  ['Macronutrientes', [
    ['ca', 'Cálcio (Ca)', 'cmolc'], ['mg', 'Magnésio (Mg)', 'cmolc'], ['k', 'Potássio (K)', 'cmolc'],
    ['p', 'Fósforo Mehlich-1', 'mg/dm³'], ['s', 'Enxofre (S)', 'mg/dm³'], ['mo', 'Matéria orgânica', 'g/dm³'],
    ['na', 'Sódio (Na)', 'cmolc'],
  ]],
  ['Micronutrientes', [
    ['b', 'Boro (B)', 'mg/dm³'], ['cu', 'Cobre (Cu)', 'mg/dm³'], ['fe', 'Ferro (Fe)', 'mg/dm³'],
    ['mn', 'Manganês (Mn)', 'mg/dm³'], ['zn', 'Zinco (Zn)', 'mg/dm³'],
  ]],
  ['Textura e CTC', [
    ['argila', 'Argila', 'g/kg'], ['ctc', 'CTC pH 7 do laudo', 'cmolc'],
  ]],
];

const ETAPAS = [
  ['laudo', 'Laudo', 'Valores da análise'],
  ['cultura', 'Cultura', 'O que vai plantar'],
  ['resultado', 'Resultado', 'Calagem e adubos'],
];

export async function criarNova() {
  const a = await store.salvar('analises', { id: store.uuid(), criadoEm: Date.now(), info: {}, solo: {}, plano: {} });
  return a.id;
}

export async function render(el, { id, aba = 'laudo' }) {
  let a = await store.obter('analises', id);
  if (!a || a.deleted) {
    el.innerHTML = `<div class="card vazio"><h2>Análise não encontrada</h2><p>Ela pode ter sido excluída.</p><a class="btn" href="#/">Voltar para a lista</a></div>`;
    return;
  }
  if (!ETAPAS.some(([k]) => k === aba)) aba = 'laudo';
  const cfg = await getConfig();
  let lidos = new Set();
  let statusLeitura = '';

  const salvarDepois = debounce(async () => {
    const r = await store.salvar('analises', a);
    a.updatedAt = r.updatedAt;
    a._dirty = 1;
  }, 400);

  function set(caminho, valor) {
    const [grupo, campo] = caminho.split('.');
    a.plano = a.plano || {};
    if (grupo !== 'overrides' && grupo !== 'fontes') a[grupo] = a[grupo] || {};
    if (grupo === 'overrides') {
      a.plano.overrides = a.plano.overrides || {};
      if (valor == null || valor === '') delete a.plano.overrides[campo];
      else a.plano.overrides[campo] = valor;
    } else if (grupo === 'fontes') {
      a.plano.fontes = a.plano.fontes || {};
      a.plano.fontes[campo] = valor;
    } else if (valor == null || valor === '') delete a[grupo][campo];
    else a[grupo][campo] = valor;
    salvarDepois();
  }

  function get(caminho) {
    const [grupo, campo] = caminho.split('.');
    if (grupo === 'overrides') return a.plano?.overrides?.[campo];
    if (grupo === 'fontes') return a.plano?.fontes?.[campo];
    return a[grupo]?.[campo];
  }

  const temValores = () => ['ca', 'mg', 'k', 'p'].some((k) => a.solo?.[k] != null);

  function subtitulo() {
    const cultura = getCultura(a.plano?.culturaId);
    return [a.info?.propriedade, cultura?.nome, a.info?.areaHa ? `${fmt(a.info.areaHa)} ha` : null].filter(Boolean).join(' · ') || 'Preencha os dados do laudo';
  }

  function desenhar() {
    const feitas = { laudo: temValores(), cultura: !!getCultura(a.plano?.culturaId), resultado: false };
    el.innerHTML = `
      <div class="cab">
        <a class="btn-voltar" href="#/" aria-label="Voltar para a lista">${icone('voltar', 22)}</a>
        <div class="cab-txt">
          <h1 id="titulo">${esc(a.info?.talhao || 'Nova análise')}</h1>
          <div class="cab-sub" id="subtitulo">${esc(subtitulo())}</div>
        </div>
        <div class="cab-acoes">
          <button class="btn fantasma icone perigo" data-acao="excluir" title="Excluir análise" aria-label="Excluir análise">${icone('lixo', 20)}</button>
        </div>
      </div>
      <ol class="etapas" aria-label="Etapas">
        ${ETAPAS.map(([k, l, d], i) => `
          <li class="${aba === k ? 'atual' : ''} ${feitas[k] && aba !== k ? 'feita' : ''}">
            <a href="#/analise/${esc(a.id)}/${k}" ${aba === k ? 'aria-current="step"' : ''}>
              <span class="etapa-n">${feitas[k] && aba !== k ? icone('check', 14) : i + 1}</span>
              <span class="etapa-txt"><b>${l}</b><small>${d}</small></span>
            </a>
          </li>`).join('')}
      </ol>
      <div class="aba-conteudo">${aba === 'laudo' ? htmlLaudo() : aba === 'cultura' ? htmlCultura() : htmlResultado()}</div>`;
    if (aba === 'laudo') prepararImportacao();
  }

  // ---------- Etapa 1: laudo ----------
  function campo(caminho, label, tipo = 'text', unidade = '') {
    const v = get(caminho);
    const lido = lidos.has(caminho) ? ' lido' : '';
    const input = tipo === 'num'
      ? `<input data-f="${caminho}" data-t="num" inputmode="decimal" autocomplete="off" value="${esc(fmtInput(v))}">`
      : `<input data-f="${caminho}" type="${tipo}" autocomplete="off" value="${esc(v ?? '')}">`;
    return `<label class="campo${lido}"><span>${esc(label)}</span>
      ${unidade ? `<span class="entrada">${input}<span class="un">${esc(unidade)}</span></span>` : input}</label>`;
  }

  function htmlLaudo() {
    return `
      <section class="card">
        <div class="importar" id="zonaImportar">
          <div class="importar-ic">${icone('upload', 24)}</div>
          <h2>Importar laudo</h2>
          <p>Envie o PDF do laboratório ou tire uma foto do laudo. Os valores são preenchidos para você conferir.</p>
          <div class="botoes">
            <label class="btn primario so-toque">${icone('camera', 18)}Tirar foto
              <input type="file" accept="image/*" capture="environment" hidden data-acao="arquivo"></label>
            <label class="btn">${icone('arquivo', 18)}Escolher arquivo
              <input type="file" accept="application/pdf,image/*" hidden data-acao="arquivo"></label>
          </div>
          <div class="modo-leitura" id="modoLeitura"></div>
          <div id="extStatus" aria-live="polite">${statusLeitura}</div>
        </div>
        ${a.origemLeitura && !statusLeitura ? `<p class="muted small" style="margin:10px 0 0;text-align:center">Última importação: ${esc(a.origemLeitura)}</p>` : ''}
      </section>

      <section class="card">
        <h2>Identificação</h2>
        <div class="grid">${IDENT.map(([c, l, t, u]) => campo(c, l, t || 'text', u)).join('')}</div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Resultados da análise</h2>${lidos.size ? '<span class="tag alerta">Confira os campos em amarelo</span>' : ''}</div>
        ${GRUPOS.map(([g, campos]) => `
          <h3>${g}</h3>
          <div class="grid">${campos.map(([k, l, u]) => campo(`solo.${k}`, l, 'num', u)).join('')}</div>`).join('')}
        <p class="muted small" style="margin-top:14px">cmolc = cmolc/dm³. Use o fósforo Mehlich-1, o método das tabelas do manual do Paraná.</p>
      </section>

      <section class="card">
        <h2>Calculados automaticamente</h2>
        <div id="derivados">${htmlDerivados()}</div>
      </section>

      <div class="acoes-fim"><a class="btn primario" href="#/analise/${esc(a.id)}/cultura">Continuar ${icone('seta', 18)}</a></div>`;
  }

  function htmlDerivados() {
    const d = derivar(a.solo);
    const itens = [
      ['Soma de bases', d.sb, 'cmolc'], ['CTC pH 7', d.ctc, 'cmolc'], ['CTC efetiva', d.ctcEfetiva, 'cmolc'],
      ['V%', d.v, '%'], ['m% (sat. Al)', d.m, '%'], ['Relação Ca/Mg', d.caMg, ': 1'],
      ['Ca na CTC', d.caPct, '%'], ['Mg na CTC', d.mgPct, '%'], ['K na CTC', d.kPct, '%'],
    ];
    return `<dl class="metricas">${itens.map(([l, v, u]) => `<div class="metrica"><dt>${l}</dt><dd>${fmt(v)} <small>${v == null ? '' : u}</small></dd></div>`).join('')}</dl>`;
  }

  async function prepararImportacao() {
    const zona = el.querySelector('#zonaImportar');
    // arrastar e soltar (computador)
    zona.ondragover = (e) => { e.preventDefault(); zona.classList.add('arrastando'); };
    zona.ondragleave = () => zona.classList.remove('arrastando');
    zona.ondrop = (e) => {
      e.preventDefault();
      zona.classList.remove('arrastando');
      const f = e.dataTransfer.files?.[0];
      if (f) lerArquivo(f);
    };
    // como fotos serão lidas agora
    const modo = el.querySelector('#modoLeitura');
    const ia = await iaDisponivel();
    if (!modo.isConnected) return;
    modo.innerHTML = `
      <span class="pilula">${icone('check', 16)}PDF: leitura exata, sem internet</span>
      ${ia
        ? `<span class="pilula">${icone('ia', 16)}Foto: leitura por IA</span>
           <label class="check"><input type="checkbox" id="soOffline"> Ler a foto só no aparelho</label>`
        : `<span class="pilula fraca">${icone('alerta', 16)}Foto: leitura no aparelho, precisão limitada${navigator.onLine ? '' : ' (sem internet)'}</span>`}`;
  }

  async function lerArquivo(file) {
    const st = el.querySelector('#extStatus');
    const modo = el.querySelector('#soOffline')?.checked ? 'offline' : 'auto';
    st.innerHTML = '<p class="progresso"><span class="spinner"></span><span class="msg">Preparando...</span></p>';
    const msg = (m) => { const s = st.querySelector('.msg'); if (s) s.textContent = m; };
    try {
      const r = await extrairArquivo(file, { modo, progresso: msg });
      lidos = new Set();
      for (const [k, v] of Object.entries(r.solo || {})) {
        if (v == null) continue;
        a.solo[k] = v;
        lidos.add(`solo.${k}`);
      }
      for (const [k, v] of Object.entries(r.info || {})) {
        if (v == null || v === '' || !IDENT.some(([c]) => c === `info.${k}`)) continue;
        if (a.info[k] == null || a.info[k] === '') {
          a.info[k] = k === 'dataColeta' ? paraISO(v) : v;
          lidos.add(`info.${k}`);
        }
      }
      a.origemLeitura = `${r.origem} (${file.name})`;
      a = await store.salvar('analises', a);
      const n = [...lidos].filter((c) => c.startsWith('solo.')).length;
      const avisos = (r.avisos || []).map((w) => `<li>${esc(w)}</li>`).join('');
      statusLeitura = n >= 5
        ? aviso('ok', `<b>${n} valores importados</b> (${esc(r.origem)}). Confira os campos em amarelo com o laudo.${avisos ? `<ul>${avisos}</ul>` : ''}`)
        : aviso('warn', `<b>Só ${n} ${n === 1 ? 'valor foi reconhecido' : 'valores foram reconhecidos'}.</b> Complete à mão ou tente de novo: foto de frente, com boa luz e o laudo ocupando a tela. Se tiver o PDF do laboratório, use o PDF.${avisos ? `<ul>${avisos}</ul>` : ''}`);
      desenhar();
    } catch (e) {
      console.error(e);
      statusLeitura = aviso('erro', `Não foi possível ler o arquivo: ${esc(e.message)}. Digite os valores abaixo.`);
      st.innerHTML = statusLeitura;
    }
  }

  // ---------- Etapa 2: cultura ----------
  function segmento(nome, caminho, valores, atual) {
    return `<div class="segmento" role="radiogroup">${valores.map(([v, l]) => `
      <label><input type="radio" name="${nome}" data-f="${caminho}" value="${esc(v)}" ${atual === v ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
  }

  function htmlCultura() {
    const p = a.plano || {};
    const cultura = getCultura(p.culturaId);
    let det = '';
    if (cultura) {
      const mods = Object.entries(cultura.modalidades);
      const modId = modalidadeId(cultura, p.modalidade);
      const mod = cultura.modalidades[modId];
      const semArgila = classeArgila(num(a.solo?.argila)) == null;
      det = `
        <section class="card">
          <h2>Sistema de produção</h2>
          ${mods.length > 1 ? `<fieldset><legend>Fase</legend>${segmento('mod', 'plano.modalidade', mods.map(([k, m]) => [k, m.label.replace(/ \(.*\)/, '')]), modId)}</fieldset>` : ''}
          ${mod.opcao ? `<fieldset><legend>${esc(mod.opcao.label)}</legend>${segmento('opc', 'plano.opcao', mod.opcao.valores.map((v) => [v.id, v.label]), p.opcao ?? mod.opcao.valores[0].id)}</fieldset>` : ''}
          ${mod.prod ? `
            <label class="campo"><span>${esc(mod.prodLabel)}</span>
              <select data-f="plano.prodIdx" data-t="num">
                ${mod.prod.map((pr, i) => `<option value="${i}" ${Number(p.prodIdx ?? 0) === i ? 'selected' : ''}>${esc(pr)}</option>`).join('')}
              </select></label>` : ''}
          ${semArgila ? `
            <label class="campo" style="margin-top:14px"><span>Classe de argila <small>o laudo não informa argila</small></span>
              <select data-f="plano.classeArgila">
                ${CLASSES_ARGILA.map((c) => `<option value="${c.id}" ${(p.classeArgila || '250a400') === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
              </select></label>` : ''}
          <p class="muted small" style="margin:14px 0 0">Base: ${esc(mod.tabelas)} do Manual de Adubação e Calagem do Paraná.</p>
        </section>

        <section class="card">
          <h2>Calagem</h2>
          <div class="grid-2">
            <label class="campo"><span>V% desejado <small>padrão da cultura: ${cultura.vAlvo}%</small></span>
              <span class="entrada"><input data-f="plano.vAlvo" data-t="num" inputmode="decimal" placeholder="${cultura.vAlvo}" value="${esc(fmtInput(p.vAlvo))}"><span class="un">%</span></span></label>
            <label class="campo"><span>PRNT do calcário <small>padrão: ${fmt(cfg.calcario.prnt)}%</small></span>
              <span class="entrada"><input data-f="plano.prnt" data-t="num" inputmode="decimal" placeholder="${cfg.calcario.prnt}" value="${esc(fmtInput(p.prnt))}"><span class="un">%</span></span></label>
          </div>
          <details>
            <summary>${icone('chevron', 16)}Critérios de interpretação</summary>
            <div class="grid-2" style="margin-top:8px">
              <label class="campo"><span>Fósforo (P)</span>
                <select data-f="plano.criterioP">
                  <option value="auto" ${!p.criterioP || p.criterioP === 'auto' ? 'selected' : ''}>Pela argila (${esc(CRITERIOS_P[criterioP({ ...a, plano: { ...p, criterioP: 'auto' } })].label)})</option>
                  ${Object.entries(CRITERIOS_P).map(([k, c]) => `<option value="${k}" ${p.criterioP === k ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
                </select></label>
              <label class="campo"><span>Potássio (K)</span>
                <select data-f="plano.criterioK">
                  ${Object.entries(CRITERIOS_K).map(([k, c]) => `<option value="${k}" ${(p.criterioK || 'geral') === k ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
                </select></label>
            </div>
          </details>
        </section>
        <div class="acoes-fim"><a class="btn primario" href="#/analise/${esc(a.id)}/resultado">Ver recomendação ${icone('seta', 18)}</a></div>`;
    }
    return `
      <section class="card">
        <h2>Cultura</h2>
        <div class="culturas" role="radiogroup">
          ${CULTURAS.map((c) => `
            <label class="cultura">
              <input type="radio" name="cultura" data-f="plano.culturaId" value="${c.id}" ${p.culturaId === c.id ? 'checked' : ''}>
              <span class="marca-sel">${icone('check', 12)}</span>
              <strong>${esc(c.nome)}</strong><small>${esc(c.descricao)}</small>
            </label>`).join('')}
        </div>
      </section>
      ${det}`;
  }

  // ---------- Etapa 3: resultado ----------
  function htmlResultado() {
    const cultura = getCultura(a.plano?.culturaId);
    if (!temValores()) {
      return `<div class="card vazio"><div class="importar-ic">${icone('arquivo', 24)}</div><h2>Faltam os valores do laudo</h2>
        <p>Importe o laudo ou digite ao menos Ca, Mg, K, P e H+Al.</p><a class="btn primario" href="#/analise/${esc(a.id)}/laudo">Ir para o laudo</a></div>`;
    }
    if (!cultura) {
      return `<div class="card vazio"><div class="importar-ic">${icone('broto', 24)}</div><h2>Escolha a cultura</h2>
        <p>A recomendação de adubação depende da cultura e da produtividade esperada.</p><a class="btn primario" href="#/analise/${esc(a.id)}/cultura">Escolher cultura</a></div>`;
    }
    const r = recomendar(a, cfg);
    const area = r.area;
    const c = r.calagem;
    const nec = r.necessidade;
    const best = r.adubacao.melhor;
    const fontes = a.plano?.fontes || {};
    const adubosAtivos = cfg.adubos.filter((x) => x.ativo !== false);
    const selFonte = (tipo, filtro) => `
      <select data-f="fontes.${tipo}">
        <option value="auto">Mais barato (automático)</option>
        ${adubosAtivos.filter(filtro).map((x) => `<option value="${x.id}" ${fontes[tipo] === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}
      </select>`;
    const tot = (kgHa) => (area ? (kgHa * area >= 1000 ? `${fmt((kgHa * area) / 1000, 2)} t` : `${fmt(kgHa * area, 0)} kg`) : '-');
    const nDoFosfatado = best.itens.find((i) => i.papel === 'P' && i.fornece.N > 0);
    const tipoCalc = c.tipo === 'dolomitico' ? 'Dolomítico' : 'Calcítico';
    const dose = (k) => (r.doses[k] ? fmt(r.doses[k], 0) : '0');

    const avisos = [...(!area ? ['Informe a área (ha) no laudo para ver as quantidades totais da área.'] : []), ...r.avisos];

    return `
      ${avisos.length ? aviso('warn', avisos.length === 1 ? esc(avisos[0]) : `<ul style="margin:0">${avisos.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`) : ''}

      <dl class="resumo">
        <div class="metrica"><dt>Calcário</dt><dd>${c.nc == null ? '-' : fmt(c.nc, 1)} <small>t/ha</small></dd><span class="sub">${c.nc > 0 ? tipoCalc : c.nc === 0 ? 'Não precisa' : ''}</span></div>
        <div class="metrica"><dt>N</dt><dd>${dose('N')} <small>kg/ha</small></dd></div>
        <div class="metrica"><dt>P₂O₅</dt><dd>${dose('P2O5')} <small>kg/ha</small></dd></div>
        <div class="metrica"><dt>K₂O</dt><dd>${dose('K2O')} <small>kg/ha</small></dd></div>
        <div class="metrica destaque"><dt>Custo estimado</dt><dd>${moeda(r.custoHa)} <small>/ha</small></dd><span class="sub">${area ? `${moeda(r.custoTotal)} em ${fmt(area)} ha` : 'Informe a área para o total'}</span></div>
      </dl>

      <div class="colunas">
        <div>
          <section class="card enfase">
            <div class="card-head"><h2>Adubos recomendados</h2><a class="btn fantasma mini" href="#/adubos">Preços</a></div>
            ${best.itens.length ? `
              <ul class="lista-adubos">
                ${best.itens.map((i) => `<li>
                  <div class="la-nome"><b>${esc(i.nome)}</b><span>Fornece ${fornece(i)}</span></div>
                  <div class="la-dose"><b>${fmt(i.kgHa, 1)}</b> kg/ha</div>
                  <div class="la-extra">
                    <span>${area ? `Total na área: <b>${tot(i.kgHa)}</b>` : 'Informe a área para o total'}</span>
                    <span>${i.custoHa == null ? 'Sem preço cadastrado' : `${moeda(i.custoHa)}/ha`}</span>
                  </div></li>`).join('')}
              </ul>
              ${nDoFosfatado ? `<p class="small muted" style="margin-top:10px">O ${esc(nDoFosfatado.sigla)} já fornece ${fmt(nDoFosfatado.fornece.N, 1)} kg/ha de N, descontado do nitrogenado.</p>` : ''}
            ` : '<p class="muted">Nenhuma adubação com N, P ou K necessária.</p>'}
            <details ${fontes.P || fontes.N || fontes.K ? 'open' : ''}>
              <summary>${icone('chevron', 16)}Trocar adubo</summary>
              <div class="grid" style="margin-top:8px">
                <label class="campo"><span>Fonte de P</span>${selFonte('P', (x) => num(x.P2O5) > 0)}</label>
                <label class="campo"><span>Fonte de N</span>${selFonte('N', (x) => num(x.N) > 0 && !(num(x.P2O5) > 0) && !(num(x.K2O) > 0))}</label>
                <label class="campo"><span>Fonte de K</span>${selFonte('K', (x) => num(x.K2O) > 0 && !(num(x.P2O5) > 0))}</label>
              </div>
            </details>
            ${r.adubacao.combinacoes.length > 1 ? `
              <details>
                <summary>${icone('chevron', 16)}Comparar combinações (${Math.min(r.adubacao.combinacoes.length, 8)})</summary>
                <ul class="combos">
                  ${r.adubacao.combinacoes.slice(0, 8).map((cb, i) => `
                    <li>
                      <span>${cb.itens.map((it) => `${esc(it.sigla)} ${fmt(it.kgHa, 0)}`).join(' + ')} <span class="muted">kg/ha</span></span>
                      <span class="valor">${cb.custoHa == null ? '-' : `${moeda(cb.custoHa)}/ha`}${i > 0 && cb.custoHa != null && best.custoHa != null ? `<small>+${moeda(cb.custoHa - best.custoHa)}</small>` : ''}</span>
                      ${i > 0 ? `<button class="btn mini" data-acao="usar-combo" data-idx="${i}">Usar esta</button>` : '<span class="tag verde">Mais barata</span>'}
                    </li>`).join('')}
                </ul>
              </details>` : ''}
            ${r.adubacao.conversaoP.length > 1 ? `
              <details>
                <summary>${icone('chevron', 16)}Fontes de fósforo para ${fmt(r.doses.P2O5, 0)} kg de P₂O₅</summary>
                <div class="tabela-wrap"><table class="tabela compacta">
                  <thead><tr><th>Fonte</th><th>Garantia</th><th class="num">kg/ha</th><th class="num">R$/ha</th></tr></thead>
                  <tbody>${r.adubacao.conversaoP.map((i, idx) => {
                    const ad = cfg.adubos.find((x) => x.id === i.aduboId);
                    return `<tr class="${idx === 0 ? 'melhor' : ''}"><td>${esc(i.nome)}</td><td>${fmt(ad.P2O5)}% P₂O₅${num(ad.N) ? ` + ${fmt(ad.N)}% N` : ''}</td><td class="num">${fmt(i.kgHa, 1)}</td><td class="num">${i.custoHa == null ? '-' : moeda(i.custoHa)}</td></tr>`;
                  }).join('')}</tbody>
                </table></div>
                <p class="muted small" style="margin-top:8px">Só o custo do fosfatado. A escolha final também considera o N que o MAP e o DAP fornecem.</p>
              </details>` : ''}
          </section>

          <section class="card">
            <h2>Calagem</h2>
            ${c.nc == null ? '<p class="muted">Informe Ca, Mg, K e H+Al (ou a CTC) para calcular.</p>' : `
              <div class="big">${fmt(c.nc, 2)} <small>t/ha</small></div>
              <p>${c.nc > 0 ? `Calcário <b>${tipoCalc.toLowerCase()}</b>${area ? `, ${tot(c.nc * 1000)} para ${fmt(area)} ha` : ''}.` : 'Não precisa de calagem: o V% atual já atinge o desejado.'}</p>
              ${c.motivoTipo && c.nc > 0 ? `<p class="small muted">${esc(c.motivoTipo)}</p>` : ''}
              <div class="formula">NC = (V2 − V1) × CTC ÷ PRNT = (${fmt(c.v2)} − ${fmt(c.v1)}) × ${fmt(c.ctc)} ÷ ${fmt(c.prnt)}</div>
              ${c.custoHa ? `<p class="small">Custo: ${moeda(c.custoHa)}/ha${area ? ` · ${moeda(c.custoHa * area)} na área` : ''}</p>` : ''}
              <details>
                <summary>${icone('chevron', 16)}Ajustar dose ou tipo</summary>
                <div class="grid-2" style="margin-top:8px">
                  <label class="campo"><span>Dose</span><span class="entrada"><input data-f="overrides.calagem" data-t="num" inputmode="decimal" placeholder="${fmt(c.nc)}" value="${esc(fmtInput(a.plano?.overrides?.calagem))}"><span class="un">t/ha</span></span></label>
                  <label class="campo"><span>Tipo de calcário</span>
                    <select data-f="overrides.tipoCalcario">
                      <option value="">Automático (pela relação Ca/Mg)</option>
                      <option value="calcitico" ${a.plano?.overrides?.tipoCalcario === 'calcitico' ? 'selected' : ''}>Calcítico</option>
                      <option value="dolomitico" ${a.plano?.overrides?.tipoCalcario === 'dolomitico' ? 'selected' : ''}>Dolomítico</option>
                    </select></label>
                </div>
              </details>`}
          </section>

          <section class="card">
            <h2>Necessidade de nutrientes</h2>
            <p class="muted small">${esc(cultura.nome)} · ${esc(nec.mod?.label || '')}. Dose = média da faixa da tabela. Digite outro valor para ajustar.</p>
            <div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Nutriente</th><th>Tabela do manual</th><th class="num">kg/ha</th></tr></thead>
              <tbody>
                ${['N', 'P2O5', 'K2O'].map((k) => {
                  const f = nec[k];
                  return `<tr>
                    <td><b>${rotuloNutriente(k)}</b></td>
                    <td>${f ? `${esc(f.texto)} kg/ha<span class="sub">${esc(f.origem || '')}</span>` : '<span class="muted">sem tabela</span>'}</td>
                    <td class="num"><input class="in-dose" data-f="overrides.${k}" data-t="num" inputmode="decimal" placeholder="${fmt(f?.dose ?? 0, 1)}" value="${esc(fmtInput(a.plano?.overrides?.[k]))}" aria-label="Dose de ${rotuloNutriente(k)} em kg/ha"></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table></div>
          </section>
        </div>

        <div>
          <section class="card">
            <h2>Interpretação da análise</h2>
            <div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Indicador</th><th class="num">Valor</th><th>Nível</th></tr></thead>
              <tbody>${r.interpretacao.map((l) => `<tr><td>${esc(l.label)}</td><td class="num">${fmt(l.valor)} <span class="muted small">${esc(l.unidade)}</span></td><td>${l.nivel ? chipNivel(l.nivel, l.inverso) : ''}</td></tr>`).join('')}</tbody>
            </table></div>
            <p class="muted small" style="margin:10px 0 0">Critério do P: ${esc(CRITERIOS_P[criterioP(a)].label)}. Para Al e m%, nível baixo é o desejável.</p>
          </section>

          ${nec.notas.length ? `
            <section class="card">
              <details class="solto">
                <summary>${icone('chevron', 16)}Orientações do manual para ${esc(cultura.nome)}</summary>
                <ul class="notas">${nec.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
              </details>
            </section>` : ''}

          <section class="card">
            <h2>Observações para o relatório</h2>
            <textarea data-f="plano.observacoes" rows="3" placeholder="Ex.: aplicar a ureia no início do perfilhamento">${esc(a.plano?.observacoes || '')}</textarea>
          </section>
        </div>
      </div>

      <div class="acoes">
        <a class="btn primario" href="#/relatorio/${esc(a.id)}">${icone('arquivo', 18)}Ver relatório</a>
        <button class="btn" data-acao="compartilhar">${icone('compartilhar', 18)}Compartilhar</button>
      </div>`;
  }

  function fornece(i) {
    const f = i.fornece;
    return [['N', f.N], ['P₂O₅', f.P2O5], ['K₂O', f.K2O], ['S', f.S], ['Ca', f.Ca]]
      .filter(([, v]) => v > 0).map(([n, v]) => `${fmt(v, 1)} ${n}`).join(' · ') + ' kg/ha';
  }

  // ---------- eventos ----------
  const atualizarResultado = debounce(() => {
    if (aba !== 'resultado') return;
    const foco = document.activeElement?.dataset?.f;
    const pos = document.activeElement?.selectionStart;
    desenhar();
    if (foco) {
      const inp = el.querySelector(`[data-f="${foco}"]`);
      if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch { /* select */ } }
    }
  }, 700);

  el.oninput = (e) => {
    const f = e.target.dataset.f;
    if (!f || e.target.type === 'radio' || e.target.tagName === 'SELECT') return;
    const valor = e.target.dataset.t === 'num' ? num(e.target.value) : e.target.value;
    set(f, valor);
    if (aba === 'laudo') {
      e.target.closest('.campo')?.classList.remove('lido');
      const d = el.querySelector('#derivados');
      if (d) d.innerHTML = htmlDerivados();
      if (f === 'info.talhao') el.querySelector('#titulo').textContent = valor || 'Nova análise';
      if (f.startsWith('info.')) el.querySelector('#subtitulo').textContent = subtitulo();
    }
    if (aba === 'resultado' && f !== 'plano.observacoes') atualizarResultado();
  };

  el.onchange = async (e) => {
    const t = e.target;
    if (t.dataset.acao === 'arquivo' && t.files?.[0]) {
      await lerArquivo(t.files[0]);
      t.value = '';
      return;
    }
    const f = t.dataset.f;
    if (!f || !(t.type === 'radio' || t.tagName === 'SELECT')) return;
    const valor = t.dataset.t === 'num' ? num(t.value) : t.value;
    set(f, valor);
    if (f === 'plano.culturaId' || f === 'plano.modalidade') {
      // reinicia escolhas que dependem da cultura
      delete a.plano.prodIdx;
      delete a.plano.opcao;
      if (f === 'plano.culturaId') delete a.plano.modalidade;
    }
    if (aba !== 'laudo') {
      const y = window.scrollY;
      desenhar();
      window.scrollTo(0, y);
    }
  };

  el.onclick = async (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b || b.tagName === 'INPUT') return;
    if (b.dataset.acao === 'excluir') {
      const idExcluido = a.id;
      a.deleted = true; // evita que um salvamento pendente traga a análise de volta
      await store.excluir('analises', idExcluido);
      location.hash = '#/';
      toast('Análise excluída', '', {
        rotulo: 'Desfazer',
        fn: async () => {
          await store.restaurar('analises', idExcluido);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        },
      });
    }
    if (b.dataset.acao === 'usar-combo') {
      const r = recomendar(a, cfg);
      const cb = r.adubacao.combinacoes[Number(b.dataset.idx)];
      a.plano.fontes = {};
      for (const it of cb.itens) a.plano.fontes[it.papel] = it.aduboId;
      a = await store.salvar('analises', a);
      desenhar();
      toast('Combinação aplicada');
    }
    if (b.dataset.acao === 'compartilhar') {
      const texto = textoResumo([a], cfg);
      if (navigator.share) {
        try { await navigator.share({ title: 'Recomendação de adubação', text: texto }); } catch { /* cancelado */ }
      } else {
        await navigator.clipboard?.writeText(texto);
        toast('Resumo copiado');
      }
    }
  };

  desenhar();

  // Ao sair: análise criada e deixada em branco é descartada (não polui a lista)
  return () => {
    if (a.deleted || !estaVazia(a)) return;
    a.deleted = true;
    store.excluir('analises', a.id);
  };
}

function estaVazia(a) {
  const preenchido = (o) => Object.values(o || {}).some((v) => v != null && v !== '');
  return !preenchido(a.info) && !preenchido(a.solo) && !a.plano?.culturaId;
}

function paraISO(v) {
  const m = String(v).match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return v;
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${ano}-${m[2]}-${m[1]}`;
}
