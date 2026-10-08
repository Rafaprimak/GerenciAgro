// Planejamento forrageiro: oferta das pastagens x demanda do rebanho, nos cenários atual e proposto.
import * as store from '../store.js';
import { calcularCenario, demandaCategoria, producaoPastagem, capacidadePastagem, cenarioPreenchido, regiaoDe, comEntradaPadrao, MAX_PASTAGENS } from '../forragem.js';
import { FORRAGEIRAS, REGIOES, CONDICOES, CATEGORIAS, ESTACOES, MESES, MESES_LONGOS, PADROES } from '../data/forrageiras.js';
import { graficoLinhas, CORES } from '../grafico.js';
import { esc, num, fmt, fmtInput, toast, debounce, aviso, confirmar } from '../ui.js';
import { icone } from '../icons.js';

const COLECAO = 'planejamentos';
const CENARIOS = [['atual', 'Atual'], ['proposto', 'Proposto']];
const ETAPAS = [
  ['pastagens', 'Pastagens', 'Oferta de forragem'],
  ['rebanho', 'Rebanho', 'Demanda dos animais'],
  ['balanco', 'Balanço', 'Oferta x demanda'],
];
const ESTACAO_NOME = Object.fromEntries(ESTACOES.map((e) => [e.id, e.nome]));
const FORRAGEIRAS_ORDEM = [...FORRAGEIRAS].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

// valores iniciais iguais aos da planilha (nº de animais 0, consumo 2,5% PV, entrada sugerida)
const rebanhoInicial = () => Object.fromEntries(CATEGORIAS.map((c) => [c.id, { n: 0, entrada: c.entrada, consumo: PADROES.consumo }]));
const cenarioVazio = () => ({ pastagens: [], rebanho: rebanhoInicial() });
const nomeMeses = (lista) => lista.map((m) => MESES[m]).join(', ');
const nomeRegiao = (id) => REGIOES.find((r) => r.id === id)?.nome || REGIOES[0].nome;

export async function criarNovo() {
  const p = await store.salvar(COLECAO, {
    id: store.uuid(), criadoEm: Date.now(), nome: '', regiao: 'sul',
    atual: { pastagens: [novaPastagem()], rebanho: rebanhoInicial() },
    proposto: cenarioVazio(),
  });
  return p.id;
}

function novaPastagem() {
  return {
    id: store.uuid(), forrageiraId: '', condicao: 'media', area: null,
    aproveitamento: PADROES.aproveitamento, pesoUA: PADROES.pesoUA, consumoUA: PADROES.consumo,
  };
}

// ---------- lista ----------

export async function renderLista(el) {
  const lista = (await store.todos(COLECAO)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  el.innerHTML = `
    <div class="cab">
      <div class="cab-txt">
        <h1>Planejamento forrageiro</h1>
        <div class="cab-sub">Quanto pasto a propriedade produz em cada mês e quanto o rebanho consome</div>
      </div>
      <div class="cab-acoes"><a class="btn primario" href="#/novo-planejamento">${icone('mais', 18)}<span>Novo</span></a></div>
    </div>
    ${lista.length ? `<div class="lista">${lista.map(cardPlano).join('')}</div>` : `
      <div class="card vazio">
        <div class="importar-ic">${icone('pasto', 26)}</div>
        <h2>Nenhum planejamento ainda</h2>
        <p>Cadastre as pastagens e o rebanho da propriedade. O app mostra a produção de forragem mês a mês,
          o consumo dos animais, os meses de falta de pasto e a capacidade de suporte, na situação atual e na proposta.</p>
        <a class="btn primario" href="#/novo-planejamento">${icone('mais', 18)}Novo planejamento</a>
      </div>`}`;
  el.onclick = (e) => {
    const item = e.target.closest('.item');
    if (item) location.hash = `#/planejamento/${item.dataset.id}/atual/${item.dataset.destino}`;
  };
  el.onkeydown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('item')) {
      e.preventDefault();
      e.target.click();
    }
  };
}

