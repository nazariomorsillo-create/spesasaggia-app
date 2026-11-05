// Il calcolo: per ogni voce della lista il prodotto più economico che rispetta le scelte (normale / italiano / bio,
// di marca / marchio del supermercato) in ogni catena; poi tutte le combinazioni fino a 3 catene, ognuna con il
// suo giro (casa → negozi → casa). Un negozio in più deve far risparmiare almeno la "soglia" (tempo, parcheggio, coda).
import { impostazioni, scrivi } from './db.js';
import { oggi, giorniTra } from './tempo.js';
import * as mappe from './mappe.js';
import { punteggio } from './qualita.js';

const ORTO = new Set(['ortofrutta']);

// Stato di un prezzo alla data: valido | vecchio (oltre 30 giorni) | scaduto (fuori settimana o troppo vecchio)
export function statoPrezzo(p, data, giorniValidi = 60) {
  if (p.valido_al) return data >= (p.valido_dal || p.rilevato_il) && data <= p.valido_al ? 'valido' : 'scaduto';
  const eta = giorniTra(p.rilevato_il, data);
  if (ORTO.has(p.reparto)) return eta <= 6 ? 'valido' : 'scaduto';
  if (eta > giorniValidi) return 'scaduto';
  return eta > 30 ? 'vecchio' : 'valido';
}

// Dove vale un prezzo: catene a prezzo nazionale ovunque; per area (Eurospin: Centro-Nord) se l'utente è in quell'area;
// per città solo nella città dell'utente
export function valeQui(r, s) {
  if (r.ambito === 'nazionale') return true;
  if (r.ambito === 'citta') return String(r.citta || '').toLowerCase() === String(s.citta || '').toLowerCase();
  return r.ambito === s.area;
}

// Per ogni prodotto e catena, il prezzo più recente se ancora valido alla data
export function prezziValidi(db, data = oggi(), s = impostazioni(db)) {
  const righe = db.prepare(`SELECT pr.*, c.ambito, v.reparto FROM prezzi pr JOIN catene c ON c.id = pr.catena_id
    JOIN prodotti p ON p.id = pr.prodotto_id JOIN voci v ON v.id = p.voce_id
    WHERE pr.rilevato_il <= ? AND pr.superato_il IS NULL ORDER BY pr.rilevato_il DESC, pr.id DESC`).all(data);
  const out = new Map(); const visti = new Set();
  for (const r of righe) {
    if (!valeQui(r, s)) continue;
    if (r.valido_dal && r.valido_dal > data) continue; // un'offerta che deve ancora cominciare non nasconde il prezzo di oggi
    const k = `${r.prodotto_id}|${r.catena_id}`;
    if (visti.has(k)) continue;
    visti.add(k);
    const stato = statoPrezzo(r, data, s.giorni_validi);
    if (stato !== 'scaduto') out.set(k, { ...r, stato });
  }
  return out;
}

export function rispetta(p, riga) {
  if (riga.prodotto_id) return p.id === riga.prodotto_id;
  if (p.voce_id !== riga.voce_id) return false;
  if ((riga.qualita === 'italiano' || riga.qualita === 'bio_italiano') && p.origine !== 'italia') return false;
  if ((riga.qualita === 'bio' || riga.qualita === 'bio_italiano') && !p.bio) return false;
  if (riga.marca === 'marca' && p.tipo !== 'marca') return false;
  if (riga.marca === 'supermercato' && p.tipo !== 'supermercato') return false;
  if (String(riga.marca || '').startsWith('brand:') && p.marca.toLowerCase() !== riga.marca.slice(6).toLowerCase()) return false;
  return true;
}

// Si può confrontare al kg / l / pz: sfuso, oppure confezione con il formato scritto
export const confrontabile = (p) => !!p.sfuso || p.quantita > 0;
// Quanto costa comprare la quantità della riga con quel prodotto: confezioni intere, o a peso per lo sfuso.
// Formato da completare: solo se l'utente ha scelto proprio quel prodotto (si contano le confezioni).
export function costo(p, prezzo, quantita, unita = 'pz', esatto = false) {
  if (p.sfuso) return { costo: Math.round(prezzo.unitario * quantita * 100) / 100, confezioni: null };
  if (p.quantita > 0) {
    const confezioni = Math.max(1, Math.ceil(quantita / p.quantita - 1e-6));
    return { costo: Math.round(confezioni * prezzo.prezzo * 100) / 100, confezioni };
  }
  if (!esatto) return null;
  const confezioni = unita === 'pz' ? Math.max(1, Math.ceil(quantita - 1e-6)) : 1;
  return { costo: Math.round(confezioni * prezzo.prezzo * 100) / 100, confezioni, formatoMancante: true };
}

