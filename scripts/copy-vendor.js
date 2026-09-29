// Copia as bibliotecas usadas no navegador (pdf.js e OCR) para public/vendor,
// para que o app funcione offline sem depender de CDN.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(raiz, 'node_modules');
const destino = path.join(raiz, 'public', 'vendor');

const arquivos = [
  ['pdfjs-dist/build/pdf.min.mjs', 'pdfjs/pdf.min.mjs'],
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdfjs/pdf.worker.min.mjs'],
  ['tesseract.js/dist/tesseract.min.js', 'tesseract/tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'tessdata/por.traineddata.gz'],
];

for (const [de, para] of arquivos) {
  const origem = path.join(nm, de);
  const alvo = path.join(destino, para);
  if (!fs.existsSync(origem)) {
    console.warn(`[copy-vendor] não encontrado: ${de}`);
    continue;
  }
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.copyFileSync(origem, alvo);
}
console.log('[copy-vendor] bibliotecas copiadas para public/vendor');
