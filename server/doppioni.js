// 0.58 Schede doppie dello stesso prodotto, trovate da sole.
// Succede quando lo stesso prodotto entra da strade diverse: scontrino («ARACHIDI SALATE»), volantino, codice a barre
// (nome di Open Food Facts), inserimento a mano. Due schede sono «probabilmente lo stesso prodotto» quando:
//  - si trovano nello STESSO supermercato (prezzo attuale lì, o marchio di quel supermercato) e hanno almeno uno di questi:
//    nome simile, stessi ingredienti, stesso formato e stesso prezzo, stesso prezzo o formato con nome o voce in comune;
//  - oppure, se una delle due non ha ancora nessun prezzo (appena scansionata), il nome è molto simile.
// Mai se: due codici a barre, due marche diverse, due formati diversi (250 g e 500 g), uno sfuso e l'altro no,
// o se qualcuno ha già detto «sono diversi».
import { parole, marcaNorm } from './censiti.js';

// Parole uguali, anche abbreviate come sugli scontrini («ARACH.» = arachidi, «GNOCCHET.» = gnocchetti)
const pari = (x, y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)));
// Somiglianza pesata: una parola che compare in tanti prodotti (la marca, «Lidl», «bronzo») conta poco,
// una che distingue il prodotto («arachidi», «reginette») conta tanto. Così «Gnocchetti sardi al bronzo Sgambaro»
// e «Reginette al bronzo Sgambaro» non si somigliano, «Arachidi salate Lidl» e «Arachidi tostate e salate» sì.
const somiglia = (A, B, w) => {
  const peso = (x) => w(x); const tA = A.reduce((s, x) => s + peso(x), 0); const tB = B.reduce((s, y) => s + peso(y), 0);
  if (!tA || !tB) return 0;
  const ab = A.filter((x) => B.some((y) => pari(x, y))).reduce((s, x) => s + peso(x), 0) / tA;
  const ba = B.filter((y) => A.some((x) => pari(x, y))).reduce((s, y) => s + peso(y), 0) / tB;
  return Math.min(ab, ba) * 0.5 + Math.max(ab, ba) * 0.5;
};
const ingr = (s) => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((w) => w.length >= 4 && !['ingredienti', 'contiene', 'tracce', 'puo', 'essere', 'prodotto', 'stabilimento'].includes(w)));
const stessiIngredienti = (A, B) => { if (A.size < 2 || B.size < 2) return 0; let c = 0; for (const x of A) if (B.has(x)) c++; return c / (A.size + B.size - c); };

export function prepara(db) {
  db.exec('CREATE TABLE IF NOT EXISTS non_uguali (a INTEGER NOT NULL, b INTEGER NOT NULL, utente_id INTEGER, creato_il TEXT NOT NULL DEFAULT (datetime(\'now\')), PRIMARY KEY (a, b))');
}
export const segnaDiversi = (db, x, y, utente_id = null) => db.prepare('INSERT OR IGNORE INTO non_uguali (a, b, utente_id) VALUES (?, ?, ?)').run(Math.min(x, y), Math.max(x, y), utente_id);

// tutti i prodotti con quello che serve al confronto (una lettura sola del database)
function carica(db) {
  const prodotti = db.prepare('SELECT p.*, v.unita, v.nome voce FROM prodotti p JOIN voci v ON v.id = p.voce_id').all();
  const prezzi = new Map();
  for (const r of db.prepare('SELECT pr.prodotto_id, pr.catena_id, pr.prezzo, pr.offerta, c.nome catena FROM prezzi pr JOIN catene c ON c.id = pr.catena_id WHERE pr.superato_il IS NULL ORDER BY pr.offerta, pr.rilevato_il DESC').all()) {
    if (!prezzi.has(r.prodotto_id)) prezzi.set(r.prodotto_id, new Map());
    const m = prezzi.get(r.prodotto_id); if (!m.has(r.catena_id)) m.set(r.catena_id, r); // per supermercato: prima il prezzo normale, il più recente
  }
  const catene = new Map(db.prepare('SELECT id, nome FROM catene').all().map((c) => [c.id, c.nome]));
  const no = new Set(db.prepare('SELECT a, b FROM non_uguali').all().map((r) => `${r.a}-${r.b}`));
  // quante schede contengono ogni parola (i nomi dei supermercati non contano: «Lidl» non dice che prodotto è)
  const dei = new Set([...catene.values()].flatMap((n) => parole(n)));
  const df = new Map();
  for (const p of prodotti) {
    p._nomi = [parole(p.nome), p.nome_scontrino ? parole(p.nome_scontrino) : null].filter((x) => x && x.length);
  }
  // anche le abbreviazioni contano come la parola intera («SGAM.» = Sgambaro, «BRO.» = bronzo)
  const tutte = [...new Set(prodotti.flatMap((p) => p._nomi.flat()))];
  const simili = (x) => tutte.filter((y) => pari(x, y) || (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))));
  for (const x of tutte) { const S = simili(x); df.set(x, prodotti.filter((p) => p._nomi.some((n) => n.some((y) => S.includes(y)))).length); }
  const w = (x) => (dei.has(x) ? 0 : 1 / Math.max(1, df.get(x) || 1));
  for (const p of prodotti) {
    p._ingr = ingr(p.ingredienti); p._prezzi = prezzi.get(p.id) || new Map();
    p._catene = new Set(p._prezzi.keys()); if (p.catena_id) p._catene.add(p.catena_id);
  }
  return { prodotti, catene, no, w };
}