// anchePresi: false = solo da prendere, true = tutte, 'solo' = solo quelle già prese (per chiudere la spesa)
export function righeLista(db, famiglia_id = null, anchePresi = false) {
  const dove = anchePresi === 'solo' ? 'r.preso = 1' : anchePresi ? '1 = 1' : 'r.preso = 0';
  return db.prepare(`SELECT r.*, v.nome AS voce, v.unita, v.reparto, v.pezzo, p.nome AS prodotto_scelto FROM righe_lista r JOIN voci v ON v.id = r.voce_id
    LEFT JOIN prodotti p ON p.id = r.prodotto_id WHERE ${dove} AND r.famiglia_id IS ? ORDER BY r.ordine, r.id`).all(famiglia_id);
}

// Migliore acquisto di ogni riga in ogni catena
export function miglioriPerCatena(db, righe, data, s, soloCatene = null) {
  const prezzi = prezziValidi(db, data, s);
  // 0.55: con il nome della voce e il reparto (servono al voto: miele, frutta e verdura) e il voto di ogni prodotto
  const voti = new Map(db.prepare('SELECT prodotto_id, AVG(stelle) media, COUNT(*) n FROM valutazioni GROUP BY prodotto_id').all().map((v) => [v.prodotto_id, { media: Math.round(v.media * 10) / 10, n: v.n }]));
  const prodotti = db.prepare('SELECT p.*, v.nome voce, v.reparto FROM prodotti p JOIN voci v ON v.id = p.voce_id').all().map((p) => ({ ...p, qualita: punteggio(p, voti.get(p.id) || null) }));
  const catene = db.prepare('SELECT * FROM catene').all().filter((c) => !soloCatene || soloCatene.includes(c.id));
  const tabella = new Map(); // riga.id → Map(catena_id → acquisto)
  for (const r of righe) {
    const m = new Map();
    for (const c of catene) {
      if (r.catena_id && c.id !== r.catena_id) continue; // offerta scelta dalla lista: solo in quel supermercato
      let best = null;
      for (const p of prodotti) {
        if (!rispetta(p, r)) continue;
        const pr = prezzi.get(`${p.id}|${c.id}`);
        if (!pr) continue;
        const k = costo(p, pr, r.quantita, r.unita, !!r.prodotto_id);
        if (!k) continue;
        if (!best || k.costo < best.costo || (k.costo === best.costo && pr.unitario < best.prezzo.unitario)) best = { ...k, prodotto: p, prezzo: pr };
      }
      if (best) m.set(c.id, best);
    }
    tabella.set(r.id, m);
  }
  return { tabella, catene };
}

function combinazioni(arr, k) {
  const out = [];
  const rec = (i, cur) => { if (cur.length === k) { out.push(cur); return; } for (let j = i; j < arr.length; j++) rec(j + 1, [...cur, arr[j]]); };
  rec(0, []);
  return out;
}
function permutazioni(arr) { return arr.length <= 1 ? [arr] : arr.flatMap((x, i) => permutazioni([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])); }

// Il giro più corto casa → negozi → casa (al massimo 3 negozi: si provano tutti gli ordini)
function giro(casa, negozi) {
  if (!casa?.lat || negozi.some((n) => n.lat == null)) return null;
  let best = null;
  for (const ord of permutazioni(negozi)) {
    let km = 0; let da = casa;
    for (const n of ord) { km += mappe.kmStrada(da, n); da = n; }
    km += mappe.kmStrada(da, casa);
    if (!best || km < best.km) best = { ordine: ord, km };
  }
  return best;
}

async function conCoordinate(db, s, salvaCasa) {
  let casa = s.casa || {};
  if (casa.indirizzo && casa.lat == null) {
    const c = await mappe.coordinate(db, casa.indirizzo);
    if (c) { casa = { ...casa, ...c }; (salvaCasa || ((x) => scrivi(db, 'casa', x)))(casa); }
  }
  const negozi = db.prepare('SELECT * FROM negozi WHERE attivo = 1').all();
  for (const n of negozi) {
    if (n.lat != null) continue;
    const c = await mappe.coordinate(db, `${n.indirizzo}${n.citta && !n.indirizzo.toLowerCase().includes(n.citta.toLowerCase()) ? `, ${n.citta}` : ''}`);
    if (c) { db.prepare('UPDATE negozi SET lat = ?, lng = ? WHERE id = ?').run(c.lat, c.lng, n.id); Object.assign(n, c); }
  }
  return { casa, negozi };
}

