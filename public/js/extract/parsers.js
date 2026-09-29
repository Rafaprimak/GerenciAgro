// Leitura dos valores de um laudo a partir do texto extraído (PDF ou OCR).
// Entrada: itens de texto {str, x, y} com y medido do topo da página (em pontos).
// Saída: { info: {...}, solo: {...}, origem, avisos }

const numBR = (s) => {
  if (s == null) return null;
  const t = String(s).trim();
  if (/^N\.?D\.?$/i.test(t)) return 0; // não detectado
  const m = t.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return Number(m[0].replace(',', '.'));
};

// ---------- Laborsolo (rótulos são imagem; valores ficam em posições fixas) ----------

const LABORSOLO_CAMPOS = {
  ctc: [132, 239], ctcEfetiva: [134, 262], mo: [270, 252], prem: [274, 281],
  phCaCl2: [416, 242], phH2O: [416, 266], phSMP: [416, 290],
  hal: [536, 242], al: [537, 290],
  ca: [135, 365], mg: [134, 388], k: [134, 414], na: [134, 438],
  p: [135, 516], pM3: [136, 539], s: [135, 560],
  b: [137, 643], cu: [137, 666], fe: [132, 691], mn: [133, 713], zn: [134, 736],
  v: [457, 458],
};
const LABORSOLO_INFO = {
  solicitante: [94, 81], produtor: [94, 103], propriedade: [97, 126], talhao: [65, 149],
  municipio: [86, 172], profundidade: [331, 172], dataColeta: [533, 75], codigo: [513, 146],
};

export function ehLaborsolo(textoCompleto) {
  return /laborsolo/i.test(textoCompleto) || /RG,?\s*096\s*REV/i.test(textoCompleto);
}

function pegarPorPosicao(itens, [x, y], tol = 8) {
  let melhor = null, dist = Infinity;
  for (const it of itens) {
    const dx = Math.abs(it.x - x), dy = Math.abs(it.y - y);
    if (dx <= tol * 2 && dy <= tol) {
      const d = dx + dy * 2;
      if (d < dist) { dist = d; melhor = it; }
    }
  }
  return melhor?.str?.trim() ?? null;
}

export function parseLaborsolo(itensPagina1) {
  const solo = {}, info = { laboratorio: 'Laborsolo' };
  for (const [campo, pos] of Object.entries(LABORSOLO_CAMPOS)) {
    const s = pegarPorPosicao(itensPagina1, pos);
    if (s && !/^\*/.test(s)) solo[campo] = numBR(s);
  }
  for (const [campo, pos] of Object.entries(LABORSOLO_INFO)) {
    const s = pegarPorPosicao(itensPagina1, pos, 10);
    if (s && !/^\*/.test(s)) info[campo] = s;
  }
  // Área no nome da propriedade: "FAZ. X (10,2HA)"
  const mArea = info.propriedade?.match(/\(([\d.,]+)\s*HA\)/i);
  if (mArea) info.areaHa = numBR(mArea[1]);
  if (!info.produtor && info.solicitante) info.produtor = info.solicitante;
  return { info, solo, origem: 'PDF Laborsolo (leitura por posição)', avisos: [] };
}

// ---------- Leitor genérico por rótulos (outros laboratórios e OCR de foto) ----------

