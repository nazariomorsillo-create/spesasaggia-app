// Spesa Saggia (cartella giro-spesa): API e app. Avvio: npm start (porta 3200, o PORTA nel file .env).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { prepara as preparaDoppioni, doppioniDi, tutteLeCoppie, segnaDiversi, dimentica } from './doppioni.js';
import { apri, RADICE, impostazioni, scrivi, PREDEFINITE, AMBITI, zonaDi, riordinaPrezzi } from './db.js';
import { calcola, prezziValidi, statoPrezzo, confrontabile, valeQui, costo } from './calcolo.js';
import { oggi, settimana, DATA } from './tempo.js';
import * as mappe from './mappe.js';
import * as off from './off.js';
import { punteggio as punteggioBase, valore, QUALITA_MINIMA, additiviDi, giudizio, leggiFormato, dettaglio as dettaglioBase } from './qualita.js';
import { codice, daIngredienti, elenco as elencoAdditivi } from './additivi.js';
import { capisci, trovaVoce, indovina, maiuscola, radici, generica } from './voce.js';
import { accesso } from './accesso.js';
import * as catalogo from './catalogo.js';
import { cercaFoto } from './foto-auto.js';
import { invia as inviaWhatsapp } from './whatsapp.js';
import * as lettura from './lettura.js';
import { produttori } from './produttori.js';
import * as vicini from './vicini.js';
import { aggiornaOrari, leggiOrariDaPagina, urlSicuro } from './orari-aggiorna.js';
import { leggiOrari, scriviOrari } from './orari.js';
import { spese, valuta, raggruppa } from './spese.js';
import { statistiche } from './statistiche.js';
import { volantini } from './volantini.js';
import { perEan, trovaCensito, completa, somiglianza, diCatena } from './censiti.js';
import * as claude from './claude.js';
import { daLettura, valoriJson, nutriDaValori } from './etichetta.js';
import * as tariffeMod from './tariffe.js';
import { categoriaDi, nomeCategoria, ORDINE as ORDINE_CATEGORIE } from './categorie.js';
const VERSIONE = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// .env semplice (chiave=valore)
// se una chiave compare due volte vale l'ultima (come fa dotenv); una variabile già nell'ambiente non si tocca
try { const env = {}; for (const r of fs.readFileSync(path.join(RADICE, '.env'), 'utf8').split('\n')) { const m = r.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2]; } for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v; } catch { /* niente .env */ }

class Errore extends Error { constructor(msg, codice = 400) { super(msg); this.codice = codice; } }
const db = apri();
preparaDoppioni(db);
// 0.69: il voto ha bisogno della voce e del reparto (frutta e verdura, miele): se il prodotto non li porta, si prendono qui,
// così il voto è lo stesso in ogni pagina
const voceInfo = db.prepare('SELECT nome, reparto FROM voci WHERE id = ?');
const conVoce = (p) => { if (!p || p.reparto !== undefined || !p.voce_id) return p; const x = voceInfo.get(p.voce_id); return x ? { ...p, reparto: x.reparto, voce: typeof p.voce === 'string' ? p.voce : x.nome } : p; };
const punteggio = (p, v = null) => punteggioBase(conVoce(p), v);
const dettaglio = (p, v = null) => dettaglioBase(conVoce(p), v);
const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 });
// ---------- intestazioni di sicurezza su ogni risposta ----------
// la pagina carica solo i suoi file; immagini anche da Open Food Facts e dalla mappa; niente pagine dentro altri siti
// 0.92: wasm-unsafe-eval serve al lettore dei codici a barre (ZXing in WebAssembly, file nostro); non permette script esterni
const CSP = ["default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https://*.openfoodfacts.org https://*.openfoodfacts.net https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  "font-src 'self' data:", "connect-src 'self'", "media-src 'self' blob:", "worker-src 'self' blob:", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
const inLocale = (req) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(String(req.headers.host || ''));
app.addHook('onSend', async (req, rep, payload) => {
  rep.header('X-Content-Type-Options', 'nosniff');
  rep.header('X-Frame-Options', 'DENY');
  rep.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  rep.header('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()');
  rep.header('Cross-Origin-Opener-Policy', 'same-origin');
  if (!inLocale(req)) rep.header('Strict-Transport-Security', 'max-age=31536000');
  const tipo = String(rep.getHeader('content-type') || '');
  if (tipo.includes('text/html')) rep.header('Content-Security-Policy', CSP);
  // i dati personali non restano nelle cache intermedie
  if (req.url.startsWith('/api/') && !rep.getHeader('cache-control')) rep.header('Cache-Control', 'no-store');
  return payload;
});
app.setErrorHandler((e, req, rep) => { rep.code(e.codice || e.statusCode || 500).send({ errore: e.codice || e.statusCode < 500 ? e.message : 'Errore del server', ...(e.codice && e.extra ? e.extra : {}) }); if (!e.codice && !(e.statusCode < 500)) console.error(e); });

// ---------- accesso: numero di cellulare e codice via WhatsApp; ogni famiglia ha la sua lista ----------
accesso(app, db, { Errore });
// impostazioni generali + quelle della famiglia (casa, città, area dei prezzi)
const imp = (req) => {
  const s = impostazioni(db); const f = req.famiglia;
  if (!f) return s;
  return { ...s, casa: f.casa?.indirizzo ? f.casa : { indirizzo: '', lat: null, lng: null }, citta: f.citta || s.citta, area: f.area || s.area };
};

// ---------- utilità ----------
const id = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Errore('Identificativo non valido'); return n; };
const testo = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const numero = (v, { min = 0, max = 1e6, nome = 'Il numero' } = {}) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) throw new Errore(`${nome} non è valido`);
  return n;
};
const UNITA = ['kg', 'l', 'pz'];
const REPARTI = ['ortofrutta', 'pane', 'fresco', 'dispensa', 'surgelati', 'bevande', 'casa', 'altro'];
const TIPI = ['marca', 'supermercato', 'senza'];
const ORIGINI = ['italia', 'estero', ''];
const QUALITA = ['qualsiasi', 'italiano', 'bio', 'bio_italiano'];

// ---------- stato e impostazioni ----------
app.get('/api/stato', async (req) => {
  if (req.utente) db.prepare('INSERT OR IGNORE INTO uso_giorni (utente_id, giorno) VALUES (?, ?)').run(req.utente.id, oggi());
  const n = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  const daLeggere = req.utente?.admin ? db.prepare("SELECT COUNT(*) n FROM scontrini_foto WHERE stato IN ('da leggere', 'da controllare')").get().n : 0;
  const volantiniDaLeggere = req.utente?.admin ? db.prepare("SELECT COUNT(*) n FROM volantini WHERE stato = 'da leggere'").get().n : 0;
  const annunci = req.utente ? annunciPer(req) : [];
  return {
    // chi non è entrato vede solo città e zona: niente indirizzo di casa né altre impostazioni
    oggi: oggi(), settimana: settimana(oggi()), impostazioni: req.famiglia ? imp(req) : (({ citta, area }) => ({ citta, area }))(impostazioni(db)),
    utente: req.utente && req.famiglia ? { nome: req.utente.nome, admin: !!req.utente.admin, famiglia: req.famiglia.nome, produttore_id: req.utente.produttore_id || null } : null,
    // per la prima apertura: manca casa o mancano i supermercati?
    offerte: req.famiglia ? contaOfferte(req) : 0,
    famiglia: req.famiglia ? { casa: !!req.famiglia.casa?.lat, raggio: req.famiglia.raggio || 10, supermercati: db.prepare('SELECT COUNT(*) n FROM famiglia_catene WHERE famiglia_id = ?').get(req.famiglia.id).n } : null,
    produttori: db.prepare('SELECT COUNT(*) n FROM produttori WHERE attivo = 1').get().n,
    titolare: String(process.env.TITOLARE || ''), versione: VERSIONE, catalogo: req.utente?.admin ? catalogo.info() : undefined,
    conti: { catene: n('catene'), negozi: n('negozi'), voci: n('voci'), prodotti: n('prodotti'), prezzi: n('prezzi'), scontrini: n('scontrini'), daLeggere, volantiniDaLeggere, doppioni: req.utente?.admin ? tutteLeCoppie(db).length : 0, lista: req.famiglia ? db.prepare('SELECT COUNT(*) n FROM righe_lista WHERE famiglia_id = ?').get(req.famiglia.id).n : 0 },
    annuncio: annunci[0] || null, annunci,
  };
});
app.put('/api/impostazioni', async (req) => {
  const b = req.body || {}; const s = impostazioni(db);
  if (b.citta !== undefined) scrivi(db, 'citta', testo(b.citta, 60) || PREDEFINITE.citta);
  if (b.area !== undefined) scrivi(db, 'area', b.area === 'sud' ? 'sud' : 'centro-nord');
  if (b.casa !== undefined) {
    const ind = testo(b.casa?.indirizzo, 160);
    const c = ind && ind !== s.casa?.indirizzo ? await mappe.coordinate(db, ind) : ind ? s.casa : null;
    scrivi(db, 'casa', { indirizzo: ind, lat: c?.lat ?? null, lng: c?.lng ?? null });
  }
  if (b.euro_km !== undefined) scrivi(db, 'euro_km', numero(b.euro_km, { max: 5, nome: 'Il costo al km' }));
  if (b.soglia_negozio !== undefined) scrivi(db, 'soglia_negozio', numero(b.soglia_negozio, { max: 100, nome: 'La soglia' }));
  if (b.sosta !== undefined) scrivi(db, 'sosta', Math.round(numero(b.sosta, { max: 120, nome: 'I minuti in negozio' })));
  if (b.max_negozi !== undefined) scrivi(db, 'max_negozi', Math.round(numero(b.max_negozi, { min: 1, max: 4, nome: 'Il numero di negozi' })));
  return impostazioni(db);
});