function cardPlano(p) {
  const r = calcularCenario(p, 'atual');
  const temProposto = cenarioPreenchido(p.proposto);
  const destino = r.producaoTotal > 0 && r.consumoTotal > 0 ? 'balanco' : r.producaoTotal > 0 ? 'rebanho' : 'pastagens';
  return `
    <div class="item card" data-id="${esc(p.id)}" data-destino="${destino}" tabindex="0" role="button">
      <div class="item-topo">
        <div class="item-titulo">
          <strong>${esc(p.nome || 'Sem nome')}</strong>
          <span>${esc([p.produtor, p.municipio, nomeRegiao(p.regiao)].filter(Boolean).join(' · '))}</span>
        </div>
        ${p._dirty ? '<span class="item-pend" title="Aguardando sincronizar"></span>' : ''}
        ${icone('chevron', 18)}
      </div>
      <div class="item-tags">
        ${r.area ? `<span class="tag">${fmt(r.area, 1)} ha</span>` : ''}
        ${r.animais ? `<span class="tag">${fmt(r.animais, 0)} animais</span>` : ''}
        ${r.consumoTotal > 0 && r.producaoTotal > 0 ? (r.mesesDeficit.length
          ? `<span class="tag alerta">${icone('alerta', 13)}Falta pasto: ${esc(nomeMeses(r.mesesDeficit))}</span>`
          : `<span class="tag verde">${icone('check', 13)}Pasto suficiente o ano todo</span>`) : ''}
        ${temProposto ? '<span class="tag">Com cenário proposto</span>' : ''}
      </div>
      ${r.producaoTotal > 0 || r.consumoTotal > 0 ? `
        <dl class="item-dados">
          <div><dt>Produção</dt><dd>${fmt(r.producaoTotal, 0)} t</dd></div>
          <div><dt>Consumo</dt><dd>${fmt(r.consumoTotal, 0)} t</dd></div>
          <div><dt>Balanço</dt><dd class="${r.balancoTotal < 0 ? 'neg' : ''}">${fmt(r.balancoTotal, 0)} t</dd></div>
          <div><dt>U.A./ha</dt><dd>${fmt(r.lotacaoPraticaMedia, 2)}</dd></div>
        </dl>` : ''}
    </div>`;
}

// ---------- editor ----------

