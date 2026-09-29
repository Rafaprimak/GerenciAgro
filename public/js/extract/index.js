// Extração dos valores do laudo no navegador.
// PDF com texto  -> pdf.js (offline) -> leitor Laborsolo ou leitor por rótulos
// Foto / PDF escaneado -> online com IA configurada no servidor: leitura pela IA
//                      -> offline (ou sem IA): OCR Tesseract local
// O resultado sempre passa pela tela de conferência antes de ser usado.

import { parseItens, parseTextoGenerico, normalizarSolo, montarLinhas } from './parsers.js';
import { servidorBase } from '../sync.js';
import * as store from '../store.js';

const VENDOR = new URL('../../vendor/', import.meta.url).href;

let pdfjsPromise;
function carregarPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(`${VENDOR}pdfjs/pdf.min.mjs`).then((m) => {
      m.GlobalWorkerOptions.workerSrc = `${VENDOR}pdfjs/pdf.worker.min.mjs`;
      return m;
    });
  }
  return pdfjsPromise;
}

let tesseractPromise;
function carregarTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      if (window.Tesseract) return resolve(window.Tesseract);
      const s = document.createElement('script');
      s.src = `${VENDOR}tesseract/tesseract.min.js`;
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => { tesseractPromise = null; reject(new Error('OCR não disponível offline. Abra o app com internet uma vez e use "Preparar OCR offline" em Configurações.')); };
      document.head.appendChild(s);
    });
  }
  return tesseractPromise;
}

export async function iaDisponivel() {
  if (!navigator.onLine) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`${await servidorBase()}/api/health`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    return r.ok && (await r.json()).ai === true;
  } catch {
    return false;
  }
}

// modo: 'auto' | 'offline'
export async function extrairArquivo(file, { modo = 'auto', progresso = () => {} } = {}) {
  const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (ehPdf) {
    progresso('Lendo o PDF...');
    const pdfjs = await carregarPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const paginas = [];
    for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      paginas.push(tc.items.filter((it) => it.str).map((it) => ({ str: it.str, x: it.transform[4], y: vp.height - it.transform[5] })));
    }
    const qtdTexto = paginas.flat().reduce((n, i) => n + i.str.trim().length, 0);
    if (qtdTexto > 40) {
      const r = parseItens(paginas);
      if (contar(r.solo) >= 5) return r;
    }
    // PDF escaneado ou formato desconhecido: tenta IA com o PDF inteiro, senão OCR da 1ª página
    if (modo === 'auto' && (await iaDisponivel())) return extrairComIA(file, 'application/pdf', progresso);
    progresso('PDF sem texto legível. Convertendo a 1ª página em imagem para o OCR...');
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return ocr(canvas, progresso);
  }

  if (modo === 'auto' && (await iaDisponivel())) {
    try {
      return await extrairComIA(file, file.type || 'image/jpeg', progresso);
    } catch (e) {
      progresso(`IA indisponível (${e.message}). Usando OCR offline...`);
    }
  }
  const canvas = await imagemParaCanvas(file, 2400, true);
  return ocr(canvas, progresso);
}

function contar(solo) {
  return Object.values(solo || {}).filter((v) => v != null).length;
}

// ampliar = true amplia imagens pequenas (até 3x): o OCR erra muito com letra miúda
async function imagemParaCanvas(file, maxLado, ampliar = false) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const esc = Math.min(ampliar ? 3 : 1, maxLado / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * esc);
  canvas.height = Math.round(bmp.height * esc);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function ocr(canvas, progresso) {
  progresso('Carregando o OCR...');
  const T = await carregarTesseract();
  const worker = await T.createWorker('por', 1, {
    workerPath: `${VENDOR}tesseract/worker.min.js`,
    corePath: `${VENDOR}tesseract-core/`,
    langPath: `${VENDOR}tessdata`,
    gzip: true,
    logger: (m) => {
      if (m.status === 'recognizing text') progresso(`Reconhecendo texto... ${Math.round(m.progress * 100)}%`);
    },
  });
  try {
    // Modo "texto esparso" + posição de cada palavra: laudos em tabela têm rótulo e valor
    // em colunas separadas, e a leitura em blocos padrão do OCR separa os dois.
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
    const palavras = [];
    for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) {
      palavras.push({ str: w.text, x: w.bbox.x0, y: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0 });
    }
    const alturas = palavras.map((w) => w.h).sort((a, b) => a - b);
    const hMediana = alturas[Math.floor(alturas.length / 2)] || 20;
    const r = parseTextoGenerico(montarLinhas(palavras, hMediana * 0.6));
    // completa com a leitura em texto corrido (pega laudos em formato de lista)
    const r2 = parseTextoGenerico(data.text.split('\n').map((l) => l.trim()).filter(Boolean));
    for (const [k, v] of Object.entries(r2.solo)) if (r.solo[k] == null) r.solo[k] = v;
    for (const [k, v] of Object.entries(r2.info)) if (r.info[k] == null) r.info[k] = v;
    const n = normalizarSolo(r.solo);
    return {
      ...r,
      solo: n.solo,
      origem: 'OCR offline (foto)',
      avisos: [...n.avisos, 'Leitura por OCR offline: confira todos os valores com o laudo. Com internet, a leitura da foto por IA é bem mais precisa. Se o laboratório enviou o PDF, prefira o PDF.'],
    };
  } finally {
    await worker.terminate();
  }
}

async function extrairComIA(file, mediaType, progresso) {
  progresso('Enviando para leitura por IA...');
  let dados, tipo = mediaType;
  if (mediaType === 'application/pdf') {
    dados = await paraBase64(file);
  } else {
    // reduz a foto para economizar dados móveis
    const canvas = await imagemParaCanvas(file, 2000);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    dados = await paraBase64(blob);
    tipo = 'image/jpeg';
  }
  const headers = { 'Content-Type': 'application/json' };
  const token = await store.getMeta('syncToken', '');
  if (token) headers['X-Sync-Token'] = token;
  const resp = await fetch(`${await servidorBase()}/api/extract`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mediaType: tipo, data: dados }),
  });
  if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `erro ${resp.status}`);
  progresso('Interpretando resposta...');
  const r = await resp.json();
  const n = normalizarSolo(r.solo || {});
  return { info: r.info || {}, solo: n.solo, origem: 'Leitura por IA', avisos: [...(r.avisos || []), ...n.avisos] };
}

function paraBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

// Baixa os arquivos do OCR para o cache (uso offline)
export async function prepararOcrOffline(progresso = () => {}) {
  const arquivos = [
    'tesseract/tesseract.min.js',
    'tesseract/worker.min.js',
    'tesseract-core/tesseract-core-lstm.wasm.js',
    'tesseract-core/tesseract-core-simd-lstm.wasm.js',
    'tesseract-core/tesseract-core-relaxedsimd-lstm.wasm.js',
    'tessdata/por.traineddata.gz',
  ];
  const cache = await caches.open('gerenciagro-vendor');
  let i = 0;
  for (const a of arquivos) {
    progresso(`Baixando ${++i}/${arquivos.length}...`);
    const url = VENDOR + a;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Falha ao baixar ${a}`);
    await cache.put(url, r);
  }
}
