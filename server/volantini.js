// Volantini: chi usa l'app fotografa le pagine, chi gestisce le fa leggere a Claude, controlla e carica le offerte
// (prezzo, periodo dal… al…). I prodotti nuovi si creano sotto la voce giusta.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as claude from './claude.js';
import * as lettura from './lettura.js';
import { trovaVoce, indovina, maiuscola, radici } from './voce.js';
import { trovaCensito, completa, somiglianza, diCatena } from './censiti.js';
export { somiglianza };

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const PICCOLE = new Set(['di', 'del', 'della', 'dei', 'delle', 'al', 'alla', 'allo', 'ai', 'alle', 'con', 'e', 'in', 'per', 'da', 'il', 'la', 'le', 'lo', 'gli', 'i']);
const parole = (s) => radici(String(s).replace(/\S*\d\S*/g, ' ')).filter((x) => x.length >= 3);
const uguali = (x, y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)));
// stesso prodotto solo se le parole tornano in tutte e due le direzioni (niente «olio» → «acciughe sott'olio»)
const simile = (a, b) => { const A = parole(a); const B = parole(b); if (!A.length || !B.length) return false; const ab = A.filter((x) => B.some((y) => uguali(x, y))).length / A.length; const ba = B.filter((y) => A.some((x) => uguali(x, y))).length / B.length; return ab >= 0.6 && ba >= 0.6; };
// la voce: quella del nome (trovaVoce), oppure quella che comincia con la stessa parola («Clementine Lidl» → «Clementine con foglia»)
const voceDi = (nome, voci, prodotti) => {
  const t = trovaVoce(nome, voci, prodotti); if (t) return t.voce;
  // 0.72: la prima parola deve essere proprio la stessa, al più singolare/plurale («mela»/«mele»): prima «Gran burger»
  // finiva in «Grana padano», perché tolta la vocale finale «grana» diventava «gran»
  const prima = primaParola(nome); if (!prima) return null;
  return voci.find((v) => stessaParola(prima, primaParola(v.nome))) || null;
};
const primaParola = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\S*\d\S*/g, ' ')
  .split(/[^a-z']+/).find((w) => w.length >= 3 && !PICCOLE.has(w) && !w.endsWith("'")) || '';
const stessaParola = (a, b) => { if (!a || !b) return false; if (a === b) return true; const v = /[aeio]$/;
  if (a.length < 4 || Math.abs(a.length - b.length) > 1 || v.test(a) !== v.test(b)) return false;
  return a.replace(/h?[aeio]$/, '') === b.replace(/h?[aeio]$/, ''); };
// nome per una voce nuova: la prima parola, con la seconda se non è una preposizione («Biscotti frollini», «Mozzarella»)
const nomeVoce = (nome) => { const w = String(nome).replace(/\b(bio|biologic[oai])\b/gi, '').trim().split(/\s+/).filter(Boolean); return maiuscola((w[1] && !PICCOLE.has(w[1].toLowerCase()) && !/\d/.test(w[1]) ? `${w[0]} ${w[1]}` : w[0] || '').toLowerCase()); };
const r2 = (x) => Math.round(x * 100) / 100;
// 0.70 somiglianza tra due foto: impronta di 256 bit (dHash 16×16 calcolato dall'app) e quanti bit sono diversi
const distanza = (a, b) => { let d = 0; for (let i = 0; i < 64; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } } return d; };
const SOGLIA_DOPPIONE = 26; // su 256: circa il 10%

export function volantini(app, db, { Errore, id, testo, numero, imp, oggi, salvaJpeg, cartellaFoto, zonaDi, avvisaOfferta, aggiungiMia }) {
  const uno = (vid) => { const v = db.prepare('SELECT * FROM volantini WHERE id = ?').get(vid); if (!v) throw new Errore('Volantino non trovato', 404); return v; };
  const catenaDa = (nome) => {
    const n = String(nome || '').toLowerCase().trim(); if (!n) return null;
    const cat = db.prepare('SELECT id, nome FROM catene').all().sort((a, b) => b.nome.length - a.nome.length);
    return cat.find((c) => c.nome.toLowerCase() === n) || cat.find((c) => n.includes(c.nome.toLowerCase()) || c.nome.toLowerCase().includes(n)) || null;
  };

  // le offerte di un supermercato già caricate e ancora valide, e le pagine già mandate in attesa di lettura
  const giaCaricate = (cid, dal = oggi(), al = null) => {
    const o = db.prepare(`SELECT COUNT(DISTINCT prodotto_id) n, MIN(valido_dal) dal, MAX(valido_al) al, MAX(rilevato_il) il FROM prezzi
      WHERE catena_id = ? AND fonte = 'volantino' AND valido_al >= ? ${al ? 'AND valido_dal <= ?' : ''}`).get(...[cid, dal, ...(al ? [al] : [])]);
    const attesa = db.prepare("SELECT COUNT(*) n FROM volantini WHERE catena_id = ? AND stato = 'da leggere' AND creato_il >= datetime('now', '-10 days')").get(cid).n;
    return { offerte: o.n, dal: o.dal, al: o.al, caricato_il: o.il, attesa };
  };
  app.get('/api/volantini/catena/:id', async (req) => { const cid = id(req.params.id); const c = db.prepare('SELECT nome FROM catene WHERE id = ?').get(cid); if (!c) throw new Errore('Supermercato non trovato', 404); return { catena: c.nome, pagine: pagineDi(cid), ...giaCaricate(cid) }; });
  app.post('/api/volantini', async (req) => {
    // la stessa pagina (la stessa foto) non entra due volte
    const impronta = crypto.createHash('sha256').update(String(req.body?.dati || '').replace(/^data:image\/jpeg;base64,/, '')).digest('hex');
    const stessa = db.prepare('SELECT foto FROM volantini WHERE impronta = ?').get(impronta);
    if (stessa) throw Object.assign(new Errore('Questa pagina è già stata mandata', 409), { extra: { gia_foto: stessa.foto || null } });
    const cid = req.body?.catena_id ? id(req.body.catena_id) : null;
    // 0.70: quante pagine al giorno (chi gestisce non ha limiti; chi manda soprattutto doppioni o pagine inutili ne ha meno)
    if (!req.utente.admin) {
      const oggiN = db.prepare("SELECT COUNT(*) n FROM volantini WHERE utente_id = ? AND creato_il >= date('now')").get(req.utente.id).n;
      const ultime = db.prepare('SELECT stato FROM volantini WHERE utente_id = ? ORDER BY id DESC LIMIT 10').pluck().all(req.utente.id);
      const inutili = ultime.filter((x) => x === 'doppione' || x === 'scartato').length;
      const max = ultime.length >= 10 && inutili >= 7 ? 5 : 20;
      if (oggiN >= max) throw new Errore(`Per oggi hai mandato ${oggiN} pagine: grazie! Le altre domani.`, 429);
    }
    // la stessa pagina rifotografata (somiglianza dell'immagine, calcolata dall'app): si ferma prima di farla leggere
    const phash = /^[0-9a-f]{64}$/.test(String(req.body?.phash || '')) ? req.body.phash : null;
    if (phash) {
      const simili = db.prepare(`SELECT v.id, v.stato, v.phash, v.foto, v.creato_il, c.nome catena FROM volantini v LEFT JOIN catene c ON c.id = v.catena_id
        WHERE v.phash IS NOT NULL AND v.stato != 'scartato' AND v.creato_il >= datetime('now', '-20 days') ${cid ? 'AND (v.catena_id = ? OR v.catena_id IS NULL)' : ''}`).all(...(cid ? [cid] : []));
      const s = simili.find((x) => distanza(x.phash, phash) <= SOGLIA_DOPPIONE);
      if (s) throw Object.assign(new Errore(`Questa pagina c'è già${s.catena ? ` (volantino ${s.catena}` : ' ('}, mandata il ${s.creato_il.slice(8, 10)}/${s.creato_il.slice(5, 7)}): non serve rifotografarla`, 409), { extra: { gia_foto: s.foto || null } });
    }
    const foto = salvaJpeg(req.body?.dati, 4_500_000);
    const vid = db.prepare('INSERT INTO volantini (utente_id, foto, catena_id, impronta, phash) VALUES (?, ?, ?, ?, ?)').run(req.utente.id, foto, cid, impronta, phash).lastInsertRowid;
    // si legge subito con il modello economico (pochi decimi di centesimo a pagina), finché la spesa del mese resta sotto il tetto;
    // le offerte entrano solo quando chi gestisce le controlla e le carica
    const auto = claude.attivo() && process.env.VOLANTINI_AUTOMATICI !== '0' && spesaMese() < TETTO();
    if (auto) leggiEElabora(vid, imp(req)).catch((e) => console.error('volantino', vid, e.message));
    return { ok: true, id: vid, leggibile: claude.attivo(), automatico: auto };
  });
  app.get('/api/volantini', async () => ({
    attivo: claude.attivo(), modello: claude.modelloVolantini(), preciso: claude.modello(), tetto: TETTO(),
    spesa: db.prepare("SELECT ROUND(COALESCE(SUM(costo), 0), 2) euro, COUNT(*) n FROM volantini WHERE costo IS NOT NULL AND creato_il >= date('now', 'start of month')").get(),
    lista: db.prepare(`SELECT v.id, v.foto, v.stato, v.creato_il, v.costo, v.catena_id, c.nome catena, u.nome, v.lettura IS NOT NULL letto, v.caricate, v.dubbie, v.dal, v.al, v.nota FROM volantini v LEFT JOIN catene c ON c.id = v.catena_id
      LEFT JOIN utenti u ON u.id = v.utente_id ORDER BY v.stato = 'da controllare' DESC, v.stato = 'da leggere' DESC, v.id DESC LIMIT 150`).all(),
  }));
  app.get('/api/volantini/:id', async (req) => { const v = uno(id(req.params.id)); return { ...v, lettura: v.lettura ? JSON.parse(v.lettura) : null }; });

  // Claude legge la pagina; le offerte vengono abbinate ai prodotti già noti, o a una voce per crearne di nuovi
  // quanto si è speso questo mese per leggere i volantini, e il tetto oltre il quale non si leggono più da soli
  const spesaMese = () => db.prepare("SELECT COALESCE(SUM(costo), 0) e FROM volantini WHERE costo IS NOT NULL AND creato_il >= date('now', 'start of month')").get().e;
  const TETTO = () => Number(process.env.CLAUDE_TETTO_MESE || 5);
  app.post('/api/volantini/:id/leggi', async (req) => leggi(uno(id(req.params.id)), { preciso: !!req.body?.preciso }));
  async function leggi(v, { preciso = false } = {}) {
    const nome = v.foto.replace(/^\/foto\//, ''); if (!/^[a-z0-9-]+\.jpg$/.test(nome)) throw new Errore('Foto non valida');
    let o;
    try { o = await claude.leggiVolantino(path.join(cartellaFoto, nome), { oggi: oggi(), catene: db.prepare('SELECT nome FROM catene').pluck().all(), ...(preciso ? { modello: claude.modello() } : {}) }); }
    catch (e) { throw new Errore(e.message, 502); }
    const prodotti = db.prepare('SELECT id, voce_id, nome, nome_scontrino, sfuso, quantita, marca FROM prodotti').all();
    const voci = db.prepare('SELECT id, nome, unita, reparto FROM voci').all();
    const offerte = (Array.isArray(o.offerte) ? o.offerte : []).filter((x) => x && x.nome && Number(x.prezzo) > 0).slice(0, 80);
    // il supermercato del volantino (scelto da chi l'ha mandato, o letto sulla pagina): i suoi prodotti si cercano per primi
    const c = v.catena_id ? db.prepare('SELECT id, nome FROM catene WHERE id = ?').get(v.catena_id) : catenaDa(o.supermercato);
    const abbinate = lettura.abbina(offerte.map((x) => ({ testo: String(x.nome), unita: x.unita || 'pz' })), prodotti, voci, c ? { catena_id: c.id, inCatena: diCatena(db, c.id) } : {});
    const righe = offerte.map((x, i) => {
      const a = abbinate[i];
      // non trovato col nome letto: il prodotto già censito più simile (nome, marca, formato), prima tra quelli del supermercato
      if (!a.prodotto_id) { const t = trovaCensito(db, { nome: String(x.nome), marca: x.marca || '', quantita: Number(x.quantita) > 0 ? Number(x.quantita) : null, sfuso: x.sfuso ? true : null, catena_id: c?.id }); if (t) { a.prodotto_id = t.id; a.sicuro = t.sicuro; } }
      // stesso prodotto solo se anche il formato torna (500 g e 1 kg sono prodotti diversi)
      const p0 = a.prodotto_id ? prodotti.find((q) => q.id === a.prodotto_id) : null;
      const p = p0 && (a.sicuro || simile(x.nome, p0.nome)) ? p0 : null;
      const formatoOk = p && (x.sfuso ? !!p.sfuso : !(p.quantita > 0) || !(Number(x.quantita) > 0) || Math.abs(p.quantita - Number(x.quantita)) < 0.001);
      const vv = formatoOk ? null : voceDi(String(x.nome), voci, prodotti); const tv = vv ? { voce: vv } : null;
      return {
        nome: maiuscola(String(x.nome).trim()).slice(0, 80), marca: x.marca || '', quantita: Number(x.quantita) > 0 ? Number(x.quantita) : null, unita: ['kg', 'l', 'pz'].includes(x.unita) ? x.unita : null,
        sfuso: !!x.sfuso, prezzo: r2(Number(x.prezzo)), prezzo_pieno: Number(x.prezzo_pieno) > 0 ? r2(Number(x.prezzo_pieno)) : null, bio: !!x.bio, italiano: !!x.italiano, condizioni: x.condizioni || '',
        prodotto_id: formatoOk ? p.id : null, prodotto: formatoOk ? p.nome : null, sicuro: formatoOk && a.sicuro,
        voce_id: formatoOk ? p.voce_id : tv?.voce.id ?? null, voce: formatoOk ? voci.find((q) => q.id === p.voce_id)?.nome : tv?.voce.nome ?? null,
        voce_nuova: !formatoOk && !tv ? { nome: nomeVoce(x.nome), ...(indovina(String(x.nome)) || { reparto: 'dispensa', unita: x.unita || 'pz' }) } : null,
      };
    });
    const vDal = DATA.test(o.valido_dal || '') ? o.valido_dal : oggi(); const vAl = DATA.test(o.valido_al || '') ? o.valido_al : null;
    const gia = c ? giaCaricate(c.id, vDal, vAl) : null;
    const esito = { gia: gia?.offerte ? gia : null, supermercato: o.supermercato || '', catena_id: c?.id ?? null, catena: c?.nome ?? null, valido_dal: DATA.test(o.valido_dal || '') ? o.valido_dal : null, valido_al: DATA.test(o.valido_al || '') ? o.valido_al : null, righe, uso: o.uso, letto_il: oggi() };
    db.prepare('UPDATE volantini SET lettura = ?, costo = COALESCE(costo, 0) + ?, catena_id = COALESCE(catena_id, ?) WHERE id = ?').run(JSON.stringify(esito), o.uso?.euro || 0, c?.id ?? null, v.id);
    return esito;
  }

  // carica le offerte controllate: prodotto esistente, oppure nuovo sotto una voce (esistente o nuova)
  // 0.70 le pagine del volantino di un supermercato degli ultimi 20 giorni (per chi sta per fotografare)
  const pagineDi = (cid) => db.prepare(`SELECT id, foto, stato, caricate, creato_il FROM volantini WHERE catena_id = ? AND stato != 'scartato' AND foto != '' AND creato_il >= datetime('now', '-20 days') ORDER BY id DESC LIMIT 40`).all(cid);

  // 0.70 Dopo la lettura di Claude, da sola: le offerte sicure entrano subito, le dubbie restano da controllare.
  //  - sicura: prodotto riconosciuto con certezza, supermercato e date lette, prezzo plausibile (né meno di un terzo né più del
  //    130% del prezzo che conosciamo)
  //  - già caricata: stessa offerta (prodotto, supermercato, prezzo, periodo) già nei prezzi
  //  - pagina doppione: almeno l'80% delle offerte riconosciute c'è già (le poche nuove entrano lo stesso)
  const ultimoPrezzo = (pid) => db.prepare('SELECT prezzo FROM prezzi WHERE prodotto_id = ? AND superato_il IS NULL ORDER BY rilevato_il DESC, id DESC LIMIT 1').get(pid)?.prezzo ?? null;
  function elabora(vid, s = imp({})) {
    const v = uno(vid); if (!v.lettura) return null;
    const l = JSON.parse(v.lettura); const righe = Array.isArray(l.righe) ? l.righe : [];
    if (!righe.length) { db.prepare("UPDATE volantini SET stato = 'scartato', nota = ?, caricate = 0, dubbie = 0 WHERE id = ?").run('nessuna offerta letta sulla pagina', vid); return { stato: 'scartato' }; }
    const c = l.catena_id ? db.prepare('SELECT * FROM catene WHERE id = ?').get(l.catena_id) : null;
    const dal = l.valido_dal || oggi(); const al = l.valido_al || null;
    const giaC = (r) => c && al && r.prodotto_id && db.prepare("SELECT 1 FROM prezzi WHERE prodotto_id = ? AND catena_id = ? AND offerta = 1 AND abs(prezzo - ?) < 0.005 AND valido_dal = ? AND valido_al = ?").get(r.prodotto_id, c.id, Number(r.prezzo), dal, al);
    const plausibile = (r) => { const u = ultimoPrezzo(r.prodotto_id); const x = Number(r.prezzo); return x > 0 && (u == null || (x >= u / 3 && x <= u * 1.3)); };
    let nota = '';
    if (!c) nota = 'manca il supermercato'; else if (!al) nota = 'manca la data di fine delle offerte';
    for (const r of righe) { delete r.fatto; if (giaC(r)) r.fatto = 'gia'; }
    const sicure = c && al ? righe.filter((r) => !r.fatto && r.prodotto_id && r.sicuro && plausibile(r)) : [];
    let x = { n: 0, caricati: [], fatti: [] };
    db.transaction(() => {
      if (sicure.length) x = inserisci(v, c, dal, al, sicure, s, v.utente_id);
      for (const r of x.fatti) r.fatto = 'caricata';
      for (const r of sicure) if (!r.fatto) r.fatto = 'gia'; // c'era già (stesso prezzo e periodo)
      const riconosciute = righe.filter((r) => r.prodotto_id).length; const gia = righe.filter((r) => r.fatto === 'gia').length;
      const dubbie = righe.filter((r) => !r.fatto).length;
      const doppione = riconosciute >= 3 && gia / riconosciute >= 0.8;
      const stato = dubbie ? 'da controllare' : doppione && !x.n ? 'doppione' : 'letto';
      db.prepare('UPDATE volantini SET lettura = ?, stato = ?, caricate = COALESCE(caricate, 0) + ?, dubbie = ?, dal = ?, al = ?, nota = ?, catena_id = COALESCE(catena_id, ?) WHERE id = ?')
        .run(JSON.stringify(l), stato, x.n, dubbie, dal, al, nota || (doppione ? 'offerte già caricate da altre pagine' : ''), c?.id ?? null, vid);
    })();
    for (const k of x.caricati) avvisaOfferta(k.p, c, k.prezzo).catch(() => {});
    return { stato: uno(vid).stato, caricate: x.n };
  }
  async function leggiEElabora(vid, s) { await leggi(uno(vid)); return elabora(vid, s); }
  app.post('/api/volantini/:id/elabora', async (req) => elabora(uno(id(req.params.id)).id, imp(req)));

  // 0.71 pulizia: la foto di una pagina non serve più quando le sue offerte sono scadute (dal giorno dopo la data «al»);
  // le pagine senza data (scartate, doppioni, mai lette) dopo 30 giorni. La riga resta (storico e costi), senza foto.
  // Una pagina ancora da controllare con le offerte già scadute si scarta: non c'è più niente da caricare.
  function pulisciFoto() {
    const vecchie = db.prepare(`SELECT id, foto, stato FROM volantini WHERE foto != ''
      AND ((al IS NOT NULL AND al < ?) OR (al IS NULL AND creato_il < datetime('now', '-30 days')))`).all(oggi());
    for (const v of vecchie) {
      const nome = String(v.foto).replace(/^\/foto\//, '');
      if (/^[a-z0-9-]+\.jpg$/.test(nome)) { try { fs.unlinkSync(path.join(cartellaFoto, nome)); } catch { /* già tolta */ } }
      const daFare = v.stato === 'da leggere' || v.stato === 'da controllare';
      db.prepare(`UPDATE volantini SET foto = ''${daFare ? ", stato = 'scartato', nota = 'offerte scadute prima del controllo'" : ''} WHERE id = ?`).run(v.id);
    }
    if (vecchie.length) console.log(`volantini: tolte ${vecchie.length} foto di offerte scadute`);
    return { tolte: vecchie.length };
  }
  app.post('/api/volantini/pulizia', async (req) => { if (!req.utente?.admin) throw new Errore('Questa parte è riservata a chi gestisce i prezzi', 403); return pulisciFoto(); });
  if (!process.env.OGGI_PROVA) { setTimeout(pulisciFoto, 90_000).unref?.(); setInterval(pulisciFoto, 24 * 3600_000).unref?.(); }

  // 0.70 una volta sola, all'avvio: le pagine «da leggere» di prima passano nel nuovo sistema (lette → elaborate; non lette → lette,
  // finché il tetto di spesa lo permette). Non nelle prove automatiche.
  if (!process.env.OGGI_PROVA) setTimeout(async () => {
    for (const v of db.prepare("SELECT id, lettura FROM volantini WHERE stato = 'da leggere' AND caricate IS NULL ORDER BY id").all()) {
      try {
        if (v.lettura) elabora(v.id);
        else if (claude.attivo() && spesaMese() < TETTO()) await leggiEElabora(v.id, imp({}));
      } catch (e) { console.error('volantino (passaggio)', v.id, e.message); }
    }
  }, 4000).unref?.();

  // 0.70: le offerte (già controllate) entrano nei prezzi: prodotto che c'è, oppure nuovo sotto una voce; le uguali non si ripetono.
  // Da chiamare dentro una transazione.
  function inserisci(v, c, dal, al, righe, s, utenteId) {
    let n = 0; let gia = 0; const nuovi = []; const caricati = []; const fatti = [];
      for (const r of righe) {
        let pid = r.prodotto_id ? id(r.prodotto_id) : null;
        const prezzo = numero(r.prezzo, { min: 0.01, max: 9999, nome: `Il prezzo di ${r.nome || 'un prodotto'}` });
        if (!pid) {
          let vid = r.voce_id ? id(r.voce_id) : null;
          if (!vid && r.voce_nuova?.nome) {
            const nomeV = testo(r.voce_nuova.nome, 60);
            vid = db.prepare('SELECT id FROM voci WHERE lower(nome) = lower(?)').get(nomeV)?.id
              ?? db.prepare('INSERT INTO voci (nome, reparto, unita) VALUES (?, ?, ?)').run(nomeV, ['ortofrutta', 'pane', 'fresco', 'dispensa', 'surgelati', 'bevande', 'casa', 'altro'].includes(r.voce_nuova.reparto) ? r.voce_nuova.reparto : 'dispensa', ['kg', 'l', 'pz'].includes(r.voce_nuova.unita) ? r.voce_nuova.unita : 'pz').lastInsertRowid;
          }
          if (!vid) continue;
          const voce = db.prepare('SELECT * FROM voci WHERE id = ?').get(vid);
          const nome = testo(r.nome, 80); if (!nome) continue;
          pid = db.prepare('SELECT id FROM prodotti WHERE voce_id = ? AND lower(nome) = lower(?)').get(vid, nome)?.id;
          if (!pid) {
            // già censito con un nome un po' diverso (stessa marca e formato, di preferenza in questo supermercato)? si usa quello e lo si completa
            const q0 = Number(r.quantita) > 0 && (!r.unita || r.unita === voce.unita) ? Number(r.quantita) : null;
            const t = trovaCensito(db, { nome, marca: r.marca || '', quantita: q0, sfuso: r.sfuso ? true : null, catena_id: c.id, voce_id: vid })
              || (() => { const x = trovaCensito(db, { nome, marca: r.marca || '', quantita: q0, sfuso: r.sfuso ? true : null, catena_id: c.id }); return x?.sicuro ? x : null; })();
            if (t) { pid = t.id; completa(db, pid, { marca: testo(r.marca, 60), origine: r.italiano ? 'italia' : '', bio: !!r.bio }); }
          }
          if (!pid) {
            // il formato si esprime nell'unità della voce (una voce a pezzi con un prodotto a peso: la confezione conta 1 pezzo)
            const sfuso = !!r.sfuso; const q = Number(r.quantita) > 0 ? Number(r.quantita) : null;
            const quantita = sfuso ? null : (r.unita && r.unita !== voce.unita ? (voce.unita === 'pz' ? 1 : null) : q);
            pid = db.prepare("INSERT INTO prodotti (voce_id, nome, tipo, marca, catena_id, origine, bio, sfuso, quantita) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)")
              .run(vid, nome, r.marca ? 'marca' : 'senza', testo(r.marca, 60), r.italiano ? 'italia' : '', r.bio ? 1 : 0, sfuso ? 1 : 0, quantita).lastInsertRowid;
            nuovi.push(nome);
          }
        }
        const p = db.prepare('SELECT p.*, v.reparto FROM prodotti p JOIN voci v ON v.id = p.voce_id WHERE p.id = ?').get(pid); if (!p) continue;
        // la stessa offerta (prodotto, supermercato, prezzo e periodo) c'è già: non si ripete
        if (db.prepare("SELECT 1 FROM prezzi WHERE prodotto_id = ? AND catena_id = ? AND offerta = 1 AND abs(prezzo - ?) < 0.005 AND valido_dal = ? AND valido_al = ?").get(p.id, c.id, prezzo, dal, al)) { gia++; continue; }
        db.prepare('INSERT INTO prezzi (prodotto_id, catena_id, citta, prezzo, unitario, offerta, rilevato_il, valido_dal, valido_al, fonte, utente_id, prezzo_pieno) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)')
          .run(p.id, c.id, zonaDi(c, s), prezzo, p.quantita > 0 ? prezzo / p.quantita : prezzo, oggi(), dal, al, 'volantino', utenteId, Number(r.prezzo_pieno) > prezzo ? Number(r.prezzo_pieno) : null);
        caricati.push({ p, prezzo }); n++; fatti.push(r);
      }
    return { n, gia, nuovi, caricati, fatti };
  }
  app.post('/api/volantini/:id/carica', async (req) => {
    const v = uno(id(req.params.id)); const b = req.body || {};
    const c = db.prepare('SELECT * FROM catene WHERE id = ?').get(id(b.catena_id)); if (!c) throw new Errore('Scegli il supermercato del volantino');
    const dal = DATA.test(b.valido_dal || '') ? b.valido_dal : oggi(); const al = DATA.test(b.valido_al || '') ? b.valido_al : null;
    if (!al) throw new Errore('Scrivi fino a quando valgono le offerte (la data «al»)');
    if (al < dal) throw new Errore('La data di fine viene prima di quella di inizio');
    const righe = (Array.isArray(b.righe) ? b.righe : []).slice(0, 80);
    let x = null;
    db.transaction(() => {
      x = inserisci(v, c, dal, al, righe, imp(req), v.utente_id ?? req.utente.id);
      db.prepare("UPDATE volantini SET stato = 'letto', catena_id = ?, caricate = COALESCE(caricate, 0) + ?, dubbie = 0, dal = ?, al = ? WHERE id = ?").run(c.id, x.n, dal, al, v.id);
    })();
    for (const k of x.caricati) avvisaOfferta(k.p, c, k.prezzo).catch(() => {});
    return { ok: true, prezzi: x.n, nuovi: x.nuovi, gia: x.gia };
  });
  app.put('/api/volantini/:id', async (req) => {
    const stato = ['da leggere', 'da controllare', 'letto', 'doppione', 'scartato'].includes(req.body?.stato) ? req.body.stato : 'scartato';
    db.prepare('UPDATE volantini SET stato = ? WHERE id = ?').run(stato, uno(id(req.params.id)).id);
    return { ok: true };
  });
}