export async function render(el, { id, cenario, etapa }) {
  let p = await store.obter(COLECAO, id);
  if (!p || p.deleted) {
    el.innerHTML = `<div class="card vazio"><h2>Planejamento não encontrado</h2><p>Ele pode ter sido excluído.</p><a class="btn" href="#/forragem">Voltar para a lista</a></div>`;
    return;
  }
  if (!CENARIOS.some(([k]) => k === cenario)) cenario = 'atual';
  if (!ETAPAS.some(([k]) => k === etapa)) etapa = 'pastagens';
  p.atual = p.atual || cenarioVazio();
  p.proposto = p.proposto || cenarioVazio();
  const desligar = [];

  const salvarDepois = debounce(async () => {
    const r = await store.salvar(COLECAO, p);
    p.updatedAt = r.updatedAt;
  }, 400);

  const cen = () => p[cenario];
  const rota = (c = cenario, e = etapa) => `#/planejamento/${esc(p.id)}/${c}/${e}`;

  function get(caminho) {
    return caminho.split('.').reduce((o, k) => o?.[k], p);
  }
  function set(caminho, valor) {
    const ks = caminho.split('.');
    let o = p;
    for (let i = 0; i < ks.length - 1; i++) {
      if (o[ks[i]] == null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    // campo apagado fica em branco e vale zero no cálculo, como uma célula vazia no Excel
    o[ks.at(-1)] = valor === '' ? null : valor;
    salvarDepois();
  }

  function subtitulo() {
    return [p.produtor, p.municipio, nomeRegiao(p.regiao)].filter(Boolean).join(' · ');
  }

  function desenhar() {
    desligar.splice(0).forEach((f) => f());
    const feitas = {
      pastagens: calcularCenario(p, cenario).producaoTotal > 0,
      rebanho: calcularCenario(p, cenario).consumoTotal > 0,
      balanco: false,
    };
    el.innerHTML = `
      <div class="cab">
        <a class="btn-voltar no-print" href="#/forragem" aria-label="Voltar para a lista">${icone('voltar', 22)}</a>
        <div class="cab-txt">
          <h1 id="titulo">${esc(p.nome || 'Novo planejamento')}</h1>
          <div class="cab-sub" id="subtitulo">${esc(subtitulo())}</div>
        </div>
        <div class="cab-acoes no-print">
          <button class="btn fantasma icone perigo" data-acao="excluir" title="Excluir planejamento" aria-label="Excluir planejamento">${icone('lixo', 20)}</button>
        </div>
      </div>
      <nav class="alternar no-print" aria-label="Cenário">
        ${CENARIOS.map(([k, l]) => `<a href="${rota(k)}" class="${k === cenario ? 'ativo' : ''}" ${k === cenario ? 'aria-current="page"' : ''}>
          ${l}${k === 'proposto' && !cenarioPreenchido(p.proposto) ? ' <small>vazio</small>' : ''}</a>`).join('')}
      </nav>
      <ol class="etapas no-print" aria-label="Etapas">
        ${ETAPAS.map(([k, l, d], i) => `
          <li class="${etapa === k ? 'atual' : ''} ${feitas[k] && etapa !== k ? 'feita' : ''}">
            <a href="${rota(cenario, k)}" ${etapa === k ? 'aria-current="step"' : ''}>
              <span class="etapa-n">${feitas[k] && etapa !== k ? icone('check', 14) : i + 1}</span>
              <span class="etapa-txt"><b>${l}</b><small>${d}</small></span>
            </a>
          </li>`).join('')}
      </ol>
      <div class="aba-conteudo">${etapa === 'pastagens' ? htmlPastagens() : etapa === 'rebanho' ? htmlRebanho() : htmlBalanco()}</div>`;
    if (etapa === 'balanco') montarGraficos();
  }

  // ---------- campos ----------
  function campoNum(caminho, label, unidade = '', dica = '') {
    return `<label class="campo"><span>${esc(label)}</span>
      <span class="entrada"><input data-f="${caminho}" data-t="num" inputmode="decimal" autocomplete="off" value="${esc(fmtInput(get(caminho)))}" ${dica ? `placeholder="${esc(dica)}"` : ''}>${unidade ? `<span class="un">${esc(unidade)}</span>` : ''}</span></label>`;
  }
  function campoTexto(caminho, label) {
    return `<label class="campo"><span>${esc(label)}</span><input data-f="${caminho}" autocomplete="off" value="${esc(get(caminho) ?? '')}"></label>`;
  }
  function segmento(nome, caminho, valores, atual) {
    return `<div class="segmento" role="radiogroup">${valores.map(({ id: v, nome: l }) => `
      <label><input type="radio" name="${nome}" data-f="${caminho}" value="${esc(v)}" ${atual === v ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
  }

  // ---------- etapa 1: pastagens ----------
  function htmlPastagens() {
    const lista = cen().pastagens || [];
    const vazioProposto = cenario === 'proposto' && !cenarioPreenchido(p.proposto);
    return `
      ${cenario === 'atual' ? `
        <section class="card">
          <h2>Propriedade</h2>
          <div class="grid-3 alinhado">
            ${campoTexto('nome', 'Nome da propriedade')}
            ${campoTexto('produtor', 'Produtor')}
            ${campoTexto('municipio', 'Município')}
          </div>
          <fieldset style="margin:14px 0 0"><legend>Região (distribuição da produção ao longo do ano)</legend>
            ${segmento('regiao', 'regiao', REGIOES, p.regiao || 'sul')}</fieldset>
        </section>` : ''}
      ${vazioProposto && cenarioPreenchido(p.atual) ? `
        <div class="card enfase">
          <h2>${icone('copiar', 18)}Cenário proposto</h2>
          <p class="muted">Simule mudanças na propriedade: reformar pastagens, plantar forrageiras de inverno, mudar o rebanho.
            Comece copiando a situação atual e altere o que for mudar.</p>
          <button class="btn primario" data-acao="copiar">${icone('copiar', 18)}Copiar do cenário atual</button>
        </div>` : ''}
      <section class="card">
        <div class="card-head"><h2>Pastagens ${cenario === 'proposto' ? '(proposto)' : ''}</h2>
          <span class="muted small">${lista.length} ${lista.length === 1 ? 'piquete' : 'piquetes'}</span></div>
        ${lista.map((ps, i) => htmlPastagem(ps, i)).join('') || '<p class="muted">Nenhuma pastagem cadastrada.</p>'}
        ${lista.length < MAX_PASTAGENS
          ? `<button class="btn bloco" data-acao="add-pastagem">${icone('mais', 18)}Adicionar pastagem</button>`
          : `<p class="muted small">Máximo de ${MAX_PASTAGENS} pastagens, como na planilha.</p>`}
        <p class="muted small" style="margin-top:12px">Aproveitamento: parte da forragem produzida que os animais conseguem colher.
          Peso e consumo da U.A. são usados na capacidade de suporte da pastagem.</p>
      </section>
      <div data-out="mini">${htmlMini()}</div>
      <div class="acoes-fim"><a class="btn primario" href="${rota(cenario, 'rebanho')}">Continuar ${icone('seta', 18)}</a></div>`;
  }

  function htmlPastagem(ps, i) {
    const base = `${cenario}.pastagens.${i}`;
    return `
      <div class="bloco-item" data-pastagem="${i}">
        <div class="bloco-topo">
          <label class="campo" style="flex:1"><span>Forrageira</span>
            <select data-f="${base}.forrageiraId">
              <option value="">Escolher...</option>
              ${FORRAGEIRAS_ORDEM.map((f) => `<option value="${esc(f.id)}" ${ps.forrageiraId === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
            </select></label>
          <button class="btn fantasma icone perigo" data-acao="rm-pastagem" data-i="${i}" title="Remover pastagem" aria-label="Remover pastagem">${icone('lixo', 18)}</button>
        </div>
        <fieldset style="margin:10px 0"><legend>Condição da pastagem</legend>
          ${segmento(`cond-${cenario}-${i}`, `${base}.condicao`, CONDICOES, ps.condicao || 'media')}</fieldset>
        <div class="grid-2col alinhado">
          ${campoNum(`${base}.area`, 'Área', 'ha')}
          ${campoNum(`${base}.aproveitamento`, 'Aproveitamento', '%')}
          ${campoNum(`${base}.pesoUA`, 'Peso da U.A.', 'kg')}
          ${campoNum(`${base}.consumoUA`, 'Consumo da U.A.', '% PV')}
        </div>
        <div class="bloco-rodape" data-out="pastagem-${i}">${rodapePastagem(ps)}</div>
      </div>`;
  }

  function rodapePastagem(ps) {
    const r = producaoPastagem(ps, regiaoDe(p));
    if (!r.forrageira) return '<span class="muted">Escolha a forrageira</span>';
    if (!r.area) return `<span>${fmt(r.prodHa, 2)} t MS/ha/ano</span><span>Informe a área</span>`;
    const ua = capacidadePastagem(ps, r.mensal);
    const uaHaAno = ua.reduce((t, v) => t + (v ?? 0), 0) / 12 / r.area;
    return `<span>${fmt(r.prodHa, 2)} t MS/ha/ano</span>
      <span><b>${fmt(r.total, 1)} t MS/ano</b> aproveitáveis</span>
      <span>${fmt(uaHaAno, 2)} U.A./ha/ano</span>`;
  }

  // ---------- etapa 2: rebanho ----------
  function htmlRebanho() {
    return `
      <section class="card">
        <div class="card-head"><h2>Rebanho ${cenario === 'proposto' ? '(proposto)' : ''}</h2></div>
        <p class="muted small">Informe o número de animais de cada categoria que fica no pasto. Ganho de peso em gramas por dia em cada estação.
          A categoria entra no mês de entrada e sai do pasto quando passa do peso final.
          A entrada deve ser feita no mês seguinte à saída da categoria anterior.</p>
        ${CATEGORIAS.map(htmlCategoria).join('')}
      </section>
      <div data-out="mini">${htmlMini()}</div>
      <div class="acoes-fim"><a class="btn primario" href="${rota(cenario, 'balanco')}">Ver balanço ${icone('seta', 18)}</a></div>`;
  }

  function htmlCategoria(cat) {
    const base = `${cenario}.rebanho.${cat.id}`;
    const c = cen().rebanho?.[cat.id] || {};
    const ativo = num(c.n) > 0;
    const entrada = c.entrada || cat.entrada;
    return `
      <div class="bloco-item categoria ${ativo ? '' : 'inativo'}" data-cat="${esc(cat.id)}">
        <div class="bloco-topo">
          <strong class="bloco-nome">${esc(cat.nome)}</strong>
          <label class="campo campo-n"><span class="sr">Número de ${esc(cat.nome)}</span>
            <span class="entrada"><input data-f="${base}.n" data-t="num" inputmode="numeric" autocomplete="off" value="${esc(fmtInput(c.n))}" placeholder="0"><span class="un">animais</span></span></label>
        </div>
        <div class="cat-detalhes">
          <div class="grid alinhado">
            <label class="campo"><span>Entrada no pasto</span>
              <select data-f="${base}.entrada" data-t="num">${MESES_LONGOS.map((mes, i) => `<option value="${i + 1}" ${Number(entrada) === i + 1 ? 'selected' : ''}>${mes}</option>`).join('')}</select></label>
            ${campoNum(`${base}.pesoInicial`, 'Peso inicial', 'kg')}
            ${campoNum(`${base}.pesoFinal`, 'Peso final', 'kg')}
            ${campoNum(`${base}.consumo`, 'Consumo', '% PV')}
          </div>
          <h3>Ganho de peso (g/dia)</h3>
          <div class="grid grid-4 alinhado">${ESTACOES.map((e) => campoNum(`${base}.ganho.${e.id}`, e.nome, 'g/dia')).join('')}</div>
          <div class="bloco-rodape" data-out="cat-${esc(cat.id)}">${rodapeCategoria(cat.id)}</div>
        </div>
      </div>`;
  }

  function rodapeCategoria(catId) {
    const c = cen().rebanho?.[catId] || {};
    const d = demandaCategoria(comEntradaPadrao(catId, c));
    if (!d.ativo) return '';
    if (!num(c.pesoInicial)) return '<span class="muted">Informe o peso inicial</span>';
    if (!num(c.pesoFinal)) return '<span class="muted">Informe o peso final (sem ele a categoria não entra no consumo)</span>';
    const fora = d.presente.map((v, m) => (v ? -1 : m)).filter((m) => m >= 0);
    return `<span><b>${fmt(d.total, 1)} t MS/ano</b> de consumo${catId === 'novilhasAdultas' ? ' (a planilha não soma no consumo total)' : ''}</span>
      <span>${fora.length === 12 ? 'Fora do pasto o ano todo' : fora.length ? `Fora do pasto: ${esc(nomeMeses(fora))}` : 'No pasto o ano todo'}</span>`;
  }

  // ---------- resumo rápido (etapas 1 e 2) ----------
  function htmlMini() {
    const r = calcularCenario(p, cenario);
    if (!r.producaoTotal && !r.consumoTotal) return '';
    return `
      <dl class="resumo-mini card">
        <div><dt>Produção</dt><dd>${fmt(r.producaoTotal, 1)} <small>t MS/ano</small></dd></div>
        <div><dt>Consumo</dt><dd>${fmt(r.consumoTotal, 1)} <small>t MS/ano</small></dd></div>
        <div><dt>Balanço</dt><dd class="${r.balancoTotal < 0 ? 'neg' : ''}">${fmt(r.balancoTotal, 1)} <small>t MS/ano</small></dd></div>
      </dl>`;
  }

  // ---------- etapa 3: balanço ----------
  function htmlBalanco() {
    const r = calcularCenario(p, cenario);
    if (!r.producaoTotal && !r.consumoTotal) {
      return `<div class="card vazio"><h2>Sem dados para o balanço</h2>
        <p>Cadastre as pastagens e o rebanho ${cenario === 'proposto' ? 'do cenário proposto' : ''} para ver a oferta e a demanda de forragem.</p>
        <a class="btn primario" href="${rota(cenario, 'pastagens')}">Ir para pastagens</a></div>`;
    }
    const outro = cenario === 'atual' ? 'proposto' : 'atual';
    const temComparacao = cenarioPreenchido(p[outro]);
    const deficit = r.mesesDeficit;
    return `
      <div class="rel-cab so-print">
        <h1>Planejamento forrageiro · cenário ${cenario}</h1>
        <div class="rel-meta">${esc([p.nome, subtitulo()].filter(Boolean).join(' · '))}</div>
      </div>
      ${r.consumoTotal > 0 && r.producaoTotal > 0 ? (deficit.length
        ? aviso('warn', `<b>Falta pasto em ${deficit.length} ${deficit.length === 1 ? 'mês' : 'meses'}:</b> ${esc(deficit.map((m) => MESES_LONGOS[m]).join(', '))}.
            Déficit somado de ${fmt(-deficit.reduce((s, m) => s + r.balanco[m], 0), 1)} t MS: planeje silagem, feno, forrageira de inverno ou ajuste do rebanho.`)
        : aviso('ok', '<b>A produção de forragem atende o rebanho em todos os meses.</b>')) : ''}
      <dl class="resumo">
        <div class="metrica"><dt>Produção de forragem</dt><dd>${fmt(r.producaoTotal, 1)} <small>t MS/ano</small></dd>
          <span class="sub">${fmt(r.area, 1)} ha de pastagem</span></div>
        <div class="metrica"><dt>Consumo do rebanho</dt><dd>${fmt(r.consumoTotal, 1)} <small>t MS/ano</small></dd>
          <span class="sub">${fmt(r.animais, 0)} animais</span></div>
        <div class="metrica"><dt>Balanço do ano</dt><dd class="${r.balancoTotal < 0 ? 'neg' : ''}">${fmt(r.balancoTotal, 1)} <small>t MS</small></dd>
          <span class="sub">${r.balancoTotal < 0 ? 'Faltam' : 'Sobram'} ${fmt(Math.abs(r.balancoTotal), 1)} t no ano</span></div>
        <div class="metrica"><dt>Lotação prática</dt><dd>${fmt(r.lotacaoPraticaMedia, 2)} <small>U.A./ha</small></dd>
          <span class="sub">Lotação teórica: ${fmt(r.lotacaoTeoricaMedia, 2)} U.A./ha</span></div>
      </dl>

      <section class="card">
        <h2>${icone('grafico', 18)}Demanda x produção de forragem</h2>
        <div id="grafBalanco"></div>
        <p class="muted small" style="margin-top:8px">t MS/mês. Produção das pastagens x consumo total do rebanho.</p>
      </section>

      <section class="card">
        <h2>Mês a mês</h2>
        ${tabelaMensal(r)}
      </section>

      <section class="card">
        <h2>Por estação</h2>
        ${tabelaEstacoes(r)}
      </section>

      ${temComparacao ? htmlComparacao(r, calcularCenario(p, outro), outro) : cenario === 'atual' ? `
        <section class="card no-print">
          <h2>${icone('copiar', 18)}Simular uma mudança</h2>
          <p class="muted">Monte o cenário proposto (por exemplo, reformar uma pastagem degradada ou plantar aveia para o inverno) e compare com o atual.</p>
          <a class="btn" href="${rota('proposto', 'pastagens')}">Montar cenário proposto ${icone('seta', 18)}</a>
        </section>` : ''}

      <div class="acoes no-print">
        <button class="btn" data-acao="imprimir">${icone('imprimir', 18)}Imprimir / salvar PDF</button>
        <button class="btn" data-acao="compartilhar">${icone('compartilhar', 18)}Compartilhar resumo</button>
      </div>`;
  }

  function linha(rotulo, valores, total, cls = '', casas = 1) {
    return `<tr class="${cls}"><td>${rotulo}</td>${valores.map((v) => `<td class="num ${v < -1e-9 && cls.includes('saldo') ? 'neg' : ''}">${v == null ? '' : fmt(v, casas)}</td>`).join('')}
      <td class="num">${total == null ? '' : fmt(total, casas)}</td></tr>`;
  }
  const cabMeses = (ultima) => `<thead><tr><th></th>${MESES.map((m) => `<th class="num">${m}</th>`).join('')}<th class="num">${ultima}</th></tr></thead>`;
  const nomePastagem = (ps) => `${esc(ps.forrageira?.nome || 'Sem forrageira')} <span class="sub">${fmt(ps.area, 1)} ha</span>`;
  const nomeCat = (id) => CATEGORIAS.find((c) => c.id === id)?.nome || id;

  // Mesmas linhas das abas PRODUÇÃO, DEMANDA e CAP. SUPORTE da planilha
  function tabelaMensal(r) {
    const comDados = r.pastagens.filter((ps) => ps.forrageira || ps.area);
    return `
      <h3>Produção mensal estimada (t MS/mês)</h3>
      <div class="tabela-wrap"><table class="tabela compacta mensal">${cabMeses('Total')}
      <tbody>
        ${comDados.map((ps) => linha(nomePastagem(ps), ps.mensal, ps.total)).join('')}
        ${linha('<b>Total/mês</b>', r.producao, r.producaoTotal, 'total')}
      </tbody></table></div>

      <h3>Consumo mensal estimado (t MS/mês)</h3>
      <div class="tabela-wrap"><table class="tabela compacta mensal">${cabMeses('Total')}
      <tbody>
        ${r.categorias.map((c) => linha(`${esc(nomeCat(c.id))} <span class="sub">${fmt(c.n, 0)} animais${c.foraDaSoma ? ' · não entra no consumo total' : ''}</span>`, c.mensal, c.total)).join('')}
        ${linha('<b>Produção total</b>', r.producao, r.producaoTotal, 'total')}
        ${linha('<b>Consumo total</b>', r.consumo, r.consumoTotal, 'total')}
        ${linha('<b>Balanço</b>', r.balanco, null, 'total saldo')}
      </tbody></table></div>

      <h3>Capacidade de suporte das pastagens (animais/piquete/mês)</h3>
      <div class="tabela-wrap"><table class="tabela compacta mensal">${cabMeses('U.A./ha/ano')}
      <tbody>
        ${comDados.map((ps) => linha(nomePastagem(ps), ps.ua, ps.uaHaAno, '', 1)).join('')}
        ${linha('<b>Total/mês</b>', r.capacidadeUA, null, 'total', 1)}
      </tbody></table></div>

      <h3>Capacidade de suporte das pastagens (U.A./ha)</h3>
      <div class="tabela-wrap"><table class="tabela compacta mensal">${cabMeses('Média')}
      <tbody>
        ${comDados.map((ps) => linha(nomePastagem(ps), ps.uaHa, ps.uaHaMedia, '', 2)).join('')}
        ${linha('<b>Lotação teórica</b>', r.lotacaoTeorica, r.lotacaoTeoricaMedia, 'total', 2)}
        ${linha(`<b>Lotação ${cenario === 'proposto' ? 'proposta' : 'prática'}</b>`, r.lotacaoPratica, r.lotacaoPraticaMedia, 'total', 2)}
      </tbody></table></div>`;
  }

  function tabelaEstacoes(r) {
    return `<div class="tabela-wrap"><table class="tabela compacta">
      <thead><tr><th>Estação</th><th class="num">Produção total/estação</th><th class="num">Capacidade média/estação</th></tr></thead>
      <tbody>${ESTACOES.map((e) => `<tr>
        <td>${esc(e.nome)} <span class="sub">${esc(nomeMeses(e.meses))}</span></td>
        <td class="num">${fmt(r.producaoEstacao[e.id], 1)} t MS</td>
        <td class="num">${fmt(r.capacidadeEstacao[e.id], 1)} animais</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function htmlComparacao(r, o, outroId) {
    const [a, b] = cenario === 'atual' ? [r, o] : [o, r];
    const linhaC = (rot, va, vb, casas = 1) => {
      const dif = va == null || vb == null ? null : vb - va;
      return `<tr><td>${rot}</td><td class="num">${fmt(va, casas)}</td><td class="num">${fmt(vb, casas)}</td>
        <td class="num">${dif == null ? '-' : `${dif > 0 ? '+' : ''}${fmt(dif, casas)}`}</td></tr>`;
    };
    return `
      <section class="card">
        <h2>${icone('grafico', 18)}Suporte das pastagens: atual x proposto</h2>
        <div id="grafComparacao"></div>
        <p class="muted small" style="margin-top:8px">Capacidade de suporte total (animais/mês) de cada cenário.</p>
        <div class="tabela-wrap"><table class="tabela compacta">
          <thead><tr><th></th><th class="num">Atual</th><th class="num">Proposto</th><th class="num">Diferença</th></tr></thead>
          <tbody>
            ${linhaC('Área de pastagem (ha)', a.area, b.area)}
            ${linhaC('Produção (t MS/ano)', a.producaoTotal, b.producaoTotal)}
            ${linhaC('Consumo total (t MS/ano)', a.consumoTotal, b.consumoTotal)}
            ${linhaC('Lotação teórica (U.A./ha)', a.lotacaoTeoricaMedia, b.lotacaoTeoricaMedia, 2)}
            ${linhaC('Lotação prática / proposta (U.A./ha)', a.lotacaoPraticaMedia, b.lotacaoPraticaMedia, 2)}
          </tbody></table></div>
        <a class="btn mini no-print" style="margin-top:12px" href="${rota(outroId, 'balanco')}">Ver balanço ${outroId === 'atual' ? 'atual' : 'proposto'} ${icone('seta', 16)}</a>
      </section>`;
  }

  function montarGraficos() {
    const r = calcularCenario(p, cenario);
    const g1 = el.querySelector('#grafBalanco');
    if (g1) {
      desligar.push(graficoLinhas(g1, {
        series: [
          { nome: 'Produção', cor: CORES.serie1, valores: r.producao },
          { nome: 'Demanda', cor: CORES.serie2, valores: r.consumo },
        ],
        rotulos: MESES, rotulosLongos: MESES_LONGOS, unidade: 't MS', casas: 1,
        faixas: r.consumoTotal > 0 ? r.mesesDeficit : [], faixaNome: 'Falta pasto',
      }));
    }
    const g2 = el.querySelector('#grafComparacao');
    if (g2) {
      const a = calcularCenario(p, 'atual');
      const b = calcularCenario(p, 'proposto');
      desligar.push(graficoLinhas(g2, {
        series: [
          { nome: 'Atual', cor: CORES.serie1, valores: a.capacidadeUA },
          { nome: 'Proposto', cor: CORES.serie2, valores: b.capacidadeUA },
        ],
        rotulos: MESES, rotulosLongos: MESES_LONGOS, unidade: 'animais', casas: 1,
      }));
    }
  }

  function textoResumo() {
    const r = calcularCenario(p, cenario);
    const linhas = [
      `*Planejamento forrageiro${p.nome ? ` · ${p.nome}` : ''}* (cenário ${cenario})`,
      subtitulo(),
      '',
      `Pastagem: ${fmt(r.area, 1)} ha · Rebanho: ${fmt(r.animais, 0)} animais`,
      `Produção: ${fmt(r.producaoTotal, 1)} t MS/ano`,
      `Consumo: ${fmt(r.consumoTotal, 1)} t MS/ano`,
      `Balanço: ${fmt(r.balancoTotal, 1)} t MS/ano`,
      r.mesesDeficit.length ? `Falta pasto em: ${r.mesesDeficit.map((m) => MESES_LONGOS[m]).join(', ')}` : 'Pasto suficiente em todos os meses',
      `Lotação prática: ${fmt(r.lotacaoPraticaMedia, 2)} U.A./ha · Lotação teórica: ${fmt(r.lotacaoTeoricaMedia, 2)} U.A./ha`,
      '',
      'Balanço por mês (t MS):',
      MESES.map((m, i) => `${m} ${fmt(r.balanco[i], 1)}`).join(' · '),
    ];
    return linhas.filter((l, i) => l || i > 1).join('\n');
  }

  // ---------- eventos ----------
  function atualizarSaidas() {
    el.querySelectorAll('[data-out]').forEach((o) => {
      const k = o.dataset.out;
      if (k === 'mini') o.innerHTML = htmlMini();
      else if (k.startsWith('pastagem-')) o.innerHTML = rodapePastagem(cen().pastagens[Number(k.slice(9))] || {});
      else if (k.startsWith('cat-')) o.innerHTML = rodapeCategoria(k.slice(4));
    });
    el.querySelectorAll('.categoria').forEach((b) => b.classList.toggle('inativo', !(num(cen().rebanho?.[b.dataset.cat]?.n) > 0)));
  }

  function aoMudar(e) {
    const f = e.target.dataset?.f;
    if (!f) return;
    if (e.target.type === 'radio' && !e.target.checked) return;
    const v = e.target.dataset.t === 'num' ? num(e.target.value) : e.target.value;
    set(f, v);
    if (f === 'nome') el.querySelector('#titulo').textContent = p.nome || 'Novo planejamento';
    if (['produtor', 'municipio', 'regiao'].includes(f)) el.querySelector('#subtitulo').textContent = subtitulo();
    atualizarSaidas();
  }
  el.addEventListener('input', aoMudar);
  el.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' || e.target.type === 'radio') aoMudar(e); });

  el.onclick = async (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const acao = b.dataset.acao;
    if (acao === 'add-pastagem') {
      cen().pastagens = [...(cen().pastagens || []), novaPastagem()];
      salvarDepois();
      desenhar();
      el.querySelector(`[data-pastagem="${cen().pastagens.length - 1}"] select`)?.focus();
    } else if (acao === 'rm-pastagem') {
      const i = Number(b.dataset.i);
      const [removida] = cen().pastagens.splice(i, 1);
      salvarDepois();
      desenhar();
      toast('Pastagem removida', '', {
        rotulo: 'Desfazer',
        fn: () => {
          cen().pastagens.splice(i, 0, removida);
          salvarDepois();
          if (el.isConnected) desenhar();
        },
      });
    } else if (acao === 'copiar') {
      p.proposto = structuredClone(p.atual);
      p.proposto.pastagens = (p.proposto.pastagens || []).map((ps) => ({ ...ps, id: store.uuid() }));
      salvarDepois();
      desenhar();
      toast('Cenário atual copiado. Altere o que vai mudar.');
    } else if (acao === 'imprimir') {
      window.print();
    } else if (acao === 'compartilhar') {
      const texto = textoResumo();
      if (navigator.share) {
        try { await navigator.share({ title: 'Planejamento forrageiro', text: texto }); } catch { /* cancelado */ }
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
      }
    } else if (acao === 'excluir') {
      if (!confirmar('Excluir este planejamento?')) return;
      await store.excluir(COLECAO, p.id);
      location.hash = '#/forragem';
      toast('Planejamento excluído', '', {
        rotulo: 'Desfazer',
        fn: async () => {
          await store.restaurar(COLECAO, p.id);
          location.hash = rota();
        },
      });
    }
  };

  desenhar();
  return () => desligar.splice(0).forEach((f) => f());
}
