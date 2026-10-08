// Writes images/review.html: every generated image in a grid with its exercise name, so a batch
// can be checked at a glance. Tick the bad ones and copy the line it builds back to Codex.
//
//   node scripts/build-image-review.mjs

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const jobs = JSON.parse(await readFile(join(ROOT, 'images/jobs.json'), 'utf8'));
const logPath = join(ROOT, 'images/log.jsonl');
const log = existsSync(logPath) ? (await readFile(logPath, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const status = new Map(log.map((e) => [e.id, e]));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cards = jobs
  .filter((j) => status.has(j.id))
  .map((j) => {
    const e = status.get(j.id);
    const src = existsSync(join(ROOT, 'images/incoming', `${j.id}.png`)) ? `incoming/${j.id}.png` : `../mobile/assets/exercises/${j.id}.webp`;
    return `<label class="card ${e.status}"><img src="${esc(src)}" loading="lazy" alt=""><span><input type="checkbox" value="${esc(j.id)}"> #${j.order} ${esc(j.name)}</span><small>${esc(j.figure)}, ${esc(j.view)}${e.status !== 'kept' ? `, ${esc(e.status)}: ${esc(e.note ?? '')}` : ''}</small></label>`;
  })
  .join('\n');

await writeFile(
  join(ROOT, 'images/review.html'),
  `<!doctype html><meta charset="utf-8"><title>Image review</title>
<style>body{font:14px system-ui;margin:16px;background:#f3eee6}#bar{position:sticky;top:0;background:#f3eee6;padding:8px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.card{display:flex;flex-direction:column;gap:4px;background:#fff;padding:6px;border-radius:8px}
.card img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px}.needs-review{outline:3px solid #e0ae52}small{color:#666}textarea{width:100%;height:60px}</style>
<div id="bar"><b>${status.size} images.</b> Tick the bad ones, then paste this to Codex:<textarea id="out" readonly></textarea></div>
<div class="grid">${cards}</div>
<script>const out=document.getElementById('out');document.addEventListener('change',()=>{const ids=[...document.querySelectorAll('input:checked')].map(i=>i.value);
out.value=ids.length?'Redo these images following docs/IMAGE_RULES.md. First append {"id":ID,"status":"rejected"} to images/log.jsonl for each, then regenerate them: '+ids.join(', '):'';});</script>\n`,
);
console.log(`Wrote images/review.html with ${status.size} images`);
