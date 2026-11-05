// Dal terminale: aggiorna subito gli orari dei negozi (mappa, siti, internet) e dice com'è andata.
//   npm run orari
import fs from 'node:fs';
import path from 'node:path';
import { apri, RADICE } from './db.js';
import { aggiornaOrari } from './orari-aggiorna.js';
import { leggiOrari } from './orari.js';

// .env semplice (chiave=valore), come fa il server
// se una chiave compare due volte vale l'ultima (come fa dotenv); una variabile già nell'ambiente non si tocca
try { const env = {}; for (const r of fs.readFileSync(path.join(RADICE, '.env'), 'utf8').split('\n')) { const m = r.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2]; } for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v; } catch { /* niente .env */ }
const db = apri();
const stato = () => {
  const r = db.prepare(`SELECT n.orari, n.orari_fonte, c.nome catena, n.indirizzo FROM negozi n JOIN catene c ON c.id = n.catena_id
    WHERE n.attivo = 1 AND n.catena_id IN (SELECT catena_id FROM famiglia_catene)`).all();
  const con = r.filter((n) => leggiOrari(n.orari));
  return { tot: r.length, con: con.length, fonti: con.reduce((m, n) => ({ ...m, [n.orari_fonte || '?']: (m[n.orari_fonte || '?'] || 0) + 1 }), {}), senza: r.filter((n) => !leggiOrari(n.orari)).map((n) => `${n.catena} ${n.indirizzo}`.trim()) };
};
// «npm run orari -- forza»: ricerca di nuovo su internet anche i negozi già cercati di recente
const forza = process.argv.includes('forza');
if (forza) { const n = db.prepare("UPDATE negozi SET web_quando = NULL WHERE orari_fonte <> 'mano'").run().changes; console.log(`Forza: riprovo la ricerca su internet (${n} negozi azzerati)`); }
// perché un negozio senza orari non viene cercato su internet
const perche = db.prepare(`SELECT n.id, n.orari, n.orari_fonte, n.indirizzo, n.nome, n.web_quando, c.tipo, c.nome catena FROM negozi n JOIN catene c ON c.id = n.catena_id
  WHERE n.attivo = 1 AND n.catena_id IN (SELECT catena_id FROM famiglia_catene)`).all().filter((n) => !leggiOrari(n.orari));
const motivi = { 'già cercati negli ultimi 30 giorni': perche.filter((n) => n.web_quando && n.web_quando > new Date(Date.now() - 30 * 86400000).toISOString()).length,
  'senza indirizzo (non si possono cercare)': perche.filter((n) => !(n.indirizzo || (n.nome && n.nome.toLowerCase() !== n.catena.toLowerCase()))).length, 'corretti a mano': perche.filter((n) => n.orari_fonte === 'mano').length, 'non supermercati (fornitori)': perche.filter((n) => n.tipo !== 'supermercato').length };
const prima = stato();
console.log(`Negozi dei supermercati scelti: ${prima.tot}, con orari: ${prima.con}`);
console.log(`Ricerca su internet con Claude (costa crediti): ${process.env.ORARI_WEB === '1' ? 'ACCESA' : 'spenta. Gli orari si leggono dalla mappa e dalle pagine ufficiali dei negozi (Altro → Supermercati e negozi)'}`);
const k = String(process.env.ANTHROPIC_API_KEY || '').trim();
if (process.env.ORARI_WEB === '1') console.log(`Chiave di Claude nel file .env: ${!k ? 'NON trovata (senza, gli orari non si cercano su internet)' : /^LA-TUA/i.test(k) ? 'c\'è ancora quella d\'esempio (LA-TUA-CHIAVE…): togli quella riga dal file .env' : `trovata (comincia con ${k.slice(0, 7)}…)`}`);
console.log(`Senza orari: ${perche.length}` + (Object.values(motivi).some(Boolean) ? ` (${Object.entries(motivi).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''));
// con «forza» si cercano tutti quelli che mancano, senza il limite giornaliero (circa 5-10 centesimi a negozio)
await aggiornaOrari(db, (m) => console.log('  ' + m), forza ? { limiteWeb: 60 } : {});
const dopo = stato();
console.log(`Fatto. Con orari: ${dopo.con} su ${dopo.tot} (${Object.entries(dopo.fonti).map(([k, v]) => `${v} ${k === 'web' ? 'da internet' : k === 'mappa' ? 'dalla mappa' : k === 'sito' ? 'dal sito' : k === 'mano' ? 'a mano' : k}`).join(', ') || 'nessuno'})`);
if (dopo.senza.length) console.log(`Ancora senza orari (${dopo.senza.length}): ${dopo.senza.slice(0, 15).join(' · ')}${dopo.senza.length > 15 ? ' …' : ''}`);
db.close?.();
