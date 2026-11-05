// Aggiornamento automatico degli orari dei negozi:
// 1. dalla mappa (OpenStreetMap): una volta alla settimana si rileggono gli orari di tutti i negozi presi dalla mappa;
// 2. dal sito del negozio: per i negozi dei supermercati scelti dalle famiglie che sulla mappa non hanno orari,
//    si legge la pagina del negozio (prima i dati strutturati della pagina, poi, se servono, con Claude). Una volta al mese.
// Gli orari corretti a mano da chi usa l'app restano finché qualcuno non chiede di tornare a quelli automatici.
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { chiediOverpass, salvaOrariMappa, orariDaTags } from './vicini.js';
import { leggiOrari, scriviOrari } from './orari.js';
import * as claude from './claude.js';

let _fetch = (...a) => globalThis.fetch(...a);
export function usaFetch(f) { _fetch = f; }
const GIORNI_MAPPA = 7; const GIORNI_SITO = 30; const MAX_SITI = 8;
const prima = (giorni) => new Date(Date.now() - giorni * 86400000).toISOString();

// 1. dalla mappa
export async function orariDallaMappa(db, { limite = 600 } = {}) {
  const negozi = db.prepare('SELECT osm_id FROM negozi WHERE osm_id IS NOT NULL AND attivo = 1 AND (orari_quando IS NULL OR orari_quando < ?) LIMIT ?').pluck().all(prima(GIORNI_MAPPA), limite);
  let n = 0;
  for (let i = 0; i < negozi.length; i += 150) {
    const gruppo = negozi.slice(i, i + 150);
    const per = { node: [], way: [], relation: [] };
    for (const o of gruppo) { const [t, id] = o.split('/'); if (per[t] && /^\d+$/.test(id)) per[t].push(id); }
    const q = `[out:json][timeout:60];(${Object.entries(per).filter(([, v]) => v.length).map(([t, v]) => `${t}(id:${v.join(',')});`).join('')});out tags;`;
    const elementi = await chiediOverpass(q);
    const visti = new Set();
    db.transaction(() => {
      for (const e of elementi) { const osm = `${e.type}/${e.id}`; visti.add(osm); salvaOrariMappa(db, osm, orariDaTags(e.tags || {})); n++; }
      // non più sulla mappa: si segna solo che si è guardato
      for (const osm of gruppo) if (!visti.has(osm)) db.prepare('UPDATE negozi SET orari_quando = ? WHERE osm_id = ?').run(new Date().toISOString(), osm);
    })();
  }
  return n;
}

// ---------- 2. dal sito ----------
const GIORNI_EN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const minuti = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

// indirizzo sicuro da leggere: solo http/https verso un nome di dominio pubblico
export function urlSicuro(s) {
  let u; try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':')) return null;
  return u.toString();
}

// i dati strutturati (schema.org) che molte pagine di negozi hanno: «openingHours» o «openingHoursSpecification»
export function orariStrutturati(html) {
  const trovati = new Set();
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const giro = (x) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(giro); return; }
      if (x.openingHours) { const v = [].concat(x.openingHours).join('; '); if (leggiOrari(v)) trovati.add(scriviOrari(leggiOrari(v).giorni, leggiOrari(v).festivi)); }
      if (Array.isArray(x.openingHoursSpecification)) {
        const giorni = Array.from({ length: 7 }, () => []); let ok = false;
        for (const s of x.openingHoursSpecification) {
          const a = minuti(s.opens); const b = minuti(s.closes); if (a == null || b == null || s.validFrom || s.validThrough) continue;
          for (const d of [].concat(s.dayOfWeek || [])) { const i = GIORNI_EN.indexOf(String(d).split('/').pop().toLowerCase()); if (i >= 0) { giorni[i].push([a, b > a ? b : b + 1440]); ok = true; } }
        }
        if (ok) trovati.add(scriviOrari(giorni.map((g) => g.sort((p, q) => p[0] - q[0]))));
      }
      for (const v of Object.values(x)) if (v && typeof v === 'object') giro(v);
    };
    giro(j);
  }
  return trovati.size === 1 ? [...trovati][0] : null; // più orari diversi: è la pagina di tanti negozi, non si sa quale
}

export const testoPagina = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&[a-z]+;/gi, ' ')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

