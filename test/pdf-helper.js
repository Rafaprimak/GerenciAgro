import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';

// Mesmo formato de itens que o navegador gera: {str, x, y(do topo)}
export async function itensDoPdf(caminho) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(caminho)) }).promise;
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    paginas.push(tc.items.filter((it) => it.str).map((it) => ({ str: it.str, x: it.transform[4], y: vp.height - it.transform[5] })));
  }
  return paginas;
}
