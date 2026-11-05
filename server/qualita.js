// Qualità del prodotto (0-100) e rapporto qualità-prezzo.
// La qualità mette insieme quello che si sa del prodotto, pesando solo le parti note (come fa Yuka, più le stelle della community):
//   stelle degli utenti 35 · Nutri-Score A-E 20 · additivi 20 · zuccheri 10 · NOVA, quanto è lavorato 10 · bio 9 · origine Italia 6
//   + 5 punti se la confezione è di vetro (0.55)
// Per frutta e verdura sfuse contano soprattutto stelle, bio e origine. Senza un dato vero sulla qualità: sconosciuta (null).
import { puntiAdditivi } from './additivi.js';
const NUTRI = { a: 20, b: 15, c: 10, d: 5, e: 0 };
const NOVA = { 1: 10, 2: 8, 3: 4, 4: 0 };
export const additiviDi = (p) => { try { const x = JSON.parse(p.additivi || 'null'); return Array.isArray(x) ? x : null; } catch { return null; } };

// 0.55: due elementi in più chiesti da Nazario.
//  - Zuccheri (per 100 g, dalla tabella nutrizionale): pochi zuccheri = più punti (10 al massimo; soglie del «semaforo» UE:
//    basso fino a 5 g, alto oltre 22,5 g; per le bevande 2,5 g e 11,25 g per 100 ml).
//  - Confezione in vetro: +5 punti sul voto finale (si ricicla all'infinito e non cede sostanze al cibo).
//  - Il miele è zucchero per natura: per il miele non contano né gli zuccheri né il Nutri-Score (che lo penalizza solo per quello).
// miele vero: la voce o il nome cominciano con «Miele» (non le caramelle al miele)
export const eMiele = (p) => /^\s*miele\b/i.test(p.voce || '') || /^\s*miele\b/i.test(p.nome || '');
const valoriDi = (p) => { try { const v = JSON.parse(p.valori || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
function puntiZuccheri(z, bevanda) {
  if (bevanda) return z <= 2.5 ? 10 : z <= 5 ? 6 : z <= 11.25 ? 3 : 0;
  return z <= 5 ? 10 : z <= 10 ? 7 : z <= 15 ? 4 : z <= 22.5 ? 2 : 0;
}
const NOMI_NUTRI = (x) => `Nutri-Score ${x.toUpperCase()}`;
/** Il voto con le sue parti, per spiegarlo nella scheda: { q, parti: [{ cosa, punti, max, testo }], bonus: [...] } */
export function dettaglio(p, voto = null) {
  const parti = []; const bonus = [];
  // casa e igiene: niente Nutri-Score né additivi alimentari, il giudizio viene solo dai voti di chi li usa
  if (p.non_alimentare || p.nonAlimentare) {
    if (!voto?.n) return { q: null, parti, bonus };
    parti.push({ cosa: 'Voti di chi lo usa', punti: Math.round(((voto.media - 1) / 4) * 100), max: 100, testo: `${voto.media} stelle su 5` });
    return { q: Math.round(((voto.media - 1) / 4) * 100), parti, bonus };
  }
  const miele = eMiele(p); const v = valoriDi(p);
  // 0.69 Frutta e verdura fresche (reparto ortofrutta, senza ingredienti né additivi scritti): sono cibo non lavorato,
  // senza additivi e con valori nutrizionali da Nutri-Score A. Prima contavano solo bio (9) e origine (6): un'arancia
  // italiana non bio prendeva 6 su 15 = 40, «così così». Ora parte da ottimo; bio e Italia aggiungono punti.
  const ortofruttaFresca = p.reparto === 'ortofrutta' && !String(p.ingredienti || '').trim() && !(additiviDi(p)?.length);
  if (voto?.n) parti.push({ cosa: 'Voti di chi l\'ha comprato', punti: ((voto.media - 1) / 4) * 35, max: 35, testo: `${voto.media} stelle su 5` });
  if (!miele && p.nutriscore && p.nutriscore in NUTRI) parti.push({ cosa: 'Valori nutrizionali', punti: NUTRI[p.nutriscore], max: 20, testo: NOMI_NUTRI(p.nutriscore) });
  else if (ortofruttaFresca) parti.push({ cosa: 'Valori nutrizionali', punti: 20, max: 20, testo: 'frutta e verdura fresche' });
  const add = additiviDi(p);
  if (add) parti.push({ cosa: 'Additivi', punti: puntiAdditivi(add) / 5, max: 20, testo: add.length ? `${add.length === 1 ? '1 additivo' : `${add.length} additivi`}` : 'nessuno' });
  else if (ortofruttaFresca) parti.push({ cosa: 'Additivi', punti: 20, max: 20, testo: 'nessuno (prodotto fresco)' });
  const z = Number(v.zuccheri);
  if (!miele && !ortofruttaFresca && v.zuccheri != null && Number.isFinite(z)) parti.push({ cosa: 'Zuccheri', punti: puntiZuccheri(z, v.categoria === 'bevanda'), max: 10, testo: `${String(Math.round(z * 10) / 10).replace('.', ',')} g per 100 ${v.categoria === 'bevanda' ? 'ml' : 'g'}` });
  if (p.nova && p.nova in NOVA) parti.push({ cosa: 'Lavorazione', punti: NOVA[p.nova], max: 10, testo: `NOVA ${p.nova}` });
  else if (ortofruttaFresca) parti.push({ cosa: 'Lavorazione', punti: 10, max: 10, testo: 'non lavorato' });
  // bio e origine contano sempre (si sa se lo sono o no), ma da soli non bastano a dare un voto:
  // 0.48 serve almeno un dato vero sulla qualità (stelle, Nutri-Score, additivi, zuccheri o NOVA); con solo «italiano» usciva 40 a tutti.
  // Frutta, verdura e prodotti freschi senza etichetta fanno eccezione: lì contano soprattutto bio e origine.
  const fresco = p.sfuso || p.reparto === 'ortofrutta' || (!p.ean && !p.ingredienti && p.tipo !== 'marca');
  if (!parti.length && !(fresco && (p.origine || p.bio)) && !(miele && (p.origine || p.bio))) return { q: null, parti: [], bonus };
  parti.push({ cosa: 'Biologico', punti: p.bio ? 9 : 0, max: 9, testo: p.bio ? 'sì' : 'no' });
  if (p.origine) parti.push({ cosa: 'Origine', punti: p.origine === 'italia' ? 6 : 0, max: 6, testo: p.origine === 'italia' ? 'Italia' : 'estero' });
  if (miele) parti.push({ cosa: 'Miele', punti: 0, max: 0, testo: 'lo zucchero è il miele stesso: zuccheri e Nutri-Score non contano' });
  const max = parti.reduce((t, x) => t + x.max, 0); const punti = parti.reduce((t, x) => t + x.punti, 0);
  let q = max ? Math.round((punti / max) * 100) : null;
  // 0.69 frutta e verdura estere non bio: al massimo 60 (i pesticidi vietati in Italia non sono garantiti esclusi)
  // e con prudenza anche quelle di origine non indicata (potrebbero essere estere)
  if (q != null && ortofruttaFresca && p.origine !== 'italia' && !p.bio && q > 60) { bonus.push({ cosa: p.origine === 'estero' ? 'Estera e non bio: non è garantito che non abbia pesticidi vietati in Italia' : 'Origine non indicata e non bio: per prudenza vale come estera (pesticidi vietati in Italia non garantiti esclusi)', punti: 60 - q }); q = 60; }
  if (q != null && p.imballaggio === 'vetro') { bonus.push({ cosa: 'Confezione in vetro', punti: 5 }); q = Math.min(100, q + 5); }
  return { q, parti: parti.map((x) => ({ ...x, punti: Math.round(x.punti * 10) / 10 })), bonus };
}
export function punteggio(p, voto = null) { return dettaglio(p, voto).q; }
// Il semaforo che si legge al volo
export function giudizio(q) {
  if (q == null) return null;
  if (q >= 75) return { parola: 'Ottimo', colore: 'verde' };
  if (q >= 55) return { parola: 'Buono', colore: 'verdino' };
  if (q >= 35) return { parola: 'Così così', colore: 'giallo' };
  return { parola: 'Scarso', colore: 'rosso' };
}

// Miglior scelta: più punti qualità per ogni euro (al kg / l / pz), solo fra i prodotti con qualità almeno discreta
export const QUALITA_MINIMA = 40;
export const valore = (qualita, unitario) => (qualita != null && qualita >= QUALITA_MINIMA && unitario > 0 ? qualita / unitario : null);

// "450 g", "1,5 l", "6 x 125 g", "750ml" → quantità nell'unità di confronto (kg o l)
const PEZZI = [[/lavagg|washes|\bwash\b|\bdosi\b|\bdose\b/, 'lavaggio'], [/rotol|\brolls?\b/, 'rotolo'], [/capsul|caps\b|pods?\b|pastigl|tabs?\b/, 'capsula'], [/fogli|sheets?\b|veli\b/, 'foglio'], [/salviett|wipes?\b/, 'salvietta'], [/\bpz\b|pezzi|\bpcs?\b/, 'pezzo']];
// "40 lavaggi", "12 rotoli", "30 capsule": il numero di pezzi e come si chiamano (per i prodotti per la casa)
export function leggiPezzi(testo) {
  const t = String(testo || '').toLowerCase();
  for (const [re, nome] of PEZZI) { const m = t.match(new RegExp(`(\\d+)\\s*(?:x\\s*)?(?:${re.source})`)); if (m) return { n: Number(m[1]), nome }; }
  return null;
}
export function leggiFormato(testo) {
  const pezzi = leggiPezzi(testo);
  const f = leggiPeso(testo);
  return f ? (pezzi ? { ...f, pezzi } : f) : pezzi ? { quantita: pezzi.n, unita: 'pz', pezzi } : null;
}
function leggiPeso(testo) {
  const t = String(testo || '').toLowerCase().replace(',', '.');
  const m = t.match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(kg|g|gr|l|lt|cl|ml)\b/);
  if (!m) return null;
  const n = Number(m[1] || 1) * Number(m[2]);
  const u = m[3];
  if (u === 'kg') return { quantita: n, unita: 'kg' };
  if (u === 'g' || u === 'gr') return { quantita: Math.round(n) / 1000, unita: 'kg' };
  if (u === 'l' || u === 'lt') return { quantita: n, unita: 'l' };
  if (u === 'cl') return { quantita: n / 100, unita: 'l' };
  return { quantita: n / 1000, unita: 'l' };
}
