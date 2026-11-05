// Supermercati veri intorno a casa, presi da OpenStreetMap (Overpass): si cercano una volta per zona e raggio,
// si salvano come negozi (con la catena abbinata) e da lì in poi si leggono dal database.
import * as mappe from './mappe.js';

let _fetch = (...a) => globalThis.fetch(...a);
export function usaFetch(f) { _fetch = f; }
// con OVERPASS_URL si usa prima un altro server (o una copia locale per le prove)
const SERVER = [...String(process.env.OVERPASS_URL || '').split(',').map((x) => x.trim()).filter(Boolean), 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const UA = 'dimmilaspesa/0.14 (+https://spesasaggia.it)';
export const RAGGI = [5, 10, 20, 30, 40];
const GIORNI_VALIDA = 30;

// nomi come compaiono su OpenStreetMap → catena dell'app, per i casi che il confronto parola per parola non coglie
const ALIAS = {
  ipertosano: 'Tosano', 'iper tosano': 'Tosano', 'tosano cerea': 'Tosano',
  'iper la grande i': 'Iper', 'iper, la grande i': 'Iper', 'u2 supermercato': 'Unes U2', u2: 'Unes U2', 'il viaggiator goloso': 'Unes',
  extracoop: 'Ipercoop', 'coop alleanza 3.0': 'Coop', 'nova coop': 'Nova Coop', 'coop lombardia': 'Coop', 'unicoop firenze': 'Coop', 'unicoop tirreno': 'Coop', 'coop centro italia': 'Coop', 'coop liguria': 'Coop',
  "in's": "In's Mercato", 'ins mercato': "In's Mercato", "in's mercato": "In's Mercato", 'md discount': 'MD', 'penny market': 'Penny', 'pam local': 'Pam',
  iperfamila: 'Famila', 'famila superstore': 'Famila Superstore', aliper: 'Alì', 'alì': 'Alì', 'ali': 'Alì', 'a&o': 'A&O', deco: 'Decò', 'decò': 'Decò', 'tuodì': 'Tuodì', tuodi: 'Tuodì',
  'conad superstore': 'Conad', 'margherita conad': 'Conad', 'conad city': 'Conad City', 'spazio conad': 'Spazio Conad', 'sapori & dintorni conad': 'Sapori e Dintorni',
  'carrefour express': 'Carrefour Express', 'carrefour market': 'Carrefour Market', 'carrefour iper': 'Carrefour', 'esselunga superstore': 'Esselunga Superstore',
  'maxi dì': 'Maxi Dì', 'maxi di': 'Maxi Dì', 'dpiu': 'Dpiù', 'dpiù': 'Dpiù', 'gros cidac': 'Gros', 'prezzemolo & vitale': 'Prezzemolo e Vitale', 'naturasì': 'NaturaSì', naturasi: 'NaturaSì',
};
const norma = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/['’`]/g, "'").trim();
const parola = (frase, nome) => new RegExp(`(^|[^a-z0-9àèéìòù])${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9àèéìòù]|$)`, 'i').test(frase);

// Trova (o crea) la catena di un negozio a partire dai suoi cartellini su OpenStreetMap
export function catenaPer(db, tags, utente_id = null, crea = true) {
  const catene = db.prepare('SELECT id, nome FROM catene').all().sort((a, b) => b.nome.length - a.nome.length);
  const perNome = (n) => catene.find((c) => c.nome.toLowerCase() === String(n).toLowerCase());
  const candidati = [tags.brand, tags.name, tags.operator].map(norma).filter(Boolean);
  for (const c of candidati) { if (ALIAS[c] && perNome(ALIAS[c])) return perNome(ALIAS[c]); }
  for (const c of candidati) for (const [k, v] of Object.entries(ALIAS)) if (k.length >= 4 && parola(c, k) && perNome(v)) return perNome(v);
  for (const c of candidati) { const t = catene.find((k) => parola(c, k.nome.toLowerCase())); if (t) return t; }
  if (!crea) return null;
  // catena sconosciuta: si aggiunge con il nome dell'insegna (chi gestisce può rinominarla o unirla)
  const nome = String(tags.brand || tags.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (nome.length < 2) return null;
  const gia = perNome(nome); if (gia) return gia;
  const cid = db.prepare('INSERT INTO catene (nome, ambito, proposta_da) VALUES (?, ?, ?)').run(nome[0].toUpperCase() + nome.slice(1), 'citta', utente_id).lastInsertRowid;
  return { id: cid, nome };
}

const indirizzoDa = (t) => [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ').trim();
// «v2»: dalla 0.45 si cercano anche gli alimentari di paese, quindi le zone già cercate si rileggono una volta
const cella = (casa, raggio) => `v2,${casa.lat.toFixed(2)},${casa.lng.toFixed(2)},${raggio}`;

// una domanda a Overpass, provando i server uno dopo l'altro
export async function chiediOverpass(q) {
  let ultimo = null;
  for (const url of SERVER) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 45000);
    try {
      const r = await _fetch(url, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`risposta ${r.status}`);
      const j = await r.json();
      if (!Array.isArray(j.elements)) throw new Error('risposta senza elementi');
      return j.elements;
    } catch (e) { ultimo = e; } finally { clearTimeout(t); }
  }
  throw ultimo || new Error('mappa non raggiungibile');
}
// i supermercati, e anche gli alimentari / minimarket con un nome (nei paesi il supermercato è spesso segnato così)
const interroga = (casa, raggioKm) => { const a = `(around:${Math.round(raggioKm * 1000)},${casa.lat},${casa.lng})`; return chiediOverpass(`[out:json][timeout:40];(nwr["shop"="supermarket"]${a};nwr["shop"~"^(convenience|grocery)$"]["name"]${a};);out center tags;`); };
// orari e sito dai cartellini della mappa
export const orariDaTags = (t) => ({ orari: String(t.opening_hours || '').trim().slice(0, 300), sito: String(t.website || t['contact:website'] || t.url || '').trim().slice(0, 300) });

// Cerca sulla mappa (se per questa zona e raggio non si è già fatto di recente) e salva i negozi trovati.
// Restituisce quanti negozi ha aggiunto o aggiornato; lancia un errore se la mappa non risponde.
export async function aggiornaZona(db, casa, raggioKm, utente_id = null) {
  const giaFatta = db.prepare('SELECT quando FROM zone_cercate WHERE chiave = ? AND quando > ?').get(cella(casa, raggioKm), new Date(Date.now() - GIORNI_VALIDA * 86400000).toISOString());
  // un raggio più grande già cercato di recente copre anche questo
  const piuGrande = RAGGI.filter((r) => r > raggioKm).some((r) => db.prepare('SELECT 1 FROM zone_cercate WHERE chiave = ? AND quando > ?').get(cella(casa, r), new Date(Date.now() - GIORNI_VALIDA * 86400000).toISOString()));
  if (giaFatta || piuGrande) return { cercato: false, n: 0 };
  const tutti = await interroga(casa, raggioKm);
  // gli alimentari si tengono se sono di un'insegna (marchio sulla mappa o catena già nota) o se in zona i supermercati sono pochi (paese)
  const supermercati = tutti.filter((e) => (e.tags || {}).shop === 'supermarket' || !(e.tags || {}).shop).length;
  const elementi = tutti.filter((e) => { const t = e.tags || {}; return !t.shop || t.shop === 'supermarket' || t.brand || supermercati < 5 || catenaPer(db, t, null, false); });
  let n = 0;
  const tx = db.transaction(() => {
    for (const e of elementi) {
      const t = e.tags || {}; const pos = e.center || e; if (pos.lat == null || pos.lon == null) continue;
      const catena = catenaPer(db, t, utente_id); if (!catena) continue;
      const osm = `${e.type}/${e.id}`; const indirizzo = indirizzoDa(t); const citta = String(t['addr:city'] || '').trim();
      const nome = String(t.name || t.brand || '').trim().slice(0, 80);
      const gia = db.prepare('SELECT * FROM negozi WHERE osm_id = ?').get(osm);
      const oh = orariDaTags(t);
      if (gia) {
        db.prepare('UPDATE negozi SET lat = ?, lng = ?, nome = ?, indirizzo = CASE WHEN indirizzo = \'\' THEN ? ELSE indirizzo END, citta = CASE WHEN citta = \'\' THEN ? ELSE citta END WHERE id = ?').run(pos.lat, pos.lon, nome, indirizzo, citta, gia.id);
      } else {
        // un negozio della stessa catena già inserito a mano a meno di 150 metri è lo stesso negozio
        const vicino = db.prepare('SELECT * FROM negozi WHERE catena_id = ? AND lat IS NOT NULL AND osm_id IS NULL').all(catena.id).find((x) => mappe.distanzaKm(x, { lat: pos.lat, lng: pos.lon }) < 0.15);
        if (vicino) db.prepare('UPDATE negozi SET osm_id = ?, nome = ? WHERE id = ?').run(osm, nome, vicino.id);
        else db.prepare('INSERT INTO negozi (catena_id, indirizzo, citta, lat, lng, osm_id, nome) VALUES (?, ?, ?, ?, ?, ?, ?)').run(catena.id, indirizzo, citta, pos.lat, pos.lon, osm, nome);
      }
      salvaOrariMappa(db, osm, oh);
      n++;
    }
    db.prepare('INSERT OR REPLACE INTO zone_cercate (chiave, quando) VALUES (?, ?)').run(cella(casa, raggioKm), new Date().toISOString());
  });
  tx();
  return { cercato: true, n };
}

// gli orari letti dalla mappa: valgono se nessuno li ha corretti a mano (e non cancellano quelli presi dal sito)
export function salvaOrariMappa(db, osm, { orari, sito }) {
  db.prepare(`UPDATE negozi SET orari_osm = ?, sito = CASE WHEN ? <> '' THEN ? ELSE sito END, orari_quando = ?,
    orari = CASE WHEN orari_fonte = 'mano' THEN orari WHEN ? <> '' THEN ? WHEN orari_fonte = 'sito' THEN orari ELSE '' END,
    orari_fonte = CASE WHEN orari_fonte = 'mano' THEN 'mano' WHEN ? <> '' THEN 'mappa' WHEN orari_fonte = 'sito' THEN 'sito' ELSE '' END
    WHERE osm_id = ?`).run(orari, sito, sito, new Date().toISOString(), orari, orari, orari, osm);
}

// I negozi conosciuti entro il raggio, dal più vicino, con la catena
export function negoziVicini(db, casa, raggioKm) {
  return db.prepare('SELECT n.*, c.nome catena FROM negozi n JOIN catene c ON c.id = n.catena_id WHERE n.attivo = 1 AND n.lat IS NOT NULL').all()
    .map((n) => ({ ...n, km: Math.round(mappe.kmStrada(casa, n) * 10) / 10, aria: mappe.distanzaKm(casa, n) }))
    .filter((n) => n.aria <= raggioKm)
    .sort((a, b) => a.aria - b.aria)
    .map(({ aria, ...n }) => n);
}

// Se un negozio preso dalla mappa è senza via, la si chiede alla mappa (una volta, quando serve)
export async function completaIndirizzo(db, negozio) {
  if (negozio.indirizzo || negozio.lat == null) return negozio;
  const ind = await mappe.indirizzoInverso(negozio);
  if (!ind) return negozio;
  db.prepare('UPDATE negozi SET indirizzo = ?, citta = CASE WHEN citta = \'\' THEN ? ELSE citta END WHERE id = ?').run(ind.indirizzo, ind.citta, negozio.id);
  return { ...negozio, indirizzo: ind.indirizzo, citta: negozio.citta || ind.citta };
}
