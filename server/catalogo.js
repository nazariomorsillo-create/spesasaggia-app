// Catalogo dei prodotti venduti in Italia, presi dagli archivi liberi Open Food Facts (alimenti), Open Beauty Facts
// (igiene personale) e Open Products Facts (casa: detersivi, carta, pulizia), licenza ODbL.
// Sta in un file a parte (data/catalogo.sqlite): si rifà ogni settimana con  node server/catalogo.js
// e l'app lo usa per il codice a barre (anche senza internet) e per la ricerca dei prodotti mai comprati.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { leggiFormato } from './qualita.js';
import { codice } from './additivi.js';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FILE = () => process.env.FILE_CATALOGO || path.join(path.dirname(process.env.FILE_DATI || path.join(RADICE, 'data/spesa.sqlite')), 'catalogo.sqlite');
export const URL_CSV = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';
export const SORGENTI = [
  { url: URL_CSV, tipo: 'cibo', nome: 'Open Food Facts' },
  // casa e igiene: archivi piccoli, si prendono tutti i prodotti (le stesse marche si vendono anche in Italia)
  { url: 'https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz', tipo: 'igiene', nome: 'Open Beauty Facts', tutti: true },
  { url: 'https://static.openproductsfacts.org/data/en.openproductsfacts.org.products.csv.gz', tipo: 'casa', nome: 'Open Products Facts', tutti: true },
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS catalogo (
  ean TEXT PRIMARY KEY, nome TEXT NOT NULL, marca TEXT NOT NULL DEFAULT '', quantita TEXT NOT NULL DEFAULT '', generico TEXT NOT NULL DEFAULT '',
  categorie TEXT NOT NULL DEFAULT '', foto TEXT NOT NULL DEFAULT '', nutriscore TEXT NOT NULL DEFAULT '', nova INTEGER, additivi TEXT,
  bio INTEGER NOT NULL DEFAULT 0, origine TEXT NOT NULL DEFAULT '', ingredienti TEXT NOT NULL DEFAULT '', produttore TEXT NOT NULL DEFAULT '', provenienza TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'cibo'   -- cibo | igiene | casa
);
CREATE VIRTUAL TABLE IF NOT EXISTS cerca_catalogo USING fts5(nome, marca, generico, content='catalogo', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS info (chiave TEXT PRIMARY KEY, valore TEXT);
`;

// ---------- lettura (dentro l'app) ----------
let aperto = null; let quando = 0; let mtime = 0;
function db() {
  const f = FILE();
  if (Date.now() - quando > 60_000 || !aperto) {
    quando = Date.now();
    let m = 0; try { m = fs.statSync(f).mtimeMs; } catch { return null; }
    if (!aperto || m !== mtime) { try { aperto?.close(); } catch { /* già chiuso */ } aperto = new Database(f, { readonly: true, fileMustExist: true }); mtime = m; }
  }
  return aperto;
}
export function chiudi() { try { aperto?.close(); } catch { /* niente */ } aperto = null; }

// Una riga del catalogo nella stessa forma di Open Food Facts online (off.cerca)
export function daRiga(r) {
  if (!r) return null;
  let additivi = null; try { additivi = r.additivi ? JSON.parse(r.additivi) : null; } catch { /* niente */ }
  const nome = [r.nome, r.marca && !r.nome.toLowerCase().includes(r.marca.toLowerCase()) ? r.marca : '', r.quantita].filter(Boolean).join(' ').trim();
  return {
    nome, marca: r.marca, tipo: r.marca ? 'marca' : 'senza', formato: leggiFormato(r.quantita), bio: !!r.bio, origine: r.origine,
    descrizione: [r.generico || r.nome, r.quantita].filter(Boolean).join(', '), ingredienti: r.ingredienti, nutriscore: r.nutriscore, nova: r.nova,
    foto: r.foto, provenienza: r.provenienza, produttore: r.produttore, generico: r.generico,
    categorie: r.categorie ? r.categorie.split('|') : [], additivi,
    tipo: r.tipo || 'cibo', nonAlimentare: !!r.tipo && r.tipo !== 'cibo',
  };
}
export function perCodice(ean) { const d = db(); return d ? daRiga(d.prepare('SELECT * FROM catalogo WHERE ean = ?').get(ean)) : null; }
export function cerca(testo, quanti = 10) {
  const d = db(); if (!d) return [];
  const VUOTE = new Set(['il', 'lo', 'la', 'le', 'gli', 'un', 'una', 'uno', 'di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'al', 'alla', 'con', 'per', 'da', 'in', 'e', 'ed', 'a']);
  const parole = String(testo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w.length >= 2 && !VUOTE.has(w)).slice(0, 6);
  if (!parole.length) return [];
  const q = parole.map((w) => `"${w}"*`).join(' AND ');
  return d.prepare(`SELECT c.* FROM cerca_catalogo f JOIN catalogo c ON c.rowid = f.rowid WHERE cerca_catalogo MATCH ? ORDER BY bm25(cerca_catalogo, 10, 5, 2), (c.foto = '') LIMIT ?`).all(q, quanti)
    .map((r) => ({ ean: r.ean, ...daRiga(r) }));
}
export function info() { const d = db(); if (!d) return null; return Object.fromEntries(d.prepare('SELECT chiave, valore FROM info').all().map((r) => [r.chiave, r.valore])); }

// ---------- importazione (da riga di comando) ----------
const pulito = (s, max = 400) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
// importa uno o più archivi (per tipo: cibo, igiene, casa) in un catalogo nuovo, poi lo sostituisce al vecchio
export async function importa(sorgenti = SORGENTI, { file = FILE(), log = console.log } = {}) {
  const lista = (Array.isArray(sorgenti) ? sorgenti : [{ url: sorgenti, tipo: 'cibo' }]);
  const tmp = `${file}.nuovo`;
  try { fs.unlinkSync(tmp); } catch { /* non c'era */ }
  const d = new Database(tmp); d.pragma('journal_mode = OFF'); d.pragma('synchronous = OFF'); d.exec(SCHEMA);
  let totale = 0; const conti = {};
  for (const s of lista) {
    log(`Scarico ${s.nome || s.url}…`);
    try { conti[s.tipo] = await importaUno(d, s.url, s.tipo, log, !!s.tutti); totale += conti[s.tipo]; }
    catch (e) { if (s.tipo === 'cibo') { d.close(); fs.unlinkSync(tmp); throw e; } log(`  ${s.nome || s.url}: ${e.message} (salto questo archivio)`); }
  }
  if (!totale) { d.close(); fs.unlinkSync(tmp); throw new Error('Nessun prodotto italiano trovato: il file non è quello giusto'); }
  d.exec("INSERT INTO cerca_catalogo(cerca_catalogo) VALUES('rebuild')");
  d.prepare('INSERT OR REPLACE INTO info (chiave, valore) VALUES (?, ?), (?, ?), (?, ?)').run('prodotti', String(totale), 'aggiornato', new Date().toISOString().slice(0, 10), 'per_tipo', JSON.stringify(conti));
  d.close();
  fs.renameSync(tmp, file);
  log(`Fatto: ${totale} prodotti (${Object.entries(conti).map(([k, v]) => `${k} ${v}`).join(', ')}). File: ${file}`);
  return totale;
}
async function importaUno(d, sorgente, tipo, log, tutti = false) {
  let flusso;
  if (/^https?:/.test(sorgente)) {
    const r = await fetch(sorgente, { headers: { 'User-Agent': 'dimmilaspesa/0.7 (+https://spesasaggia.it)' } });
    if (!r.ok) throw new Error(`Download non riuscito: ${r.status}`);
    flusso = Readable.fromWeb(r.body);
  } else { if (!fs.existsSync(sorgente)) throw new Error(`file non trovato: ${sorgente}`); flusso = fs.createReadStream(sorgente); }
  if (String(sorgente).endsWith('.gz')) flusso = flusso.pipe(zlib.createGunzip());
  const righe = readline.createInterface({ input: flusso, crlfDelay: Infinity });
  let col = null; let lette = 0; let tenute = 0; let lotto = [];
  // un codice già presente come alimento non viene sovrascritto da un altro archivio
  const ins = d.prepare(`INSERT ${tipo === 'cibo' ? 'OR REPLACE' : 'OR IGNORE'} INTO catalogo (ean, nome, marca, quantita, generico, categorie, foto, nutriscore, nova, additivi, bio, origine, ingredienti, produttore, provenienza, tipo)
    VALUES (@ean, @nome, @marca, @quantita, @generico, @categorie, @foto, @nutriscore, @nova, @additivi, @bio, @origine, @ingredienti, @produttore, @provenienza, '${tipo}')`);
  const scrivi = d.transaction((xs) => { for (const x of xs) ins.run(x); });
  for await (const riga of righe) {
    const c = riga.split('\t');
    if (!col) { col = Object.fromEntries(c.map((n, i) => [n.trim(), i])); continue; }
    lette++;
    if (lette % 200000 === 0) log(`… ${lette} righe lette, ${tenute} prodotti tenuti`);
    const v = (n) => (col[n] != null ? c[col[n]] || '' : '');
    if (!tutti && !/(^|,)en:italy(,|$)/.test(v('countries_tags'))) continue;
    const ean = v('code').replace(/\D/g, ''); if (ean.length < 8 || ean.length > 14) continue;
    const nome = pulito(v('product_name_it') || v('product_name'), 150); if (!nome) continue;
    const etichette = v('labels_tags');
    const add = v('additives_tags') ? [...new Set(v('additives_tags').split(',').map(codice).filter(Boolean))] : null;
    lotto.push({
      ean, nome, marca: pulito(v('brands').split(',')[0], 60), quantita: pulito(v('quantity'), 40), generico: pulito(v('generic_name_it') || v('generic_name'), 120),
      categorie: v('categories').split(',').map((x) => x.trim()).filter((x) => x && !/^[a-z]{2}:/.test(x)).slice(-4).join('|').slice(0, 300),
      foto: (/^https:\/\//.test(v('image_small_url')) ? v('image_small_url') : /^https:\/\//.test(v('image_front_small_url')) ? v('image_front_small_url') : '').slice(0, 300),
      nutriscore: tipo === 'cibo' && /^[a-e]$/.test(v('nutriscore_grade')) ? v('nutriscore_grade') : '', nova: tipo === 'cibo' && [1, 2, 3, 4].includes(Number(v('nova_group'))) ? Number(v('nova_group')) : null,
      additivi: tipo === 'cibo' && add ? JSON.stringify(add) : null, bio: /organic|biologico|(^|,)..:bio(,|$)/.test(etichette) ? 1 : 0,
      origine: /(^|,)en:italy(,|$)/.test(v('origins_tags')) ? 'italia' : '', ingredienti: pulito(v('ingredients_text_it') || v('ingredients_text'), 2000),
      produttore: pulito(v('manufacturing_places'), 120), provenienza: pulito(v('origins'), 120),
    });
    tenute++;
    if (lotto.length >= 5000) { scrivi(lotto); lotto = []; }
  }
  if (lotto.length) scrivi(lotto);
  if (!col) throw new Error('il file non è quello giusto');
  log(`  ${tenute} prodotti ${tutti ? '' : 'italiani '}su ${lette} righe`);
  return tenute;
}

// node server/catalogo.js  [indirizzo o file .csv.gz]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  importa(process.argv[2] ? [{ url: process.argv[2], tipo: process.argv[3] || 'cibo' }] : SORGENTI).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