const r2 = (x) => Math.round(x * 100) / 100;

// 0.61: una riga «libera» (generica, il prodotto si sceglie al supermercato) non entra nel conto del giro: si prende dove si va
export const libera = (r) => !!r.libera && !r.prodotto_id && !r.catena_id;
export async function calcola(db, { data = oggi(), famiglia_id = null, s = impostazioni(db), salvaCasa = null, catene_ids = null, anchePresi = false } = {}) {
  const tutteRighe = righeLista(db, famiglia_id, anchePresi);
  const avvisi = [];
  if (!tutteRighe.length) return { data, righe: tutteRighe, soluzioni: [], singoli: [], liberi: [], avvisi: ['La lista è vuota.'] };
  const liberi = tutteRighe.filter(libera).map(rigaCorta); const righe = tutteRighe.filter((r) => !libera(r));
  if (!righe.length) return { data, righe: tutteRighe.map(rigaCorta), soluzioni: [], singoli: [], liberi, avvisi };
  const { casa, negozi } = await conCoordinate(db, s, salvaCasa);
  if (!casa.lat) avvisi.push('Manca l\'indirizzo di casa (Altro → La mia famiglia): il giro e i chilometri non si possono calcolare.');
  const { tabella, catene } = miglioriPerCatena(db, righe, data, s, catene_ids);
  if (catene_ids && catene_ids.length && catene_ids.length < db.prepare('SELECT COUNT(*) n FROM catene').get().n) avvisi.push(`Guardo solo i tuoi supermercati: ${catene.map((c) => c.nome).join(', ')}. Ne aggiungi altri in Altro → I miei supermercati.`);
  // il negozio di ogni catena: il più vicino a casa (o il primo, se mancano le coordinate)
  const negozioDi = new Map();
  for (const c of catene) {
    const suoi = negozi.filter((n) => n.catena_id === c.id);
    if (!suoi.length) continue;
    const conPos = suoi.filter((n) => n.lat != null);
    negozioDi.set(c.id, casa.lat && conPos.length ? conPos.sort((a, b) => mappe.distanzaKm(casa, a) - mappe.distanzaKm(casa, b))[0] : suoi[0]);
  }
  const utili = catene.filter((c) => negozioDi.has(c.id) && righe.some((r) => tabella.get(r.id).has(c.id)));
  const senzaNegozio = catene.filter((c) => !negozioDi.has(c.id) && righe.some((r) => tabella.get(r.id).has(c.id)));
  if (senzaNegozio.length) avvisi.push(`Manca l'indirizzo del negozio per: ${senzaNegozio.map((c) => c.nome).join(', ')} (Altro → I miei supermercati).`);

  const valuta = (insieme) => {
    const ids = new Set(insieme.map((c) => c.id));
    const perCatena = new Map(insieme.map((c) => [c.id, []]));
    const mancanti = [];
    let spesa = 0;
    for (const r of righe) {
      let best = null; let cid = null;
      for (const [k, v] of tabella.get(r.id)) if (ids.has(k) && (!best || v.costo < best.costo)) { best = v; cid = k; }
      if (!best) { mancanti.push(r); continue; }
      spesa += best.costo;
      perCatena.get(cid).push({ riga: r, ...best });
    }
    if (insieme.length > 1 && [...perCatena.values()].some((x) => !x.length)) return null; // un negozio dove non si compra niente non serve
    const ng = insieme.map((c) => negozioDi.get(c.id));
    const g = giro(casa, ng);
    const ordine = g ? g.ordine : ng;
    const costoStrada = g ? g.km * s.euro_km : 0;
    return {
      catene: ordine.map((n) => catene.find((c) => c.id === n.catena_id).nome),
      negozi: ordine.map((n) => ({
        catena: catene.find((c) => c.id === n.catena_id).nome, catena_id: n.catena_id, indirizzo: n.indirizzo, citta: n.citta, nome: n.nome || "", id: n.id, orari: n.orari || "",
        righe: perCatena.get(n.catena_id).map(acquisto), subtotale: r2(perCatena.get(n.catena_id).reduce((t, x) => t + x.costo, 0)),
      })),
      spesa: r2(spesa), km: g ? Math.round(g.km * 10) / 10 : null, minuti: g ? Math.round(mappe.minutiAuto(g.km) + s.sosta * insieme.length) : null,
      costoStrada: r2(costoStrada), totale: r2(spesa + costoStrada), mancanti: mancanti.map(rigaCorta),
      punteggio: spesa + costoStrada + (insieme.length - 1) * s.soglia_negozio + mancanti.length * 1000,
      link: casa.indirizzo ? mappe.linkMaps(casa.indirizzo, ordine.map((n) => (n.lat != null ? `${n.lat},${n.lng}` : `${n.indirizzo}${n.citta && !n.indirizzo.toLowerCase().includes(n.citta.toLowerCase()) ? `, ${n.citta}` : ''}`))) : '',
    };
  };

  const tutte = [];
  for (let k = 1; k <= Math.min(s.max_negozi, utili.length); k++) for (const ins of combinazioni(utili, k)) { const v = valuta(ins); if (v) tutte.push(v); }
  tutte.sort((a, b) => a.punteggio - b.punteggio);
  const singoli = tutte.filter((x) => x.catene.length === 1).sort((a, b) => a.mancanti.length - b.mancanti.length || a.totale - b.totale);
  const migliore1 = singoli[0];
  const soluzioni = tutte.slice(0, 4).map((x) => ({
    ...x, punteggio: undefined,
    rispetto: migliore1 && x !== migliore1 ? { catena: migliore1.catene[0], risparmio: r2(migliore1.totale - x.totale), minuti: x.minuti != null && migliore1.minuti != null ? x.minuti - migliore1.minuti : null, recupera: migliore1.mancanti.length - x.mancanti.length } : null,
  }));
  // 0.72: le righe generiche («scelgo al supermercato») vanno nel supermercato del giro dove la voce costa meno;
  // se non c'è nessun prezzo, nel negozio dove si comprano più cose. Il prezzo è solo indicativo e non entra nel conto.
  const righeLibere = tutteRighe.filter(libera);
  if (righeLibere.length && soluzioni.length) {
    const tl = miglioriPerCatena(db, righeLibere, data, s, catene_ids).tabella;
    for (const sol of soluzioni) {
      for (const n of sol.negozi) n.liberi = [];
      const principale = [...sol.negozi].sort((a, b) => b.righe.length - a.righe.length)[0];
      for (const r of righeLibere) {
        let best = null; let dove = null;
        for (const n of sol.negozi) { const v = tl.get(r.id)?.get(n.catena_id); if (v && (!best || v.costo < best.costo)) { best = v; dove = n; } }
        (dove || principale).liberi.push({ riga: rigaCorta(r), da: best ? best.costo : null, foto: best?.prodotto.foto || '', prezzi: Object.fromEntries(sol.negozi.map((n) => [n.catena, tl.get(r.id)?.get(n.catena_id)?.costo ?? null])) });
      }
    }
  }
  // la più economica in assoluto (anche se la strada o la soglia la fanno scartare): serve per dire quanto si risparmierebbe altrove
  const minMancanti = Math.min(...tutte.map((x) => x.mancanti.length), Infinity);
  const piuEconomica = tutte.filter((x) => x.mancanti.length === minMancanti).sort((a, b) => a.totale - b.totale)[0] || null;
  return { data, impostazioni: { euro_km: s.euro_km, soglia_negozio: s.soglia_negozio, sosta: s.sosta }, righe: tutteRighe.map(rigaCorta), liberi, soluzioni, piuEconomica: piuEconomica ? { ...piuEconomica, punteggio: undefined } : null, singoli: singoli.map((x) => ({ catena: x.catene[0], spesa: x.spesa, totale: x.totale, mancanti: x.mancanti.length, km: x.km })), avvisi };
}

const rigaCorta = (r) => ({ id: r.id, voce: r.voce, quantita: r.quantita, unita: r.unita, qualita: r.qualita, marca: r.marca, prodotto_scelto: r.prodotto_scelto || null });
const acquisto = (x) => ({
  riga: rigaCorta(x.riga), prodotto: x.prodotto.nome, prodotto_id: x.prodotto.id, foto: x.prodotto.foto || '', tipo: x.prodotto.tipo, marca: x.prodotto.marca, origine: x.prodotto.origine, bio: !!x.prodotto.bio, qualita: x.prodotto.qualita ?? null,
  confezioni: x.confezioni, formatoMancante: !!x.formatoMancante, costo: x.costo, prezzo: x.prezzo.prezzo, unitario: x.prezzo.unitario, offerta: !!x.prezzo.offerta,
  rilevato_il: x.prezzo.rilevato_il, valido_al: x.prezzo.valido_al, stato: x.prezzo.stato,
});