// ---------- catene e negozi ----------
const catene = (req = null) => {
  const citta = String(req ? imp(req).citta : impostazioni(db).citta || '').toLowerCase();
  const mie = new Set(req?.famiglia ? db.prepare('SELECT catena_id FROM famiglia_catene WHERE famiglia_id = ?').pluck().all(req.famiglia.id) : []);
  return db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM prezzi p WHERE p.catena_id = c.id) prezzi,
    (SELECT COUNT(*) FROM negozi n WHERE n.catena_id = c.id AND n.attivo = 1 AND lower(n.citta) = ?) negozi_citta FROM catene c ORDER BY c.nome`).all(citta)
    .map((c) => ({ ...c, mia: mie.has(c.id), negozi: db.prepare('SELECT * FROM negozi WHERE catena_id = ? ORDER BY attivo DESC, indirizzo').all(c.id) }));
};
// i supermercati della famiglia: quelli scelti; se non ne ha ancora scelti, quelli con un negozio nella sua città
const mieCatene = (req) => {
  const f = req.famiglia; if (!f) return null;
  const scelte = db.prepare('SELECT catena_id FROM famiglia_catene WHERE famiglia_id = ?').pluck().all(f.id);
  if (scelte.length) return scelte;
  const citta = String(imp(req).citta || '').toLowerCase();
  return db.prepare('SELECT DISTINCT catena_id FROM negozi WHERE attivo = 1 AND lower(citta) = ?').pluck().all(citta);
};
const aggiungiMia = (req, cid) => { if (req.famiglia) db.prepare('INSERT OR IGNORE INTO famiglia_catene (famiglia_id, catena_id) VALUES (?, ?)').run(req.famiglia.id, cid); };
app.get('/api/miei-supermercati', async (req) => catene(req).filter((c) => c.mia));
// 0.74: tra quali supermercati si sceglie dove prendere una cosa generica: i tuoi (quelli che guarda anche il giro)
app.get('/api/supermercati-giro', async (req) => {
  const ids = mieCatene(req); const tutte = db.prepare("SELECT id, nome FROM catene WHERE tipo IS NOT 'fornitore' ORDER BY nome").all();
  return ids && ids.length ? tutte.filter((c) => ids.includes(c.id)) : tutte;
});
app.post('/api/miei-supermercati', async (req) => { const cid = id(req.body?.catena_id); if (!db.prepare('SELECT 1 FROM catene WHERE id = ?').get(cid)) throw new Errore('Supermercato non trovato', 404); aggiungiMia(req, cid); return catene(req); });
app.delete('/api/miei-supermercati/:id', async (req) => { db.prepare('DELETE FROM famiglia_catene WHERE famiglia_id = ? AND catena_id = ?').run(req.famiglia.id, id(req.params.id)); return catene(req); });
// casa, città e area della famiglia: da qui parte e torna il giro
app.put('/api/famiglia/casa', async (req) => {
  const b = req.body || {}; const f = req.famiglia;
  const ind = testo(b.indirizzo, 160);
  const c = ind && ind !== f.casa?.indirizzo ? await mappe.coordinate(db, ind) : ind ? f.casa : null;
  if (ind && !c?.lat) throw new Errore('Non trovo questo indirizzo: scrivi via, numero e città (es. Via Bologna 10, Ferrara)');
  // città e area (per la zona dei prezzi) le dice la mappa, se non vengono scritte a mano; la regione serve alle statistiche
  const regione = ind ? (c?.regione || f.regione || '') : '';
  const citta = b.citta !== undefined ? testo(b.citta, 60) : (ind && c?.citta) || f.citta;
  const area = b.area !== undefined ? (['centro-nord', 'sud'].includes(b.area) ? b.area : '') : f.area || (ind ? (mappe.zonaItalia(regione, c.lat) === 'Sud e isole' ? 'sud' : 'centro-nord') : '');
  const casa = ind ? { indirizzo: ind, lat: c.lat, lng: c.lng } : {};
  db.prepare('UPDATE famiglie SET casa = ?, citta = ?, area = ?, regione = ? WHERE id = ?').run(JSON.stringify(casa), citta, area, regione, f.id);
  req.famiglia = { ...f, casa, citta, area, regione };
  return imp(req);
});
app.get('/api/catene', async (req) => catene(req));
app.post('/api/catene', async (req) => {
  // chiunque può aggiungere un supermercato che manca; la zona dei prezzi la decide chi gestisce (per ora: la città)
  const nome = testo(req.body?.nome, 60).replace(/\s+/g, ' '); if (nome.length < 2) throw new Errore('Scrivi il nome del supermercato');
  const c = db.prepare('SELECT * FROM catene WHERE lower(nome) = lower(?)').get(nome);
  if (c) return { catena: c, lista: catene(req) };
  // un fornitore (vendita diretta, online…) ha lo stesso prezzo ovunque e non entra tra i supermercati del giro
  const fornitore = !!req.body?.fornitore;
  const cid = db.prepare('INSERT INTO catene (nome, ambito, proposta_da, tipo) VALUES (?, ?, ?, ?)').run(nome[0].toUpperCase() + nome.slice(1), fornitore ? 'nazionale' : req.utente.admin && AMBITI.includes(req.body?.ambito) ? req.body.ambito : 'citta', req.utente.admin ? null : req.utente.id, fornitore ? 'fornitore' : 'supermercato').lastInsertRowid;
  if (req.body?.mio !== false && !fornitore) aggiungiMia(req, cid);
  return { catena: db.prepare('SELECT * FROM catene WHERE id = ?').get(cid), lista: catene(req) };
});
app.put('/api/catene/:id', async (req) => {
  const c = db.prepare('SELECT * FROM catene WHERE id = ?').get(id(req.params.id)); if (!c) throw new Errore('Catena non trovata', 404);
  const ambito = AMBITI.includes(req.body?.ambito) ? req.body.ambito : c.ambito;
  db.prepare('UPDATE catene SET nome = ?, ambito = ? WHERE id = ?').run(testo(req.body?.nome, 60) || c.nome, ambito, c.id);
  // i prezzi già rilevati seguono la nuova zona della catena
  if (ambito !== c.ambito) db.prepare('UPDATE prezzi SET citta = ? WHERE catena_id = ?').run(zonaDi({ ambito }, impostazioni(db)), c.id);
  return catene(req);
});
async function posNegozio(n) {
  const c = await mappe.coordinate(db, `${n.indirizzo}${n.citta && !n.indirizzo.toLowerCase().includes(n.citta.toLowerCase()) ? `, ${n.citta}` : ''}`);
  db.prepare('UPDATE negozi SET lat = ?, lng = ? WHERE id = ?').run(c?.lat ?? null, c?.lng ?? null, n.id);
}
// orari di un negozio corretti a mano (da chiunque usi l'app: valgono per tutti, come i prezzi)
const ORA_HH = /^(\d{1,2}):(\d{2})$/;
const fasceDa = (x) => {
  if (!Array.isArray(x)) throw new Errore('Orari non validi');
  return x.slice(0, 3).map((f) => {
    const a = ORA_HH.exec(String(f?.[0] || '')); const b = ORA_HH.exec(String(f?.[1] || ''));
    if (!a || !b) throw new Errore('Scrivi le ore come 8:30 o 19:30');
    const da = Number(a[1]) * 60 + Number(a[2]); const al = Number(b[1]) * 60 + Number(b[2]);
    if (da > 1440 || al > 1440 || Number(a[2]) > 59 || Number(b[2]) > 59) throw new Errore('Scrivi le ore come 8:30 o 19:30');
    if (al <= da && al !== 0) throw new Errore('L\'ora di chiusura deve venire dopo quella di apertura');
    return [da, al === 0 ? 1440 : al];
  }).sort((p, q) => p[0] - q[0]);
};
app.post('/api/negozi/:id/orari', async (req) => {
  const n = db.prepare('SELECT * FROM negozi WHERE id = ?').get(id(req.params.id)); if (!n) throw new Errore('Negozio non trovato', 404);
  const g = req.body?.giorni; if (!Array.isArray(g) || g.length !== 7) throw new Errore('Servono gli orari di tutti i 7 giorni');
  const giorni = g.map(fasceDa); const festivi = req.body?.festivi == null ? null : fasceDa(req.body.festivi);
  const testoOrari = scriviOrari(giorni, festivi);
  if (!leggiOrari(testoOrari)) throw new Errore('Orari non validi');
  db.prepare("UPDATE negozi SET orari = ?, orari_fonte = 'mano', orari_da = ? WHERE id = ?").run(testoOrari, req.utente.id, n.id);
  return db.prepare('SELECT * FROM negozi WHERE id = ?').get(n.id);
});
// la pagina ufficiale del negozio (sito della catena) da cui leggere gli orari: si legge subito e poi ogni mese
app.put('/api/negozi/:id/pagina-orari', async (req) => {
  const n = db.prepare('SELECT * FROM negozi WHERE id = ?').get(id(req.params.id)); if (!n) throw new Errore('Negozio non trovato', 404);
  const url = urlSicuro(testo(req.body?.url, 300));
  if (!url) { db.prepare("UPDATE negozi SET orari_url = '' WHERE id = ?").run(n.id); return { negozio: db.prepare('SELECT * FROM negozi WHERE id = ?').get(n.id), letti: false }; }
  let letti = null;
  try { letti = await leggiOrariDaPagina(url); } catch (e) { throw new Errore(`Non riesco ad aprire la pagina: ${e.message}`, 502); }
  if (letti) db.prepare("UPDATE negozi SET orari_url = ?, orari = ?, orari_fonte = 'sito', orari_da = NULL, sito_quando = ? WHERE id = ?").run(url, letti.orari, new Date().toISOString(), n.id);
  else db.prepare("UPDATE negozi SET orari_url = ?, sito_quando = ? WHERE id = ?").run(url, new Date().toISOString(), n.id);
  return { negozio: db.prepare('SELECT * FROM negozi WHERE id = ?').get(n.id), letti: !!letti, come: letti?.come || null };
});
// di nuovo gli orari automatici (mappa o sito)
app.delete('/api/negozi/:id/orari', async (req) => {
  const n = db.prepare('SELECT * FROM negozi WHERE id = ?').get(id(req.params.id)); if (!n) throw new Errore('Negozio non trovato', 404);
  const auto = n.orari_osm && leggiOrari(n.orari_osm);
  db.prepare('UPDATE negozi SET orari = ?, orari_fonte = ?, orari_da = NULL, sito_quando = NULL, web_quando = NULL WHERE id = ?').run(auto ? n.orari_osm : '', auto ? 'mappa' : '', n.id);
  return db.prepare('SELECT * FROM negozi WHERE id = ?').get(n.id);
});
app.post('/api/negozi', async (req) => {
  const b = req.body || {}; const cid = id(b.catena_id);
  const indirizzo = testo(b.indirizzo, 160); if (indirizzo.length < 5) throw new Errore('Scrivi l\'indirizzo del negozio (via, numero, città)');
  const citta = testo(b.citta, 60) || imp(req).citta;
  aggiungiMia(req, cid);
  const gia = db.prepare('SELECT id FROM negozi WHERE catena_id = ? AND lower(indirizzo) = lower(?)').get(cid, indirizzo);
  if (gia) return catene(req);
  const pos = await mappe.coordinate(db, `${indirizzo}${!indirizzo.toLowerCase().includes(citta.toLowerCase()) ? `, ${citta}` : ''}`);
  if (!pos?.lat) throw new Errore('Non trovo questo indirizzo sulla mappa: controlla via, numero civico e città (es. Via Bologna 10, Ferrara)');
  db.prepare('INSERT INTO negozi (catena_id, indirizzo, citta, lat, lng) VALUES (?, ?, ?, ?, ?)').run(cid, indirizzo, citta, pos.lat, pos.lng);
  return catene(req);
});
// Un supermercato che sulla mappa non c'è: nome e indirizzo, in un passo solo. Diventa subito tuo.
app.post('/api/negozi/nuovo', async (req) => {
  const b = req.body || {};
  const nome = testo(b.nome, 60).replace(/\s+/g, ' '); if (nome.length < 2) throw new Errore('Scrivi il nome del supermercato (es. Rossotono)');
  const indirizzo = testo(b.indirizzo, 160); if (indirizzo.length < 5) throw new Errore('Scrivi l\'indirizzo: via, numero e paese');
  const pos = await mappe.coordinate(db, indirizzo);
  if (!pos?.lat) throw new Errore('Non trovo questo indirizzo sulla mappa: controlla via, numero civico e paese (es. Via Roma 10, San Nicandro Garganico)');
  const catena = vicini.catenaPer(db, { name: nome }, req.utente.id); if (!catena) throw new Errore('Scrivi il nome del supermercato');
  // lo stesso negozio già c'è (a meno di 150 metri)? si usa quello
  const vicino = db.prepare('SELECT * FROM negozi WHERE catena_id = ? AND lat IS NOT NULL').all(catena.id).find((x) => mappe.distanzaKm(x, pos) < 0.15);
  if (!vicino) db.prepare('INSERT INTO negozi (catena_id, indirizzo, citta, lat, lng, nome) VALUES (?, ?, ?, ?, ?, ?)').run(catena.id, indirizzo, testo(pos.citta || '', 60), pos.lat, pos.lng, nome);
  aggiungiMia(req, catena.id);
  return { ok: true, catena: catena.nome, gia: !!vicino };
});
app.put('/api/negozi/:id', async (req) => {
  const n = db.prepare('SELECT * FROM negozi WHERE id = ?').get(id(req.params.id)); if (!n) throw new Errore('Negozio non trovato', 404);
  const b = req.body || {};
  const indirizzo = b.indirizzo !== undefined ? testo(b.indirizzo, 160) : n.indirizzo;
  db.prepare('UPDATE negozi SET indirizzo = ?, citta = ?, attivo = ? WHERE id = ?').run(indirizzo, b.citta !== undefined ? testo(b.citta, 60) : n.citta, b.attivo !== undefined ? (b.attivo ? 1 : 0) : n.attivo, n.id);
  if (indirizzo !== n.indirizzo || n.lat == null) await posNegozio({ ...n, indirizzo });
  return catene(req);
});
// i supermercati veri intorno a casa (dalla mappa), con la stella su quelli già tuoi
const raggioDi = (q) => { const r = Number(q); return vicini.RAGGI.includes(r) ? r : 10; };
const listaVicini = async (req, raggio) => {
  const casa = imp(req).casa; if (!casa?.lat) throw new Errore('Prima scrivi l\'indirizzo di casa: serve per cercare i supermercati vicini');
  let avviso = '';
  try { await vicini.aggiornaZona(db, casa, raggio, req.utente.id); }
  catch { avviso = 'In questo momento la mappa non risponde: ti mostro i supermercati che conosco già. Riprova più tardi per vederli tutti.'; }
  const mie = new Set(mieCatene(req) || []);
  const scelte = db.prepare('SELECT COUNT(*) n FROM famiglia_catene WHERE famiglia_id = ?').get(req.famiglia.id).n;
  return { raggio, casa: { lat: casa.lat, lng: casa.lng }, avviso, negozi: vicini.negoziVicini(db, casa, raggio).map((n) => ({ id: n.id, catena_id: n.catena_id, catena: n.catena, nome: n.nome, indirizzo: n.indirizzo, citta: n.citta, lat: n.lat, lng: n.lng, orari: n.orari || "", orari_fonte: n.orari_fonte || "", orari_url: n.orari_url || "", km: n.km, mia: scelte > 0 && mie.has(n.catena_id) })) };
};
app.get('/api/negozi/vicini', async (req) => {
  // il raggio scelto si ricorda: le alternative nella pagina Scegli guardano i supermercati entro questo raggio
  const raggio = req.query.raggio ? raggioDi(req.query.raggio) : (req.famiglia.raggio || 10);
  if (req.query.raggio && raggio !== req.famiglia.raggio) db.prepare('UPDATE famiglie SET raggio = ? WHERE id = ?').run(raggio, req.famiglia.id);
  return listaVicini(req, raggio);
});
app.post('/api/negozi/:id/mio', async (req) => {
  const n = db.prepare('SELECT * FROM negozi WHERE id = ?').get(id(req.params.id)); if (!n) throw new Errore('Negozio non trovato', 404);
  aggiungiMia(req, n.catena_id);
  await vicini.completaIndirizzo(db, n);
  if (!n.citta) db.prepare('UPDATE negozi SET citta = ? WHERE id = ? AND citta = \'\'').run(imp(req).citta, n.id);
  return listaVicini(req, raggioDi(req.body?.raggio));
});
app.delete('/api/negozi/:id/mio', async (req) => {
  const n = db.prepare('SELECT * FROM negozi WHERE id = ?').get(id(req.params.id)); if (!n) throw new Errore('Negozio non trovato', 404);
  db.prepare('DELETE FROM famiglia_catene WHERE famiglia_id = ? AND catena_id = ?').run(req.famiglia.id, n.catena_id);
  return listaVicini(req, raggioDi(req.query.raggio));
});

// ---------- voci e prodotti ----------
app.get('/api/voci', async () => db.prepare(`SELECT v.*, (SELECT COUNT(*) FROM prodotti p WHERE p.voce_id = v.id) prodotti FROM voci v ORDER BY v.nome`).all());
// Dal nome del prodotto che si sta scrivendo («Filetti di sgombro Delicius 4 x 125 g»): la voce in cui confrontarlo.
// Prima le voci già esistenti che somigliano, poi una voce nuova proposta (nome pulito, reparto e unità indovinati).
app.get('/api/voci/proposta', async (req) => {
  const nome = testo(req.query.nome, 100); if (nome.length < 3) return { voci: [], nuova: null };
  const tutte = db.prepare('SELECT * FROM voci').all(); const prodotti = db.prepare('SELECT id, voce_id, nome, marca FROM prodotti').all();
  const basso = nome.toLowerCase();
  const t = trovaVoce(nome, tutte, prodotti);
  // voci le cui parole (lunghe) compaiono nel nome
  // voci che cominciano come il nome («Mele Golden» → «Mele»), non quelle che lo contengono più avanti («Aceto di mele»)
  const rad = (w) => (w.length > 3 ? w.replace(/h?[aeio]$/, '') : w);
  const primaDi = (x) => rad(String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter((w) => w.length > 2)[0] || '');
  const prima = primaDi(nome);
  const perParole = prima ? tutte.filter((v) => primaDi(v.nome) === prima) : [];
  // la proposta di trovaVoce vale solo se comincia come il nome (niente «Aceto di mele» per «Mele Golden»)
  const buona = t && primaDi(t.voce.nome) === prima ? t.voce : null;
  const voci = [...(buona ? [buona] : []), ...perParole.filter((v) => !buona || v.id !== buona.id)].slice(0, 5);
  // nome pulito: via formato («4 x 125 g», «500 g»), «bio», «italiano» e le parole dopo la terza
  const pulito = nome.replace(/\b\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(kg|g|gr|ml|cl|l|lt|pz)\b/gi, ' ').replace(/\b\d+(?:[.,]\d+)?\s*(kg|g|gr|ml|cl|l|lt|litri|pezzi|pz)\b/gi, ' ')
    .replace(/\b(bio|biologic[oa]|italia|italian[oaie]|classic[oa]|original[e]?)\b/gi, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  const g = indovina(pulito || nome) || { reparto: 'dispensa', unita: 'pz' };
  return { voci, nuova: { nome: maiuscola(pulito || nome), reparto: g.reparto, unita: g.unita } };
});
app.post('/api/voci', async (req) => {
  const b = req.body || {}; const nome = testo(b.nome, 60); if (!nome) throw new Errore('Scrivi il nome (es. Zucchine, Crema di nocciole)');
  const c = db.prepare('SELECT * FROM voci WHERE lower(nome) = lower(?)').get(nome); if (c) return c;
  const vid = db.prepare('INSERT INTO voci (nome, reparto, unita) VALUES (?, ?, ?)').run(nome[0].toUpperCase() + nome.slice(1), REPARTI.includes(b.reparto) ? b.reparto : 'dispensa', UNITA.includes(b.unita) ? b.unita : 'pz').lastInsertRowid;
  return db.prepare('SELECT * FROM voci WHERE id = ?').get(vid);
});
app.put('/api/voci/:id', async (req) => {
  const v = db.prepare('SELECT * FROM voci WHERE id = ?').get(id(req.params.id)); if (!v) throw new Errore('Voce non trovata', 404);
  const b = req.body || {};
  db.prepare('UPDATE voci SET nome = ?, reparto = ?, unita = ?, pezzo = ? WHERE id = ?').run(testo(b.nome, 60) || v.nome, REPARTI.includes(b.reparto) ? b.reparto : v.reparto, UNITA.includes(b.unita) ? b.unita : v.unita,
    b.pezzo !== undefined ? testo(b.pezzo, 20).toLowerCase() : v.pezzo, v.id);
  return db.prepare('SELECT * FROM voci WHERE id = ?').get(v.id);
});
const prodottoCompleto = (pid) => db.prepare('SELECT p.*, v.nome voce, v.unita, v.reparto, v.pezzo, c.nome catena FROM prodotti p JOIN voci v ON v.id = p.voce_id LEFT JOIN catene c ON c.id = p.catena_id WHERE p.id = ?').get(pid);
app.get('/api/prodotti', async (req) => {
  const q = testo(req.query.q, 60).toLowerCase(); const ean = testo(req.query.ean, 20);
  const vid = req.query.voce_id ? id(req.query.voce_id) : null;
  return db.prepare(`SELECT p.*, v.nome voce, v.unita, v.reparto, v.pezzo, c.nome catena FROM prodotti p JOIN voci v ON v.id = p.voce_id LEFT JOIN catene c ON c.id = p.catena_id
    WHERE (? IS NULL OR p.voce_id = ?) AND (? = '' OR p.ean = ?) AND (? = '' OR lower(p.nome || ' ' || v.nome || ' ' || p.marca || ' ' || p.nome_scontrino) LIKE '%' || ? || '%')
    ORDER BY v.nome, p.nome LIMIT 200`).all(vid, vid, ean, ean, q, q);
});
// additivi: da elenco (["E330"]) o da testo ("E330, E250", "nessuno"); '' = non si sa
const additiviTesto = (x) => {
  if (x == null || x === '') return '';
  if (Array.isArray(x)) return JSON.stringify([...new Set(x.map(codice).filter(Boolean))]);
  if (/nessun|senza additivi/i.test(String(x))) return '[]';
  const c = daIngredienti(String(x)); return c.length ? JSON.stringify(c) : '';
};
// foto: solo quelle caricate qui o quelle di Open Food Facts (un indirizzo qualsiasi farebbe sapere a un altro sito chi apre l'app)
const FOTO_OK = (x) => /^https:\/\/([a-z0-9-]+\.)*openfoodfacts\.(org|net)\/[^\s"'<>]+$/i.test(String(x)) || /^\/foto\/[a-z0-9-]+\.jpg$/.test(String(x));
const NUOVO = { additivi: '', tipo: 'senza', marca: '', catena_id: null, origine: '', bio: 0, quantita: null, pezzi: null, sfuso: 0, ean: '', nome_scontrino: '', descrizione: '', ingredienti: '', produttore: '', provenienza: '', foto: '', nutriscore: '', note: '', nova: null, valori: '', imballaggio: '' };
function datiProdotto(b, prima = NUOVO) {
  const v = (k, f) => (b[k] !== undefined ? f(b[k]) : prima[k]);
  const d = {
    voce_id: v('voce_id', id), nome: v('nome', (x) => testo(x, 100)), tipo: v('tipo', (x) => (TIPI.includes(x) ? x : 'senza')),
    marca: v('marca', (x) => testo(x, 60)), catena_id: v('catena_id', (x) => (x ? id(x) : null)), origine: v('origine', (x) => (ORIGINI.includes(x) ? x : '')),
    bio: v('bio', (x) => (x ? 1 : 0)), quantita: v('quantita', (x) => (x === null || x === '' ? null : numero(x, { max: 1000, nome: 'Il formato' }))),
    pezzi: v('pezzi', (x) => { const n = Math.round(Number(String(x ?? '').replace(',', '.'))); return n > 1 && n <= 500 ? n : null; }),
    ean: v('ean', (x) => testo(x, 20).replace(/\D/g, '')), nome_scontrino: v('nome_scontrino', (x) => testo(x, 60)),
    sfuso: v('sfuso', (x) => (x ? 1 : 0)), descrizione: v('descrizione', (x) => testo(x, 300)), ingredienti: v('ingredienti', (x) => testo(x, 2000)),
    produttore: v('produttore', (x) => testo(x, 120)), provenienza: v('provenienza', (x) => testo(x, 120)), foto: v('foto', (x) => (FOTO_OK(x) ? testo(x, 400) : '')), additivi: v('additivi', additiviTesto),
    nutriscore: v('nutriscore', (x) => (/^[a-e]$/i.test(String(x)) ? String(x).toLowerCase() : '')), note: v('note', (x) => testo(x, 500)),
    nova: v('nova', (x) => ([1, 2, 3, 4].includes(Number(x)) ? Number(x) : null)),
    valori: v('valori', (x) => valoriJson(x)),
    imballaggio: v('imballaggio', (x) => (['vetro', 'plastica', 'carta', 'metallo'].includes(x) ? x : '')),
  };
  // 0.51: valori nutrizionali letti dall'etichetta e Nutri-Score non indicato: si calcola dai valori
  if (d.valori && !d.nutriscore) d.nutriscore = nutriDaValori(d.valori) || '';
  // additivi non scritti: si cercano i codici E negli ingredienti
  if (!d.additivi && d.ingredienti) d.additivi = additiviTesto(d.ingredienti);
  if (d.sfuso) d.quantita = null;
  if (!d.voce_id) throw new Errore('Scegli la voce (es. Zucchine) a cui appartiene il prodotto');
  if (!d.nome) throw new Errore('Scrivi il nome del prodotto');
  if (d.tipo !== 'supermercato') d.catena_id = null;
  if (d.tipo === 'supermercato' && !d.catena_id) throw new Errore('Di quale supermercato è il marchio?');
  if (d.tipo === 'marca' && !d.marca) throw new Errore('Scrivi la marca (es. Barilla)');
  return d;
}
// Il formato scritto in un'unità qualsiasi (3 l, 500 g, 750 ml, 12 pz) diventa quello della voce (kg, l, pz).
// Se la voce non ha ancora prodotti con il formato, la voce si adatta (es. «Ammorbidente» creato a pezzi diventa a litri).
const BASE = { g: ['kg', 0.001], kg: ['kg', 1], ml: ['l', 0.001], cl: ['l', 0.01], l: ['l', 1], pz: ['pz', 1] };
function adattaFormato(d, unitaScritta, pid = null) {
  if (!unitaScritta || d.sfuso || d.quantita == null) return;
  const b = BASE[unitaScritta]; if (!b) throw new Errore('Unità del formato non valida');
  const [base, f] = b; d.quantita = Math.round(d.quantita * f * 100000) / 100000;
  const voce = db.prepare('SELECT * FROM voci WHERE id = ?').get(d.voce_id); if (!voce || voce.unita === base) return;
  const altri = db.prepare('SELECT COUNT(*) n FROM prodotti WHERE voce_id = ? AND id IS NOT ? AND (quantita > 0 OR sfuso = 1)').get(voce.id, pid).n;
  // 0.48: una voce «a pezzi» i cui prodotti sono in realtà confezioni a peso o a litri (es. yogurt da volantino: «450 g» contato 1 pezzo)
  // passa a kg / l da sola: il formato vero si legge dal nome; dove non c'è, il formato resta da completare.
  if (altri && voce.unita === 'pz' && base !== 'pz' && indovina(voce.nome)?.unita === base && convertiVoceAPeso(voce, base, pid)) return;
  if (altri) throw new Errore(`«${voce.nome}» si confronta ${voce.unita === 'kg' ? 'a peso (kg)' : voce.unita === 'l' ? 'a litri' : `a ${voce.pezzo ? `${voce.pezzo === 'lavaggio' ? 'lavaggi' : voce.pezzo === 'rotolo' ? 'rotoli' : 'pezzi'}` : 'pezzi'}`} e ha già altri prodotti: scrivi il formato in quell'unità, oppure tocca «Cambia» accanto alla voce e scegline un'altra`);
  const g = indovina(voce.nome);
  db.prepare('UPDATE voci SET unita = ?, pezzo = ?, reparto = ? WHERE id = ?').run(base, base === 'pz' ? voce.pezzo : '', voce.reparto === 'dispensa' && g?.reparto ? g.reparto : voce.reparto, voce.id);
}
// Voce a pezzi -> a peso/litri. Ogni altro prodotto deve essere: con il formato nel nome nella stessa unità (450 g -> 0,45 kg),
// oppure una confezione contata «1 pezzo» (formato che si completerà). Un vero conteggio (6 uova, 12 rotoli) blocca: torna false.
function convertiVoceAPeso(voce, base, pid) {
  const prodotti = db.prepare('SELECT * FROM prodotti WHERE voce_id = ? AND id IS NOT ?').all(voce.id, pid);
  const nuovi = [];
  for (const p of prodotti) {
    if (p.sfuso) return false;
    const f = leggiFormato(p.nome) || leggiFormato(p.descrizione);
    if (f && f.unita === base && f.quantita > 0) nuovi.push([p, Math.round(f.quantita * 100000) / 100000]);
    else if (!(p.quantita > 0) || p.quantita === 1) nuovi.push([p, null]);
    else return false;
  }
  db.transaction(() => {
    for (const [p, q] of nuovi) {
      db.prepare('UPDATE prodotti SET quantita = ?, pezzi = NULL WHERE id = ?').run(q, p.id);
      for (const pr of db.prepare('SELECT id, prezzo FROM prezzi WHERE prodotto_id = ?').all(p.id)) db.prepare('UPDATE prezzi SET unitario = ? WHERE id = ?').run(q > 0 ? pr.prezzo / q : pr.prezzo, pr.id);
    }
    const g = indovina(voce.nome);
    db.prepare("UPDATE voci SET unita = ?, pezzo = '', reparto = ? WHERE id = ?").run(base, voce.reparto === 'dispensa' && g?.reparto ? g.reparto : voce.reparto, voce.id);
  })();
  return true;
}
// la voce giusta per un nome nuovo: reparto e unità di confronto proposti
app.get('/api/voci/indovina', async (req) => { const g = indovina(testo(req.query.nome, 60)); return g || { reparto: 'dispensa', unita: 'pz' }; });
app.post('/api/prodotti', async (req) => {
  const d = datiProdotto(req.body || {});
  adattaFormato(d, req.body?.formato_unita);
  if (d.ean && perEan(db, d.ean)) throw new Errore('C\'è già un prodotto con questo codice a barre');
  const pid = db.prepare(`INSERT INTO prodotti (voce_id, nome, tipo, marca, catena_id, origine, bio, quantita, pezzi, sfuso, ean, nome_scontrino, descrizione, ingredienti, produttore, provenienza, foto, nutriscore, note, nova, additivi, valori, imballaggio)
    VALUES (@voce_id, @nome, @tipo, @marca, @catena_id, @origine, @bio, @quantita, @pezzi, @sfuso, @ean, @nome_scontrino, @descrizione, @ingredienti, @produttore, @provenienza, @foto, @nutriscore, @note, @nova, @additivi, @valori, @imballaggio)`).run(d).lastInsertRowid;
  return prodottoCompleto(pid);
});
app.put('/api/prodotti/:id', async (req) => {
  const p = db.prepare('SELECT * FROM prodotti WHERE id = ?').get(id(req.params.id)); if (!p) throw new Errore('Prodotto non trovato', 404);
  const d = datiProdotto(req.body || {}, p);
  adattaFormato(d, req.body?.formato_unita, p.id);
  if (d.foto !== p.foto) db.prepare("UPDATE prodotti SET foto_fonte = '' WHERE id = ?").run(p.id); // 0.76: foto messa da qui, non più quella automatica
  db.prepare(`UPDATE prodotti SET voce_id = @voce_id, nome = @nome, tipo = @tipo, marca = @marca, catena_id = @catena_id, origine = @origine, bio = @bio, quantita = @quantita, pezzi = @pezzi, sfuso = @sfuso,
    ean = @ean, nome_scontrino = @nome_scontrino, descrizione = @descrizione, ingredienti = @ingredienti, produttore = @produttore, provenienza = @provenienza, foto = @foto, nutriscore = @nutriscore, note = @note, nova = @nova, additivi = @additivi, valori = @valori, imballaggio = @imballaggio WHERE id = @id`).run({ ...d, id: p.id });
  // il formato è cambiato: si ricalcola il prezzo per kg / l / pz dei prezzi già rilevati
  if (d.quantita !== p.quantita || d.sfuso !== p.sfuso) for (const pr of db.prepare('SELECT * FROM prezzi WHERE prodotto_id = ?').all(p.id)) db.prepare('UPDATE prezzi SET unitario = ? WHERE id = ?').run(d.quantita > 0 ? pr.prezzo / d.quantita : pr.prezzo, pr.id);
  return prodottoCompleto(p.id);
});
// ---------- doppioni: prima di censire un prodotto nuovo, quelli simili già censiti nello stesso supermercato ----------
// stesso codice a barre (ovunque) = di sicuro lo stesso; altrimenti nome simile tra i prodotti di quel supermercato
// (marchio suo o prezzo già rilevato lì). Formati diversi (250 g e 500 g) sono prodotti diversi: non si propongono.
app.get('/api/prodotti/simili', async (req) => {
  const q = req.query || {}; const nome = testo(q.nome, 100); const ean = String(q.ean || '').replace(/\D/g, '');
  const cid = q.catena_id ? id(q.catena_id) : null;
  const b = BASE[q.formato_unita]; const qta = Number(String(q.quantita || '').replace(',', '.'));
  const quantita = b && qta > 0 ? qta * b[1] : null; const sfuso = q.sfuso === '1' || q.sfuso === 'true';
  const trovati = new Map();
  if (ean.length >= 8) { const e = perEan(db, ean); if (e) trovati.set(e, 1); }
  if (cid && nome.length >= 3) {
    const lista = db.prepare(`SELECT DISTINCT p.* FROM prodotti p LEFT JOIN prezzi pr ON pr.prodotto_id = p.id AND pr.catena_id = ?
      WHERE p.catena_id = ? OR pr.id IS NOT NULL`).all(cid, cid);
    for (const p of lista) {
      if (trovati.has(p.id)) continue;
      if (quantita && p.quantita > 0 && Math.abs(p.quantita - quantita) / Math.max(p.quantita, quantita) > 0.05) continue;
      if (sfuso !== !!p.sfuso && (quantita || p.quantita > 0)) continue;
      const s = somiglianza(nome, p.nome); if (s >= 0.5) trovati.set(p.id, s);
    }
  }
  // 0.56: anche senza supermercato, tra i prodotti senza codice a barre (di solito nati dagli scontrini): se il nome somiglia
  // è probabile che sia lo stesso (es. «ARACHIDI SALATE» dallo scontrino Lidl e «Arachidi salate tostate» dalla foto dell'etichetta)
  // 0.94: si fa sempre, anche con un supermercato scelto (il prodotto può essere nato da uno scontrino di un altro supermercato)
  if (nome.length >= 3) for (const p of db.prepare("SELECT * FROM prodotti WHERE ean = ''").all()) {
    if (trovati.has(p.id)) continue;
    if (quantita && p.quantita > 0 && Math.abs(p.quantita - quantita) / Math.max(p.quantita, quantita) > 0.05) continue;
    const s = Math.max(somiglianza(nome, p.nome), p.nome_scontrino ? somiglianza(nome, p.nome_scontrino) : 0); if (s >= 0.6) trovati.set(p.id, s - 0.05);
  }
  const ultimo = db.prepare('SELECT prezzo, rilevato_il FROM prezzi WHERE prodotto_id = ? AND catena_id = ? AND superato_il IS NULL ORDER BY rilevato_il DESC, id DESC LIMIT 1');
  const ultimoOvunque = db.prepare('SELECT pr.prezzo, pr.rilevato_il, c.nome catena FROM prezzi pr JOIN catene c ON c.id = pr.catena_id WHERE pr.prodotto_id = ? AND pr.superato_il IS NULL ORDER BY pr.rilevato_il DESC, pr.id DESC LIMIT 1');
  return [...trovati.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([pid, s]) => {
    const p = prodottoCompleto(pid); const uq = cid ? ultimo.get(pid, cid) : null;
    const u = uq ? { ...uq, catena: db.prepare('SELECT nome FROM catene WHERE id = ?').get(cid)?.nome } : ultimoOvunque.get(pid);
    return { id: p.id, nome: p.nome, voce: p.voce, foto: p.foto, quantita: p.quantita, unita: p.unita, pezzo: p.pezzo, pezzi: p.pezzi, sfuso: !!p.sfuso, marca: p.marca, catena: p.catena || u?.catena || null,
      prezzo: u?.prezzo ?? null, rilevato_il: u?.rilevato_il ?? null, stesso_codice: s === 1 && !!ean && p.ean === ean, descrizione: p.descrizione };
  });
});
// valori nutrizionali e confezione, se mancano (completa() non li conosce)
function completaValori(pid, o) {
  const p = db.prepare('SELECT valori, imballaggio FROM prodotti WHERE id = ?').get(pid); if (!p) return;
  db.prepare('UPDATE prodotti SET valori = ?, imballaggio = ? WHERE id = ?').run(p.valori || o.valori || '', p.imballaggio || o.imballaggio || '', pid);
}
// 0.56 Unire due schede dello stesso prodotto (es. una nata dagli scontrini, una dal codice a barre): resta questa,
// prende dall'altra i dati che le mancano, i prezzi, le righe della lista, i preferiti e i voti; l'altra si cancella.
app.post('/api/prodotti/:id/unisci', async (req) => {
  let p = db.prepare('SELECT * FROM prodotti WHERE id = ?').get(id(req.params.id)); let a = db.prepare('SELECT * FROM prodotti WHERE id = ?').get(id(req.body?.altro));
  if (!p || !a || p.id === a.id) throw new Errore('Prodotto non trovato', 404);
  // 0.58: chi non gestisce i prezzi può unire solo le schede che l'app stessa propone come doppie
  if (!req.utente.admin && !doppioniDi(db, p.id).some((x) => x.id === a.id)) throw new Errore('Unire questi due prodotti è riservato a chi gestisce i prezzi', 403);
  // resta la scheda con più prezzi (di solito quella degli scontrini, che sa riconoscere le righe), a parità la più vecchia
  const nPrezzi = (x) => db.prepare('SELECT COUNT(*) n FROM prezzi WHERE prodotto_id = ?').get(x).n;
  if (nPrezzi(a.id) > nPrezzi(p.id) || (nPrezzi(a.id) === nPrezzi(p.id) && a.id < p.id)) [p, a] = [a, p];
  if (p.ean && a.ean && p.ean !== a.ean) throw new Errore('Hanno due codici a barre diversi: sono prodotti diversi');
  db.transaction(() => {
    const ean = a.ean; if (ean) db.prepare("UPDATE prodotti SET ean = '' WHERE id = ?").run(a.id);
    const campi = ['marca', 'origine', 'descrizione', 'ingredienti', 'produttore', 'provenienza', 'foto', 'nutriscore', 'additivi', 'nome_scontrino', 'valori', 'imballaggio', 'note'];
    const nuovo = {}; for (const k of campi) if ((p[k] == null || p[k] === '') && a[k] != null && a[k] !== '') nuovo[k] = a[k];
    if (!p.ean && ean) nuovo.ean = ean; if (!p.nova && a.nova) nuovo.nova = a.nova; if (!p.bio && a.bio) nuovo.bio = 1;
    if (!p.sfuso && !(p.quantita > 0) && a.quantita > 0 && !a.sfuso) { nuovo.quantita = a.quantita; if (a.pezzi) nuovo.pezzi = a.pezzi; }
    if (p.tipo === 'senza' && a.tipo !== 'senza') { nuovo.tipo = a.tipo; if (a.catena_id) nuovo.catena_id = a.catena_id; }
    const k = Object.keys(nuovo); if (k.length) db.prepare(`UPDATE prodotti SET ${k.map((x) => `${x} = @${x}`).join(', ')} WHERE id = @id`).run({ ...nuovo, id: p.id });
    db.prepare('UPDATE prezzi SET prodotto_id = ? WHERE prodotto_id = ?').run(p.id, a.id);
    db.prepare('UPDATE righe_lista SET prodotto_id = ? WHERE prodotto_id = ?').run(p.id, a.id);
    db.prepare('UPDATE OR IGNORE preferiti SET prodotto_id = ? WHERE prodotto_id = ?').run(p.id, a.id); db.prepare('DELETE FROM preferiti WHERE prodotto_id = ?').run(a.id);
    db.prepare('UPDATE OR IGNORE valutazioni SET prodotto_id = ? WHERE prodotto_id = ?').run(p.id, a.id); db.prepare('DELETE FROM valutazioni WHERE prodotto_id = ?').run(a.id);
    // 0.60.1: anche i nomi dello scontrino, così le righe degli scontrini continuano a riconoscere il prodotto
    db.prepare('UPDATE OR IGNORE nomi_scontrino SET prodotto_id = ? WHERE prodotto_id = ?').run(p.id, a.id); db.prepare('DELETE FROM nomi_scontrino WHERE prodotto_id = ?').run(a.id);
    db.prepare('DELETE FROM prodotti WHERE id = ?').run(a.id);
    // i prezzi al kg / l / pz con il formato di questa scheda, poi uno solo per supermercato
    const q = db.prepare('SELECT quantita, sfuso FROM prodotti WHERE id = ?').get(p.id);
    for (const pr of db.prepare('SELECT id, prezzo FROM prezzi WHERE prodotto_id = ?').all(p.id)) db.prepare('UPDATE prezzi SET unitario = ? WHERE id = ?').run(!q.sfuso && q.quantita > 0 ? pr.prezzo / q.quantita : pr.prezzo, pr.id);
    riordinaPrezzi(db);
  })();
  dimentica();
  return prodottoCompleto(p.id);
});
// 0.58 Possibili doppioni di una scheda (stesso supermercato con nome, ingredienti, formato o prezzo uguali): per unirli
app.get('/api/prodotti/:id/doppioni', async (req) => {
  const p = db.prepare('SELECT id FROM prodotti WHERE id = ?').get(id(req.params.id)); if (!p) throw new Errore('Prodotto non trovato', 404);
  return doppioniDi(db, p.id).map((a) => ({ ...a, qualita: punteggio(db.prepare('SELECT * FROM prodotti WHERE id = ?').get(a.id), voto(a.id)) }));
});
// «Sono diversi»: la coppia non viene più proposta
app.post('/api/prodotti/:id/diversi', async (req) => {
  const p = db.prepare('SELECT id FROM prodotti WHERE id = ?').get(id(req.params.id)); const a = db.prepare('SELECT id FROM prodotti WHERE id = ?').get(id(req.body?.altro));
  if (!p || !a || p.id === a.id) throw new Errore('Prodotto non trovato', 404);
  segnaDiversi(db, p.id, a.id, req.utente.id); dimentica(); return { ok: true };
});
// 0.58 tutte le schede doppie da controllare (chi gestisce i prezzi)
app.get('/api/doppioni', async (req) => {
  if (!req.utente.admin) throw new Errore('Questa parte è riservata a chi gestisce i prezzi', 403);
  return tutteLeCoppie(db).slice(0, 100);
});
// «È lo stesso prodotto»: si aggiungono solo i dati che mancano, niente di quello che c'è viene cambiato
app.post('/api/prodotti/:id/integra', async (req) => {
  const p = db.prepare('SELECT * FROM prodotti WHERE id = ?').get(id(req.params.id)); if (!p) throw new Errore('Prodotto non trovato', 404);
  const b = req.body || {}; const nuovo = {}; const campi = [];
  const NOMI = { descrizione: 'descrizione', ingredienti: 'ingredienti', produttore: 'produttore', provenienza: 'provenienza', foto: 'foto', nutriscore: 'Nutri-Score', note: 'note', nome_scontrino: 'nome sullo scontrino', additivi: 'additivi', origine: 'origine', ean: 'codice a barre', nova: 'NOVA', valori: 'valori nutrizionali', imballaggio: 'confezione' };
  const d = datiProdotto({ ...b, voce_id: p.voce_id, nome: p.nome, tipo: p.tipo, marca: p.marca, catena_id: p.catena_id, sfuso: p.sfuso }, { ...NUOVO, voce_id: p.voce_id });
  for (const k of Object.keys(NOMI)) {
    const vuoto = p[k] == null || p[k] === ''; const pieno = d[k] != null && d[k] !== '';
    if (vuoto && pieno) { nuovo[k] = d[k]; campi.push(NOMI[k]); }
  }
  if (nuovo.ean && db.prepare('SELECT 1 FROM prodotti WHERE ean = ? AND id != ?').get(nuovo.ean, p.id)) { delete nuovo.ean; campi.splice(campi.indexOf('codice a barre'), 1); }
  if (!p.bio && d.bio === 1 && b.bio !== undefined) { nuovo.bio = 1; campi.push('bio'); }
  // il formato, se mancava. 0.93: se è scritto in un'unità diversa da quella della voce (litri per un detersivo che si
  // confronta a lavaggi) non blocca l'unione: il resto si salva e il formato resta da completare nella scheda
  let avviso = '';
  if (!p.sfuso && !(p.quantita > 0) && d.quantita > 0 && b.formato_unita) {
    try {
      const f = { ...d, voce_id: p.voce_id }; adattaFormato(f, b.formato_unita, p.id);
      nuovo.quantita = f.quantita; if (d.pezzi && !p.pezzi) nuovo.pezzi = d.pezzi; campi.push('formato');
    } catch (e) { if (!(e instanceof Errore)) throw e; avviso = `Il formato non l'ho messo: ${e.message}`; }
  }
  const chiavi = Object.keys(nuovo);
  if (chiavi.length) db.prepare(`UPDATE prodotti SET ${chiavi.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...nuovo, id: p.id });
  if (nuovo.quantita) for (const pr of db.prepare('SELECT * FROM prezzi WHERE prodotto_id = ?').all(p.id)) db.prepare('UPDATE prezzi SET unitario = ? WHERE id = ?').run(pr.prezzo / nuovo.quantita, pr.id);
  return { prodotto: prodottoCompleto(p.id), campi, avviso };
});
// ---------- foto dei prodotti: scattata col telefono, ridotta nel browser, salvata qui ----------
const CARTELLA_FOTO = path.join(path.dirname(process.env.FILE_DATI || path.join(RADICE, 'data/spesa.sqlite')), 'foto');
function salvaJpeg(dati, max = 1_500_000) {
  const buf = Buffer.from(String(dati || '').replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  if (buf.length < 1000 || buf.length > max) throw new Errore('La foto è troppo piccola o troppo grande: riprova');
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) throw new Errore('Serve una foto in formato JPEG');
  fs.mkdirSync(CARTELLA_FOTO, { recursive: true });
  const nome = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.jpg`;
  fs.writeFileSync(path.join(CARTELLA_FOTO, nome), buf);
  return `/foto/${nome}`;
}
app.post('/api/foto', async (req) => ({ foto: salvaJpeg(req.body?.dati) }));
// 0.76: foto automatiche (Open Food Facts). «Non è questa»: si toglie e non si ripropone più
app.post('/api/prodotti/:id/foto-sbagliata', async (req) => {
  const p = db.prepare('SELECT * FROM prodotti WHERE id = ?').get(id(req.params.id)); if (!p) throw new Errore('Prodotto non trovato', 404);
  if (!p.foto_fonte) throw new Errore('Questa foto è stata messa da una persona: la cambi da «Modifica la scheda»');
  db.prepare("UPDATE prodotti SET foto = '', foto_fonte = '', foto_no = 1 WHERE id = ?").run(p.id);
  return prodottoCompleto(p.id);
});
app.get('/api/foto-automatiche', async (req) => {
  if (!req.utente.admin) throw new Errore('Questa parte è riservata a chi gestisce i prezzi', 403);
  const n = (w) => db.prepare(`SELECT COUNT(*) n FROM prodotti p JOIN voci v ON v.id = p.voce_id WHERE ${w}`).get().n;
  return { senza: n("p.foto = '' AND p.sfuso = 0 AND v.reparto IS NOT 'ortofrutta'"), automatiche: n("p.foto_fonte != ''"), scartate: n('p.foto_no = 1'), catalogo: !!catalogo.info() };
});
app.post('/api/foto-automatiche', async (req) => {
  if (!req.utente.admin) throw new Errore('Questa parte è riservata a chi gestisce i prezzi', 403);
  // si riprovano anche quelli già cercati in questo mese
  if (req.body?.tutti) db.prepare("UPDATE prodotti SET foto_cercata = NULL WHERE foto = '' AND foto_no = 0").run();
  return cercaFoto(db, { cartella: CARTELLA_FOTO, limite: 300 });
});
// 0.49: etichetta fotografata (codice a barre non trovato): nome, formato, ingredienti, additivi e Nutri-Score dalla confezione.
// Modello economico; al massimo 20 letture al giorno a persona e un tetto di spesa al mese (CLAUDE_TETTO_ETICHETTE_MESE, 3 € se non indicato).
app.post('/api/etichetta', async (req) => {
  const foto = (Array.isArray(req.body?.foto) ? req.body.foto : []).slice(0, 3);
  if (!foto.length) throw new Errore('Fai almeno una foto dell\'etichetta');
  if (!claude.attivo()) throw new Errore('La lettura delle etichette non è attiva: compila i campi a mano');
  const oggiN = db.prepare("SELECT COUNT(*) n FROM etichette_lette WHERE utente_id = ? AND creata_il >= date('now')").get(req.utente.id).n;
  if (oggiN >= 20 && !req.utente.admin) throw new Errore('Per oggi hai letto molte etichette: compila i campi a mano o riprova domani');
  const mese = db.prepare("SELECT COALESCE(SUM(costo), 0) e FROM etichette_lette WHERE creata_il >= date('now', 'start of month')").get().e;
  if (mese >= Number(process.env.CLAUDE_TETTO_ETICHETTE_MESE || 3)) throw new Errore('La lettura delle etichette è in pausa fino al mese prossimo: compila i campi a mano');
  const immagini = foto.map((d) => { const b = Buffer.from(String(d || '').replace(/^data:image\/jpeg;base64,/, ''), 'base64'); if (b.length < 1000 || b.length > 1_500_000 || b[0] !== 0xFF || b[1] !== 0xD8) throw new Errore('Una foto non va bene: rifalla'); return b.toString('base64'); });
  const r = await claude.leggiEtichetta(immagini);
  db.prepare('INSERT INTO etichette_lette (utente_id, costo) VALUES (?, ?)').run(req.utente.id, r.uso?.euro || 0);
  const e = daLettura(r.dati);
  if (!e.letto) throw new Errore('Non riesco a leggere l\'etichetta: fai una foto più vicina e con più luce');
  return { ...e, foto: salvaJpeg(foto[0]) };
});
// 0.89: codice a barre fotografato (iPhone: niente permesso della fotocamera): se il telefono non legge le barre, si leggono le cifre
const codiciOggi = new Map();
const eanValido = (c) => { if (!/^(\d{8}|\d{12,14})$/.test(c)) return false; const d = c.split('').map(Number); const k = d.pop(); const s = d.reverse().reduce((t, x, i) => t + x * (i % 2 ? 1 : 3), 0); return (10 - (s % 10)) % 10 === k; };
app.post('/api/codice-da-foto', async (req) => {
  const chiaveG = `${req.utente.id}|${oggi()}`; const n = codiciOggi.get(chiaveG) || 0;
  if (n >= 60 && !req.utente.admin) throw new Errore('Per oggi hai fotografato molti codici: scrivilo a mano');
  const mese = db.prepare("SELECT COALESCE(SUM(costo), 0) e FROM etichette_lette WHERE creata_il >= date('now', 'start of month')").get().e;
  if (mese >= Number(process.env.CLAUDE_TETTO_ETICHETTE_MESE || 3)) return { ean: null };
  const b = Buffer.from(String(req.body?.dati || '').replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  if (b.length < 1000 || b.length > 1_500_000 || b[0] !== 0xFF || b[1] !== 0xD8) throw new Errore('La foto non va bene: rifalla');
  codiciOggi.set(chiaveG, n + 1); if (codiciOggi.size > 5000) codiciOggi.clear();
  const r = await claude.leggiCodice(b.toString('base64'));
  if (r.uso?.euro) db.prepare('INSERT INTO etichette_lette (utente_id, costo) VALUES (?, ?)').run(req.utente.id, r.uso.euro);
  return { ean: r.ean && eanValido(r.ean) ? r.ean : null };
});
// scontrino fotografato da chi fa la spesa: va in coda, chi gestisce i prezzi lo legge e lo carica
// l'impronta di una foto: la stessa foto mandata due volte si riconosce
const improntaFoto = (dati) => crypto.createHash('sha256').update(String(dati || '').replace(/^data:image\/jpeg;base64,/, '')).digest('hex');
app.post('/api/scontrini/foto', async (req) => {
  const impronta = improntaFoto(req.body?.dati);
  if (db.prepare('SELECT 1 FROM scontrini_foto WHERE impronta = ?').get(impronta)) throw new Errore('Questo scontrino è già stato mandato: i suoi prezzi sono già nell\'app (o lo saranno a breve)', 409);
  const foto = salvaJpeg(req.body?.dati, 3_500_000);
  const fid = db.prepare('INSERT INTO scontrini_foto (utente_id, foto, catena, impronta) VALUES (?, ?, ?, ?)').run(req.utente.id, foto, testo(req.body?.catena, 60), impronta).lastInsertRowid;
  // si legge subito, mentre la persona continua: i prodotti riconosciuti con sicurezza entrano da soli
  if (process.env.SCONTRINI_AUTOMATICI !== '0') leggiEcarica(fid).catch((e) => console.error('scontrino', fid, e.message));
  return { ok: true, id: fid, automatico: process.env.SCONTRINI_AUTOMATICI !== '0' };
});
// chi ha mandato lo scontrino vede com'è andata la lettura (solo i suoi)
app.get('/api/scontrini/mio/:id', async (req) => {
  const f = db.prepare('SELECT * FROM scontrini_foto WHERE id = ? AND utente_id = ?').get(id(req.params.id), req.utente.id); if (!f) throw new Errore('Scontrino non trovato', 404);
  const sc = db.prepare('SELECT righe FROM scontrini WHERE foto_id = ?').get(f.id);
  const l = f.lettura ? JSON.parse(f.lettura) : null;
  return { stato: f.stato, letto: !!l, catena: f.catena || null, prezzi: sc ? JSON.parse(sc.righe || '[]').length : 0, resto: l ? l.righe.filter((r) => !r.caricata && r.importo > 0).length : null };
});
app.get('/api/scontrini/foto', async () => db.prepare(`SELECT s.id, s.foto, s.catena, s.stato, s.creato_il, s.lettura, u.nome FROM scontrini_foto s LEFT JOIN utenti u ON u.id = s.utente_id
  ORDER BY s.stato IN ('da leggere', 'da controllare') DESC, s.id DESC LIMIT 100`).all());
// Lettura di uno scontrino fotografato: OCR, righe, abbinamento ai prodotti (chi gestisce controlla e poi carica)
// i nomi da scontrino di ogni supermercato («LATTE PS 1L» da Lidl non è per forza lo stesso prodotto di Eurospin)
db.exec('CREATE TABLE IF NOT EXISTS nomi_scontrino (catena_id INTEGER NOT NULL, testo TEXT NOT NULL, prodotto_id INTEGER NOT NULL, PRIMARY KEY (catena_id, testo))');
const conCatena = (cid) => (cid ? { catena_id: cid, nomiCatena: new Map(db.prepare('SELECT testo, prodotto_id FROM nomi_scontrino WHERE catena_id = ?').all(cid).map((x) => [x.testo, x.prodotto_id])), inCatena: diCatena(db, cid) } : {});
async function leggiScontrino(f) {
  const nome = f.foto.replace(/^\/foto\//, ''); if (!/^[a-z0-9-]+\.jpg$/.test(nome)) throw new Errore('Foto non valida');
  let testo;
  try { testo = await lettura.leggiTesto(path.join(CARTELLA_FOTO, nome)); } catch (e) { console.error(e); throw new Errore('Non riesco a leggere la foto: sul server manca il programma di lettura (tesseract) o la foto non è leggibile', 502); }
  const analisi = lettura.analizza(testo, db.prepare('SELECT id, nome FROM catene').all());
  const prodotti = db.prepare('SELECT id, voce_id, nome, nome_scontrino, sfuso, quantita FROM prodotti').all(); const voci = db.prepare('SELECT id, nome, unita, reparto FROM voci').all();
  const righe = lettura.abbina(analisi.righe, prodotti, voci, conCatena(analisi.catena_id));
  const esito = { ...analisi, righe, testo, letto_il: oggi() };
  db.prepare('UPDATE scontrini_foto SET lettura = ? WHERE id = ?').run(JSON.stringify(esito), f.id);
  return esito;
}
app.post('/api/scontrini/foto/:id/leggi', async (req) => {
  const f = db.prepare('SELECT * FROM scontrini_foto WHERE id = ?').get(id(req.params.id)); if (!f) throw new Errore('Scontrino non trovato', 404);
  // se una parte era già entrata da sola, quelle righe restano segnate come caricate
  const prima = f.lettura ? JSON.parse(f.lettura) : null;
  const esito = await leggiScontrino(f);
  if (prima?.righe?.some((r) => r.caricata)) { const fatte = new Set(prima.righe.filter((r) => r.caricata).map((r) => `${r.testo}|${r.importo}`)); esito.righe = esito.righe.map((r) => (fatte.has(`${r.testo}|${r.importo}`) ? { ...r, caricata: true } : r)); db.prepare('UPDATE scontrini_foto SET lettura = ? WHERE id = ?').run(JSON.stringify(esito), f.id); }
  return esito;
});
// Lo stesso scontrino (supermercato, giorno, totale, numero) già caricato da un'altra foto?
const scontrinoDoppio = (cid, data, totale, numero, fid) => (totale > 0 ? db.prepare('SELECT id FROM scontrini WHERE catena_id = ? AND data = ? AND abs(totale - ?) < 0.005 AND (? = \'\' OR numero = \'\' OR numero = ?) AND (foto_id IS NULL OR foto_id != ?)').get(cid, data, totale, numero || '', numero || '', fid || 0) : null);
// I prezzi delle righe abbinate entrano nell'archivio, a nome di chi ha mandato la foto; lo scontrino va nello storico
function caricaRighe(f, c, { data, numero, totale, righe }, utente_id, req) {
  let n = 0; const salvate = [];
  db.transaction(() => {
    for (const r of righe) {
      const pid = r.prodotto_id ? id(r.prodotto_id) : null; if (!pid) continue;
      const p = prodottoCompleto(pid); if (!p) continue;
      const prezzo = numero_(r.prezzo_unita ?? r.importo, p.nome);
      let dal = null; let al = null; if (p.reparto === 'ortofrutta') ({ dal, al } = settimana(data));
      db.prepare('INSERT INTO prezzi (prodotto_id, catena_id, citta, prezzo, unitario, offerta, rilevato_il, valido_dal, valido_al, fonte, utente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(p.id, c.id, zonaDi(c, req ? imp(req) : impostazioni(db)), prezzo, p.quantita > 0 ? prezzo / p.quantita : prezzo, r.offerta ? 1 : 0, data, dal, al, 'scontrino', utente_id);
      if (r.testo && !p.nome_scontrino) db.prepare('UPDATE prodotti SET nome_scontrino = ? WHERE id = ?').run(testo(r.testo, 60), p.id);
      // come lo scrive QUESTO supermercato: la prossima volta lo stesso testo è lo stesso prodotto
      if (r.testo) db.prepare('INSERT OR REPLACE INTO nomi_scontrino (catena_id, testo, prodotto_id) VALUES (?, ?, ?)').run(c.id, lettura.norma(r.testo), p.id);
      salvate.push({ testo: r.testo, quantita: r.quantita, unita: r.unita, prezzo_unita: prezzo, importo: r.importo, prodotto_id: p.id }); n++;
    }
    if (n) {
      const gia = db.prepare('SELECT * FROM scontrini WHERE foto_id = ?').get(f.id);
      if (gia) db.prepare('UPDATE scontrini SET righe = ? WHERE id = ?').run(JSON.stringify([...JSON.parse(gia.righe || '[]'), ...salvate]), gia.id);
      else db.prepare('INSERT INTO scontrini (catena_id, negozio_id, data, ora, numero, totale, righe, foto_id) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)').run(c.id, data, '', testo(numero, 40), Number(totale) || 0, JSON.stringify(salvate), f.id);
      const fam = f.utente_id ? db.prepare('SELECT famiglia_id FROM utenti WHERE id = ?').get(f.utente_id)?.famiglia_id : null;
      if (fam) db.prepare('INSERT INTO avvisi (famiglia_id, testo, link) VALUES (?, ?, ?)').run(fam, `Grazie! Dal tuo scontrino ${c.nome} del ${data.slice(8, 10)}/${data.slice(5, 7)} sono entrati ${n} prezzi.`, '#lista');
    }
  })();
  return n;
}
const numero_ = (x, nome) => numero(x, { min: 0.01, max: 9999, nome: `Il prezzo di ${nome}` });
// Lettura automatica appena arriva la foto: entrano solo le righe riconosciute con sicurezza; il resto lo controlla chi gestisce
async function leggiEcarica(fid) {
  const f = db.prepare('SELECT * FROM scontrini_foto WHERE id = ?').get(fid); if (!f) return;
  const l = await leggiScontrino(f);
  if (!l.catena_id || !l.data) return; // supermercato o data non letti: resta «da leggere»
  const c = db.prepare('SELECT * FROM catene WHERE id = ?').get(l.catena_id);
  if (scontrinoDoppio(c.id, l.data, l.totale, l.numero, f.id)) { db.prepare("UPDATE scontrini_foto SET stato = 'doppione', catena = ? WHERE id = ?").run(c.nome, f.id); return; }
  const sicure = l.righe.filter((r) => r.prodotto_id && r.sicuro && r.importo > 0);
  const n = sicure.length ? caricaRighe(f, c, { data: l.data, numero: l.numero, totale: l.totale, righe: sicure }, f.utente_id, null) : 0;
  const fatte = new Set(sicure); l.righe = l.righe.map((r) => (fatte.has(r) ? { ...r, caricata: true } : r));
  const resto = l.righe.filter((r) => !r.caricata && r.importo > 0).length;
  db.prepare('UPDATE scontrini_foto SET lettura = ?, stato = ?, catena = ? WHERE id = ?').run(JSON.stringify(l), resto ? 'da controllare' : 'letto', c.nome, f.id);
  return { prezzi: n, resto };
}
// I prezzi letti entrano nell'archivio (a nome di chi ha mandato la foto), lo scontrino resta nello storico
app.post('/api/scontrini/foto/:id/carica', async (req) => {
  const f = db.prepare('SELECT * FROM scontrini_foto WHERE id = ?').get(id(req.params.id)); if (!f) throw new Errore('Scontrino non trovato', 404);
  const b = req.body || {}; const c = db.prepare('SELECT * FROM catene WHERE id = ?').get(id(b.catena_id)); if (!c) throw new Errore('Scegli il supermercato');
  const data = DATA.test(b.data || '') ? b.data : oggi();
  if (!b.anche_se_doppio && scontrinoDoppio(c.id, data, Number(b.totale) || 0, testo(b.numero, 40), f.id)) throw new Errore(`Questo scontrino ${c.nome} del ${data.slice(8, 10)}/${data.slice(5, 7)} (stesso totale) è già stato caricato da un'altra foto`, 409);
  const righe = (Array.isArray(b.righe) ? b.righe : []).slice(0, 80).filter((r) => !r.caricata);
  const n = caricaRighe(f, c, { data, numero: b.numero, totale: b.totale, righe }, f.utente_id ?? req.utente.id, req);
  // le righe caricate si segnano nella lettura (così non entrano due volte)
  const l = f.lettura ? JSON.parse(f.lettura) : null;
  if (l?.righe) { const k = new Set(righe.map((r) => `${r.testo}|${r.importo}`)); l.righe = l.righe.map((r) => (k.has(`${r.testo}|${r.importo}`) ? { ...r, caricata: true } : r)); db.prepare('UPDATE scontrini_foto SET lettura = ? WHERE id = ?').run(JSON.stringify(l), f.id); }
  db.prepare("UPDATE scontrini_foto SET stato = 'letto', catena = ? WHERE id = ?").run(c.nome, f.id);
  return { ok: true, prezzi: n };
});
app.put('/api/scontrini/foto/:id', async (req) => {
  const stato = ['da leggere', 'da controllare', 'letto', 'scartato', 'doppione'].includes(req.body?.stato) ? req.body.stato : 'letto';
  db.prepare('UPDATE scontrini_foto SET stato = ? WHERE id = ?').run(stato, id(req.params.id));
  return { ok: true };
});
app.get('/foto/:nome', async (req, rep) => {
  // le foto (prodotti, scontrini, volantini) si vedono solo da dentro l'app
  if (!req.utente) throw new Errore('Foto non trovata', 404);
  const nome = String(req.params.nome); if (!/^[a-z0-9-]+\.jpg$/.test(nome)) throw new Errore('Foto non trovata', 404);
  const f = path.join(CARTELLA_FOTO, nome); if (!fs.existsSync(f)) throw new Errore('Foto non trovata', 404);
  return rep.type('image/jpeg').header('Cache-Control', 'private, max-age=31536000, immutable').send(fs.readFileSync(f));
});
app.get('/api/marche', async (req) => db.prepare("SELECT DISTINCT marca FROM prodotti WHERE tipo = 'marca' AND marca != '' AND (? IS NULL OR voce_id = ?) ORDER BY marca").all(req.query.voce_id || null, req.query.voce_id || null).map((r) => r.marca));

// ---------- prezzi ----------
app.post('/api/prezzi', async (req) => {
  const b = req.body || {};
  const p = prodottoCompleto(id(b.prodotto_id)); if (!p) throw new Errore('Prodotto non trovato', 404);
  const c = db.prepare('SELECT * FROM catene WHERE id = ?').get(id(b.catena_id)); if (!c) throw new Errore('Catena non trovata', 404);
  const prezzo = numero(b.prezzo, { min: 0.01, max: 9999, nome: 'Il prezzo' });
  const rilevato = DATA.test(b.rilevato_il || '') ? b.rilevato_il : oggi();
  let dal = DATA.test(b.valido_dal || '') ? b.valido_dal : null; let al = DATA.test(b.valido_al || '') ? b.valido_al : null;
  // ortofrutta: il prezzo vale per una settimana, dal… al… (se non la dici: la settimana della rilevazione)
  if (p.reparto === 'ortofrutta' && !al) ({ dal, al } = settimana(rilevato));
  if (al && dal && al < dal) throw new Errore('La data di fine viene prima di quella di inizio');
  if (al && !dal) dal = rilevato <= al ? rilevato : al;
  const unitario = p.quantita > 0 ? prezzo / p.quantita : prezzo;
  db.prepare('INSERT INTO prezzi (prodotto_id, catena_id, citta, prezzo, unitario, offerta, rilevato_il, valido_dal, valido_al, fonte, utente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(p.id, c.id, zonaDi(c, imp(req)), prezzo, unitario, b.offerta ? 1 : 0, rilevato, dal, al, ['scontrino', 'scaffale', 'manuale'].includes(b.fonte) ? b.fonte : 'scaffale', req.utente?.id ?? null);
  aggiungiMia(req, c.id);
  if (b.offerta) avvisaOfferta(p, c, prezzo).catch((e) => console.error(e));
  return { ok: true };
});
// correggere un prezzo (letto male da uno scontrino, scritto sbagliato): chi gestisce, o chi l'ha inserito
const prezzoModificabile = (req, pid) => {
  const x = db.prepare('SELECT * FROM prezzi WHERE id = ?').get(id(pid)); if (!x) throw new Errore('Prezzo non trovato', 404);
  if (!req.utente.admin && x.utente_id !== req.utente.id) throw new Errore('Puoi correggere solo i prezzi che hai inserito tu', 403);
  return x;
};
app.put('/api/prezzi/:id', async (req) => {
  const x = prezzoModificabile(req, req.params.id); const b = req.body || {};
  const p = prodottoCompleto(x.prodotto_id);
  const prezzo = b.prezzo !== undefined ? numero(b.prezzo, { min: 0.01, max: 9999, nome: 'Il prezzo' }) : x.prezzo;
  // 0.72: un prezzo corretto è un prezzo visto oggi, quindi prende la data di oggi
  const rilevato = DATA.test(b.rilevato_il || '') ? b.rilevato_il : b.prezzo !== undefined ? oggi() : x.rilevato_il;
  const offerta = b.offerta !== undefined ? (b.offerta ? 1 : 0) : x.offerta;
  // il periodo dell'offerta: si cambia solo se viene mandato; se l'offerta viene tolta, cade anche il periodo (salvo ortofrutta)
  let dal = b.valido_dal !== undefined ? (DATA.test(b.valido_dal || '') ? b.valido_dal : null) : x.valido_dal;
  let al = b.valido_al !== undefined ? (DATA.test(b.valido_al || '') ? b.valido_al : null) : x.valido_al;
  if (!offerta && x.offerta && p.reparto !== 'ortofrutta' && b.valido_al !== undefined) { dal = null; al = null; }
  if (al && dal && al < dal) throw new Errore('La data di fine viene prima di quella di inizio');
  if (al && !dal) dal = rilevato <= al ? rilevato : al;
  db.prepare('UPDATE prezzi SET prezzo = ?, unitario = ?, offerta = ?, rilevato_il = ?, valido_dal = ?, valido_al = ? WHERE id = ?')
    .run(prezzo, p.quantita > 0 ? prezzo / p.quantita : prezzo, offerta, rilevato, dal, al, x.id);
  return { ok: true };
});
app.delete('/api/prezzi/:id', async (req) => { db.prepare('DELETE FROM prezzi WHERE id = ?').run(prezzoModificabile(req, req.params.id).id); return { ok: true }; });
// Confronto: per una voce, ogni prodotto con l'ultimo prezzo in ogni catena (anche scaduto, per vederlo) e la storia
app.get('/api/confronto', async (req) => {
  const vid = id(req.query.voce_id); const data = DATA.test(req.query.data || '') ? req.query.data : oggi(); const s = imp(req);
  const voce = db.prepare('SELECT * FROM voci WHERE id = ?').get(vid); if (!voce) throw new Errore('Voce non trovata', 404);
  const prodotti = db.prepare('SELECT p.*, c.nome catena FROM prodotti p LEFT JOIN catene c ON c.id = p.catena_id WHERE p.voce_id = ? ORDER BY p.nome').all(vid);
  const storia = db.prepare(`SELECT pr.*, c.nome catena, c.ambito, ? reparto FROM prezzi pr JOIN catene c ON c.id = pr.catena_id WHERE pr.prodotto_id = ? AND pr.superato_il IS NULL ORDER BY pr.rilevato_il DESC, pr.id DESC`);
  return { voce, data, prodotti: prodotti.map((p) => ({ ...p, qualita: punteggio({ ...p, voce: voce.nome, reparto: voce.reparto }, voto(p.id)), prezzi: storia.all(voce.reparto, p.id).map((x) => ({ ...x, stato: statoPrezzo(x, data, s.giorni_validi) })) })) };
});

// ---------- scheda prodotto, preferiti, ricerca ----------
const pubblico = (p) => ({ id: p.id, voce_id: p.voce_id, nome: p.nome, tipo: p.tipo, marca: p.marca, catena: p.catena || null, origine: p.origine, bio: !!p.bio, quantita: p.quantita, sfuso: !!p.sfuso, foto: p.foto, confrontabile: confrontabile(p), non_alimentare: !!p.non_alimentare });
const voto = (pid) => { const r = db.prepare('SELECT AVG(stelle) media, COUNT(*) n FROM valutazioni WHERE prodotto_id = ?').get(pid); return r.n ? { media: Math.round(r.media * 10) / 10, n: r.n } : null; };
const preferitoDi = (voceId, req) => db.prepare('SELECT prodotto_id FROM preferiti WHERE utente = ? AND voce_id = ?').get(`f${req.famiglia.id}`, voceId)?.prodotto_id || null;
app.get('/api/prodotti/:id', async (req) => {
  const p = prodottoCompleto(id(req.params.id)); if (!p) throw new Errore('Prodotto non trovato', 404);
  const s = imp(req); const d = oggi();
  const storia = db.prepare('SELECT pr.*, c.nome catena, c.ambito, ? reparto FROM prezzi pr JOIN catene c ON c.id = pr.catena_id WHERE pr.prodotto_id = ? ORDER BY pr.rilevato_il DESC, pr.id DESC').all(p.reparto, p.id)
    .map((x) => ({ ...x, stato: statoPrezzo(x, d, s.giorni_validi), quiValido: valeQui(x, s), modificabile: !!req.utente.admin || x.utente_id === req.utente.id }));
  // 0.54: i prezzi di adesso (uno per supermercato, più le offerte con il periodo ancora da finire) e lo storico a parte
  const attuale = (x) => !x.superato_il && !(x.offerta && x.valido_al && x.valido_al < d);
  const ultimi = storia.filter(attuale).sort((a, b) => a.catena.localeCompare(b.catena) || a.offerta - b.offerta);
  const precedenti = storia.filter((x) => !attuale(x));
  const v = voto(p.id);
  const mio = db.prepare('SELECT stelle FROM valutazioni WHERE utente = ? AND prodotto_id = ?').get(`u${req.utente.id}`, p.id)?.stelle || 0;
  return { ...p, sfuso: !!p.sfuso, bio: !!p.bio, confrontabile: confrontabile(p), preferito: preferitoDi(p.voce_id, req) === p.id, qualita: punteggio(p, v), giudizio: giudizio(punteggio(p, v)), additivi: additiviDi(p) ? elencoAdditivi(additiviDi(p)) : null, voto: v, mioVoto: mio, ultimi, storia: precedenti, perche: dettaglio(p, v), puoUnire: !!req.utente.admin };
});
app.post('/api/valutazioni', async (req) => {
  const pid = id(req.body?.prodotto_id); if (!db.prepare('SELECT 1 FROM prodotti WHERE id = ?').get(pid)) throw new Errore('Prodotto non trovato', 404);
  const stelle = Math.round(Number(req.body?.stelle) || 0);
  if (stelle >= 1 && stelle <= 5) db.prepare("INSERT INTO valutazioni (utente, prodotto_id, stelle, commento) VALUES (?, ?, ?, ?) ON CONFLICT(utente, prodotto_id) DO UPDATE SET stelle = excluded.stelle, commento = excluded.commento").run(`u${req.utente.id}`, pid, stelle, testo(req.body?.commento, 300));
  else db.prepare('DELETE FROM valutazioni WHERE utente = ? AND prodotto_id = ?').run(`u${req.utente.id}`, pid);
  return { voto: voto(pid) };
});
app.post('/api/preferiti', async (req) => {
  const vid = id(req.body?.voce_id);
  if (req.body?.prodotto_id) {
    const p = db.prepare('SELECT * FROM prodotti WHERE id = ? AND voce_id = ?').get(id(req.body.prodotto_id), vid); if (!p) throw new Errore('Prodotto non trovato', 404);
    db.prepare("INSERT INTO preferiti (utente, voce_id, prodotto_id) VALUES (?, ?, ?) ON CONFLICT(utente, voce_id) DO UPDATE SET prodotto_id = excluded.prodotto_id").run(`f${req.famiglia.id}`, vid, p.id);
  } else db.prepare('DELETE FROM preferiti WHERE utente = ? AND voce_id = ?').run(`f${req.famiglia.id}`, vid);
  return { preferito: preferitoDi(vid, req) };
});
// Ricerca: per ogni voce trovata il più economico, l'italiano più economico, il bio più economico e il mio preferito
// Per una voce: il più economico, l'italiano, il bio, il migliore, la miglior scelta e il preferito della famiglia
function analisiVoce(v, req, prezzi, catene) {
  const prodotti = db.prepare('SELECT p.*, c.nome catena FROM prodotti p LEFT JOIN catene c ON c.id = p.catena_id WHERE p.voce_id = ?').all(v.id);
  const offerte = [];
  for (const p of prodotti) {
    let best = null;
    for (const pr of prezzi.values()) if (pr.prodotto_id === p.id && (!best || pr.unitario < best.unitario)) best = pr;
    if (best) offerte.push({ p, pr: best, q: punteggio(p, voto(p.id)) });
  }
  const scegli = (f) => offerte.filter((o) => confrontabile(o.p) && f(o.p)).sort((a, b) => a.pr.unitario - b.pr.unitario)[0] || null;
  const fmt = (o) => o && { prodotto: pubblico(o.p), catena: catene.get(o.pr.catena_id), catena_id: o.pr.catena_id, prezzo: o.pr.prezzo, unitario: o.pr.unitario, stato: o.pr.stato, valido_al: o.pr.valido_al, offerta: !!o.pr.offerta, rilevato_il: o.pr.rilevato_il, qualita: o.q ?? null };
  // il migliore: la qualità più alta (a parità, il meno caro); la miglior scelta: più qualità per ogni euro
  const conQ = offerte.filter((o) => confrontabile(o.p) && o.q != null);
  const migliore = [...conQ].sort((a, b) => b.q - a.q || a.pr.unitario - b.pr.unitario)[0] || null;
  const scelta = conQ.filter((o) => valore(o.q, o.pr.unitario) != null).sort((a, b) => valore(b.q, b.pr.unitario) - valore(a.q, a.pr.unitario))[0] || null;
  const pid = preferitoDi(v.id, req); const pp = pid && prodotti.find((p) => p.id === pid);
  return {
    voce: v, prodotti: prodotti.length, offertaVicina: offertaVicina(req, prezzi, catene, prodotti),
    migliore: fmt(migliore), scelta: fmt(scelta),
    economico: fmt(scegli(() => true)), italiano: fmt(scegli((p) => p.origine === 'italia')), bio: fmt(scegli((p) => p.bio)),
    preferito: pp ? (fmt(offerte.find((o) => o.p.id === pid)) || { prodotto: pubblico(pp), catena: null }) : null,
    daCompletare: offerte.filter((o) => !confrontabile(o.p)).map(fmt),
  };
}
// L'app propone: l'offerta per questa cosa nel supermercato più vicino a casa (prima tra i tuoi, poi negli altri)
function offertaVicina(req, prezzi, catene, prodotti) {
  const casa = imp(req).casa; const mie = new Set(mieCatene(req) || []);
  const ids = new Set(prodotti.map((p) => p.id));
  const negozi = db.prepare('SELECT catena_id, lat, lng, indirizzo, citta, nome FROM negozi WHERE attivo = 1 AND lat IS NOT NULL').all();
  const vicino = (cid) => negozi.filter((n) => n.catena_id === cid).map((n) => ({ ...n, km: casa?.lat ? Math.round(mappe.kmStrada(casa, n) * 10) / 10 : null })).sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))[0] || null;
  const cand = [...prezzi.values()].filter((z) => z.offerta && ids.has(z.prodotto_id)).map((z) => ({ z, p: prodotti.find((p) => p.id === z.prodotto_id), n: vicino(z.catena_id) })).filter((k) => confrontabile(k.p))
    .sort((a, b) => Number(mie.has(b.z.catena_id)) - Number(mie.has(a.z.catena_id)) || (a.n?.km ?? 1e9) - (b.n?.km ?? 1e9) || a.z.unitario - b.z.unitario);
  const k = cand[0]; if (!k) return null;
  return { prodotto: pubblico(k.p), catena: catene.get(k.z.catena_id), catena_id: k.z.catena_id, prezzo: k.z.prezzo, unitario: k.z.unitario, valido_al: k.z.valido_al, offerta: true, qualita: punteggio(k.p, voto(k.p.id)),
    km: k.n?.km ?? null, indirizzo: k.n ? `${k.n.indirizzo || k.n.nome}${k.n.citta ? `, ${k.n.citta}` : ''}` : '', mia: mie.has(k.z.catena_id) };
}
// Le scelte da proporre nella lista: una riga per prodotto, con tutte le etichette che merita
const ETICHETTE = [['economico', 'Più economico'], ['offerta', 'In offerta'], ['italiano', 'Italiano'], ['bio', 'Bio'], ['scelta', 'Miglior scelta'], ['migliore', 'Il migliore'], ['preferito', 'Il mio preferito']];
function opzioniDa(a) {
  const out = [];
  for (const [k, t] of ETICHETTE) {
    const o = k === 'offerta' ? null : a[k]; if (!o?.catena) continue;
    const g = out.find((x) => x.prodotto.id === o.prodotto.id && x.catena_id === o.catena_id);
    if (g) g.etichette.push(t); else out.push({ ...o, etichette: [t] });
  }
  for (const o of out) if (o.offerta && !o.etichette.includes('In offerta')) o.etichette.push('In offerta');
  return out.slice(0, 5);
}
app.get('/api/cerca', async (req) => {
  const q = testo(req.query.q, 60).toLowerCase(); if (q.length < 2) return [];
  const s = imp(req); const prezzi = prezziValidi(db, oggi(), s);
  const catene = new Map(db.prepare('SELECT id, nome FROM catene').all().map((c) => [c.id, c.nome]));
  const voci = db.prepare(`SELECT DISTINCT v.* FROM voci v LEFT JOIN prodotti p ON p.voce_id = v.id
    WHERE lower(v.nome) LIKE '%' || ? || '%' OR lower(p.nome || ' ' || p.marca || ' ' || p.nome_scontrino) LIKE '%' || ? || '%'
    ORDER BY CASE WHEN lower(v.nome) LIKE ? || '%' THEN 0 ELSE 1 END, v.nome LIMIT 8`).all(q, q, q);
  return voci.map((v) => analisiVoce(v, req, prezzi, catene));
});
// Ricerca mentre si scrive: ogni parola restringe (tutte le parole devono esserci, in qualsiasi ordine).
// Restituisce cose da toccare: le voci («Latte», generico), i prodotti con il prezzo migliore, e il catalogo.
const PAROLE_VUOTE = new Set(['di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'al', 'alla', 'allo', 'ai', 'alle', 'con', 'e', 'per', 'da', 'in', 'il', 'lo', 'la', 'i', 'gli', 'le', 'a', 'un', 'una', 'uno']);
const normaRicerca = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
app.get('/api/cerca/veloce', async (req) => {
  const parole = normaRicerca(req.query.q).split(' ').filter((w) => w.length >= 2 && !PAROLE_VUOTE.has(w)).slice(0, 6);
  if (!parole.length) return { voci: [], prodotti: [], catalogo: [] };
  const radice = (w) => (w.length > 4 ? w.replace(/[aeio]$/, '') : w); // «zucchine» trova anche «zucchina»
  const tutte = (testo) => { const t = normaRicerca(testo); return parole.every((w) => t.includes(radice(w))); };
  const prezzi = [...prezziValidi(db, oggi(), imp(req)).values()];
  const catene = new Map(db.prepare('SELECT id, nome FROM catene').all().map((c) => [c.id, c.nome]));
  const voci = db.prepare('SELECT * FROM voci').all().filter((v) => tutte(v.nome))
    .sort((a, b) => Number(!normaRicerca(a.nome).startsWith(parole[0])) - Number(!normaRicerca(b.nome).startsWith(parole[0])) || a.nome.length - b.nome.length).slice(0, 4)
    .map((v) => ({ id: v.id, nome: v.nome, unita: v.unita, pezzo: v.pezzo, prodotti: db.prepare('SELECT COUNT(*) n FROM prodotti WHERE voce_id = ?').get(v.id).n }));
  const prodotti = db.prepare('SELECT p.*, v.nome voce, v.unita, v.pezzo FROM prodotti p JOIN voci v ON v.id = p.voce_id').all()
    .filter((p) => tutte(`${p.nome} ${p.marca} ${p.voce} ${p.nome_scontrino}`))
    .map((p) => { const z = prezzi.filter((x) => x.prodotto_id === p.id).sort((a, b) => a.prezzo - b.prezzo)[0]; return { p, z }; })
    .sort((a, b) => Number(!a.z) - Number(!b.z) || Number(!normaRicerca(a.p.nome).startsWith(parole[0])) - Number(!normaRicerca(b.p.nome).startsWith(parole[0])) || a.p.nome.length - b.p.nome.length)
    .slice(0, 10)
    .map(({ p, z }) => ({ id: p.id, voce_id: p.voce_id, voce: p.voce, nome: p.nome, marca: p.marca, quantita: p.quantita, sfuso: !!p.sfuso, unita: p.unita, pezzo: p.pezzo, bio: !!p.bio, origine: p.origine, foto: p.foto, non_alimentare: !!p.non_alimentare,
      qualita: punteggio(p, voto(p.id)), prezzo: z?.prezzo ?? null, catena: z ? catene.get(z.catena_id) : null, offerta: !!z?.offerta }));
  const gia = new Set(db.prepare("SELECT ean FROM prodotti WHERE ean != ''").pluck().all());
  const dalCatalogo = parole.join(' ').length >= 3 ? catalogo.cerca(parole.join(' '), 10).filter((x) => !gia.has(x.ean)).slice(0, 6)
    .map((x) => ({ ean: x.ean, nome: x.nome, foto: x.foto, non_alimentare: !!x.nonAlimentare, qualita: punteggio({ ...x, additivi: x.additivi ? JSON.stringify(x.additivi) : '' }) })) : [];
  return { voci, prodotti, catalogo: dalCatalogo };
});
// Ricerca mentre si scrive: prima i prodotti che la famiglia compra di solito, poi gli altri dell'app (con dove costano
// meno), poi le voci generiche e il catalogo. Ogni parola scritta restringe l'elenco.
const VUOTE_CERCA = new Set(['il', 'lo', 'la', 'le', 'gli', 'i', 'un', 'una', 'uno', 'di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'al', 'alla', 'con', 'per', 'da', 'in', 'e']);
const parolaCerca = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
function abitualiDi(req) {
  // quante volte la famiglia l'ha comprato (spese chiuse) + il preferito della voce
  const conta = new Map();
  for (const r of db.prepare('SELECT righe FROM spese WHERE famiglia_id = ? ORDER BY id DESC LIMIT 60').all(req.famiglia.id)) {
    let righe = []; try { righe = JSON.parse(r.righe); } catch { /* niente */ }
    for (const x of righe) if (x.prodotto_id) conta.set(x.prodotto_id, (conta.get(x.prodotto_id) || 0) + 1);
  }
  for (const pid of db.prepare('SELECT prodotto_id FROM preferiti WHERE utente = ?').pluck().all(`f${req.famiglia.id}`)) conta.set(pid, (conta.get(pid) || 0) + 3);
  for (const pid of db.prepare('SELECT prodotto_id FROM righe_lista WHERE famiglia_id = ? AND prodotto_id IS NOT NULL AND scelto = 1').pluck().all(req.famiglia.id)) conta.set(pid, (conta.get(pid) || 0) + 1);
  return conta;
}
// ---------- offerte di oggi: i prodotti in offerta nei tuoi supermercati (e in quelli nel tuo raggio), per reparto ----------
// L'altro modo di fare la spesa: si parte dalle offerte, si tocca «Metti in lista» e poi si avvia il giro come sempre.
function offerteDi(req) {
  const data = oggi(); const s = imp(req); const f = req.famiglia; const casa = s.casa; const raggio = f?.raggio || 10;
  const mie = mieCatene(req) || [];
  const negozi = db.prepare('SELECT catena_id, lat, lng FROM negozi WHERE attivo = 1 AND lat IS NOT NULL').all();
  const ammessi = new Set(mie);
  if (casa?.lat) for (const n of negozi) if (mappe.distanzaKm(casa, n) <= raggio) ammessi.add(n.catena_id);
  for (const cid of db.prepare("SELECT id FROM catene WHERE tipo = 'fornitore'").pluck().all()) ammessi.add(cid);
  const ovunque = !ammessi.size;
  const catene = new Map(db.prepare('SELECT id, nome FROM catene').all().map((c) => [c.id, c.nome]));
  const inLista = new Set(db.prepare('SELECT prodotto_id FROM righe_lista WHERE famiglia_id = ? AND prodotto_id IS NOT NULL').pluck().all(f.id));
  const abituali = abitualiDi(req);
  const schedaDi = db.prepare('SELECT p.*, v.nome voce, v.reparto, v.unita, v.pezzo FROM prodotti p JOIN voci v ON v.id = p.voce_id WHERE p.id = ?');
  const normaleDi = db.prepare('SELECT prezzo FROM prezzi WHERE prodotto_id = ? AND offerta = 0 AND superato_il IS NULL AND rilevato_il <= ? ORDER BY CASE WHEN catena_id = ? THEN 0 ELSE 1 END, rilevato_il DESC LIMIT 1');
  const offerte = []; const inArrivo = [];
  // le offerte di oggi (prezzi validi) e quelle che devono ancora cominciare (dai volantini letti in anticipo)
  const future = db.prepare(`SELECT pr.*, c.ambito FROM prezzi pr JOIN catene c ON c.id = pr.catena_id WHERE pr.offerta = 1 AND pr.superato_il IS NULL AND pr.valido_dal > ? AND (pr.valido_al IS NULL OR pr.valido_al >= pr.valido_dal) ORDER BY pr.valido_dal, pr.id DESC`).all(data)
    .filter((z) => valeQui(z, s));
  const vistiFuturi = new Set();
  for (const z of [...prezziValidi(db, data, s).values(), ...future.map((z) => ({ ...z, stato: 'in_arrivo' }))]) {
    if (!z.offerta || (!ovunque && !ammessi.has(z.catena_id))) continue;
    const futura = z.stato === 'in_arrivo';
    if (futura) { const k = `${z.prodotto_id}|${z.catena_id}`; if (vistiFuturi.has(k)) continue; vistiFuturi.add(k); }
    const p = schedaDi.get(z.prodotto_id); if (!p) continue;
    // quanto si risparmia: rispetto al prezzo pieno scritto sul volantino, o all'ultimo prezzo normale conosciuto
    const normale = z.prezzo_pieno || normaleDi.get(p.id, data, z.catena_id)?.prezzo || null;
    (futura ? inArrivo : offerte).push({
      prodotto_id: p.id, nome: p.nome, marca: p.marca || '', voce: p.voce, voce_id: p.voce_id, reparto: REPARTI.includes(p.reparto) ? p.reparto : 'altro', categoria: categoriaDi(p.voce, p.nome, p.reparto),
      origine: p.origine || '', tipo: p.tipo || 'senza', unita: p.unita, pezzo: p.pezzo || '', quantita: p.quantita, daMettere: p.sfuso ? 1 : p.quantita || 1, sfuso: !!p.sfuso, bio: !!p.bio, italiano: p.origine === 'italia',
      prezzo: z.prezzo, unitario: z.unitario, normale: normale > z.prezzo ? normale : null, risparmio: normale > z.prezzo ? Math.round((1 - z.prezzo / normale) * 100) : null,
      qualita: punteggio(p, voto(p.id)), // 0.55: il pallino con il voto anche sulle offerte
      catena: catene.get(z.catena_id) || '', catena_id: z.catena_id, mio: mie.includes(z.catena_id), valido_dal: z.valido_dal, valido_al: z.valido_al, stato: z.stato,
      inLista: inLista.has(p.id), solito: abituali.has(p.id),
    });
  }
  // prima quello che compri di solito, poi chi fa risparmiare di più, poi il prezzo più basso
  const ordina = (l) => l.sort((a, b) => Number(b.solito) - Number(a.solito) || (b.risparmio || 0) - (a.risparmio || 0) || a.prezzo - b.prezzo);
  ordina(offerte); inArrivo.sort((a, b) => (a.valido_dal || '').localeCompare(b.valido_dal || '') || (b.risparmio || 0) - (a.risparmio || 0));
  // le categorie, solo quelle in cui c'è almeno un'offerta, nell'ordine della spesa
  const categorie = (l) => ORDINE_CATEGORIE.map((k) => ({ categoria: k, nome: nomeCategoria(k), n: l.filter((o) => o.categoria === k).length })).filter((c) => c.n);
  const reparti = REPARTI.map((r) => ({ reparto: r, n: offerte.filter((o) => o.reparto === r).length })).filter((r) => r.n);
  return { data, offerte, inArrivo, reparti, categorie: categorie(offerte), categorieInArrivo: categorie(inArrivo), zona: { supermercati: ammessi.size, ovunque, casa: !!casa?.lat, raggio } };
}
app.get('/api/offerte', async (req) => offerteDi(req));
const contaOfferte = (req) => { try { return offerteDi(req).offerte.length; } catch { return 0; } };
// i supermercati nel raggio d'azione della famiglia (dai negozi vicino a casa)
function catenePerRaggio(req) {
  const casa = imp(req).casa; const raggio = req.famiglia?.raggio || 10; const vicine = new Set();
  if (!casa?.lat) return vicine;
  for (const n of db.prepare('SELECT catena_id, lat, lng FROM negozi WHERE attivo = 1 AND lat IS NOT NULL').all()) if (mappe.distanzaKm(casa, n) <= raggio) vicine.add(n.catena_id);
  return vicine;
}
// un'offerta altrove vale la pena solo se costa almeno il 20% in meno e si risparmia almeno 1 euro (sulle confezioni che servono)
const OFFERTA_ALTROVE = { quota: 0.8, euro: 1 };
// Un prodotto MIGLIORE allo stesso prezzo (o meno) al kg/l/pz, tra i tuoi supermercati e quelli del raggio:
// guadagna bio o italiano senza perdere niente, oppure ha un punteggio di qualità chiaramente più alto (+10).
const PAROLE_QUALITA = (q) => giudizio(q)?.parola || null;
function miglioreDi(x, z, { prezzi, mie, vicine, catene }) {
  if (!z) return null;
  const cur = db.prepare('SELECT * FROM prodotti WHERE id = ?').get(x.prodotto_id); if (!cur || !confrontabile(cur)) return null;
  const qCur = punteggio(cur, voto(cur.id));
  const cand = [];
  for (const p of db.prepare('SELECT * FROM prodotti WHERE voce_id = ? AND id != ?').all(cur.voce_id, cur.id)) {
    if (!confrontabile(p) || !!p.sfuso !== !!cur.sfuso) continue;
    if ((cur.bio && !p.bio) || (cur.origine === 'italia' && p.origine !== 'italia')) continue; // mai un passo indietro
    const guadagnaBio = !cur.bio && !!p.bio; const guadagnaIta = cur.origine !== 'italia' && p.origine === 'italia';
    const q = punteggio(p, voto(p.id));
    if (q != null && qCur != null && q < qCur - 5) continue; // bio o italiano sì, ma non molto peggiore per il resto
    const qualitaMeglio = q != null && (qCur == null ? q >= 55 : q >= qCur + 10);
    if (!guadagnaBio && !guadagnaIta && !qualitaMeglio) continue;
    let best = null;
    for (const k of prezzi.values()) if (k.prodotto_id === p.id && (mie.has(k.catena_id) || vicine.has(k.catena_id)) && k.unitario <= z.unitario + 1e-9
      && (!best || k.unitario < best.unitario || (k.unitario === best.unitario && mie.has(k.catena_id) && !mie.has(best.catena_id)))) best = k;
    if (best) cand.push({ p, k: best, q, guadagnaBio, guadagnaIta, qualitaMeglio, rango: (guadagnaBio ? 2 : 0) + (guadagnaIta ? 1 : 0) });
  }
  cand.sort((a, b2) => b2.rango - a.rango || (b2.q ?? 0) - (a.q ?? 0) || a.k.unitario - b2.k.unitario);
  const c = cand[0]; if (!c) return null;
  const n = c.p.sfuso ? 1 : Math.max(1, Math.ceil(x.quantita / c.p.quantita - 1e-6));
  const perche = [];
  if (c.guadagnaBio && c.guadagnaIta) perche.push('è bio e italiano'); else if (c.guadagnaBio) perche.push('è bio'); else if (c.guadagnaIta) perche.push('è italiano');
  // la qualità si dice solo se si può confrontare (con il prodotto di adesso), o se è l'unico motivo
  if (c.qualitaMeglio && PAROLE_QUALITA(c.q)) {
    if (qCur != null) perche.push(`qualità «${PAROLE_QUALITA(c.q)}»${PAROLE_QUALITA(qCur) !== PAROLE_QUALITA(c.q) ? ` invece di «${PAROLE_QUALITA(qCur)}»` : ` (${c.q} punti su 100 invece di ${qCur})`}`);
    else if (!perche.length) perche.push(`qualità «${PAROLE_QUALITA(c.q)}»`);
  }
  return { prodotto_id: c.p.id, nome: c.p.nome, foto: c.p.foto || '', catena_id: c.k.catena_id, catena: catene.get(c.k.catena_id), mio: mie.has(c.k.catena_id),
    prezzo: c.p.sfuso ? null : Math.round(c.k.prezzo * n * 100) / 100, confezioni: n, unitario: Math.round(c.k.unitario * 100) / 100, unitario_ora: Math.round(z.unitario * 100) / 100,
    uguale: Math.abs(c.k.unitario - z.unitario) < 0.005, perche };
}
// l'offerta migliore per un prodotto in un supermercato del raggio che non è tra i tuoi, rispetto al prezzo z (dei tuoi)
function offertaAltroveDi(pid, z, { prezzi, mie, vicine, catene }, confezioni = 1) {
  if (!z || !mie.has(z.catena_id)) return null;
  const n = Math.max(1, confezioni || 1); let o = null;
  for (const k of prezzi.values()) if (k.prodotto_id === pid && k.offerta && !mie.has(k.catena_id) && vicine.has(k.catena_id) && k.prezzo <= z.prezzo * OFFERTA_ALTROVE.quota && (z.prezzo - k.prezzo) * n >= OFFERTA_ALTROVE.euro - 1e-9 && (!o || k.prezzo < o.prezzo)) o = k;
  return o ? { catena_id: o.catena_id, catena: catene.get(o.catena_id), prezzo: Math.round(o.prezzo * n * 100) / 100, risparmio: Math.round((z.prezzo - o.prezzo) * n * 100) / 100, valido_al: o.valido_al || null, confezioni: n } : null;
}
// 0.59 Il prodotto consigliato tra quelli trovati (con prezzo e formato, confrontati al kg / l / pezzo):
//  - il miglior rapporto qualità-prezzo tra quelli di qualità almeno «buona» (55 su 100);
//  - se uno bio o italiano costa al massimo il 5% in più ed è buono quasi uguale (non più di 5 punti sotto), si consiglia quello;
//  - senza voti di qualità: il più conveniente (mai uno «da evitare»), ma solo se c'è con chi confrontarlo.
function consigliatoTra(righe) {
  const perUnita = new Map(); for (const r of righe) if (r.unitario != null) { if (!perUnita.has(r.unita)) perUnita.set(r.unita, []); perUnita.get(r.unita).push(r); }
  const gruppo = [...perUnita.values()].sort((a, b) => b.length - a.length)[0]; if (!gruppo?.length) return null;
  const eco = gruppo.reduce((m, r) => (r.unitario < m.unitario ? r : m));
  // 0.62: «conveniente» si intende al kg / litro / pezzo (una confezione più grande può costare di più e convenire)
  const alU = gruppo[0].unita === 'kg' ? 'al kg' : gruppo[0].unita === 'l' ? 'al litro' : 'al pezzo';
  const buoni = gruppo.filter((r) => r.qualita != null && r.qualita >= 55);
  if (buoni.length) {
    let best = buoni.reduce((m, r) => (valore(r.qualita, r.unitario) > valore(m.qualita, m.unitario) ? r : m));
    const migliore = buoni.reduce((m, r) => (r.qualita > m.qualita ? r : m));
    const meglioPer = (r) => (r.bio && !best.bio ? 'bio' : r.italiano && !best.italiano ? 'italiano' : null);
    const alt = buoni.filter((r) => r !== best && meglioPer(r) && r.unitario <= best.unitario * 1.05 + 1e-9 && r.qualita >= best.qualita - 5 && !(best.bio && !r.bio) && !(best.italiano && !r.italiano))
      .sort((a, b) => (b.bio - a.bio) || (b.italiano - a.italiano) || a.unitario - b.unitario)[0];
    if (alt) { const m = alt.bio && alt.italiano && !best.bio && !best.italiano ? 'bio e italiano, allo stesso prezzo' : `${meglioPer(alt)}, allo stesso prezzo`; best = alt; return { r: best, motivo: m }; }
    // bio / italiano si dicono quando gli altri non lo sono tutti
    const piu = [best.bio && gruppo.some((r) => !r.bio) ? 'bio' : '', best.italiano && gruppo.some((r) => !r.italiano) ? 'italiano' : ''].filter(Boolean);
    const con = (m) => (piu.length ? `${m} · ${piu.join(' e ')}` : m);
    if (gruppo.length === 1) return { r: best, motivo: con(best.qualita >= 75 ? 'qualità ottima' : 'buona qualità') };
    if (best === eco && best === migliore) return { r: best, motivo: con(`il migliore e il più conveniente ${alU}`), toglie: ['economico', 'qualita'] };
    if (best === eco) return { r: best, motivo: con(`il più conveniente ${alU}, di buona qualità`), toglie: ['economico'] };
    if (best === migliore) return { r: best, motivo: con('qualità più alta a un buon prezzo'), toglie: ['qualita'] };
    return { r: best, motivo: con('miglior rapporto qualità-prezzo') };
  }
  if (gruppo.length < 2 || gruppo.some((r) => r.qualita != null && r.qualita >= 55)) return null;
  const ok = gruppo.filter((r) => r.qualita == null || r.qualita >= 35); if (!ok.length) return null;
  const e = ok.reduce((m, r) => (r.unitario < m.unitario ? r : m));
  return { r: e, motivo: `il più conveniente ${alU}`, toglie: ['economico'] };
}
// 0.67 I miei preferiti: i prodotti che la famiglia compra (spese chiuse, preferiti, scelte in lista) che sono buoni
// (almeno 55 su 100) e a buon prezzo (rapporto qualità-prezzo vicino al migliore della stessa cosa), divisi per il
// supermercato dove costano meno tra i tuoi. Così si vede quale supermercato ha più prodotti buoni a buon prezzo.
app.get('/api/miei-preferiti', async (req) => {
  const conta = abitualiDi(req);
  const prezzi = [...prezziValidi(db, oggi(), imp(req)).values()];
  const mie = new Set(mieCatene(req) || []); const vicine = catenePerRaggio(req);
  const catene = new Map(db.prepare('SELECT id, nome FROM catene').all().map((c) => [c.id, c.nome]));
  const dove = (pid) => {
    const tutti = prezzi.filter((z) => z.prodotto_id === pid);
    const qui = tutti.filter((z) => mie.has(z.catena_id)); const vic = tutti.filter((z) => vicine.has(z.catena_id));
    const lista = qui.length ? qui : vic.length ? vic : tutti;
    return lista.sort((a, b) => a.unitario - b.unitario || a.prezzo - b.prezzo)[0] || null;
  };
  const prodotto = db.prepare('SELECT p.*, v.nome voce, v.unita, v.pezzo, v.reparto FROM prodotti p JOIN voci v ON v.id = p.voce_id WHERE p.id = ?');
  const dellaVoce = db.prepare('SELECT p.*, v.nome voce, v.unita, v.pezzo, v.reparto FROM prodotti p JOIN voci v ON v.id = p.voce_id WHERE p.voce_id = ?');
  const gruppi = new Map(); const visteVoci = new Map();
  for (const [pid, volte] of conta) {
    const p = prodotto.get(pid); if (!p) continue;
    const q = punteggio(p, voto(p.id)); if (q == null || q < 55) continue;
    const z = dove(p.id); if (!z) continue;
    // la stessa cosa (voce): i prodotti con prezzo, per sapere se questo è a buon prezzo e se è la Scelta saggia
    if (!visteVoci.has(p.voce_id)) {
      const cand = dellaVoce.all(p.voce_id).filter((o) => confrontabile(o)).map((o) => { const zz = dove(o.id); return zz ? { id: o.id, unitario: zz.unitario, unita: o.unita, qualita: punteggio(o, voto(o.id)), bio: !!o.bio, italiano: o.origine === 'italia' } : null; }).filter(Boolean);
      const vals = cand.map((c) => valore(c.qualita, c.unitario)).filter((x) => x != null);
      visteVoci.set(p.voce_id, { meglio: vals.length ? Math.max(...vals) : null, saggia: consigliatoTra(cand)?.r.id ?? null });
    }
    const vv = visteVoci.get(p.voce_id); const val = confrontabile(p) ? valore(q, z.unitario) : null;
    if (vv.meglio != null && val != null && val < vv.meglio * 0.85) continue; // buono, ma c'è di meglio per quel che costa
    const g = gruppi.get(z.catena_id) || []; gruppi.set(z.catena_id, g);
    g.push({ id: p.id, nome: p.nome, voce: p.voce, foto: p.foto || '', qualita: q, giudizio: giudizio(q), prezzo: z.prezzo, unitario: Math.round(z.unitario * 100) / 100, offerta: !!z.offerta,
      unita: p.unita, pezzo: p.pezzo || '', formato: { quantita: p.sfuso ? null : p.quantita, unita: p.unita, pezzi: p.pezzi || null, pezzo: p.pezzo || '', sfuso: !!p.sfuso },
      saggia: vv.saggia === p.id, bio: !!p.bio, italiano: p.origine === 'italia', volte });
  }
  const out = [...gruppi].map(([cid, prodotti]) => ({ catena: catene.get(cid), mio: mie.has(cid), prodotti: prodotti.sort((a, b) => b.volte - a.volte || b.qualita - a.qualita),
    media: Math.round(prodotti.reduce((t, x) => t + x.qualita, 0) / prodotti.length) }))
    .sort((a, b) => b.prodotti.length - a.prodotti.length || b.media - a.media);
  return { catene: out, migliore: out[0]?.catena || null, totale: out.reduce((t, c) => t + c.prodotti.length, 0) };
});
// Parole generiche e i nomi specifici che comprendono (radici, senza accenti): chi scrive «formaggio» trova anche il grana
const SINONIMI_CERCA = {
  formagg: ['grana', 'parmigian', 'pecorin', 'mozzarel', 'ricott', 'stracchin', 'gorgonzol', 'scamorz', 'provol', 'asiag', 'fontin', 'emmental', 'taleggi', 'caciocaval', 'caciott', 'mascarpon', 'crescenz', 'montasi', 'feta', 'brie', 'camembert', 'philadelphi', 'robiol', 'squacquer', 'burrat', 'edamer', 'gouda', 'groviera', 'sottilett', 'quartirol', 'primosale', 'casatell'],
  salum: ['prosciutt', 'salam', 'mortadel', 'bresaol', 'speck', 'pancett', 'copp', 'culatel', 'lardo', 'wurstel', 'cotechin', 'zampon'],
  affettat: ['prosciutt', 'salam', 'mortadel', 'bresaol', 'speck', 'pancett', 'copp', 'culatel', 'tacchin'],
  past: ['spaghett', 'penn', 'fusill', 'rigaton', 'linguin', 'farfall', 'tagliatel', 'maccheron', 'orecchiett', 'paccher', 'tortiglion', 'sedanin', 'bucatin', 'trofi', 'ditalin', 'conchigli', 'tortellin', 'ravioli', 'lasagn', 'gnocch', 'fettuccin', 'pappardel', 'vermicel', 'casarecc', 'strozzapret'],
  pesc: ['salmon', 'merluzz', 'tonn', 'orat', 'branzin', 'sgombr', 'sardin', 'alic', 'acciug', 'gamber', 'calamar', 'polp', 'vongol', 'cozz', 'baccal', 'nasell', 'platess', 'trot', 'seppi', 'totan'],
  carn: ['poll', 'tacchin', 'manz', 'maial', 'vitell', 'salsicc', 'hamburg', 'macinat', 'bistecc', 'agnell', 'conigli', 'arrost', 'scaloppin', 'spezzatin', 'cotolett', 'lonz', 'braciol', 'costin'],
  frutt: ['mel', 'per', 'banan', 'aranc', 'limon', 'mandarin', 'clementin', 'kiwi', 'uva', 'fragol', 'pesch', 'albicocc', 'ciliegi', 'prugn', 'susin', 'cach', 'melon', 'anguri', 'ananas', 'fich', 'pompelm', 'mirtill', 'lampon'],
  verdur: ['patat', 'cipoll', 'carot', 'zucchin', 'zucc', 'pomodor', 'insalat', 'lattug', 'radicchi', 'spinac', 'bietol', 'cavol', 'broccol', 'finocch', 'sedan', 'peperon', 'melanzan', 'cetriol', 'fagiolin', 'pisell', 'porr', 'asparag', 'carciof', 'funghi', 'rucol', 'verz'],
  ortagg: ['patat', 'cipoll', 'carot', 'zucchin', 'pomodor', 'insalat', 'spinac', 'cavol', 'broccol', 'finocch', 'peperon', 'melanzan', 'cetriol'],
  legum: ['fagiol', 'ceci', 'lenticch', 'pisell', 'fave', 'soia', 'lupin', 'cicerch'],
  bibit: ['cola', 'aranciat', 'gassos', 'chinott', 'tonic', 'limonat', 'the', 'te', 'energy', 'sprite', 'fanta'],
  dolc: ['biscott', 'merendin', 'cioccolat', 'torta', 'croissant', 'brioch', 'wafer', 'budin', 'crostat', 'plumcake', 'panettone', 'pandoro', 'caramell'],
  detersiv: ['ammorbident', 'candeggin', 'sgrassator', 'lavastovigl', 'lavatric', 'piatti', 'pavimenti', 'anticalcar', 'igienizzant', 'bucato'],
  surgelat: ['gelat', 'congelat', 'bastoncin'],
};
app.get('/api/suggerisci', async (req) => {
  const parole = parolaCerca(req.query.q).split(/\s+/).filter((w) => w.length >= 2 && !VUOTE_CERCA.has(w)).slice(0, 6);
  if (!parole.length) return [];
  // 0.72: ognuno scrive a modo suo. Una parola trova anche il plurale e il femminile («grattugiato» → «grattugiata»),
  // un errore di battitura («grattuggiato») e i nomi specifici di una parola generica («formaggio» → grana, parmigiano…)
  const radiceC = (w) => (w.length > 4 ? w.replace(/h?[aeio]$/, '') : w);
  const quasiUguali = (a, b) => { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
    return d + (a.length - i) + (b.length - j) <= 1; };
  const generiche = Object.entries(SINONIMI_CERCA);
  const specifiche = (w) => { const r = radiceC(w); const g = generiche.find(([k]) => r.startsWith(k) || (r.length >= 5 && k.startsWith(r))); return g ? g[1] : []; };
  const trova = (w, ts, t) => { const r = radiceC(w); const s = specifiche(w);
    const c4 = w.length === 4 ? w.replace(/[aeio]$/, '') : '';
    // 0.81: con una radice corta (zucc, latt) solo parole di lunghezza simile: zucca/zucche sì, zuccheri no; latte sì, lattuga no
    return ts.some((x) => x.startsWith(w) || (r.length >= 5 && x.startsWith(r)) || (r.length === 4 && x.startsWith(r) && x.length <= 6) || (c4 && x.length <= 5 && x.replace(/[aeio]$/, '') === c4)
      || (w.length >= 6 && (quasiUguali(x, w) || quasiUguali(radiceC(x), r))) || s.some((y) => x.startsWith(y)))
      || (r.length >= 5 && t.includes(r)); }; // 0.81: dentro un'altra parola solo se lunga («zucca» non è in «zuccheri»)
  const quanteParole = (testo) => { const t = parolaCerca(testo); const ts = t.split(/\s+/).filter(Boolean); return parole.filter((w) => trova(w, ts, t)).length; };
  const tutteLeParole = (testo) => quanteParole(testo) === parole.length;
  const abituali = abitualiDi(req); const mie = new Set(mieCatene(req) || []);
  const prezzi = prezziValidi(db, oggi(), imp(req)); const catene = new Map(db.prepare('SELECT id, nome FROM catene').all().map((c) => [c.id, c.nome]));
  const tuttiProdotti = db.prepare("SELECT p.*, v.nome voce, v.unita, v.pezzo, v.reparto FROM prodotti p JOIN voci v ON v.id = p.voce_id").all();
  const testoP = (p) => `${p.nome} ${p.marca} ${p.voce} ${p.nome_scontrino || ''}`;
  let prodotti = tuttiProdotti.filter((p) => tutteLeParole(testoP(p)));
  // 0.72: se con tutte le parole non c'è niente con un prezzo, bastano metà delle parole («formaggio duro grattugiato»)
  if (parole.length > 1) {
    const conPrezzo = new Set([...prezzi.values()].map((z) => z.prodotto_id));
    if (!prodotti.some((p) => conPrezzo.has(p.id))) { const min = Math.ceil(parole.length / 2); prodotti = tuttiProdotti.filter((p) => quanteParole(testoP(p)) >= min); }
  }
  // il prezzo da mostrare: il più basso tra i tuoi supermercati; se lì non c'è, il più basso nel raggio; se no, il più basso che c'è
  const vicine = catenePerRaggio(req);
  const livello = (cid) => (mie.has(cid) ? 2 : vicine.has(cid) ? 1 : 0);
  const migliorPrezzo = (pid) => { let b = null; for (const z of prezzi.values()) if (z.prodotto_id === pid && (!b || livello(z.catena_id) > livello(b.catena_id) || (livello(z.catena_id) === livello(b.catena_id) && z.prezzo < b.prezzo))) b = z; return b; };
  // e, se c'è, l'offerta in un altro supermercato del raggio che fa davvero risparmiare
  const offertaAltrove = (pid, z) => offertaAltroveDi(pid, z, { prezzi, mie, vicine, catene });
  // 0.53: per scegliere davvero servono, oltre al prezzo, il formato, il prezzo al kg / l / pezzo e la qualità
  const righe = prodotti.map((p) => { const z = migliorPrezzo(p.id); const q = punteggio(p, voto(p.id)); const conFormato = !!p.sfuso || p.quantita > 0;
    return { tipo: abituali.has(p.id) ? 'solito' : 'prodotto', prodotto_id: p.id, voce_id: p.voce_id, nome: p.nome, voce: p.voce, foto: p.foto,
    quantita: p.sfuso ? 1 : p.quantita || 1, sfuso: !!p.sfuso, volte: abituali.get(p.id) || 0, prezzo: z?.prezzo ?? null, catena: z ? catene.get(z.catena_id) : null, offerta: !!z?.offerta,
    mio: !!z && mie.has(z.catena_id), altrove: offertaAltrove(p.id, z),
    formato: conFormato ? { quantita: p.sfuso ? null : p.quantita, unita: p.unita, pezzi: p.pezzi || null, pezzo: p.pezzo || '', sfuso: !!p.sfuso } : null,
    unitario: z && conFormato ? Math.round(z.unitario * 100) / 100 : null, unita: p.unita, pezzo: p.pezzo || '',
    qualita: q, bio: !!p.bio, italiano: p.origine === 'italia', marca: p.marca || '' }; })
    // 0.59: nei risultati solo i prodotti con un prezzo (senza prezzo non aiutano a scegliere); gli altri si trovano con «Qualsiasi»
    .filter((r) => r.prezzo != null)
    // prima quello che compri di solito, poi chi si può confrontare (prezzo e formato) dal più conveniente al kg/l/pz, poi gli altri
    .sort((a, b) => b.volte - a.volte || (b.unitario != null) - (a.unitario != null) || (a.unitario != null && b.unitario != null && a.unita === b.unita ? a.unitario - b.unitario : 0)
      || (b.prezzo != null) - (a.prezzo != null) || a.nome.length - b.nome.length).slice(0, 10);
  // i distintivi, solo tra prodotti che si confrontano (stessa unità, almeno due con prezzo e formato)
  for (const u of ['kg', 'l', 'pz']) {
    const conf = righe.filter((r) => r.unitario != null && r.unita === u); if (conf.length < 2) continue;
    const eco = conf.reduce((m, r) => (r.unitario < m.unitario ? r : m)); eco.distintivi = [...(eco.distintivi || []), 'economico'];
    const conQ = conf.filter((r) => r.qualita != null);
    if (conQ.length >= 2) { const top = conQ.reduce((m, r) => (r.qualita > m.qualita ? r : m)); if (top !== eco) top.distintivi = [...(top.distintivi || []), 'qualita']; }
  }
  // 0.59 «Consigliato»: UN prodotto da prendere, con il motivo
  const cons = consigliatoTra(righe); if (cons) { cons.r.consigliato = cons.motivo; cons.r.distintivi = (cons.r.distintivi || []).filter((d) => !(cons.toglie || []).includes(d)); if (!cons.r.volte) { righe.splice(righe.indexOf(cons.r), 1); righe.splice(righe.filter((r) => r.volte > 0).length, 0, cons.r); } } // subito dopo quelli che compri di solito
  // le voci (es. «Mandarini»: qualsiasi, scegli dopo quale). 0.59: una sola tra quelle simili («Fresh mandarin oranges» è
  // la stessa cosa di «Mandarini»): resta quella che comincia con la parola cercata, con più prodotti, dal nome più corto
  const conProdotti = new Map(db.prepare('SELECT voce_id, COUNT(*) n FROM prodotti GROUP BY voce_id').all().map((x) => [x.voce_id, x.n]));
  const parolaVoce = (n) => parolaCerca(n).split(/\s+/).filter((w) => w.length >= 4);
  const simili = (a, b) => parolaVoce(a).some((x) => parolaVoce(b).some((y) => x.slice(0, 6) === y.slice(0, 6)));
  const inizia = (v) => parolaCerca(v.nome).startsWith(parole[0]);
  const voci = [];
  for (const v of db.prepare('SELECT * FROM voci').all().filter((x) => tutteLeParole(x.nome))
    .sort((a, b) => inizia(b) - inizia(a) || (conProdotti.get(b.id) || 0) - (conProdotti.get(a.id) || 0) || a.nome.length - b.nome.length)) {
    if (voci.length >= 2 || voci.some((x) => simili(x.nome, v.nome))) continue;
    voci.push({ tipo: 'voce', voce_id: v.id, nome: v.nome });
  }
  return [...righe, ...voci];
});
// Scheda dal codice a barre: Open Food Facts (archivio libero dei prodotti alimentari). Riempie solo i campi vuoti.
app.post('/api/prodotti/:id/off', async (req) => {
  const p = prodottoCompleto(id(req.params.id)); if (!p) throw new Errore('Prodotto non trovato', 404);
  if (!p.ean) throw new Errore('Serve il codice a barre del prodotto');
  const o = await off.cerca(p.ean);
  if (!o) throw new Errore('Prodotto non trovato su Open Food Facts', 404);
  if (o.errore) throw new Errore(o.errore, 502);
  const vuoto = (k) => !String(p[k] ?? '').trim();
  const formatoOk = !p.sfuso && !(p.quantita > 0) && o.formato && o.formato.unita === p.unita;
  const nuovi = {
    descrizione: vuoto('descrizione') ? o.descrizione : p.descrizione, ingredienti: vuoto('ingredienti') ? o.ingredienti : p.ingredienti,
    marca: vuoto('marca') && p.tipo === 'marca' ? o.marca : p.marca, nutriscore: vuoto('nutriscore') ? o.nutriscore : p.nutriscore,
    nova: p.nova || o.nova, foto: vuoto('foto') ? o.foto : p.foto, provenienza: vuoto('provenienza') ? o.provenienza : p.provenienza,
    produttore: vuoto('produttore') ? o.produttore : p.produttore, bio: p.bio || (o.bio ? 1 : 0), origine: p.origine || o.origine,
    quantita: formatoOk ? o.formato.quantita : p.quantita,
    additivi: p.additivi || (o.additivi ? JSON.stringify(o.additivi) : ''),
    valori: p.valori || o.valori || '', imballaggio: p.imballaggio || o.imballaggio || '',
  };
  db.prepare('UPDATE prodotti SET descrizione = @descrizione, ingredienti = @ingredienti, marca = @marca, nutriscore = @nutriscore, nova = @nova, foto = @foto, provenienza = @provenienza, produttore = @produttore, bio = @bio, origine = @origine, quantita = @quantita, additivi = @additivi, valori = @valori, imballaggio = @imballaggio WHERE id = @id').run({ ...nuovi, id: p.id });
  if (formatoOk) for (const pr of db.prepare('SELECT * FROM prezzi WHERE prodotto_id = ?').all(p.id)) db.prepare('UPDATE prezzi SET unitario = ? WHERE id = ?').run(pr.prezzo / nuovi.quantita, pr.id);
  return prodottoCompleto(p.id);
});
// Codice a barre inquadrato: se il prodotto c'è si apre la sua scheda, altrimenti la proposta da Open Food Facts
// Prodotto trovato su Open Food Facts: si crea da solo, con la voce giusta (o una nuova) e tutta la scheda
// 0.59: la voce nuova prende il nome dalla categoria di Open Food Facts, che spesso è in inglese («Fresh mandarin oranges»):
// prima di crearla il nome si fa dire in italiano («Mandarini») e si guarda se una voce così c'è già.
const senzaMarcaDi = (o) => (t) => String(t || '').replace(new RegExp(o.marca ? o.marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '$^', 'ig'), '').replace(/\d+([.,]\d+)?\s*(kg|g|gr|l|lt|ml|cl)\b.*$/i, '').replace(/\s+/g, ' ').trim();
function voceEsistenteOff(o, voci, prodotti) {
  const senzaMarca = senzaMarcaDi(o);
  for (const c of [o.voceItaliana, o.generico, ...[...(o.categorie || [])].reverse().slice(0, 3), senzaMarca(o.nome)].filter(Boolean)) { const t = trovaVoce(c, voci, prodotti); if (t) return t.voce; }
  return null;
}
function nomeVoceNuovaOff(o) {
  // 0.81: una categoria generica («Carni») non fa da nome: meglio il nome del prodotto senza marca («Petto pollo»)
  const cat0 = (o.categorie || []).at(-1) || ''; const cat = generica(cat0) ? '' : cat0; const gen = generica(o.generico) ? '' : o.generico || '';
  return maiuscola((cat && cat.split(' ').length <= 3 ? cat : gen || cat || senzaMarcaDi(o)(o.nome) || o.nome).slice(0, 60).toLowerCase());
}
async function preparaOff(o) {
  if (!o || o.voceItaliana) return o;
  const voci = db.prepare('SELECT * FROM voci').all(); const prodotti = db.prepare('SELECT id, voce_id, nome, marca, quantita, sfuso FROM prodotti').all();
  if (voceEsistenteOff(o, voci, prodotti)) return o;
  const n = nomeVoceNuovaOff(o); const it = await claude.voceItaliana(n).catch(() => n);
  return { ...o, voceItaliana: it && it !== n ? maiuscola(it) : null };
}
function creaDaOff(ean, o) {
  // c'è già (inserito a mano, da scontrino o da volantino, senza codice)? Si completa quello con il codice e i dati del catalogo
  const qta = o.formato && ['kg', 'l'].includes(o.formato.unita) ? o.formato.quantita : null;
  const gia = trovaCensito(db, { nome: o.nome, marca: o.marca, quantita: qta, soloSenzaEan: true });
  if (gia?.sicuro) { completa(db, gia.id, { ...o, ean }); return gia.id; }
  const voci = db.prepare('SELECT * FROM voci').all(); const prodotti = db.prepare('SELECT id, voce_id, nome, marca, quantita, sfuso FROM prodotti').all();
  let voce = voceEsistenteOff(o, voci, prodotti);
  if (!voce) {
    const nome = o.voceItaliana || nomeVoceNuovaOff(o);
    const g = indovina(nome) || { reparto: o.nonAlimentare ? 'casa' : 'dispensa', unita: o.formato?.unita || 'pz' };
    if (o.nonAlimentare) g.reparto = 'casa';
    // casa: se la confezione dice lavaggi, rotoli o capsule, la voce si confronta a quei pezzi
    const pezzo = o.nonAlimentare && o.formato?.pezzi ? o.formato.pezzi.nome : '';
    const unita = pezzo ? 'pz' : o.formato?.unita && g.unita !== 'pz' ? o.formato.unita : g.unita;
    const c = db.prepare('SELECT * FROM voci WHERE lower(nome) = lower(?)').get(nome);
    voce = c || db.prepare('SELECT * FROM voci WHERE id = ?').get(db.prepare('INSERT INTO voci (nome, reparto, unita, pezzo) VALUES (?, ?, ?, ?)').run(nome, g.reparto, unita, pezzo === 'pezzo' ? '' : pezzo).lastInsertRowid);
  }
  const quantita = voce.unita === 'pz' && o.formato?.pezzi ? o.formato.pezzi.n : o.formato && o.formato.unita === voce.unita ? o.formato.quantita : voce.unita === 'pz' ? 1 : null;
  const d = datiProdotto({ voce_id: voce.id, nome: o.nome.slice(0, 100), tipo: o.marca ? 'marca' : 'senza', marca: o.marca, origine: o.origine, bio: o.bio, quantita, ean, pezzi: voce.unita !== 'pz' && o.formato?.pezzi?.n > 1 ? o.formato.pezzi.n : null,
    descrizione: o.descrizione, ingredienti: o.ingredienti, produttore: o.produttore, provenienza: o.provenienza, foto: o.foto, nutriscore: o.nutriscore, nova: o.nova, additivi: o.additivi ?? '', valori: o.valori || '', imballaggio: o.imballaggio || '' });
  return db.prepare(`INSERT INTO prodotti (voce_id, nome, tipo, marca, catena_id, origine, bio, quantita, pezzi, sfuso, ean, nome_scontrino, descrizione, ingredienti, produttore, provenienza, foto, nutriscore, note, nova, additivi, valori, imballaggio)
    VALUES (@voce_id, @nome, @tipo, @marca, @catena_id, @origine, @bio, @quantita, @pezzi, @sfuso, @ean, @nome_scontrino, @descrizione, @ingredienti, @produttore, @provenienza, @foto, @nutriscore, @note, @nova, @additivi, @valori, @imballaggio)`).run(d).lastInsertRowid;
}
// Catalogo: i prodotti venduti in Italia anche se nessuno li ha ancora comprati
app.get('/api/catalogo', async (req) => {
  const q = testo(req.query.q, 60); if (q.length < 3) return [];
  const gia = db.prepare("SELECT ean FROM prodotti WHERE ean != ''").pluck();
  const presenti = new Set(gia.all());
  return catalogo.cerca(q, 14).filter((x) => !presenti.has(x.ean)).slice(0, 8)
    .map((x) => ({ ean: x.ean, nome: x.nome, marca: x.marca, foto: x.foto, non_alimentare: !!x.nonAlimentare, qualita: punteggio({ ...x, additivi: x.additivi ? JSON.stringify(x.additivi) : '' }) }));
});
// Un prodotto del catalogo diventa un prodotto dell'app (e, se chiesto, va in lista)
app.post('/api/catalogo/:ean/usa', async (req) => {
  const ean = String(req.params.ean || '').replace(/\D/g, '');
  let pid = perEan(db, ean);
  if (!pid) { const c = catalogo.perCodice(ean); if (!c) throw new Errore('Prodotto non trovato nel catalogo', 404); pid = creaDaOff(ean, await preparaOff(c)); }
  if (req.body?.lista) {
    const p = prodottoCompleto(pid);
    const c = db.prepare('SELECT id FROM righe_lista WHERE voce_id = ? AND preso = 0 AND famiglia_id = ?').get(p.voce_id, req.famiglia.id);
    if (c) db.prepare('UPDATE righe_lista SET prodotto_id = ?, scelto = 1 WHERE id = ?').run(pid, c.id);
    else db.prepare('INSERT INTO righe_lista (voce_id, prodotto_id, quantita, qualita, marca, ordine, famiglia_id, scelto) VALUES (?, ?, ?, ?, ?, ?, ?, 1)').run(p.voce_id, pid, p.sfuso ? 1 : (p.quantita || 1), 'qualsiasi', 'qualsiasi', ordine(req), req.famiglia.id);
  }
  return { prodotto_id: pid };
});
app.get('/api/scansiona/:ean', async (req) => {
  const ean = String(req.params.ean || '').replace(/\D/g, '');
  if (ean.length < 8 || ean.length > 14) throw new Errore('Codice a barre non valido');
  const c = perEan(db, ean);
  if (c) return { prodotto_id: c };
  // 0.56: il prodotto può esserci già senza codice a barre (dagli scontrini): se è sicuramente lui gli si aggiunge il codice
  // e la scheda; se è solo probabile si passa dal modulo, che chiede «È questo?»; altrimenti si crea
  const daDati = async (o) => {
    if (o.estero) o = { ...o, nome: await claude.nomeItaliano(o.nome, o.marca).catch(() => o.nome) };
    const f = o.formato && o.formato.unita !== 'pz' ? o.formato.quantita : null;
    const t = trovaCensito(db, { nome: o.nome, marca: o.marca || '', quantita: f, soloSenzaEan: true });
    if (t?.sicuro) { completa(db, t.id, { ...o, ean }); completaValori(t.id, o); return { prodotto_id: t.id, unito: true }; }
    if (t) return { ean, proposta: o, voci: [] };
    return { prodotto_id: creaDaOff(ean, await preparaOff(o)), nuovo: true };
  };
  const dalCatalogo = catalogo.perCodice(ean);
  if (dalCatalogo) return await daDati(dalCatalogo);
  const o = await off.cerca(ean);
  // se Open Food Facts non risponde, si scrive la scheda a mano (non si blocca la persona)
  if (o?.errore) return { ean, proposta: null, voci: [], avviso: 'Open Food Facts non risponde: scrivi tu la scheda, ci vuole un attimo.' };
  if (o) return await daDati(o);
  // voci che compaiono nel nome del prodotto (es. «Crema di nocciole»), per proporre dove metterlo
  const nome = String(o?.nome || '').toLowerCase();
  const voci = o ? db.prepare('SELECT * FROM voci').all().filter((v) => v.nome.toLowerCase().split(/\s+/).filter((w) => w.length > 3).some((w) => nome.includes(w.slice(0, -1)))).slice(0, 5) : [];
  return { ean, proposta: o, voci };
});

// ---------- lista ----------
const lista = (req) => {
  const righe = db.prepare(`SELECT r.*, v.nome voce, v.unita, v.reparto, v.pezzo, p.nome prodotto_scelto, p.foto, p.quantita prodotto_quantita, c.nome catena_marchio FROM righe_lista r JOIN voci v ON v.id = r.voce_id LEFT JOIN prodotti p ON p.id = r.prodotto_id LEFT JOIN catene c ON c.id = p.catena_id WHERE r.famiglia_id = ? ORDER BY r.ordine, r.id`).all(req.famiglia.id);
  if (!righe.length) return righe;
  // 0.55: il voto del prodotto scelto, per il pallino accanto al nome
  const prodRiga = db.prepare('SELECT * FROM prodotti WHERE id = ?');
  for (const r of righe) if (r.prodotto_id) { const p = prodRiga.get(r.prodotto_id); r.voto_prodotto = p ? punteggio({ ...p, voce: r.voce, reparto: r.reparto }, voto(p.id)) : null; }
  // per ogni cosa da prendere: le scelte con i prezzi (più economico, italiano, bio…) da toccare direttamente nella lista
  const prezzi = prezziValidi(db, oggi(), imp(req));
  const catene = new Map(db.prepare('SELECT id, nome FROM catene').all().map((c) => [c.id, c.nome]));
  // il supermercato del prodotto scelto (per la «bolla» accanto al nome): quello dove costa meno tra i tuoi, oppure il marchio
  const mie = new Set(mieCatene(req) || []);
  const supermercatoDi = (x) => {
    if (!x.prodotto_id) return null;
    let best = null;
    for (const z of prezzi.values()) if (z.prodotto_id === x.prodotto_id && (!best || (mie.has(z.catena_id) && !mie.has(best.catena_id)) || (mie.has(z.catena_id) === mie.has(best.catena_id) && z.prezzo < best.prezzo))) best = z;
    if (best) return { catena: catene.get(best.catena_id), prezzo: best.prezzo, uno: best.prezzo };
    if (x.catena_marchio) return { catena: x.catena_marchio, prezzo: null };
    // nessun prezzo valido oggi: il supermercato dove l'abbiamo visto l'ultima volta (senza prezzo, che è vecchio)
    const u = db.prepare('SELECT catena_id FROM prezzi WHERE prodotto_id = ? AND superato_il IS NULL ORDER BY rilevato_il DESC, id DESC').all(x.prodotto_id);
    const z = u.find((k) => mie.has(k.catena_id)) || u[0];
    return z ? { catena: catene.get(z.catena_id), prezzo: null } : null;
  };
  const vicine = catenePerRaggio(req);
  // il prezzo del prodotto nel più conveniente dei tuoi supermercati (base per dire se un'offerta altrove conviene)
  const confezioniDi = (x) => { const pz = db.prepare('SELECT quantita, sfuso FROM prodotti WHERE id = ?').get(x.prodotto_id); return pz?.quantita > 0 && !pz.sfuso ? Math.max(1, Math.ceil(x.quantita / pz.quantita - 1e-6)) : 1; };
  const neiTuoi = (pid) => { let b = null; for (const z of prezzi.values()) if (z.prodotto_id === pid && mie.has(z.catena_id) && (!b || z.prezzo < b.prezzo)) b = z; return b; };
  return righe.map((x) => {
    // la riga va presa in un supermercato preciso (l'offerta scelta dalla lista)
    if (x.catena_id && x.prodotto_id) {
      const z = prezzi.get(`${x.prodotto_id}|${x.catena_id}`); const n = confezioniDi(x);
      const mio = neiTuoi(x.prodotto_id);
      const prima = x.prodotto_prima ? db.prepare('SELECT id, nome FROM prodotti WHERE id = ?').get(x.prodotto_prima) : null;
      return { ...x, opzioni: [], super: { catena: catene.get(x.catena_id), prezzo: z ? Math.round(z.prezzo * n * 100) / 100 : null, uno: z ? z.prezzo : null, confezioni: n, offerta: !!z?.offerta, scelto_qui: true, torna: mio ? catene.get(mio.catena_id) : null, prima: prima || null } };
    }
    if (x.preso) return { ...x, super: supermercatoDi(x) };
    // 0.61 riga generica (si sceglie al supermercato): solo, se c'è, l'offerta di oggi per quella cosa nei tuoi supermercati o vicino
    if (x.libera && !x.prodotto_id) {
      let o = null;
      for (const z of prezzi.values()) if (z.offerta && (mie.has(z.catena_id) || vicine.has(z.catena_id))) {
        const p = prodRiga.get(z.prodotto_id); if (!p || p.voce_id !== x.voce_id) continue;
        if (!o || z.unitario < o.z.unitario) o = { z, p };
      }
      return { ...x, opzioni: [], dove_libera: x.catena_libera === 0 ? 'dove capita' : x.catena_libera ? catene.get(x.catena_libera) || '' : '', offerta_voce: o ? { prodotto_id: o.p.id, nome: o.p.nome, catena: catene.get(o.z.catena_id), prezzo: o.z.prezzo, valido_al: o.z.valido_al || null } : null };
    }
    const opzioni = opzioniDa(analisiVoce({ id: x.voce_id, nome: x.voce, unita: x.unita, reparto: x.reparto }, req, prezzi, catene))
      .map((o) => { const c = costo(o.prodotto, o, x.quantita, x.unita); return { ...o, stima: c?.costo ?? null, confezioni: c?.confezioni ?? null }; });
    const sc = x.prodotto_id ? opzioni.find((o) => o.prodotto?.id === x.prodotto_id && o.catena) : null;
    // la bolla: il prodotto scelto nel più conveniente dei tuoi supermercati (le offerte altrove stanno nel riquadro sotto)
    const mio = x.prodotto_id ? neiTuoi(x.prodotto_id) : null; const n = x.prodotto_id ? confezioniDi(x) : 1;
    // 0.66: «uno» = il prezzo di una confezione (o al kg per lo sfuso), per il cartellino nella lista
    const sup = mio ? { catena: catene.get(mio.catena_id), prezzo: Math.round(mio.prezzo * n * 100) / 100, uno: mio.prezzo, confezioni: n, offerta: !!mio.offerta }
      : sc ? { catena: sc.catena, prezzo: sc.stima ?? sc.prezzo, uno: sc.prezzo ?? null, confezioni: sc.confezioni } : supermercatoDi(x);
    const altrove = x.prodotto_id && x.scelto && !x.offerta_nascosta ? offertaAltroveDi(x.prodotto_id, mio, { prezzi, mie, vicine, catene }, n) : null;
    // se non c'è un'offerta: un prodotto migliore (bio, italiano o di qualità più alta) allo stesso prezzo
    const migliore = !altrove && x.prodotto_id && x.scelto && !x.migliore_nascosto ? miglioreDi(x, mio, { prezzi, mie, vicine, catene }) : null;
    return { ...x, opzioni, super: sup, altrove, migliore };
  });
};
const ordine = (req) => db.prepare('SELECT COALESCE(MAX(ordine), 0) + 1 o FROM righe_lista WHERE famiglia_id = ?').get(req.famiglia.id).o;
const rigaDi = (req, rid) => { const r = db.prepare('SELECT * FROM righe_lista WHERE id = ? AND famiglia_id = ?').get(id(rid), req.famiglia.id); if (!r) throw new Errore('Riga non trovata', 404); return r; };
function datiRiga(b, prima = {}) {
  const v = (k, f) => (b[k] !== undefined ? f(b[k]) : prima[k]);
  return {
    voce_id: v('voce_id', id), prodotto_id: v('prodotto_id', (x) => (x ? id(x) : null)), quantita: v('quantita', (x) => numero(x, { min: 0.01, max: 200, nome: 'La quantità' })) ?? 1,
    qualita: v('qualita', (x) => (QUALITA.includes(x) ? x : 'qualsiasi')) || 'qualsiasi',
    marca: v('marca', (x) => (['qualsiasi', 'marca', 'supermercato'].includes(x) || /^brand:.{1,60}$/.test(x) ? x : 'qualsiasi')) || 'qualsiasi',
    preso: v('preso', (x) => (x ? 1 : 0)) ?? 0,
    scelto: v('scelto', (x) => (x ? 1 : 0)) ?? 0,
  };
}
// abitudini: la scelta fatta su una voce si ricorda per la volta dopo (le zucchine italiane, la passata Mutti…)
const abitudine = (fid, voce_id) => db.prepare('SELECT qualita, marca FROM abitudini WHERE famiglia_id = ? AND voce_id = ?').get(fid, voce_id) || { qualita: 'qualsiasi', marca: 'qualsiasi' };
const ricorda = (fid, voce_id, qualita, marca) => db.prepare(`INSERT INTO abitudini (famiglia_id, voce_id, qualita, marca) VALUES (?, ?, ?, ?)
  ON CONFLICT(famiglia_id, voce_id) DO UPDATE SET qualita = excluded.qualita, marca = excluded.marca`).run(fid, voce_id, qualita, marca);
// se non è stato detto niente, valgono le abitudini
const conAbitudine = (fid, d, b) => { if (!d.voce_id) return d; const a = abitudine(fid, d.voce_id); return { ...d, qualita: b.qualita && b.qualita !== 'qualsiasi' ? d.qualita : a.qualita, marca: b.marca && b.marca !== 'qualsiasi' ? d.marca : a.marca }; };
// 0.84: le cose prese nei giorni passati vanno nello storico (Le mie spese), una spesa per supermercato e giorno
let archiviaSpese = null;
app.get('/api/lista', async (req) => { if (archiviaSpese) await archiviaSpese(req, { soloVecchie: true }).catch((e) => console.error('archivio spese:', e.message)); return lista(req); });
app.post('/api/lista', async (req) => {
  const d = conAbitudine(req.famiglia.id, datiRiga(req.body || {}), req.body || {});
  if (!d.voce_id) throw new Errore('Scegli cosa comprare');
  // chi mette in lista un prodotto preciso (dalla ricerca, dalle offerte, dal codice a barre) ha già scelto: niente «Scegli» da rifare
  db.prepare('INSERT INTO righe_lista (voce_id, prodotto_id, quantita, qualita, marca, ordine, famiglia_id, scelto) VALUES (@voce_id, @prodotto_id, @quantita, @qualita, @marca, @o, @f, @scelto)').run({ ...d, o: ordine(req), f: req.famiglia.id, scelto: d.prodotto_id || d.scelto ? 1 : 0 });
  return lista(req);
});
app.put('/api/lista/:id', async (req) => {
  const r = rigaDi(req, req.params.id);
  // spunta «preso»: risposta immediata, senza ricalcolare tutta la lista
  if (req.query.breve && Object.keys(req.body || {}).every((k) => k === 'preso' || k === 'preso_da')) {
    // 0.84: spuntata nel giro → si sa dove e quando l'hai presa (per lo storico, una spesa per supermercato e giorno)
    const da = req.body.preso && req.body.preso_da ? id(req.body.preso_da) : null;
    db.prepare('UPDATE righe_lista SET preso = ?, preso_da = ?, preso_il = ? WHERE id = ?').run(req.body.preso ? 1 : 0, da, req.body.preso ? oggi() : null, r.id); return { ok: true };
  }
  const b = req.body || {};
  const d = datiRiga(b, r);
  db.prepare('UPDATE righe_lista SET voce_id = @voce_id, prodotto_id = @prodotto_id, quantita = @quantita, qualita = @qualita, marca = @marca, preso = @preso, scelto = @scelto WHERE id = @id').run({ ...d, id: r.id });
  // cambiato prodotto: il supermercato scelto e il «non mi interessa» non valgono più
  if (d.prodotto_id !== r.prodotto_id) db.prepare('UPDATE righe_lista SET catena_id = NULL, offerta_nascosta = 0, migliore_nascosto = 0, prodotto_prima = NULL WHERE id = ?').run(r.id);
  if (b.catena_id !== undefined) {
    const cid = b.catena_id ? id(b.catena_id) : null;
    if (cid && !db.prepare('SELECT 1 FROM catene WHERE id = ?').get(cid)) throw new Errore('Supermercato non trovato', 404);
    db.prepare('UPDATE righe_lista SET catena_id = ? WHERE id = ?').run(cid, r.id);
  }
  if (b.offerta_nascosta !== undefined) db.prepare('UPDATE righe_lista SET offerta_nascosta = ? WHERE id = ?').run(b.offerta_nascosta ? 1 : 0, r.id);
  if (b.migliore_nascosto !== undefined) db.prepare('UPDATE righe_lista SET migliore_nascosto = ? WHERE id = ?').run(b.migliore_nascosto ? 1 : 0, r.id);
  if (req.body?.qualita !== undefined || req.body?.marca !== undefined) ricorda(req.famiglia.id, d.voce_id, d.qualita, d.marca);
  return lista(req);
});
app.delete('/api/lista/:id', async (req) => { db.prepare('DELETE FROM righe_lista WHERE id = ?').run(rigaDi(req, req.params.id).id); return lista(req); });
app.delete('/api/lista', async (req) => { db.prepare(req.query.presi ? 'DELETE FROM righe_lista WHERE preso = 1 AND famiglia_id = ?' : 'DELETE FROM righe_lista WHERE famiglia_id = ?').run(req.famiglia.id); return lista(req); });

// ---------- lista a voce: il telefono trascrive, qui si capisce cosa e quanto ----------
app.post('/api/lista/voce', async (req) => {
  const t = testo(req.body?.testo, 1000); if (!t) throw new Errore('Non ho sentito niente: tocca il microfono e parla');
  const voci = db.prepare('SELECT * FROM voci').all(); const prodotti = db.prepare('SELECT id, voce_id, nome, marca, quantita, sfuso FROM prodotti').all();
  const capito = capisci(t, voci, prodotti, { esatto: req.body?.esatto === true }).map((c) => {
    if (!c.voce_id) {
      // nome mai sentito: forse è un prodotto preciso del catalogo ("pan di stelle", "nutella").
      // 0.78: solo se non è una cosa comune che l'app riconosce (zucca, petto di pollo: si crea la voce generica),
      // e con parole uguali, non solo l'inizio («zucca» non è la marca «Zuccato»): la prima parola detta è la prima del nome o la marca
      const r = radici(c.nome);
      const trovato = indovina(c.nome) ? null : catalogo.cerca(c.nome, 8).find((x) => {
        const n = radici(x.nome); const m = radici(x.marca || ''); const t = [...n, ...m];
        return r.length && r.every((w) => t.includes(w)) && (n[0] === r[0] || m.includes(r[0]));
      });
      return trovato ? { ...c, catalogo: { ean: trovato.ean, nome: trovato.nome, marca: trovato.marca, foto: trovato.foto } } : c;
    }
    const a = abitudine(req.famiglia.id, c.voce_id);
    return { ...c, qualita: c.qualita !== 'qualsiasi' ? c.qualita : a.qualita, marca: c.marca !== 'qualsiasi' ? c.marca : a.marca };
  });
  return { testo: t, capito };
});
app.post('/api/lista/voce/conferma', async (req) => {
  const righe = Array.isArray(req.body?.righe) ? req.body.righe.slice(0, 40) : [];
  if (!righe.length) throw new Errore('Non c\'è niente da mettere in lista');
  db.transaction(() => {
    for (const r of righe) {
      let voce_id = r.voce_id ? id(r.voce_id) : null; let detto = null;
      // detto un prodotto preciso del catalogo: si crea il prodotto (con la sua voce) e si propone come scelta
      const ean = String(r.catalogo?.ean || '').replace(/\D/g, '');
      if (!voce_id && ean) {
        { const e = perEan(db, ean); detto = e ? db.prepare('SELECT id, voce_id FROM prodotti WHERE id = ?').get(e) : null; }
        if (!detto) { const o = catalogo.perCodice(ean); if (o) { const pid = creaDaOff(ean, o); detto = { id: pid, voce_id: db.prepare('SELECT voce_id FROM prodotti WHERE id = ?').get(pid).voce_id }; } }
        if (detto) voce_id = detto.voce_id;
      }
      if (!voce_id) {
        const nome = testo(r.nuova?.nome || r.nome, 60); if (!nome) continue;
        const c = db.prepare('SELECT id FROM voci WHERE lower(nome) = lower(?)').get(nome);
        voce_id = c ? c.id : db.prepare('INSERT INTO voci (nome, reparto, unita) VALUES (?, ?, ?)').run(nome[0].toUpperCase() + nome.slice(1), REPARTI.includes(r.nuova?.reparto) ? r.nuova.reparto : 'dispensa', UNITA.includes(r.nuova?.unita) ? r.nuova.unita : 'pz').lastInsertRowid;
      }
      const d = datiRiga({ voce_id, quantita: r.quantita, qualita: r.qualita, marca: r.marca });
      const c = db.prepare('SELECT * FROM righe_lista WHERE voce_id = ? AND preso = 0 AND famiglia_id = ?').get(voce_id, req.famiglia.id);
      if (c) { if (r.detta) db.prepare('UPDATE righe_lista SET quantita = ? WHERE id = ?').run(d.quantita, c.id); if (detto) db.prepare('UPDATE righe_lista SET prodotto_id = ?, scelto = 0 WHERE id = ?').run(detto.id, c.id); continue; }
      db.prepare('INSERT INTO righe_lista (voce_id, prodotto_id, quantita, qualita, marca, ordine, famiglia_id) VALUES (@voce_id, @p, @quantita, @qualita, @marca, @o, @f)').run({ ...d, p: detto?.id ?? null, o: ordine(req), f: req.famiglia.id });
    }
  })();
  return lista(req);
});
// ---------- avvisi: un preferito in offerta, in uno dei supermercati della famiglia ----------
async function avvisaOfferta(p, c, prezzo) {
  const voce = db.prepare('SELECT * FROM voci WHERE id = ?').get(p.voce_id);
  const famiglie = new Map();
  for (const r of db.prepare("SELECT utente FROM preferiti WHERE prodotto_id = ? AND utente LIKE 'f%'").all(p.id)) famiglie.set(Number(r.utente.slice(1)), `Il tuo preferito «${p.nome}» è in offerta da ${c.nome} a ${euroTesto(prezzo)}.`);
  for (const r of db.prepare(`SELECT DISTINCT fc.famiglia_id FROM famiglia_catene fc WHERE fc.catena_id = ? AND (
      EXISTS (SELECT 1 FROM righe_lista l WHERE l.famiglia_id = fc.famiglia_id AND l.voce_id = ? AND l.preso = 0)
      OR EXISTS (SELECT 1 FROM abitudini a WHERE a.famiglia_id = fc.famiglia_id AND a.voce_id = ?))`).all(c.id, p.voce_id, p.voce_id)) {
    if (!famiglie.has(r.famiglia_id)) famiglie.set(r.famiglia_id, `${voce.nome}: «${p.nome}» è in offerta da ${c.nome} a ${euroTesto(prezzo)}.`);
  }
  for (const [fid, testo] of famiglie) {
    if (db.prepare("SELECT 1 FROM avvisi WHERE famiglia_id = ? AND link = ? AND creato_il > datetime('now', '-1 day')").get(fid, `#prodotto/${p.id}`)) continue;
    db.prepare('INSERT INTO avvisi (famiglia_id, testo, link) VALUES (?, ?, ?)').run(fid, testo, `#prodotto/${p.id}`);
    if (process.env.WHATSAPP_SERVIZIO) for (const u of db.prepare('SELECT telefono FROM utenti WHERE famiglia_id = ?').all(fid)) await inviaWhatsapp(u.telefono, `${testo} Apri spesasaggia.it per vederlo.`);
  }
}
const euroTesto = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;
app.get('/api/avvisi', async (req) => db.prepare('SELECT * FROM avvisi WHERE famiglia_id = ? AND letto = 0 ORDER BY id DESC LIMIT 10').all(req.famiglia.id));
app.put('/api/avvisi/:id', async (req) => { db.prepare('UPDATE avvisi SET letto = 1 WHERE id = ? AND famiglia_id = ?').run(id(req.params.id), req.famiglia.id); return { ok: true }; });

// ---------- la scelta di una riga: le proposte con i prezzi, tutti i prodotti, il catalogo ----------
const prossimaDaScegliere = (req, r) => {
  const altre = db.prepare('SELECT r.id, r.ordine, v.nome voce FROM righe_lista r JOIN voci v ON v.id = r.voce_id WHERE r.famiglia_id = ? AND r.preso = 0 AND r.scelto = 0 AND r.id != ? ORDER BY r.ordine, r.id').all(req.famiglia.id, r.id);
  const dopo = altre.find((x) => x.ordine > r.ordine || (x.ordine === r.ordine && x.id > r.id)) || altre[0] || null;
  return { prossima: dopo ? { id: dopo.id, voce: dopo.voce } : null, restano: altre.length };
};
app.get('/api/lista/:id/scelte', async (req) => {
  const r = rigaDi(req, req.params.id);
  const v = db.prepare('SELECT * FROM voci WHERE id = ?').get(r.voce_id);
  const s = imp(req); const tuttiPrezzi = prezziValidi(db, oggi(), s);
  const catene = new Map(db.prepare('SELECT id, nome FROM catene').all().map((c) => [c.id, c.nome]));
  // le proposte guardano i miei supermercati; se lì nessuno ha ancora un prezzo per questa cosa, si guarda ovunque
  const mie = mieCatene(req) || [];
  const prezziMiei = new Map([...tuttiPrezzi].filter(([, x]) => mie.includes(x.catena_id)));
  const fuoriDaiMiei = mie.length > 0 && ![...prezziMiei.values()].some((x) => db.prepare('SELECT 1 FROM prodotti WHERE id = ? AND voce_id = ?').get(x.prodotto_id, v.id));
  const prezzi = mie.length && !fuoriDaiMiei ? prezziMiei : tuttiPrezzi;
  const a = analisiVoce(v, req, prezzi, catene);
  const prodotti = db.prepare('SELECT p.*, c.nome catena FROM prodotti p LEFT JOIN catene c ON c.id = p.catena_id WHERE p.voce_id = ?').all(v.id);
  const schede = prodotti.map((p) => {
    const pz = [...tuttiPrezzi.values()].filter((x) => x.prodotto_id === p.id).sort((x, y) => (mie.includes(y.catena_id) - mie.includes(x.catena_id)) || x.unitario - y.unitario)
      .map((x) => ({ catena: catene.get(x.catena_id), catena_id: x.catena_id, prezzo: x.prezzo, unitario: x.unitario, offerta: !!x.offerta, stato: x.stato, rilevato_il: x.rilevato_il }));
    const q = punteggio({ ...p, voce: v.nome, reparto: v.reparto }, voto(p.id)); // 0.62: con voce e reparto, come nella ricerca (frutta e verdura)
    const etichette = ETICHETTE.filter(([k]) => k !== 'offerta' && a[k]?.prodotto?.id === p.id && a[k]?.catena).map(([, t]) => t);
    if (pz.some((x) => x.offerta)) etichette.push('In offerta');
    const c = pz[0] ? costo(p, pz[0], r.quantita, r.unita, true) : null;
    return { prodotto: pubblico(p), qualita: q, giudizio: giudizio(q), prezzi: pz, etichette, stima: c?.costo ?? null, confezioni: c?.confezioni ?? null, detto: p.id === r.prodotto_id && !r.scelto, scelto: p.id === r.prodotto_id && !!r.scelto };
  }).sort((x, y) => (y.detto - x.detto) || (y.etichette.length > 0) - (x.etichette.length > 0) || (y.prezzi.length > 0) - (x.prezzi.length > 0) || ((x.prezzi[0]?.unitario ?? 1e9) - (y.prezzi[0]?.unitario ?? 1e9)));
  const presenti = new Set(prodotti.map((p) => p.ean).filter(Boolean));
  const dalCatalogo = catalogo.cerca(v.nome, 14).filter((x) => !presenti.has(x.ean)).slice(0, 6)
    .map((x) => ({ ean: x.ean, nome: x.nome, marca: x.marca, foto: x.foto, formato: x.formato, non_alimentare: !!x.nonAlimentare, qualita: punteggio({ ...x, additivi: x.additivi ? JSON.stringify(x.additivi) : '' }) }));
  const scelta = r.scelto ? (r.prodotto_id ? schede.find((x) => x.prodotto.id === r.prodotto_id) || null : r.libera ? { libera: true } : { automatica: true }) : null;
  // nei miei supermercati: per ognuno il prodotto che costa meno, con le sue caratteristiche, così si vede dove conviene andare
  const miei = mie.map((cid) => {
    const meglio = schede.filter((x) => x.prodotto.confrontabile !== false).flatMap((x) => x.prezzi.filter((z) => z.catena_id === cid).map((z) => ({ x, z }))).sort((a, b) => a.z.unitario - b.z.unitario)[0] || null;
    return { catena_id: cid, catena: catene.get(cid), prodotto: meglio ? meglio.x.prodotto : null, prezzo: meglio?.z.prezzo ?? null, unitario: meglio?.z.unitario ?? null, offerta: !!meglio?.z.offerta, qualita: meglio?.x.qualita ?? null, stima: meglio ? (costo(meglio.x.prodotto, meglio.z, r.quantita, r.unita, true)?.costo ?? null) : null };
  }).sort((a, b) => (a.unitario ?? 1e9) - (b.unitario ?? 1e9));
  for (const x of schede) for (const z of x.prezzi) z.mio = mie.includes(z.catena_id);
  const proposte = propostePer(req, r, v, schede, catene, mie);
  return { riga: { ...r, voce: v.nome, unita: v.unita, reparto: v.reparto, pezzo: v.pezzo || '' }, prodotti: schede, catalogo: dalCatalogo, scelta, miei, fuoriDaiMiei, ...proposte, ...prossimaDaScegliere(req, r) };
});
// Per una cosa della lista: la proposta principale (quello che hai scelto, o il più conveniente del tipo che vuoi) e le
// alternative per tipo — il più votato, il più economico, il migliore, il miglior rapporto qualità-prezzo, il bio e
// l'italiano al prezzo più vicino — ognuna nel supermercato dove costa meno tra i tuoi e quelli nel tuo raggio.
function propostePer(req, r, v, schede, catene, mie) {
  const f = req.famiglia; const casa = imp(req).casa; const raggio = f?.raggio || 10;
  const negozi = db.prepare('SELECT catena_id, lat, lng, indirizzo, citta, nome FROM negozi WHERE attivo = 1 AND lat IS NOT NULL').all();
  const vicino = (cid) => (casa?.lat ? negozi.filter((n) => n.catena_id === cid).map((n) => ({ ...n, aria: mappe.distanzaKm(casa, n) })).sort((a, b) => a.aria - b.aria)[0] || null : null);
  // dove guardare: i miei supermercati e quelli con un negozio entro il raggio da casa
  const ammessi = new Set(mie);
  if (casa?.lat) for (const n of negozi) if (mappe.distanzaKm(casa, n) <= raggio) ammessi.add(n.catena_id);
  for (const cid of db.prepare("SELECT id FROM catene WHERE tipo = 'fornitore'").pluck().all()) ammessi.add(cid);
  const ovunque = !ammessi.size;
  const fornitori = new Set(db.prepare("SELECT id FROM catene WHERE tipo = 'fornitore'").pluck().all());
  const posto = (x) => {
    const p = x.prodotto;
    const best = x.prezzi.filter((z) => ovunque || ammessi.has(z.catena_id))
      .map((z) => ({ z, c: costo(p, z, r.quantita, r.unita, true) })).filter((k) => k.c)
      .sort((a, b) => a.c.costo - b.c.costo || Number(b.z.mio) - Number(a.z.mio))[0];
    if (!best) return null;
    const n = vicino(best.z.catena_id);
    return { catena: best.z.catena, catena_id: best.z.catena_id, mio: mie.includes(best.z.catena_id), fornitore: fornitori.has(best.z.catena_id), prezzo: best.z.prezzo, unitario: best.z.unitario, offerta: best.z.offerta, valido_al: best.z.valido_al || null,
      costo: best.c.costo, confezioni: best.c.confezioni ?? null, km: n ? Math.round(mappe.kmStrada(casa, n) * 10) / 10 : null, indirizzo: n ? `${n.indirizzo || n.nome}${n.citta && n.indirizzo ? `, ${n.citta}` : ''}` : '' };
  };
  const conPosto = schede.map((x) => ({ x, dove: posto(x), voto: voto(x.prodotto.id) }));
  // anche i prodotti col formato da completare: il costo è quello della confezione (meglio di niente)
  const prezzati = conPosto.filter((k) => k.dove);
  const tipoOk = (p) => (r.qualita === 'bio' ? p.bio : r.qualita === 'italiano' ? p.origine === 'italia' : r.qualita === 'bio_italiano' ? p.bio && p.origine === 'italia' : true);
  // la principale: il prodotto scelto o detto; se non c'è, il più conveniente del tipo voluto (o in assoluto)
  // la principale: il prodotto scelto o detto; se non c'è, il preferito; altrimenti il più conveniente del tipo voluto
  let principale = r.prodotto_id ? conPosto.find((k) => k.x.prodotto.id === r.prodotto_id) : null;
  let motivo = principale ? (r.scelto ? 'scelto' : 'detto') : 'conveniente';
  if (!principale) { const pid = preferitoDi(v.id, req); const pf = pid && conPosto.find((k) => k.x.prodotto.id === pid); if (pf) { principale = pf; motivo = 'preferito'; } }
  if (!principale) principale = [...prezzati].filter((k) => tipoOk(k.x.prodotto)).sort((a, b) => a.dove.costo - b.dove.costo)[0] || [...prezzati].sort((a, b) => a.dove.costo - b.dove.costo)[0] || null;
  const ref = principale?.dove?.costo ?? null;
  const altri = prezzati.filter((k) => k.x.prodotto.id !== principale?.x.prodotto.id);
  const vicinoA = (lista) => (ref == null ? lista.sort((a, b) => a.dove.costo - b.dove.costo)[0] : lista.sort((a, b) => Math.abs(a.dove.costo - ref) - Math.abs(b.dove.costo - ref) || a.dove.costo - b.dove.costo)[0]);
  // il consiglio dell'app: rispetto alla tua scelta, qualità migliore allo stesso prezzo, oppure stessa qualità a meno
  const fascia = (q) => (q == null ? null : q >= 75 ? 3 : q >= 55 ? 2 : q >= 35 ? 1 : 0);
  const consiglio = () => {
    if (!principale?.dove) return null;
    const c0 = principale.dove.costo; const q0 = principale.x.qualita; const f0 = fascia(q0);
    const tolleranza = Math.max(0.05, c0 * 0.05); // "stesso prezzo": entro 5 centesimi o il 5%
    const cand = altri.filter((k) => k.x.qualita != null).map((k) => {
      const c = k.dove.costo; const q = k.x.qualita; const f = fascia(q);
      const meglioStessoPrezzo = c <= c0 + tolleranza && (f0 == null ? q >= 55 : f > f0);
      const stessaQualitaMeno = c < c0 - 0.04 && (f0 == null ? q >= 55 : f >= f0);
      if (!meglioStessoPrezzo && !stessaQualitaMeno) return null;
      // quanto vale il cambio: risparmio in % più punti di qualità guadagnati
      return { k, guadagno: ((c0 - c) / c0) * 100 + (q - (q0 ?? 50)), perche: f > (f0 ?? -1) ? (c < c0 - 0.04 ? 'meglio-e-meno' : 'meglio') : 'meno' };
    }).filter(Boolean).sort((a, b) => b.guadagno - a.guadagno);
    return cand[0] || null;
  };
  let cons = consiglio();
  // 0.62: la Scelta saggia, con la stessa regola della ricerca (miglior rapporto qualità-prezzo tra i prodotti almeno buoni,
  // bio o italiano se costano quasi uguale): se non è già la proposta principale, è lei il consiglio e va in cima
  if (!principale || motivo === 'conveniente') {
    const cand = prezzati.filter((k) => k.x.prodotto.confrontabile !== false && k.dove?.unitario > 0)
      .map((k) => ({ k, unitario: k.dove.unitario, unita: v.unita, qualita: k.x.qualita ?? null, bio: !!k.x.prodotto.bio, italiano: k.x.prodotto.origine === 'italia' }));
    const sg = consigliatoTra(cand);
    if (sg && sg.r.k !== principale) cons = { k: sg.r.k, perche: `saggia:${sg.motivo}` };
  }
  const tipi = [
    ['consiglio', 'La scelta saggia', () => cons?.k],
    ['votato', 'Il più votato', () => [...altri].filter((k) => k.voto).sort((a, b) => b.voto.media - a.voto.media || b.voto.n - a.voto.n)[0]],
    // 0.62: «il più economico» solo se costa davvero meno della proposta principale
    ['economico', 'Il più economico', () => [...altri].filter((k) => ref == null || k.dove.costo < ref - 0.004).sort((a, b) => a.dove.costo - b.dove.costo)[0]],
    // 0.64: «il migliore» e «miglior qualità-prezzo» solo se lo sono davvero anche rispetto alla proposta principale
    ['migliore', 'Il migliore', () => [...altri].filter((k) => k.x.qualita != null && (principale?.x.qualita == null || k.x.qualita > principale.x.qualita)).sort((a, b) => b.x.qualita - a.x.qualita || a.dove.costo - b.dove.costo)[0]],
    ['scelta', 'Miglior qualità-prezzo', () => [...altri].filter((k) => k.x.prodotto.confrontabile && k.x.qualita != null && valore(k.x.qualita, k.dove.unitario) != null && !(principale?.dove && valore(principale.x.qualita, principale.dove.unitario) != null && valore(principale.x.qualita, principale.dove.unitario) >= valore(k.x.qualita, k.dove.unitario))).sort((a, b) => valore(b.x.qualita, b.dove.unitario) - valore(a.x.qualita, a.dove.unitario))[0]],
    ['bio', 'Bio al prezzo più vicino', () => vicinoA(altri.filter((k) => k.x.prodotto.bio))],
    ['italiano', 'Italiano al prezzo più vicino', () => vicinoA(altri.filter((k) => k.x.prodotto.origine === 'italia'))],
  ];
  const alternative = [];
  for (const [k, t, trova] of tipi) {
    const a = trova(); if (!a) continue;
    const g = alternative.find((y) => y.prodotto.id === a.x.prodotto.id);
    if (g) { g.tipi.push(k); g.etichette.push(t); continue; }
    alternative.push({ tipi: [k], etichette: [t], prodotto: a.x.prodotto, qualita: a.x.qualita, giudizio: a.x.giudizio, voto: a.voto, dove: a.dove,
      differenza: a.dove && ref != null ? Math.round((a.dove.costo - ref) * 100) / 100 : null, perche: k === 'consiglio' ? cons.perche : null });
  }
  return {
    principale: principale ? { motivo, prodotto: principale.x.prodotto, qualita: principale.x.qualita, giudizio: principale.x.giudizio, voto: principale.voto, dove: principale.dove } : null,
    // nessun consiglio: la tua scelta è già la migliore (niente di meglio allo stesso prezzo, niente di pari qualità a meno)
    // "già la migliore" solo se c'è stato davvero un confronto: almeno un altro prodotto con prezzo e giudizio
    alternative, giaMigliore: !!principale?.dove && !cons && principale.x.qualita != null && altri.some((k) => k.x.qualita != null),
    confrontati: altri.length, senzaPrezzo: conPosto.filter((k) => !k.dove).length, zona: { raggio, casa: !!casa?.lat, supermercati: ammessi.size },
  };
}
// 0.74: dove si prende una cosa generica (0 = dove capita); vale anche per la volta dopo
function doveLibera(req, r, v) {
  const cid = v === null || v === '' ? null : Number(v) === 0 ? 0 : id(v);
  if (cid && !db.prepare('SELECT 1 FROM catene WHERE id = ?').get(cid)) throw new Errore('Supermercato non trovato', 404);
  db.prepare('UPDATE righe_lista SET catena_libera = ? WHERE id = ?').run(cid, r.id);
  // il supermercato si ricorda per la volta dopo solo per le cose generiche (un prodotto spostato perché mancava vale solo stavolta)
  if (cid != null && r.libera) db.prepare(`INSERT INTO abitudini (famiglia_id, voce_id, catena_libera) VALUES (?, ?, ?)
    ON CONFLICT(famiglia_id, voce_id) DO UPDATE SET catena_libera = excluded.catena_libera`).run(req.famiglia.id, r.voce_id, cid);
}
app.post('/api/lista/:id/dove', async (req) => { const r = rigaDi(req, req.params.id); doveLibera(req, r, req.body?.catena_libera); return { ok: true }; });
// La scelta: un prodotto preciso (anche dal catalogo) con le confezioni, oppure "decidi tu" con il tipo
app.post('/api/lista/:id/scegli', async (req) => {
  const r = rigaDi(req, req.params.id); const b = req.body || {};
  if (b.libera) {
    // 0.61: generica, il prodotto lo sceglie chi fa la spesa al supermercato (come una lista di carta)
    db.prepare("UPDATE righe_lista SET prodotto_id = NULL, scelto = 1, libera = 1, qualita = 'qualsiasi', marca = 'qualsiasi', catena_id = NULL, offerta_nascosta = 0, migliore_nascosto = 0 WHERE id = ?").run(r.id);
    // 0.74: il supermercato dove la prendi; se non lo dici, quello dell'ultima volta
    if (b.catena_libera !== undefined) doveLibera(req, r, b.catena_libera);
    else if (r.catena_libera == null) { const a = db.prepare('SELECT catena_libera FROM abitudini WHERE famiglia_id = ? AND voce_id = ?').get(req.famiglia.id, r.voce_id); if (a?.catena_libera != null) db.prepare('UPDATE righe_lista SET catena_libera = ? WHERE id = ?').run(a.catena_libera, r.id); }
  } else if (b.automatica) {
    const d = datiRiga({ qualita: b.qualita, marca: b.marca }, r);
    db.prepare('UPDATE righe_lista SET prodotto_id = NULL, scelto = 1, libera = 0, qualita = ?, marca = ?, catena_id = NULL, offerta_nascosta = 0, migliore_nascosto = 0 WHERE id = ?').run(d.qualita, d.marca, r.id);
    if (b.qualita !== undefined || b.marca !== undefined) ricorda(req.famiglia.id, r.voce_id, d.qualita, d.marca);
  } else {
    let pid = b.prodotto_id ? id(b.prodotto_id) : null;
    const ean = String(b.ean || '').replace(/\D/g, '');
    if (!pid && ean) { pid = perEan(db, ean); if (!pid) { const o = catalogo.perCodice(ean); if (!o) throw new Errore('Prodotto non trovato nel catalogo', 404); pid = creaDaOff(ean, await preparaOff(o)); } }
    const p = pid && db.prepare('SELECT * FROM prodotti WHERE id = ?').get(pid); if (!p) throw new Errore('Scegli un prodotto');
    const n = Math.max(1, Math.min(50, Math.round(Number(b.confezioni) || 0) || (p.quantita > 0 ? Math.max(1, Math.ceil(r.quantita / p.quantita - 1e-6)) : 1)));
    const quantita = p.sfuso ? r.quantita : p.quantita > 0 ? Math.round(n * p.quantita * 1000) / 1000 : n;
    db.prepare('UPDATE righe_lista SET catena_libera = NULL WHERE id = ? AND prodotto_id IS NOT ?').run(r.id, p.id); // scelto un altro prodotto: niente più spostamento
    db.prepare('UPDATE righe_lista SET prodotto_id = ?, scelto = 1, libera = 0, voce_id = ?, quantita = ?, catena_id = CASE WHEN prodotto_id = ? THEN catena_id ELSE NULL END, offerta_nascosta = CASE WHEN prodotto_id = ? THEN offerta_nascosta ELSE 0 END, migliore_nascosto = CASE WHEN prodotto_id = ? THEN migliore_nascosto ELSE 0 END WHERE id = ?').run(p.id, p.voce_id, quantita, p.id, p.id, p.id, r.id);
    // preso dal suggerimento «migliore»: si ricorda il prodotto di prima (per tornare indietro)
    const tornaIndietro = r.prodotto_prima && r.prodotto_prima === p.id && r.quantita_prima;
    if (tornaIndietro) db.prepare('UPDATE righe_lista SET quantita = ? WHERE id = ?').run(r.quantita_prima, r.id); // si torna alla quantità di prima
    const daSugg = b.da_suggerimento && r.prodotto_id !== p.id;
    db.prepare('UPDATE righe_lista SET prodotto_prima = ?, quantita_prima = ? WHERE id = ?').run(daSugg ? r.prodotto_id : null, daSugg ? r.quantita : null, r.id);
    if (b.migliore_nascosto !== undefined) db.prepare('UPDATE righe_lista SET migliore_nascosto = ? WHERE id = ?').run(b.migliore_nascosto ? 1 : 0, r.id);
    // se è in un supermercato che non è tra i tuoi, la riga va presa lì
    if (b.catena_id !== undefined) { const cid = b.catena_id ? id(b.catena_id) : null; if (cid && !db.prepare('SELECT 1 FROM catene WHERE id = ?').get(cid)) throw new Errore('Supermercato non trovato', 404); db.prepare('UPDATE righe_lista SET catena_id = ? WHERE id = ?').run(cid, r.id); }
  }
  return { lista: lista(req), ...prossimaDaScegliere(req, r) };
});
app.get('/api/calcolo', async (req) => {
  const data = DATA.test(req.query.data || '') ? req.query.data : oggi(); const s = imp(req);
  // i tuoi supermercati, più quelli dove hai scelto di prendere un'offerta dalla lista
  const scelti = db.prepare('SELECT DISTINCT catena_id FROM righe_lista WHERE famiglia_id = ? AND catena_id IS NOT NULL').pluck().all(req.famiglia.id);
  const mie0 = mieCatene(req); const mie = mie0 && mie0.length ? [...new Set([...mie0, ...scelti])] : mie0;
  const salvaCasa = (casa) => db.prepare('UPDATE famiglie SET casa = ? WHERE id = ?').run(JSON.stringify(casa), req.famiglia.id);
  const anchePresi = !!req.query.tutto;
  const r = await calcola(db, { data, famiglia_id: req.famiglia.id, s, catene_ids: mie, salvaCasa, anchePresi });
  const migliore = r.soluzioni[0];
  // quanto si risparmia: rispetto a fare tutto in un negozio solo, e rispetto ai supermercati fuori dai tuoi
  const unSolo = migliore ? r.singoli.filter((x) => x.mancanti <= migliore.mancanti.length).sort((a, b) => a.totale - b.totale)[0] || null : null;
  let altrove = null;
  if (migliore && mie?.length) {
    const tutti = db.prepare('SELECT COUNT(DISTINCT catena_id) n FROM negozi WHERE attivo = 1').get().n;
    if (tutti > mie.length) {
      const r2 = await calcola(db, { data, famiglia_id: req.famiglia.id, s, catene_ids: null, salvaCasa, anchePresi });
      const m2 = r2.piuEconomica;
      if (m2 && m2.catene.some((c) => !migliore.catene.includes(c)) && m2.mancanti.length <= migliore.mancanti.length && m2.totale < migliore.totale - 0.5) {
        const costoIn = (sol) => new Map(sol.negozi.flatMap((n) => n.righe.map((x) => [x.riga.id, { costo: x.costo, catena: n.catena, prodotto: x.prodotto, unitario: x.unitario }])));
        const a = costoIn(migliore); const b = costoIn(m2);
        const differenze = [...b].filter(([id, x]) => !migliore.catene.includes(x.catena) && a.has(id) && a.get(id).costo > x.costo + 0.04)
          .map(([id, x]) => ({ voce: m2.negozi.flatMap((n) => n.righe).find((y) => y.riga.id === id).riga.voce, catena: x.catena, prodotto: x.prodotto, costo: x.costo, prima: a.get(id).costo, primaCatena: a.get(id).catena }));
        altrove = { catene: m2.catene, nuove: m2.catene.filter((c) => !migliore.catene.includes(c)), spesa: m2.spesa, totale: m2.totale, risparmio: Math.round((migliore.totale - m2.totale) * 100) / 100, km: m2.km, differenze };
      }
    }
  }
  // com'è la spesa: il giudizio dei prodotti del giro, con un'alternativa migliore dove c'è
  const giudizi = migliore ? raggruppa(valuta(db, migliore, { data, s, mie, voto })) : null;
  // cose che nei supermercati non ci sono ma hanno un prezzo da un fornitore: si comprano a parte
  const fornitori = new Map(db.prepare("SELECT id, nome FROM catene WHERE tipo = 'fornitore'").all().map((c) => [c.id, c.nome]));
  const fuoriGiro = [];
  if (fornitori.size) {
    const pv = prezziValidi(db, data, s);
    for (const m of (migliore ? migliore.mancanti : r.righe || [])) {
      const riga = db.prepare('SELECT * FROM righe_lista WHERE id = ?').get(m.id); if (!riga) continue;
      const ids = riga.prodotto_id ? [riga.prodotto_id] : db.prepare('SELECT id FROM prodotti WHERE voce_id = ?').pluck().all(riga.voce_id);
      const z = [...pv.values()].filter((x) => fornitori.has(x.catena_id) && ids.includes(x.prodotto_id)).sort((a, b) => a.unitario - b.unitario)[0];
      if (z) fuoriGiro.push({ id: m.id, voce: m.voce, fornitore: fornitori.get(z.catena_id), prezzo: z.prezzo, prodotto: db.prepare('SELECT nome FROM prodotti WHERE id = ?').get(z.prodotto_id)?.nome || '' });
    }
  }
  return { ...r, fuoriGiro, risparmio: migliore ? { unSolo: unSolo ? { catena: unSolo.catena, spesa: unSolo.spesa, totale: unSolo.totale } : null, rispettoUnSolo: unSolo ? Math.round((unSolo.totale - migliore.totale) * 100) / 100 : null, altrove } : null, giudizi };
});

// ---------- produttori locali ----------
produttori(app, db, { Errore, id, testo, numero, imp, mieCasa: (req) => imp(req).casa, canoneDi: (p) => tariffeMod.canoneProduttore(db, p) });
// ---------- le spese fatte: storico, pagella e alternative per la prossima volta ----------
archiviaSpese = spese(app, db, { Errore, id, imp, mieCatene, voto, oggi });
// ---------- statistiche d'uso (chi gestisce) ----------
statistiche(app, db, { oggi });
// produttori segnalati da chi usa l'app
app.post('/api/segnalazioni', async (req) => {
  const b = req.body || {}; const nome = testo(b.nome, 80); if (nome.length < 2) throw new Errore('Scrivi il nome del produttore');
  db.prepare('INSERT INTO segnalazioni (utente_id, nome, telefono, dove, cosa) VALUES (?, ?, ?, ?, ?)').run(req.utente.id, nome, testo(b.telefono, 30), testo(b.dove, 120), testo(b.cosa, 200));
  return { ok: true };
});
app.get('/api/segnalazioni', async () => db.prepare('SELECT s.*, u.nome da FROM segnalazioni s LEFT JOIN utenti u ON u.id = s.utente_id ORDER BY s.stato = \'nuova\' DESC, s.id DESC LIMIT 100').all());
app.put('/api/segnalazioni/:id', async (req) => { db.prepare("UPDATE segnalazioni SET stato = 'vista' WHERE id = ?").run(id(req.params.id)); return { ok: true }; });
// errori della pagina (il «paracadute» dell'app): finiscono nel registro del server per poterli correggere
app.post('/api/errore', async (req) => { const b = req.body || {}; console.error(`[errore pagina] ${testo(b.dove, 80)} · ${testo(b.messaggio, 300)} · utente ${req.utente?.id ?? '-'}\n${testo(b.pila, 800)}`); return { ok: true }; });
// ---------- volantini letti da Claude ----------
volantini(app, db, { Errore, id, testo, numero, imp, oggi, salvaJpeg, cartellaFoto: CARTELLA_FOTO, zonaDi, avvisaOfferta, aggiungiMia });

// ---------- scontrini ----------
app.get('/api/scontrini', async () => db.prepare('SELECT s.*, c.nome catena, n.indirizzo FROM scontrini s LEFT JOIN catene c ON c.id = s.catena_id LEFT JOIN negozi n ON n.id = s.negozio_id ORDER BY s.data DESC, s.id DESC').all()
  .map((s) => ({ ...s, righe: JSON.parse(s.righe) })));

// ---------- pubblicità in home: 3 posti (1°, 2°, 3°), la mia o pagate ogni 2 settimane ----------
const oggiStr = () => oggi();
// un annuncio si vede se è attivo, ha un posto e (se non è mio) è pagato fino a oggi
const annuncioVisibile = (a) => !!a.attivo && [1, 2, 3].includes(a.posizione) && (!!a.mio || (!!a.pagato_fino && a.pagato_fino >= oggiStr()));
const conPrezzi = (a) => {
  const p = tariffeMod.prezziHome(db, a.lat != null ? a : null);
  return { ...a, mio: !!a.mio, visibile: annuncioVisibile(a), attivi: p.attivi, raggio: p.raggio, prezzi: p.posti, prezzo_posto: a.posizione ? p.posti[a.posizione - 1] : null };
};
const listaAnnunci = () => db.prepare('SELECT * FROM annunci ORDER BY posizione IS NULL, posizione, id').all().map(conPrezzi);
// gli annunci per chi apre l'app: in ordine di posto; quelli con una zona solo a chi abita entro il raggio
const annunciPer = (req) => {
  const t = tariffeMod.tariffe(db); const casa = req.famiglia ? imp(req).casa : null;
  return db.prepare('SELECT * FROM annunci WHERE attivo = 1 AND posizione BETWEEN 1 AND 3 ORDER BY posizione').all()
    .filter((a) => annuncioVisibile(a) && (a.lat == null || !casa?.lat || mappe.distanzaKm(a, casa) <= t.raggio_km))
    .map(({ id: aid, titolo, testo: t2, whatsapp, messaggio, link, bottone, nota, posizione }) => ({ id: aid, titolo, testo: t2, whatsapp, messaggio, link, bottone, nota, posizione }));
};
app.get('/api/annunci', async () => listaAnnunci());
// il numero WhatsApp si salva con il prefisso (393…); il link «Scopri di più» deve essere una pagina web
const numeroWa = (x) => { let n = String(x || '').replace(/\D/g, ''); if (!n) return ''; if (n.startsWith('00')) n = n.slice(2); if (n.length <= 10 && n.startsWith('3')) n = `39${n}`; if (n.length < 10 || n.length > 15) throw new Errore('Il numero WhatsApp non è valido'); return n; };
const datiAnnuncio = async (b, prima = {}) => {
  const link = testo(b.link, 400); if (link && !/^https?:\/\//.test(link)) throw new Errore('Il link di «Scopri di più» deve cominciare con https://');
  const posizione = [1, 2, 3].includes(Number(b.posizione)) ? Number(b.posizione) : null;
  const pagato = String(b.pagato_fino ?? prima.pagato_fino ?? '').trim(); if (pagato && !DATA.test(pagato)) throw new Errore('La data «pagato fino al» non è valida');
  const d = { titolo: testo(b.titolo, 80), testo: testo(b.testo, 300), whatsapp: numeroWa(b.whatsapp), messaggio: testo(b.messaggio, 300), link, bottone: testo(b.bottone, 40), nota: testo(b.nota, 200), attivo: b.attivo === false ? 0 : 1,
    posizione, mio: b.mio ? 1 : 0, inserzionista: testo(b.inserzionista, 80), zona: testo(b.zona, 160), lat: prima.lat ?? null, lng: prima.lng ?? null, pagato_fino: pagato };
  if (!d.titolo) throw new Errore('Scrivi il titolo');
  if (!d.mio && !d.inserzionista) throw new Errore('Scrivi chi fa la pubblicità (l\'inserzionista)');
  // la zona dell'inserzionista decide il prezzo e chi vede l'annuncio
  if (d.zona && (d.zona !== prima.zona || d.lat == null)) { const c = await mappe.coordinate(db, d.zona); if (!c?.lat) throw new Errore('Non trovo la zona dell\'inserzionista: scrivi via e città, o solo la città'); d.lat = c.lat; d.lng = c.lng; }
  if (!d.zona) { d.lat = null; d.lng = null; }
  return d;
};
// un posto è di un solo annuncio attivo: per darlo a un altro bisogna prima liberarlo
const postoLibero = (d, aid = null) => {
  if (!d.posizione || !d.attivo) return;
  const altro = db.prepare('SELECT * FROM annunci WHERE posizione = ? AND attivo = 1 AND id IS NOT ?').get(d.posizione, aid);
  if (altro && annuncioVisibile(altro)) throw new Errore(`Il ${d.posizione}° posto è già di «${altro.mio ? 'la tua pubblicità' : altro.inserzionista || altro.titolo}»: liberalo prima`);
  if (altro) db.prepare('UPDATE annunci SET posizione = NULL WHERE id = ?').run(altro.id); // scaduto: il posto si libera
};
const CAMPI_ANNUNCIO = 'titolo = @titolo, testo = @testo, whatsapp = @whatsapp, messaggio = @messaggio, link = @link, bottone = @bottone, nota = @nota, attivo = @attivo, posizione = @posizione, mio = @mio, inserzionista = @inserzionista, zona = @zona, lat = @lat, lng = @lng, pagato_fino = @pagato_fino';
app.post('/api/annunci', async (req) => {
  const d = await datiAnnuncio(req.body || {}); postoLibero(d);
  db.prepare('INSERT INTO annunci (titolo, testo, whatsapp, messaggio, link, bottone, nota, attivo, posizione, mio, inserzionista, zona, lat, lng, pagato_fino) VALUES (@titolo, @testo, @whatsapp, @messaggio, @link, @bottone, @nota, @attivo, @posizione, @mio, @inserzionista, @zona, @lat, @lng, @pagato_fino)').run(d);
  return listaAnnunci();
});
app.put('/api/annunci/:id', async (req) => {
  const a = db.prepare('SELECT * FROM annunci WHERE id = ?').get(id(req.params.id)); if (!a) throw new Errore('Annuncio non trovato', 404);
  const d = await datiAnnuncio({ ...a, ...req.body }, a); postoLibero(d, a.id);
  db.prepare(`UPDATE annunci SET ${CAMPI_ANNUNCIO} WHERE id = @id`).run({ ...d, id: a.id });
  return listaAnnunci();
});
// rinnovo: altre 2 settimane dal giorno di scadenza (o da oggi, se è già scaduto), al prezzo del suo posto
app.post('/api/annunci/:id/rinnova', async (req) => {
  const a = db.prepare('SELECT * FROM annunci WHERE id = ?').get(id(req.params.id)); if (!a) throw new Errore('Annuncio non trovato', 404);
  if (!a.posizione) throw new Errore('Prima scegli il posto (1°, 2° o 3°)');
  const t = tariffeMod.tariffe(db); const da = a.pagato_fino && a.pagato_fino >= oggi() ? a.pagato_fino : oggi();
  const fino = new Date(`${da}T12:00:00Z`); fino.setUTCDate(fino.getUTCDate() + t.giorni_home);
  const prezzo = tariffeMod.prezziHome(db, a.lat != null ? a : null).posti[a.posizione - 1];
  db.prepare('UPDATE annunci SET pagato_fino = ?, prezzo = ? WHERE id = ?').run(fino.toISOString().slice(0, 10), prezzo, a.id);
  return listaAnnunci();
});
// tariffe (chi gestisce) e anteprima dei prezzi per una zona
app.get('/api/tariffe', async () => {
  const t = tariffeMod.tariffe(db); const h = tariffeMod.prezziHome(db, null);
  return { ...t, tutti: { attivi: h.attivi, home: h.posti, produttore: tariffeMod.prezzoDa(t.produttori, h.attivi) } };
});
app.put('/api/tariffe', async (req) => tariffeMod.salvaTariffe(db, req.body || {}, Errore));
app.get('/api/tariffe/zona', async (req) => {
  const c = await mappe.coordinate(db, testo(req.query.zona, 160)); if (!c?.lat) throw new Errore('Zona non trovata: scrivi la città o via e città');
  const t = tariffeMod.tariffe(db); const h = tariffeMod.prezziHome(db, c);
  return { zona: req.query.zona, attivi: h.attivi, raggio: h.raggio, home: h.posti, produttore: tariffeMod.prezzoDa(t.produttori, h.attivi) };
});

// ---------- app ----------
const dist = path.join(RADICE, 'dist');
if (fs.existsSync(dist)) {
  const pagina = (req, rep) => rep.type('text/html').header('Cache-Control', 'no-cache').send(fs.readFileSync(path.join(dist, 'index.html')));
  app.get('/', pagina);
  // il manifest per l'iPhone: stesso contenuto, ma l'app installata parte con il gettone del «ponte» (vedi accesso.js)
  app.get('/manifest-app.webmanifest', async (req, rep) => {
    const m = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
    const t = String(req.query?.ponte || '');
    m.id = '/';
    if (/^[A-Za-z0-9_-]{20,64}$/.test(t)) m.start_url = `/?ponte=${t}`;
    return rep.type('application/manifest+json').header('Cache-Control', 'no-store').send(JSON.stringify(m));
  });
  await app.register(fastifyStatic, { root: dist, index: false, wildcard: true });
  // un file che non c'è (con un punto nel nome: .env, .sqlite, .js…) è «non trovato»; le altre pagine sono l'app
  app.setNotFoundHandler((req, rep) => { const u = req.url.split('?')[0]; return u.startsWith('/api/') ? rep.code(404).send({ errore: 'Non trovato' }) : /(^|\/)\.|\.[a-z0-9]{1,8}$/i.test(u) ? rep.code(404).type('text/plain').send('Non trovato') : pagina(req, rep); });
}
export { app, db };
// avvio diretto (npm start) o con pm2 (dove argv[1] è il programma di pm2)
if (process.env.pm_id !== undefined || process.argv[1] && path.resolve(process.argv[1]) === path.join(RADICE, 'server/index.js')) {
  const porta = Number(process.env.PORTA || 3200);
  await app.listen({ port: porta, host: process.env.HOST || '127.0.0.1' });
  console.log(`Spesa Saggia in ascolto su http://127.0.0.1:${porta}`);
  // orari dei negozi: un minuto dopo l'avvio e poi ogni giorno (ognuno si rilegge solo quando è vecchio)
  // 0.76: foto automatiche dei prodotti nuovi: due minuti dopo l'avvio e poi ogni mezz'ora
  if (process.env.FOTO_AUTOMATICHE !== '0') {
    const foto = () => cercaFoto(db, { cartella: CARTELLA_FOTO }).catch((e) => console.error('foto automatiche:', e.message));
    setTimeout(foto, 120_000).unref?.(); setInterval(foto, 30 * 60_000).unref?.();
  }
  if (process.env.ORARI_AUTOMATICI !== '0') {
    const giro = () => aggiornaOrari(db).catch((e) => console.error('orari:', e.message));
    setTimeout(giro, 60_000).unref?.(); setInterval(giro, 24 * 3600_000).unref?.();
  }
}