// Agrupa itens em linhas (mesmo y) e ordena por x
export function montarLinhas(itens, tolY = 4) {
  const ord = [...itens].filter((i) => i.str && i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas = [];
  for (const it of ord) {
    const l = linhas.find((l) => Math.abs(l.y - it.y) <= tolY);
    if (l) l.itens.push(it);
    else linhas.push({ y: it.y, itens: [it] });
  }
  return linhas.map((l) => l.itens.sort((a, b) => a.x - b.x).map((i) => i.str.trim()).join(' '));
}

const NUM = '(-?\\d+(?:[.,]\\d+)?|N\\.?D\\.?)';
// Cada campo: lista de padrões de rótulo. O valor é o primeiro número depois do rótulo, na mesma linha.
const ROTULOS = {
  phCaCl2: [/pH\s*(?:em\s*)?(?:CaCl|CaC1|Ca\s*Cl)\s*[₂2]?/i],
  phH2O: [/pH\s*(?:em\s*)?(?:H\s*[₂2]\s*O|água|agua)/i],
  phSMP: [/(?:pH\s*(?:em\s*)?)?SMP/i],
  hal: [/H\s*\+\s*Al(?:\s*[³3]?\s*\+?)?/i, /Acidez\s+Potencial(?:\s*\(H\s*\+\s*Al\))?/i],
  al: [/(?<![+H]\s*)\bAl\s*(?:[³3]\s*\+|\+\s*[³3]|[³3])(?!\s*%)/, /Alum[ií]nio(?:\s*\(Al[^)]*\))?(?!\s*%)/i, /Acidez\s+Troc[áa]vel(?:\s*\(Al[^)]*\))?/i],
  ca: [/C[áa]lcio(?:\s*\(Ca[^)]*\))?(?!\s*%)/i, /\bCa\s*(?:[²2]\s*\+|\+\s*[²2])(?!\s*%)/],
  mg: [/Magn[ée]sio(?:\s*\(Mg[^)]*\))?(?!\s*%)/i, /\bMg\s*(?:[²2]\s*\+|\+\s*[²2])(?!\s*%)/],
  k: [/Pot[áa]ssio(?:\s*\(K[^)]*\))?(?!\s*%)/i, /\bK\s*\+(?!\s*%)/],
  na: [/S[óo]dio(?:\s*\(Na[^)]*\))?(?!\s*%)/i],
  p: [/F[óo]sforo\s*(?:\(P\)\s*)?Mehlich\s*(?:-\s*)?(?:1|I)\b/i, /P\s*[-(]?\s*Mehlich\s*(?:-\s*)?(?:1|I)\b\)?/i, /P[\s-]*(?:Mel|Meh)[\s.]*(?:1|I)\b/i, /F[óo]sforo(?:\s*\(P\))?(?!\s*(?:Rem|Mehlich\s*(?:3|III)))/i, /P\s*[-]?\s*dispon[ií]vel/i],
  s: [/Enxofre(?:\s*\(S[^)]*\))?/i, /\bS\s*-?\s*SO\s*[₄4]/i],
  b: [/Boro(?:\s*\(B\))?/i],
  cu: [/Cobre(?:\s*\(Cu[^)]*\))?/i],
  fe: [/Ferro(?:\s*\(Fe[^)]*\))?/i],
  mn: [/Mangan[êe]s(?:\s*\(Mn[^)]*\))?/i],
  zn: [/Zinco(?:\s*\(Zn[^)]*\))?/i],
  mo: [/Mat[ée]ria\s+Org[âa]nica(?:\s*\(M\.?O\.?S?\))?(?:\s*\(?g\s*\/\s*(?:dm|kg)[³3]?\)?)?/i, /\bM\.?O\.?\b/],
  ctc: [/CTC\s*(?:\(?\s*(?:a\s*)?pH\s*7(?:[.,]0)?\s*\)?|pH\s*7|total)(?:\s*\(?cmol\w*\s*\/?\s*dm[³3]?\)?)?/i, /\bT\s*\(CTC/i],
  v: [/\bV\s*%/i, /Satura[çc][ãa]o\s+(?:por\s+)?bases(?:\s*\(V%?\))?/i],
  argila: [/Argila/i],
};