const fmt = (q, u) => (u === 'kg' && q < 1 ? `${Math.round(q * 1000)} g` : u === 'l' && q < 1 ? `${Math.round(q * 1000)} ml` : `${String(Math.round(q * 1000) / 1000).replace('.', ',')} ${u}`);
const euro = (x) => `${x.toFixed(2).replace('.', ',')} €`;

// Le due schede sono lo stesso prodotto? null = no; altrimenti punteggio, supermercato in comune e i motivi in parole
export function confronta(p, a, { catene, no, w }) {
  if (p.id === a.id || no.has(`${Math.min(p.id, a.id)}-${Math.max(p.id, a.id)}`)) return null;
  if (p.ean && a.ean) return null; // due codici a barre (diversi per forza): prodotti diversi
  if (!!p.sfuso !== !!a.sfuso) return null;
  const mp = marcaNorm(p.marca); const ma = marcaNorm(a.marca); if (mp && ma && !mp.includes(ma) && !ma.includes(mp)) return null;
  const formatoConfrontabile = p.unita === a.unita && p.quantita > 0 && a.quantita > 0 && !p.sfuso;
  const stessoFormato = formatoConfrontabile && Math.abs(p.quantita - a.quantita) / Math.max(p.quantita, a.quantita) <= 0.03;
  if (formatoConfrontabile && !stessoFormato) return null; // 250 g e 500 g: due prodotti
  let nome = 0; let tuttiInConflitto = true;
  // in conflitto: tutti e due i nomi hanno una parola «che dice cos'è» che l'altro non ha (gnocchetti / reginette)
  const resta = (X, Y) => X.some((x) => x.length >= 4 && w(x) >= 0.5 && !Y.some((y) => pari(x, y)));
  for (const A of p._nomi) for (const B of a._nomi) { nome = Math.max(nome, somiglia(A, B, w)); if (!(resta(A, B) && resta(B, A))) tuttiInConflitto = false; }
  const conflitto = p._nomi.length && a._nomi.length && tuttiInConflitto;
  const ing = stessiIngredienti(p._ingr, a._ingr);
  const comuni = [...p._catene].filter((c) => a._catene.has(c));
  let prezzoUguale = null;
  for (const c of comuni) { const x = p._prezzi.get(c); const y = a._prezzi.get(c); if (x && y && Math.abs(x.prezzo - y.prezzo) <= Math.max(0.02, x.prezzo * 0.02)) { prezzoUguale = { catena: catene.get(c), prezzo: y.prezzo }; break; } }
  const stessaVoce = p.voce_id === a.voce_id;
  let ok = false;
  // stesso supermercato: nome simile; oppure formato o prezzo uguali con il nome che un po' torna; gli ingredienti
  // uguali contano solo se l'elenco è lungo (pasta di forme diverse ha gli stessi due ingredienti)
  if (comuni.length) ok = nome >= 0.6 || ((prezzoUguale || stessoFormato) && nome >= 0.3 && !conflitto) || (ing >= 0.6 && Math.min(p._ingr.size, a._ingr.size) >= 5 && nome >= 0.15);
  else if (!p._prezzi.size || !a._prezzi.size) ok = nome >= 0.6 || ing >= 0.75;
  else ok = nome >= 0.85;
  if (!ok) return null;
  const motivi = [];
  if (comuni.length) motivi.push(`tutti e due da ${comuni.map((c) => catene.get(c)).join(', ')}`);
  if (nome >= 0.5) motivi.push('nome simile'); else if (stessaVoce) motivi.push(`stessa voce (${a.voce})`);
  if (ing >= 0.6 && Math.min(p._ingr.size, a._ingr.size) >= 5) motivi.push('stessi ingredienti');
  if (stessoFormato) motivi.push(`stesso formato (${fmt(a.quantita, a.unita)})`);
  if (prezzoUguale) motivi.push(`stesso prezzo (${euro(prezzoUguale.prezzo)} da ${prezzoUguale.catena})`);
  const punti = nome + ing + (stessoFormato ? 0.5 : 0) + (prezzoUguale ? 0.5 : 0) + (comuni.length ? 0.5 : 0) + (stessaVoce ? 0.2 : 0);
  return { punti, motivi, catena: comuni.length ? catene.get(comuni[0]) : null };
}

const riassunto = (a) => { const u = [...a._prezzi.values()][0]; return { id: a.id, nome: a.nome, foto: a.foto, ean: a.ean, nome_scontrino: a.nome_scontrino, prezzo: u?.prezzo ?? null, catena: u?.catena || null, quantita: a.quantita, unita: a.unita }; };

// le schede che sembrano lo stesso prodotto di questa
export function doppioniDi(db, pid) {
  const d = carica(db); const p = d.prodotti.find((x) => x.id === pid); if (!p) return [];
  return d.prodotti.map((a) => ({ a, c: confronta(p, a, d) })).filter((x) => x.c).sort((x, y) => y.c.punti - x.c.punti).slice(0, 4)
    .map(({ a, c }) => ({ ...riassunto(a), motivi: c.motivi, supermercato: c.catena }));
}

// tutte le coppie da controllare, per chi gestisce i prezzi (risultato tenuto per un minuto)
let memo = null;
export const dimentica = () => { memo = null; };
export function tutteLeCoppie(db) {
  if (memo && Date.now() - memo.t < 60_000) return memo.v;
  const d = carica(db); const out = [];
  for (let i = 0; i < d.prodotti.length; i++) for (let j = i + 1; j < d.prodotti.length; j++) {
    const c = confronta(d.prodotti[i], d.prodotti[j], d); if (c) out.push({ a: riassunto(d.prodotti[i]), b: riassunto(d.prodotti[j]), motivi: c.motivi, punti: c.punti });
  }
  out.sort((x, y) => y.punti - x.punti);
  memo = { t: Date.now(), v: out }; return out;
}
