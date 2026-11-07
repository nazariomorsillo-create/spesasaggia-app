// Le spese fatte: quando si chiude la lista, le cose prese finiscono nello storico con dove si sono comprate, a quanto,
// il giudizio di ogni prodotto (0-100), la pagella della spesa (media) e, per la prossima volta, l'alternativa migliore:
// lo stesso prodotto dove costa meno, oppure un prodotto di qualità pari o superiore a un prezzo uguale o più basso.
import { calcola, prezziValidi, confrontabile, costo } from './calcolo.js';
import { punteggio, giudizio } from './qualita.js';

export const PAGELLA = { verde: 60, giallo: 45 }; // media ≥ 60 verde, 45-59 giallo, sotto rosso
export const colorePagella = (media) => (media == null ? 'grigio' : media >= PAGELLA.verde ? 'verde' : media >= PAGELLA.giallo ? 'giallo' : 'rosso');
const r2 = (x) => Math.round(x * 100) / 100;

// Giudica le righe di una soluzione del giro (cosa, dove, a quanto) e trova l'alternativa migliore per ognuna
export function valuta(db, soluzione, { data, s, mie, voto }) {
  const prezzi = [...prezziValidi(db, data, s).values()];
  const catene = new Map(db.prepare('SELECT id, nome FROM catene').all().map((c) => [c.id, c.nome]));
  const cid = new Map([...catene].map(([k, v]) => [v, k]));
  const inMie = (z) => !mie?.length || mie.includes(z.catena_id);
  const voti = []; const visti = new Set();
  for (const n of soluzione.negozi) for (const x of n.righe) {
    if (visti.has(x.prodotto_id)) continue; visti.add(x.prodotto_id);
    const p0 = db.prepare('SELECT * FROM prodotti WHERE id = ?').get(x.prodotto_id); if (!p0) continue;
    // 0.66: voto con voce e reparto (come nel resto dell'app: frutta e verdura)
    const vv = db.prepare('SELECT nome, reparto FROM voci WHERE id = ?').get(p0.voce_id) || {};
    const conVoce = (o) => ({ ...o, voce: vv.nome, reparto: vv.reparto });
    const p = conVoce(p0);
    const q = punteggio(p, voto(p.id)); const g = giudizio(q);
    const quiId = cid.get(n.catena);
    let alternativa = null;
    // 1) lo stesso prodotto dove costa meno (prima tra i tuoi supermercati, poi anche fuori)
    const altrove = prezzi.filter((z) => z.prodotto_id === p.id && z.catena_id !== quiId).map((z) => ({ z, c: costo(p, z, x.riga.quantita, x.riga.unita, true) })).filter((k) => k.c && k.c.costo < x.costo - 0.04).sort((a, b) => a.c.costo - b.c.costo);
    const stesso = altrove.find((k) => inMie(k.z)) || altrove[0];
    if (stesso) alternativa = { tipo: 'stesso', prodotto: p.nome, prodotto_id: p.id, qualita: q, giudizio: g, catena: catene.get(stesso.z.catena_id), fuori: !inMie(stesso.z), costo: stesso.c.costo, differenza: r2(stesso.c.costo - x.costo) };
    // 2) un prodotto di qualità pari (stessa fascia: Ottimo, Buono, Così così) o superiore che costa uguale o meno:
    //    prima nei tuoi supermercati, poi anche fuori
    const fascia = (v) => (v == null ? null : v >= 75 ? 75 : v >= 55 ? 55 : v >= 35 ? 35 : 0);
    const soglia = q == null ? 55 : fascia(q); const sopra = q == null ? 75 : Math.min(75, soglia + 20);
    // "pari": stessa fascia con i voti, oppure stessa fascia guardando solo il prodotto (senza i voti di chi compra,
    // che mancano quasi sempre sulle cose nuove); "meglio": una fascia sopra
    const senzaVoti = (o) => fascia(punteggio(conVoce(o), null));
    const pari = (k) => k.q != null && (fascia(k.q) >= soglia || (senzaVoti(k.o) != null && senzaVoti(k.o) >= senzaVoti(p)));
    const meglio = (k) => k.q != null && k.q >= sopra && k.q > soglia;
    const migliori = db.prepare('SELECT * FROM prodotti WHERE voce_id = ? AND id != ?').all(p.voce_id, p.id)
      .filter((o) => confrontabile(o))
      .map((o) => ({ o, q: punteggio(conVoce(o), voto(o.id)) }))
      .filter((k) => pari(k) || meglio(k))
      .flatMap((k) => prezzi.filter((z) => z.prodotto_id === k.o.id && z.catena_id !== quiId).map((z) => ({ ...k, z, c: costo(k.o, z, x.riga.quantita, x.riga.unita, true) })))
      .filter((k) => k.c && ((meglio(k) && k.c.costo <= x.costo + 0.001) || (k.c.costo < x.costo - 0.04)))
      .sort((a, b) => Number(inMie(b.z)) - Number(inMie(a.z)) || fascia(b.q) - fascia(a.q) || a.c.costo - b.c.costo);
    if (migliori[0] && (!alternativa || meglio(migliori[0]) || migliori[0].c.costo < alternativa.costo)) {
      const m = migliori[0];
      alternativa = { tipo: 'migliore', prodotto: m.o.nome, prodotto_id: m.o.id, qualita: m.q, giudizio: giudizio(m.q), catena: catene.get(m.z.catena_id), fuori: !inMie(m.z), costo: m.c.costo, differenza: r2(m.c.costo - x.costo) };
    }
    // 3) se il prodotto è scarso e non c'è niente a prezzo pari, almeno uno buono anche se costa di più
    if (!alternativa && (q == null || q < 55)) {
      const buoni = db.prepare('SELECT * FROM prodotti WHERE voce_id = ? AND id != ?').all(p.voce_id, p.id)
        .map((o) => ({ o, q: punteggio(conVoce(o), voto(o.id)), pr: prezzi.filter((z) => z.prodotto_id === o.id && inMie(z)).sort((u, w) => u.unitario - w.unitario)[0] }))
        .filter((k) => k.q != null && k.q >= 55 && k.pr && confrontabile(k.o)).sort((u, w) => w.q - u.q || u.pr.unitario - w.pr.unitario);
      if (buoni[0]) { const c = costo(buoni[0].o, buoni[0].pr, x.riga.quantita, x.riga.unita, true); alternativa = { tipo: 'qualita', prodotto: buoni[0].o.nome, prodotto_id: buoni[0].o.id, qualita: buoni[0].q, giudizio: giudizio(buoni[0].q), catena: catene.get(buoni[0].pr.catena_id), fuori: false, costo: c?.costo ?? null, differenza: c ? r2(c.costo - x.costo) : null }; }
    }
    // 0.66 quanto hai risparmiato: rispetto al prezzo medio dello stesso prodotto negli altri supermercati che lo hanno,
    // oppure (se l'hai preso in offerta) rispetto al suo prezzo pieno lì, se è più alto
    const altriC = prezzi.filter((z) => z.prodotto_id === p.id && z.catena_id !== quiId).map((z) => costo(p, z, x.riga.quantita, x.riga.unita, true)?.costo).filter((c) => c != null);
    let riferimento = altriC.length ? r2(altriC.reduce((t, c) => t + c, 0) / altriC.length) : null; let rispetto = altriC.length ? 'media' : null;
    if (x.offerta && quiId) {
      const pieno = db.prepare('SELECT prezzo, unitario FROM prezzi WHERE prodotto_id = ? AND catena_id = ? AND offerta = 0 ORDER BY rilevato_il DESC, id DESC LIMIT 1').get(p.id, quiId);
      const c = pieno ? costo(p, pieno, x.riga.quantita, x.riga.unita, true)?.costo : null;
      if (c != null && (riferimento == null || c > riferimento)) { riferimento = c; rispetto = 'pieno'; }
    }
    const risparmiato = riferimento != null && riferimento > x.costo + 0.004 ? r2(riferimento - x.costo) : 0;
    // e la qualità: il voto del prodotto preso rispetto alla media dei prodotti della stessa cosa (con un voto)
    const qVoce = db.prepare('SELECT * FROM prodotti WHERE voce_id = ?').all(p.voce_id).map((o) => punteggio(conVoce(o), voto(o.id))).filter((v) => v != null);
    const qualitaMedia = qVoce.length >= 2 ? Math.round(qVoce.reduce((t, v) => t + v, 0) / qVoce.length) : null;
    voti.push({ voce: x.riga.voce, riga_id: x.riga.id, prodotto: p.nome, prodotto_id: p.id, catena: n.catena, quantita: x.riga.quantita, unita: x.riga.unita, confezioni: x.confezioni ?? null, costo: x.costo, qualita: q, giudizio: g, alternativa,
      riferimento, rispetto, risparmiato, qualitaMedia });
  }
  return voti;
}
export const raggruppa = (voti) => ({
  promossi: voti.filter((v) => v.qualita != null && v.qualita >= 55), cosiCosi: voti.filter((v) => v.qualita != null && v.qualita >= 35 && v.qualita < 55),
  scarsi: voti.filter((v) => v.qualita != null && v.qualita < 35), ignoti: voti.filter((v) => v.qualita == null),
});
const pagella = (voti) => {
  const con = voti.filter((v) => v.qualita != null);
  const media = con.length ? Math.round(con.reduce((t, v) => t + v.qualita, 0) / con.length) : null;
  return { media, colore: colorePagella(media), conGiudizio: con.length };
};
// la vista di una spesa salvata, pronta per la pagina
const vista = (row) => {
  const righe = JSON.parse(row.righe); const voti = righe.filter((r) => r.prodotto_id);
  const prossima = righe.filter((r) => r.alternativa).sort((a, b) => (a.alternativa.differenza ?? 0) - (b.alternativa.differenza ?? 0));
  const risparmio = r2(prossima.filter((r) => r.alternativa.differenza < 0).reduce((t, r) => t - r.alternativa.differenza, 0));
  // 0.66: il bilancio della spesa — risparmiato (soldi) e qualità rispetto alla media delle stesse cose
  const risparmiato = r2(voti.reduce((t, r) => t + (r.risparmiato || 0), 0));
  const confrontati = voti.filter((r) => r.riferimento != null).length;
  const conQ = voti.filter((r) => r.qualita != null && r.qualitaMedia != null);
  const sopraMedia = conQ.length ? Math.round(conQ.reduce((t, r) => t + (r.qualita - r.qualitaMedia), 0) / conQ.length) : null;
  return { id: row.id, data: row.data, catene: JSON.parse(row.catene), n: row.n, totale: row.totale, media: row.media, colore: row.colore, righe,
    giudizi: raggruppa(voti), senzaProdotto: righe.filter((r) => !r.prodotto_id), prossima, risparmio, soglie: PAGELLA,
    bilancio: { speso: row.totale, risparmiato, confrontati, sopraMedia, qualitaConfrontati: conQ.length, offerte: voti.filter((r) => r.rispetto === 'pieno' && r.risparmiato > 0).length } };
};