// ---------- orari scritti in italiano in una pagina, letti senza Claude ----------
// Capisce «dal lunedì al sabato 8:00 - 20:00», «lun-ven 8.30-13 / 16-19.30», «domenica chiuso», «tutti i giorni 8-21»…
const GIORNI_IT = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const TOKEN = /\b(\d{1,2}(?:[:.]\d{2})?)\s*(?:-|–|—|alle|a)\s*(\d{1,2}(?:[:.]\d{2})?)\b|\b(lun|mar|mer|gio|ven|sab|dom)[a-zìé.]*|\b(chius[oa])\b|\b(festiv[oi])\b|\b(tutti i giorni|7 giorni su 7|sempre aperto)\b|\b(al|a|e)\b|(-|–|—|\/)/gi;
const minutiDa = (t) => { const m = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(t); if (!m) return null; const h = Number(m[1]); const mi = Number(m[2] || 0); return h <= 24 && mi < 60 ? h * 60 + mi : null; };
export function orariDalTesto(testo) {
  const t = String(testo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  const giorni = Array.from({ length: 7 }, () => null); let festivi = null;
  let pendenti = []; let fasce = []; let chiuso = false; let aspettaIntervallo = false; let qualcosa = false;
  const chiudi = () => {
    if (pendenti.length && (fasce.length || chiuso)) {
      for (const g of pendenti) { if (g === 'festivi') festivi = chiuso ? [] : fasce.slice(); else if (giorni[g] == null) giorni[g] = chiuso ? [] : fasce.slice(); }
      qualcosa = true;
    }
    pendenti = []; fasce = []; chiuso = false; aspettaIntervallo = false;
  };
  for (const m of t.matchAll(TOKEN)) {
    if (m[1]) { // fascia oraria
      const a = minutiDa(m[1]); const b = minutiDa(m[2]); if (a == null || b == null) continue;
      if (!pendenti.length) continue; // un orario senza giorno non si sa a cosa si riferisce
      // orari plausibili per un negozio: la prima fascia apre tra le 5 e le 15; le altre (dopo la pausa) vengono dopo
      if (b <= a || b > 1440 || (fasce.length ? a < fasce.at(-1)[1] : (a < 300 || a > 900))) continue;
      fasce.push([a, b]); chiuso = false;
    } else if (m[3]) { // giorno
      const g = GIORNI_IT.indexOf(m[3]);
      if (fasce.length || chiuso) chiudi();
      if (aspettaIntervallo && pendenti.length && typeof pendenti.at(-1) === 'number') { for (let i = pendenti.at(-1); i !== g; i = (i + 1) % 7) if (!pendenti.includes(i)) pendenti.push(i); pendenti.push(g); }
      else pendenti.push(g);
      aspettaIntervallo = false;
    } else if (m[4]) { if (pendenti.length) { chiuso = true; fasce = []; } }
    else if (m[5]) { if (fasce.length || chiuso) chiudi(); pendenti.push('festivi'); aspettaIntervallo = false; }
    else if (m[6]) { if (fasce.length || chiuso) chiudi(); pendenti = [0, 1, 2, 3, 4, 5, 6]; aspettaIntervallo = false; }
    else if (m[7] || m[8]) { if (pendenti.length && !fasce.length && !chiuso && m[7] !== 'e') aspettaIntervallo = true; }
  }
  chiudi();
  if (!qualcosa) return null;
  const noti = giorni.filter((g) => g != null).length;
  if (noti < 5) return null; // troppo poco per fidarsi
  return { giorni: giorni.map((g) => g || []), festivi };
}

// Legge una pagina (quella del negozio sul sito ufficiale) e tira fuori gli orari: prima i dati strutturati, poi il testo.
export async function leggiOrariDaPagina(url) {
  const html = await scarica(url);
  const strutturati = orariStrutturati(html);
  if (strutturati) return { orari: strutturati, come: 'dati strutturati' };
  const o = orariDalTesto(testoPagina(html));
  if (o) return { orari: scriviOrari(o.giorni, o.festivi), come: 'testo della pagina' };
  return null;
}

// un indirizzo della rete interna (il server stesso, la rete di casa/ufficio, i metadati del fornitore): mai
export function ipInterno(ip) {
  if (net.isIPv4(ip)) {
    const [a, b2] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b2 === 254) || (a === 172 && b2 >= 16 && b2 <= 31) || (a === 192 && b2 === 168) || (a === 100 && b2 >= 64 && b2 <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x.startsWith('::ffff:')) return ipInterno(x.slice(7));
  return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80');
}
let _risolvi = async (host) => (await lookup(host, { all: true })).map((r) => r.address);
export function usaRisolvi(f) { _risolvi = f; }
async function controllaDestinazione(u) {
  const url = new URL(u);
  if (!urlSicuro(url.toString())) throw new Error('indirizzo non ammesso');
  const ips = await _risolvi(url.hostname);
  if (!ips.length || ips.some(ipInterno)) throw new Error('indirizzo interno: non lo leggo');
  return url;
}
async function scarica(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    // i reindirizzamenti si seguono a mano (al massimo 4), controllando ogni volta dove portano
    let dove = await controllaDestinazione(url);
    for (let i = 0; i < 5; i++) {
      const r = await _fetch(dove.toString(), { headers: { 'User-Agent': 'dimmilaspesa/0.24 (+https://spesasaggia.it) orari dei negozi', Accept: 'text/html' }, signal: ctrl.signal, redirect: 'manual' });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { dove = await controllaDestinazione(new URL(r.headers.get('location'), dove).toString()); continue; }
      if (!r.ok) throw new Error(`risposta ${r.status}`);
      return (await r.text()).slice(0, 2_000_000);
    }
    throw new Error('troppi reindirizzamenti');
  } finally { clearTimeout(t); }
}

