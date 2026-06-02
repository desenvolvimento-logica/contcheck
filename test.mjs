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
const sorted = [...items].sort((a,b)=>b.y-a.y);
const lines = [];
for (const it of sorted) {
  const last = lines[lines.length-1];
  if (last && Math.abs(last[0].y - it.y) <= 2.5) last.push(it);
  else lines.push([it]);
}
const rows = lines.map(l => ({items: l.sort((a,b)=>a.x-b.x)}));

const HEADER = /^(0?[1-9]|1[0-2])[\/\-.]\d{2,4}$/i;
const NUM = /^-?\d{1,3}(\.\d{3})*,\d{2}[DC]?$|^-?\d+,\d{2}[DC]?$/i;

let header;
for (const r of rows) {
  const m = r.items.filter(it => HEADER.test(it.str.trim()));
  if (m.length >= 3) {
    const picked = m.slice(0,3);
    const after = r.items.find(it => it.x > picked[2].x+5 && !HEADER.test(it.str.trim()));
    header = { labels: picked.map(p=>p.str.trim()), xs: picked.map(p=>p.x), rightBoundary: after?after.x:picked[2].x+(picked[2].x-picked[1].x) };
    console.log('HEADER:', header);
    break;
  }
}

const target = '3.1.1.02.002';
for (const r of rows) {
  const ci = r.items.find(it => it.str.trim().split(/\s+/).includes(target));
  if (!ci) continue;
  const nums = r.items.filter(it => NUM.test(it.str.trim()));
  const boundaries = [header.xs[0], header.xs[1], header.xs[2], header.rightBoundary];
  const picked = [null,null,null];
  for (const n of nums) {
    const re = n.x + n.width;
    for (let i=0;i<3;i++) {
      if (re > boundaries[i]-30 && re <= boundaries[i+1]-5+2) {
        if (!picked[i] || re > picked[i].x+picked[i].width) picked[i]=n;
        break;
      }
    }
  }
  const firstNumX = Math.min(...nums.map(n=>n.x));
  const desc = r.items.filter(it => it.x > ci.x + ci.width - 0.1 && it.x < firstNumX).map(it=>it.str.trim()).join(' ');
  console.log('CLASSITEM:', JSON.stringify(ci.str), 'x=', ci.x, 'w=', ci.width);
  console.log('DESC:', desc);
  console.log('PICKED:', picked.map(p=>p?p.str:null));
  break;
}
