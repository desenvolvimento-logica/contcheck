import { readFileSync } from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

console.log('start');
const data = new Uint8Array(readFileSync('/tmp/t.pdf'));
const doc = await pdfjs.getDocument({ data }).promise;
console.log('pages', doc.numPages);
const page = await doc.getPage(1);
const content = await page.getTextContent();
console.log('items', content.items.length);

const items = [];
for (const it of content.items) {
  if (!it.str || !it.str.trim()) continue;
  const w = typeof it.width === 'number' && it.width > 0 ? it.width : it.str.length*5;
  items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: w });
}
console.log('non-empty', items.length);

const buckets = new Map();
for (const it of items) {
  const k = Math.round(it.y/2)*2;
  if (!buckets.has(k)) buckets.set(k, []);
  buckets.get(k).push(it);
}
const keys = [...buckets.keys()].sort((a,b)=>b-a);
const rows = [];
for (const k of keys) {
  const line = buckets.get(k).sort((a,b)=>a.x-b.x);
  const merged = [];
  for (const it of line) {
    const last = merged[merged.length-1];
    const gap = last ? it.x - (last.x + last.width) : Infinity;
    if (last && gap < 1.5 && !/\s/.test(it.str) && !/\s/.test(last.str)) {
      last.str += it.str;
      last.width = it.x + it.width - last.x;
    } else merged.push({...it});
  }
  rows.push({items: merged});
}
console.log('rows', rows.length);

const HEADER = /^(0?[1-9]|1[0-2])[\/\-.]\d{2,4}$/i;
const NUM = /^-?\d{1,3}(\.\d{3})*,\d{2}[DC]?$|^-?\d+,\d{2}[DC]?$/i;

let header;
for (const r of rows) {
  const m = r.items.filter(it => HEADER.test(it.str.trim()));
  if (m.length >= 3) {
    const picked = m.slice(0,3);
    const after = r.items.find(it => it.x > picked[2].x+5 && !HEADER.test(it.str.trim()));
    header = { labels: picked.map(p=>p.str.trim()), xs: picked.map(p=>p.x), rightBoundary: after?after.x:picked[2].x+(picked[2].x-picked[1].x) };
    console.log('HEADER:', JSON.stringify(header));
    break;
  }
}
if (!header) { console.log('NO HEADER'); process.exit(0); }

const target = '3.1.1.02.002';
for (const r of rows) {
  const ci = r.items.find(it => it.str.trim() === target);
  if (!ci) continue;
  console.log('\nROW items for', target);
  for (const it of r.items) console.log(`  x=${it.x.toFixed(1)} w=${it.width.toFixed(1)} end=${(it.x+it.width).toFixed(1)} str=${JSON.stringify(it.str)}`);
  
  const nums = r.items.filter(it => NUM.test(it.str.trim()));
  const boundaries = [header.xs[0], header.xs[1], header.xs[2], header.rightBoundary];
  const MARGIN=5;
  const picked = [null,null,null];
  for (const n of nums) {
    const re = n.x + n.width;
    for (let i=0;i<3;i++) {
      if (re > boundaries[i]-30 && re <= boundaries[i+1]-MARGIN+2) {
        if (!picked[i] || re > picked[i].x+picked[i].width) picked[i]=n;
        break;
      }
    }
  }
  console.log('\nPICKED:', picked.map(p=>p?p.str:null));
  break;
}