export function parseTextoGenerico(linhas) {
  const solo = {};
  const achados = {};
  for (const linha of linhas) {
    for (const [campo, padroes] of Object.entries(ROTULOS)) {
      if (solo[campo] != null) continue;
      for (const re of padroes) {
        const m = linha.match(re);
        if (!m) continue;
        const resto = linha.slice(m.index + m[0].length);
        // pula unidades logo após o rótulo, ex.: "(cmolc/dm³)" "mg/dm3"
        const semUnid = resto.replace(/^[\s:=|]*(\(?\s*(?:cmol\w*|mmol\w*|mg|g|%)\s*\/?\s*(?:dm|kg|L)?\s*[³3]?\s*\)?)?/i, '');
        const mv = semUnid.match(new RegExp('^[\\s:=|]*' + NUM));
        if (mv) {
          solo[campo] = numBR(mv[1]);
          achados[campo] = linha;
          break;
        }
      }
    }
  }
  // Informações de cabeçalho
  const info = {};
  const texto = linhas.join('\n');
  const cab = (re) => texto.match(re)?.[1]?.trim();
  info.produtor = cab(/(?:Produtor|Propriet[áa]rio|Cliente)\s*:?\s*([^\n]+?)(?:\s{2,}|\s+(?:Profundidade|Data|Amostra)|$)/im);
  info.propriedade = cab(/(?:Propriedade|Fazenda)\s*:?\s*([^\n]+?)(?:\s{2,}|\s+Munic|$)/im);
  info.municipio = cab(/Munic[íi]pio(?:\/UF)?\s*:?\s*([^\n]+?)(?:\s{2,}|\s+[ÁA]rea|\s+Coleta|$)/im);
  info.talhao = cab(/(?:Talh[ãa]o|Gleba|Nome da amostra|Identifica[çc][ãa]o)\s*:?\s*([^\n]+?)(?:\s{2,}|\s+Data|\s+Profund|$)/im);
  info.profundidade = cab(/Profundidade\s*:?\s*(\d+\s*[-–a]\s*\d+\s*(?:cm)?)/i);
  info.dataColeta = cab(/Coleta\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i);
  for (const k of Object.keys(info)) if (!info[k]) delete info[k];
  return { info, solo, achados, origem: 'Leitura por rótulos', avisos: [] };
}

// ---------- Ajustes de unidade e checagens ----------

const FAIXA_PLAUSIVEL = {
  phCaCl2: [3, 8.5], phH2O: [3.5, 9.5], phSMP: [4, 8], al: [0, 10], hal: [0, 40], ca: [0, 40], mg: [0, 20],
  k: [0, 3], na: [0, 5], p: [0, 600], s: [0, 300], b: [0, 10], cu: [0, 60], fe: [0, 1500], mn: [0, 800],
  zn: [0, 150], mo: [0, 250], argila: [0, 1000], ctc: [0, 80], v: [0, 100],
};

export function normalizarSolo(solo) {
  const s = { ...solo };
  const avisos = [];
  // K em mg/dm³ -> cmolc/dm³ (1 cmolc de K = 391 mg)
  if (s.k != null && s.k > 3) {
    avisos.push(`K = ${s.k} parece estar em mg/dm³; convertido para ${(s.k / 391).toFixed(2)} cmolc/dm³.`);
    s.k = Math.round((s.k / 391) * 100) / 100;
  }
  // Ca/Mg/H+Al em mmolc/dm³ -> cmolc/dm³
  for (const c of ['ca', 'mg', 'hal', 'al', 'ctc']) {
    if (s[c] != null && ((c === 'mg' && s[c] > 15) || (c !== 'mg' && s[c] > 60))) {
      avisos.push(`${c.toUpperCase()} = ${s[c]} parece estar em mmolc/dm³; dividido por 10.`);
      s[c] = Math.round((s[c] / 10) * 100) / 100;
    }
  }
  // MO em % -> g/dm³
  if (s.mo != null && s.mo < 10) {
    avisos.push(`MO = ${s.mo} parece estar em %; convertido para ${(s.mo * 10).toFixed(1)} g/dm³.`);
    s.mo = Math.round(s.mo * 100) / 10;
  }
  // Valores impossíveis em solo (lixo de OCR, ex.: "0,75" lido como 975) são descartados
  for (const [c, [min, max]] of Object.entries(FAIXA_PLAUSIVEL)) {
    if (s[c] != null && (s[c] < min || s[c] > max)) {
      avisos.push(`${c.toUpperCase()} = ${s[c]} está fora do possível (${min} a ${max}); valor descartado. Digite o valor do laudo.`);
      delete s[c];
    }
  }
  return { solo: s, avisos };
}

export function parseItens(paginas) {
  // paginas: array de arrays de itens {str,x,y}
  const texto = paginas.flat().map((i) => i.str).join(' ');
  let r;
  if (ehLaborsolo(texto)) r = parseLaborsolo(paginas[0]);
  else r = parseTextoGenerico(paginas.flatMap((p) => montarLinhas(p)));
  const n = normalizarSolo(r.solo);
  r.solo = n.solo;
  r.avisos = [...r.avisos, ...n.avisos];
  return r;
}

export { numBR };
