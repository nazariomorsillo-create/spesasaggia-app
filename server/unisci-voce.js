// 0.59 Unisce due voci della lista che sono la stessa cosa (es. «Fresh mandarin oranges» dentro «Mandarini»),
// oppure, se la seconda non c'è, rinomina la prima. Uso, dalla cartella dell'app:
//   node server/unisci-voce.js "Fresh mandarin oranges" "Mandarini"
// Senza il terzo argomento «sì» mostra solo cosa farebbe.
import fs from 'node:fs';
import path from 'node:path';
import { apri, RADICE } from './db.js';
try { for (const r of fs.readFileSync(path.join(RADICE, '.env'), 'utf8').split('\n')) { const m = r.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; } } catch { /* niente .env */ }
const [da, a, conferma] = process.argv.slice(2);
if (!da || !a) { console.log('Uso: node server/unisci-voce.js "voce da togliere" "voce che resta" [sì]'); process.exit(1); }
const db = apri();
const V = (n) => db.prepare('SELECT * FROM voci WHERE lower(nome) = lower(?)').get(n);
const x = V(da); const y = V(a);
if (!x) { console.log(`Non trovo la voce «${da}». Voci simili:`, db.prepare("SELECT nome FROM voci WHERE nome LIKE ?").pluck().all(`%${da.split(' ')[0]}%`)); process.exit(1); }
const n = db.prepare('SELECT COUNT(*) n FROM prodotti WHERE voce_id = ?').get(x.id).n;
if (!y) {
  console.log(`«${a}» non c'è: rinomino «${x.nome}» in «${a}» (${n} prodotti).`);
  if (conferma === 'sì') { db.prepare('UPDATE voci SET nome = ? WHERE id = ?').run(a, x.id); console.log('Fatto.'); } else console.log('Per farlo davvero aggiungi in fondo: sì');
  process.exit(0);
}
if (x.id === y.id) { console.log('È la stessa voce.'); process.exit(0); }
if (x.unita !== y.unita) { console.log(`Non le unisco: «${x.nome}» si conta in ${x.unita}, «${y.nome}» in ${y.unita}.`); process.exit(1); }
console.log(`Sposto in «${y.nome}» i ${n} prodotti di «${x.nome}», la lista, i preferiti, le abitudini e le offerte; poi tolgo «${x.nome}».`);
if (conferma !== 'sì') { console.log('Per farlo davvero aggiungi in fondo: sì'); process.exit(0); }
db.transaction(() => {
  db.prepare('UPDATE prodotti SET voce_id = ? WHERE voce_id = ?').run(y.id, x.id);
  db.prepare('UPDATE righe_lista SET voce_id = ? WHERE voce_id = ?').run(y.id, x.id);
  db.prepare('UPDATE OR IGNORE preferiti SET voce_id = ? WHERE voce_id = ?').run(y.id, x.id); db.prepare('DELETE FROM preferiti WHERE voce_id = ?').run(x.id);
  db.prepare('UPDATE OR IGNORE abitudini SET voce_id = ? WHERE voce_id = ?').run(y.id, x.id); db.prepare('DELETE FROM abitudini WHERE voce_id = ?').run(x.id);
  db.prepare('UPDATE offerte SET voce_id = ? WHERE voce_id = ?').run(y.id, x.id);
  db.prepare('DELETE FROM voci WHERE id = ?').run(x.id);
})();
console.log('Fatto.');