export async function orariDalSito(db, { limite = MAX_SITI, log = () => {} } = {}) {
  // la pagina da leggere: quella indicata a mano (orari_url) vale più del sito preso dalla mappa.
  // Le pagine indicate a mano si rileggono ogni mese anche se gli orari ci sono già (possono cambiare).
  const candidati = db.prepare(`SELECT n.*, c.nome catena FROM negozi n JOIN catene c ON c.id = n.catena_id
    WHERE n.attivo = 1 AND (n.sito <> '' OR n.orari_url <> '') AND n.orari_fonte <> 'mano' AND (n.sito_quando IS NULL OR n.sito_quando < ?)
      AND n.catena_id IN (SELECT catena_id FROM famiglia_catene) ORDER BY n.id`).all(prima(GIORNI_SITO))
    .filter((n) => n.orari_url || !leggiOrari(n.orari)).slice(0, limite);
  let trovati = 0;
  for (const n of candidati) {
    db.prepare('UPDATE negozi SET sito_quando = ? WHERE id = ?').run(new Date().toISOString(), n.id);
    const url = urlSicuro(n.orari_url || n.sito); if (!url) continue;
    let orari = null;
    try {
      const html = await scarica(url);
      orari = orariStrutturati(html);
      if (!orari) { const o = orariDalTesto(testoPagina(html)); if (o) orari = scriviOrari(o.giorni, o.festivi); }
      if (!orari && claudeAcceso()) {
        const testo = testoPagina(html).slice(0, 15000);
        if (/\d{1,2}[:.]\d{2}/.test(testo)) {
          const { dati, uso } = await claude.chiediJson(`Questa è la pagina web di un supermercato italiano.
Negozio: ${n.catena}${n.nome ? ` (${n.nome})` : ''}, ${n.indirizzo}${n.citta ? `, ${n.citta}` : ''}.
Ricava gli orari di apertura DI QUESTO NEGOZIO. Se la pagina riguarda tanti negozi e non si capisce quali sono i suoi, o gli orari non ci sono, rispondi null.
Rispondi SOLO con JSON: {"orari": "orari nel formato opening_hours di OpenStreetMap, per esempio Mo-Sa 08:00-20:00; Su 09:00-13:00; PH off" oppure null}

Testo della pagina:
${testo}`);
          if (uso) log(`orari dal sito con Claude per il negozio ${n.id}: ${uso.euro} €`);
          const o = dati?.orari && leggiOrari(dati.orari);
          if (o) orari = scriviOrari(o.giorni, o.festivi);
        }
      }
    } catch (e) { log(`orari dal sito del negozio ${n.id} non letti: ${e.message}`); continue; }
    if (orari) {
      db.prepare("UPDATE negozi SET orari = ?, orari_fonte = 'sito', orari_url = ? WHERE id = ? AND orari_fonte <> 'mano'").run(orari, url, n.id);
      trovati++;
    } else log(`orari dal sito del negozio ${n.id} (${n.catena}, ${n.indirizzo}): nella pagina non li ho trovati`);
  }
  return trovati;
}

