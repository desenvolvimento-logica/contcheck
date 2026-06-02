import { readFileSync } from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const data = new Uint8Array(readFileSync('/tmp/t.pdf'));
const doc = await pdfjs.getDocument({ data }).promise;
const page = await doc.getPage(1);
const content = await page.getTextContent();
const items = [];
for (const it of content.items) {
  if (!it.str || !it.str.trim()) continue;
  const w = typeof it.width === 'number' && it.width > 0 ? it.width : it.str.length*5;
  items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: w });
}
// print first 80
for (const it of items.slice(0,80)) console.log(it.y.toFixed(1), it.x.toFixed(1), 'w='+it.width.toFixed(1), JSON.stringify(it.str));