export function spese(app, db, { Errore, id, imp, mieCatene, voto, oggi }) {
  const mia = (req, sid) => { const r = db.prepare('SELECT * FROM spese WHERE id = ? AND famiglia_id = ?').get(sid, req.famiglia.id); if (!r) throw new Errore('Spesa non trovata', 404); return r; };

  // 0.84 (Nazario, 07/11): le cose spuntate non restano in lista. Vanno nello storico da sole, una spesa per supermercato e giorno
  // (quello dove le hai spuntate nel giro); se nello stesso giorno torni nello stesso supermercato, si aggiungono a quella spesa.
  // Succede quando apri «Le mie spese» e, comunque, il giorno dopo.
  const archivia = async (req, { soloVecchie = false } = {}) => {
    const f = req.famiglia.id; const s = imp(req); const oggiG = oggi();
    const prese = db.prepare('SELECT id, preso_da, COALESCE(preso_il, ?) giorno FROM righe_lista WHERE famiglia_id = ? AND preso = 1').all(oggiG, f)
      .filter((r) => !soloVecchie || r.giorno < oggiG);
    if (!prese.length) return [];
    const gruppi = new Map();
    for (const r of prese) { const k = `${r.preso_da || 0}|${r.giorno}`; if (!gruppi.has(k)) gruppi.set(k, { catena_id: r.preso_da || null, giorno: r.giorno, ids: new Set() }); gruppi.get(k).ids.add(r.id); }
    const fatte = []; const mie0 = mieCatene(req);
    for (const g of gruppi.values()) {
      const catena = g.catena_id ? db.prepare('SELECT id, nome FROM catene WHERE id = ?').get(g.catena_id) : null;
      const mie = catena ? [catena.id] : mie0;
      const r = await calcola(db, { data: g.giorno, famiglia_id: f, s, catene_ids: mie, salvaCasa: null, anchePresi: 'solo', soloRighe: g.ids, normali: true });
      const migliore = r.soluzioni[0];
      const voti = migliore ? valuta(db, migliore, { data: g.giorno, s, mie, voto }) : [];
      const conVoto = new Set(voti.map((v) => v.riga_id));
      const resto = r.righe.filter((x) => !conVoto.has(x.id)).map((x) => ({ voce: x.voce, riga_id: x.id, prodotto: x.prodotto_scelto || '', prodotto_id: null, catena: catena?.nome || '', quantita: x.quantita, unita: x.unita, costo: null, qualita: null, giudizio: null, alternativa: null }));
      const nuove = [...voti, ...resto].map(({ riga_id, ...v }) => v);
      const esiste = db.prepare('SELECT * FROM spese WHERE famiglia_id = ? AND data = ? AND catena_id IS ?').get(f, g.giorno, catena?.id ?? null);
      const righe = [...(esiste ? JSON.parse(esiste.righe) : []), ...nuove];
      const { media, colore } = pagella(righe);
      const costi = righe.filter((v) => v.costo != null); const totale = costi.length ? r2(costi.reduce((t, v) => t + v.costo, 0)) : null;
      const catene = catena ? [catena.nome] : migliore ? migliore.catene : [];
      if (esiste) { db.prepare('UPDATE spese SET righe = ?, n = ?, totale = ?, media = ?, colore = ? WHERE id = ?').run(JSON.stringify(righe), righe.length, totale, media, colore, esiste.id); fatte.push(esiste.id); }
      else fatte.push(db.prepare('INSERT INTO spese (famiglia_id, data, righe, catene, n, totale, media, colore, catena_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(f, g.giorno, JSON.stringify(righe), JSON.stringify(catene), righe.length, totale, media, colore, catena?.id ?? null).lastInsertRowid);
      db.prepare(`DELETE FROM righe_lista WHERE id IN (${[...g.ids].map(() => '?').join(',')})`).run(...g.ids);
    }
    return fatte;
  };

  // «Com'è andata la spesa?»: le cose prese vanno subito nello storico (una spesa per supermercato e giorno)
  app.post('/api/spese', async (req) => {
    const fatte = await archivia(req);
    if (!fatte.length) throw new Errore('Non c\'è niente di preso da salvare: spunta le cose man mano che le prendi');
    return { ids: fatte };
  });
  app.get('/api/spese', async (req) => (await archivia(req), db).prepare('SELECT id, data, catene, n, totale, media, colore FROM spese WHERE famiglia_id = ? ORDER BY data DESC, id DESC LIMIT 200').all(req.famiglia.id)
    .map((x) => ({ ...x, catene: JSON.parse(x.catene) })));
  app.get('/api/spese/:id', async (req) => vista(mia(req, id(req.params.id))));
  app.delete('/api/spese/:id', async (req) => { mia(req, id(req.params.id)); db.prepare('DELETE FROM spese WHERE id = ?').run(id(req.params.id)); return { ok: true }; });
  return archivia;
}