// ---------- 3. da internet ----------
// Per i negozi dei supermercati scelti che non hanno orari né dalla mappa né dal sito: Claude li cerca su internet
// (Google Maps, il sito della catena, PagineGialle…) e li scrive nel formato della mappa. Pochi centesimi a negozio,
// al massimo MAX_WEB negozi al giorno, ognuno una volta al mese.
const MAX_WEB = Number(process.env.ORARI_WEB_AL_GIORNO || 8); const GIORNI_WEB = 30;
// La ricerca su internet con Claude costa crediti (5-10 centesimi a negozio): è spenta, si accende con ORARI_WEB=1 nel .env
export const claudeAcceso = () => process.env.ORARI_WEB === '1' && claude.attivo();
export async function orariDalWeb(db, { limite = MAX_WEB, log = () => {} } = {}) {
  if (!claudeAcceso()) return 0;
  const candidati = db.prepare(`SELECT n.*, c.nome catena FROM negozi n JOIN catene c ON c.id = n.catena_id
    WHERE n.attivo = 1 AND n.orari_fonte <> 'mano' AND c.tipo = 'supermercato' AND (n.web_quando IS NULL OR n.web_quando < ?)
      AND n.catena_id IN (SELECT catena_id FROM famiglia_catene) ORDER BY n.id`).all(prima(GIORNI_WEB))
    // senza via non si può cercare «proprio quel negozio»: un nome uguale all'insegna («Conad») non basta
    .filter((n) => !leggiOrari(n.orari) && (n.indirizzo || (n.nome && n.nome.toLowerCase() !== n.catena.toLowerCase()))).slice(0, limite);
  if (candidati.length) log(`orari da internet: cerco ${candidati.length} ${candidati.length === 1 ? 'negozio' : 'negozi'} (al massimo ${limite} al giorno)`);
  let trovati = 0;
  for (const n of candidati) {
    db.prepare('UPDATE negozi SET web_quando = ? WHERE id = ?').run(new Date().toISOString(), n.id);
    const dove = `${n.catena}${n.nome && n.nome.toLowerCase() !== n.catena.toLowerCase() ? ` ${n.nome}` : ''}, ${n.indirizzo}${n.citta ? `, ${n.citta}` : ''}`;
    try {
      const { dati, uso } = await claude.chiediJson(`Cerca su internet gli orari di apertura attuali di questo supermercato italiano: ${dove}.
Guarda la pagina del negozio sul sito della catena o su Google Maps. Deve essere PROPRIO questo negozio (stessa via): se trovi solo altri negozi della stessa catena, o non sei sicuro, rispondi con orari null.
Rispondi SOLO con JSON, senza testo prima o dopo:
{"orari": "orari nel formato opening_hours di OpenStreetMap, per esempio Mo-Sa 08:00-20:00; Su 09:00-13:00; PH off" oppure null, "fonte": "indirizzo della pagina da cui li hai presi" oppure null}`, { ricercaWeb: 3, max_tokens: 800 });
      if (uso) log(`orari da internet per il negozio ${n.id} (${dove}): ${uso.ricerche} ricerche, ${uso.euro} €`);
      const o = dati?.orari && leggiOrari(dati.orari);
      if (o) {
        const url = urlSicuro(String(dati.fonte || '')) || '';
        db.prepare("UPDATE negozi SET orari = ?, orari_fonte = 'web', orari_url = ? WHERE id = ? AND orari_fonte <> 'mano'").run(scriviOrari(o.giorni, o.festivi), url, n.id);
        trovati++;
      }
    } catch (e) { log(`orari da internet per il negozio ${n.id} non trovati: ${e.message}`); }
  }
  return trovati;
}

// il giro di ogni giorno: prima la mappa, poi i siti, poi internet
export async function aggiornaOrari(db, log = console.log, { limiteWeb } = {}) {
  try { const n = await orariDallaMappa(db); if (n) log(`orari dalla mappa: ${n} negozi riletti`); } catch (e) { log(`orari dalla mappa non aggiornati: ${e.message}`); }
  try { const n = await orariDalSito(db, { log }); if (n) log(`orari dal sito: ${n} negozi`); } catch (e) { log(`orari dal sito non aggiornati: ${e.message}`); }
  try { const n = await orariDalWeb(db, { log, ...(limiteWeb ? { limite: limiteWeb } : {}) }); if (n) log(`orari da internet: ${n} negozi`); } catch (e) { log(`orari da internet non aggiornati: ${e.message}`); }
}
