// 0.60.1 Toglie una voce della lista con i suoi prodotti e i loro prezzi (quando non serve più o non si sa cos'era).
// Uso, dalla cartella dell'app:  node server/elimina-voce.js "Rosa"        (mostra cosa toglierebbe)
//                                node server/elimina-voce.js "Rosa" sì     (lo fa davvero)
import fs from 'node:fs';
import path from 'node:path';
import { apri, RADICE } from './db.js';
try { for (const r of fs.readFileSync(path.join(RADICE, '.env'), 'utf8').split('\n')) { const m = r.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; } } catch { /* niente .env */ }
const [nome, conferma] = process.argv.slice(2);
if (!nome) { console.log('Uso: node server/elimina-voce.js "voce" [sì]'); process.exit(1); }
const db = apri();
const v = db.prepare('SELECT * FROM voci WHERE lower(nome) = lower(?)').get(nome);
if (!v) { console.log(`Non trovo la voce «${nome}».`); process.exit(1); }
const prodotti = db.prepare('SELECT id, nome FROM prodotti WHERE voce_id = ?').all(v.id);
const prezzi = prodotti.length ? db.prepare(`SELECT COUNT(*) n FROM prezzi WHERE prodotto_id IN (${prodotti.map(() => '?').join(',')})`).get(...prodotti.map((p) => p.id)).n : 0;
const righe = db.prepare('SELECT COUNT(*) n FROM righe_lista WHERE voce_id = ?').get(v.id).n;
console.log(`Tolgo «${v.nome}»: ${prodotti.length} prodotti (${prodotti.map((p) => p.nome).join(', ') || 'nessuno'}), ${prezzi} prezzi, ${righe} righe nelle liste.`);
if (conferma !== 'sì') { console.log('Per farlo davvero aggiungi in fondo: sì'); process.exit(0); }
const T = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
db.transaction(() => {
  for (const p of prodotti) {
    db.prepare('DELETE FROM righe_lista WHERE prodotto_id = ?').run(p.id);
    if (T('nomi_scontrino')) db.prepare('DELETE FROM nomi_scontrino WHERE prodotto_id = ?').run(p.id);
    if (T('non_uguali')) db.prepare('DELETE FROM non_uguali WHERE a = ? OR b = ?').run(p.id, p.id);
    db.prepare('DELETE FROM preferiti WHERE prodotto_id = ?').run(p.id);
    db.prepare('DELETE FROM valutazioni WHERE prodotto_id = ?').run(p.id);
    db.prepare('DELETE FROM prezzi WHERE prodotto_id = ?').run(p.id);
    db.prepare('DELETE FROM codici_alias WHERE prodotto_id = ?').run(p.id);
    db.prepare('DELETE FROM prodotti WHERE id = ?').run(p.id);
  }
  db.prepare('DELETE FROM righe_lista WHERE voce_id = ?').run(v.id);
  db.prepare('DELETE FROM preferiti WHERE voce_id = ?').run(v.id);
  db.prepare('DELETE FROM abitudini WHERE voce_id = ?').run(v.id);
  db.prepare('UPDATE offerte SET voce_id = NULL WHERE voce_id = ?').run(v.id);
  db.prepare('DELETE FROM voci WHERE id = ?').run(v.id);
})();
console.log('Fatto.');
