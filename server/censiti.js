// Riconoscere un prodotto GIÀ CENSITO, da qualunque parte arrivi (codice a barre, scontrino, volantino, inserimento a mano),
// così non nascono doppioni: se c'è, si aggiorna quello (prezzo e dati che mancavano), non se ne crea un altro.
import { radici } from './voce.js';

// codice a barre: lo stesso anche con o senza gli zeri davanti (UPC a 12 cifre = EAN a 13 con lo 0)
export const eanNorm = (e) => String(e || '').replace(/\D/g, '').replace(/^0+/, '');
export function perEan(db, ean) {
  const n = eanNorm(ean); if (n.length < 7) return null;
  return db.prepare("SELECT id FROM prodotti WHERE ean != '' AND ltrim(ean, '0') = ? ORDER BY id LIMIT 1").get(n)?.id ?? null;
}

export const parole = (s) => radici(String(s).replace(/\S*\d\S*/g, ' ')).filter((x) => x.length >= 3);
export const uguali = (x, y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)));
// quanto due nomi si somigliano, da 0 a 1 (le parole che tornano, nelle due direzioni)
export const somiglianza = (a, b) => { const A = parole(a); const B = parole(b); if (!A.length || !B.length) return 0; const ab = A.filter((x) => B.some((y) => uguali(x, y))).length / A.length; const ba = B.filter((y) => A.some((x) => uguali(x, y))).length / B.length; return Math.min(ab, ba) * 0.5 + Math.max(ab, ba) * 0.5; };
export const marcaNorm = (m) => String(m || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// i prodotti «di quel supermercato»: marchio suo, o con un prezzo già rilevato lì
export function diCatena(db, cid) {
  if (!cid) return new Set();
  return new Set(db.prepare('SELECT DISTINCT p.id FROM prodotti p LEFT JOIN prezzi pr ON pr.prodotto_id = p.id AND pr.catena_id = ? WHERE p.catena_id = ? OR pr.id IS NOT NULL').pluck().all(cid, cid));
}

// Il prodotto già censito più simile: nome (e marca), stesso formato, prima tra quelli del supermercato.
// quantita è nell'unità della voce (kg, l, pz); se si sa, formati diversi (250 g e 500 g) sono prodotti diversi.
export function trovaCensito(db, { nome, marca = '', quantita = null, sfuso = null, catena_id = null, voce_id = null, soloSenzaEan = false } = {}) {
  if (!String(nome || '').trim()) return null;
  const inCatena = diCatena(db, catena_id);
  const sql = `SELECT * FROM prodotti WHERE 1 = 1${voce_id ? ' AND voce_id = @voce_id' : ''}${soloSenzaEan ? " AND ean = ''" : ''}`;
  const mN = marcaNorm(marca); let best = null;
  for (const p of db.prepare(sql).all({ voce_id })) {
    if (quantita > 0 && p.quantita > 0 && Math.abs(p.quantita - quantita) / Math.max(p.quantita, quantita) > 0.05) continue;
    if (sfuso != null && !!p.sfuso !== !!sfuso && (quantita > 0 || p.quantita > 0)) continue;
    const pM = marcaNorm(p.marca);
    if (mN && pM && !mN.includes(pM) && !pM.includes(mN)) continue; // marche diverse: prodotti diversi
    const s = Math.max(somiglianza(nome, p.nome), mN ? somiglianza(`${nome} ${marca}`, `${p.nome} ${p.marca}`) : 0);
    const qui = inCatena.has(p.id);
    if (s < (qui ? 0.6 : 0.8)) continue;
    const punti = s + (qui ? 0.2 : 0) + (mN && pM ? 0.1 : 0);
    if (!best || punti > best.punti) best = { id: p.id, nome: p.nome, punti, somiglianza: s, delSupermercato: qui };
  }
  if (!best) return null;
  return { ...best, sicuro: best.somiglianza >= 0.85 || (best.delSupermercato && best.somiglianza >= 0.75) };
}

// I dati arrivati (catalogo, volantino…) completano il prodotto che c'era: si riempie solo quello che manca
const CAMPI = ['marca', 'origine', 'descrizione', 'ingredienti', 'produttore', 'provenienza', 'foto', 'nutriscore', 'nova', 'additivi', 'ean'];
export function completa(db, pid, dati) {
  const p = db.prepare('SELECT * FROM prodotti WHERE id = ?').get(pid); if (!p) return [];
  const nuovo = {};
  for (const k of CAMPI) {
    const v = dati[k]; if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (p[k] == null || p[k] === '') nuovo[k] = k === 'additivi' && typeof v !== 'string' ? JSON.stringify(v) : v;
  }
  if (nuovo.ean && db.prepare('SELECT 1 FROM prodotti WHERE ean = ? AND id != ?').get(nuovo.ean, pid)) delete nuovo.ean;
  if (dati.bio && !p.bio) nuovo.bio = 1;
  if (nuovo.marca && p.tipo === 'senza') nuovo.tipo = 'marca';
  const k = Object.keys(nuovo);
  if (k.length) db.prepare(`UPDATE prodotti SET ${k.map((x) => `${x} = @${x}`).join(', ')} WHERE id = @id`).run({ ...nuovo, id: pid });
  return k;
}
