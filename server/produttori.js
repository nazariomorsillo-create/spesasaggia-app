// Produttori locali: le loro offerte compaiono accanto ai supermercati, il cliente prenota nell'app, ritira dal produttore
// e paga lì. Il produttore paga un canone mensile per essere nell'app (nessuna commissione: gli acquisti non passano di qui).
// Se il canone è scaduto (pagato_fino nel passato) il banco non si vede più, finché chi gestisce non segna il pagamento.
import * as mappe from './mappe.js';
import { invia as inviaWhatsapp } from './whatsapp.js';
import { numero as numeroTel } from './accesso.js';

const STATI = ['nuovo', 'confermato', 'pronto', 'ritirato', 'annullato'];
const euro = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;
const adesso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const r2 = (x) => Math.round(x * 100) / 100;
const oggi = () => new Date().toISOString().slice(0, 10);
const DATA = /^\d{4}-\d{2}-\d{2}$/;
// visibile a chi fa la spesa: attivo e con il canone in regola (vuoto = nessuna scadenza segnata)
const VISIBILE = "attivo = 1 AND (pagato_fino = '' OR pagato_fino >= date('now'))";
const visibile = (p) => !!p.attivo && (!p.pagato_fino || p.pagato_fino >= oggi());

export function produttori(app, db, { Errore, id, testo, numero, imp, mieCasa, canoneDi = () => ({ attivi: 0, euro: 0, raggio: 20 }) }) {
  // il canone che paga: calcolato dalle persone attive in zona (automatico) oppure quello scritto a mano
  const canoneEffettivo = (p) => { const c = canoneDi(p); return { ...c, euro_calcolato: c.euro, euro: p.canone_auto ? c.euro : p.canone }; };
  const casaDi = (req) => (mieCasa ? mieCasa(req) : imp(req).casa);
  const soloAdmin = (req) => { if (!req.utente?.admin) throw new Errore('Questa parte è riservata a chi gestisce l\'app', 403); };
  const mio = (req) => { const p = req.utente?.produttore_id && db.prepare('SELECT * FROM produttori WHERE id = ?').get(req.utente.produttore_id); if (!p) throw new Errore('Questa parte è solo per i produttori registrati', 403); return p; };
  const offerteDi = (pid, tutte = false) => db.prepare(`SELECT o.*, v.nome voce FROM offerte o LEFT JOIN voci v ON v.id = o.voce_id WHERE o.produttore_id = ? ${tutte ? '' : 'AND o.disponibile = 1'} ORDER BY o.nome`).all(pid)
    .map((o) => ({ ...o, bio: !!o.bio, disponibile: !!o.disponibile }));
  const km = (casa, p) => (casa?.lat && p.lat != null ? Math.round(mappe.kmStrada(casa, p) * 10) / 10 : null);
  const avvisa = (fid, t, link) => db.prepare('INSERT INTO avvisi (famiglia_id, testo, link) VALUES (?, ?, ?)').run(fid, t, link);
  const collega = (p) => { db.prepare('UPDATE utenti SET produttore_id = NULL WHERE produttore_id = ?').run(p.id); if (p.telefono && p.attivo) db.prepare('UPDATE utenti SET produttore_id = ? WHERE telefono = ?').run(p.id, p.telefono); };
  const righeDi = (o) => ({ ...o, righe: JSON.parse(o.righe || '[]') });

  // ---------- per chi fa la spesa ----------
  app.get('/api/produttori', async (req) => {
    const casa = casaDi(req);
    if (req.query.voce_id) {
      // le offerte dei produttori per una cosa della lista (pagina Scegli)
      return db.prepare(`SELECT o.*, p.nome produttore, p.orari, p.lat, p.lng FROM offerte o JOIN produttori p ON p.id = o.produttore_id WHERE o.voce_id = ? AND o.disponibile = 1 AND p.${VISIBILE}`).all(id(req.query.voce_id))
        .map((o) => ({ id: o.id, produttore_id: o.produttore_id, produttore: o.produttore, nome: o.nome, descrizione: o.descrizione, prezzo: o.prezzo, unita: o.unita, passo: o.passo, bio: !!o.bio, foto: o.foto, orari: o.orari, km: km(casa, o) }))
        .sort((a, b) => a.prezzo - b.prezzo);
    }
    return db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM offerte o WHERE o.produttore_id = p.id AND o.disponibile = 1) offerte FROM produttori p WHERE p.${VISIBILE}`).all()
      .filter((p) => p.offerte > 0 || req.utente?.admin)
      .map((p) => ({ id: p.id, nome: p.nome, descrizione: p.descrizione, citta: p.citta, orari: p.orari, offerte: p.offerte, km: km(casa, p) }))
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || a.nome.localeCompare(b.nome));
  });
  app.get('/api/produttori/tutti', async (req) => {
    soloAdmin(req);
    return db.prepare('SELECT p.*, (SELECT COUNT(*) FROM offerte o WHERE o.produttore_id = p.id) offerte, (SELECT COUNT(*) FROM ordini o WHERE o.produttore_id = p.id) ordini FROM produttori p ORDER BY p.attivo DESC, p.nome').all();
  });
  app.get('/api/produttori/:id', async (req) => {
    const p = db.prepare(`SELECT * FROM produttori WHERE id = ? AND ${VISIBILE}`).get(id(req.params.id)); if (!p) throw new Errore('Produttore non trovato', 404);
    const casa = casaDi(req);
    const dove = `${p.indirizzo}${p.citta && !p.indirizzo.toLowerCase().includes(p.citta.toLowerCase()) ? `, ${p.citta}` : ''}`;
    return { id: p.id, nome: p.nome, descrizione: p.descrizione, indirizzo: p.indirizzo, citta: p.citta, orari: p.orari, km: km(casa, p),
      link: p.indirizzo ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dove)}` : '', offerte: offerteDi(p.id),
      ordini: db.prepare("SELECT id, stato FROM ordini WHERE produttore_id = ? AND famiglia_id = ? AND stato IN ('nuovo', 'confermato', 'pronto')").all(p.id, req.famiglia.id) };
  });

  app.post('/api/ordini', async (req) => {
    const b = req.body || {};
    const p = db.prepare(`SELECT * FROM produttori WHERE id = ? AND ${VISIBILE}`).get(id(b.produttore_id)); if (!p) throw new Errore('Produttore non trovato', 404);
    const righe = [];
    for (const r of (Array.isArray(b.righe) ? b.righe : []).slice(0, 40)) {
      const o = db.prepare('SELECT * FROM offerte WHERE id = ? AND produttore_id = ? AND disponibile = 1').get(id(r.offerta_id), p.id); if (!o) continue;
      const q = numero(r.quantita, { min: 0.01, max: 500, nome: `La quantità di ${o.nome}` });
      righe.push({ offerta_id: o.id, nome: o.nome, quantita: q, unita: o.unita, prezzo: o.prezzo, importo: r2(q * o.prezzo) });
    }
    if (!righe.length) throw new Errore('Scegli almeno una cosa da ordinare');
    const totale = r2(righe.reduce((t, r) => t + r.importo, 0));
    const commissione = 0; // nessuna commissione: il produttore paga un canone
    const ritiro = testo(b.ritiro, 120); if (!ritiro) throw new Errore('Scrivi quando passi a ritirare (per esempio: venerdì verso le 18)');
    const oid = db.prepare('INSERT INTO ordini (produttore_id, famiglia_id, utente_id, righe, totale, commissione, ritiro, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(p.id, req.famiglia.id, req.utente.id, JSON.stringify(righe), totale, commissione, ritiro, testo(b.note, 300)).lastInsertRowid;
    const riassunto = righe.map((r) => `${r.nome} ${r.quantita} ${r.unita === 'pz' ? 'pz' : r.unita}`).join(', ');
    if (p.telefono) inviaWhatsapp(p.telefono, `Nuovo ordine n. ${oid} da ${req.utente.nome} (Spesa Saggia): ${riassunto}. Totale ${euro(totale)}, ritiro ${ritiro}. Apri spesasaggia.it → Altro → Il mio banco per confermarlo.`).catch(() => {});
    return righeDi(db.prepare('SELECT * FROM ordini WHERE id = ?').get(oid));
  });
  const mieiOrdini = (req) => db.prepare('SELECT o.*, p.nome p_nome, p.indirizzo p_indirizzo, p.citta p_citta, p.telefono p_telefono, p.orari p_orari FROM ordini o JOIN produttori p ON p.id = o.produttore_id WHERE o.famiglia_id = ? ORDER BY o.id DESC LIMIT 50').all(req.famiglia.id)
    .map((o) => ({ ...righeDi(o), produttore: { nome: o.p_nome, indirizzo: o.p_indirizzo, citta: o.p_citta, telefono: o.p_telefono ? `+39${o.p_telefono}` : '', orari: o.p_orari } }));
  app.get('/api/ordini', async (req) => mieiOrdini(req));
  app.put('/api/ordini/:id', async (req) => {
    const o = db.prepare('SELECT * FROM ordini WHERE id = ? AND famiglia_id = ?').get(id(req.params.id), req.famiglia.id); if (!o) throw new Errore('Ordine non trovato', 404);
    if (req.body?.stato !== 'annullato') throw new Errore('Puoi solo annullare un ordine');
    if (!['nuovo', 'confermato'].includes(o.stato)) throw new Errore('Questo ordine non si può più annullare: è già pronto o ritirato');
    db.prepare("UPDATE ordini SET stato = 'annullato', aggiornato_il = ? WHERE id = ?").run(adesso(), o.id);
    const p = db.prepare('SELECT * FROM produttori WHERE id = ?').get(o.produttore_id);
    if (p?.telefono) inviaWhatsapp(p.telefono, `L'ordine n. ${o.id} su Spesa Saggia è stato annullato dal cliente.`).catch(() => {});
    return mieiOrdini(req);
  });

  // ---------- per il produttore ----------
  const vistaMia = (req) => {
    const p = mio(req);
    const ordini = db.prepare('SELECT o.*, u.nome cliente, u.telefono tel FROM ordini o LEFT JOIN utenti u ON u.id = o.utente_id WHERE o.produttore_id = ? ORDER BY o.id DESC LIMIT 100').all(p.id)
      .map((o) => ({ ...righeDi(o), telefono: o.tel ? `+39${o.tel}` : '' }));
    return { id: p.id, nome: p.nome, descrizione: p.descrizione, indirizzo: p.indirizzo, citta: p.citta, orari: p.orari, canone: canoneEffettivo(p).euro, canone_auto: !!p.canone_auto, pagato_fino: p.pagato_fino, inizio: p.inizio, attivo: !!p.attivo, visibile: visibile(p), offerte: offerteDi(p.id, true), ordini };
  };
  app.get('/api/produttore/mio', async (req) => vistaMia(req));
  app.get('/api/produttore/riepilogo', async (req) => {
    const p = mio(req);
    return db.prepare("SELECT substr(aggiornato_il, 1, 7) mese, COUNT(*) ordini, ROUND(SUM(totale), 2) venduto FROM ordini WHERE produttore_id = ? AND stato = 'ritirato' GROUP BY mese ORDER BY mese DESC LIMIT 24").all(p.id);
  });
  const datiOfferta = (b, prima = {}) => {
    const v = (k, f) => (b[k] !== undefined ? f(b[k]) : prima[k]);
    const d = { nome: v('nome', (x) => testo(x, 80)), descrizione: v('descrizione', (x) => testo(x, 300)) || '', prezzo: v('prezzo', (x) => numero(x, { min: 0.01, max: 999, nome: 'Il prezzo' })),
      unita: v('unita', (x) => (['kg', 'pz', 'l'].includes(x) ? x : 'kg')) || 'kg', passo: v('passo', (x) => numero(x, { min: 0.05, max: 100, nome: 'La quantità minima' })) ?? 1,
      bio: v('bio', (x) => (x ? 1 : 0)) ?? 0, foto: v('foto', (x) => (/^(https:\/\/|\/foto\/)/.test(String(x)) ? testo(x, 400) : '')) || '',
      disponibile: v('disponibile', (x) => (x ? 1 : 0)) ?? 1, voce_id: v('voce_id', (x) => (x ? id(x) : null)) ?? null };
    if (!d.nome) throw new Errore('Scrivi il nome del prodotto'); if (!(d.prezzo > 0)) throw new Errore('Scrivi il prezzo');
    if (d.voce_id && !db.prepare('SELECT 1 FROM voci WHERE id = ?').get(d.voce_id)) d.voce_id = null;
    return d;
  };
  app.post('/api/produttore/offerte', async (req) => {
    const p = mio(req); const d = datiOfferta(req.body || {});
    db.prepare('INSERT INTO offerte (produttore_id, voce_id, nome, descrizione, prezzo, unita, passo, bio, foto, disponibile) VALUES (@p, @voce_id, @nome, @descrizione, @prezzo, @unita, @passo, @bio, @foto, @disponibile)').run({ ...d, p: p.id });
    return offerteDi(p.id, true);
  });
  app.put('/api/produttore/offerte/:id', async (req) => {
    const p = mio(req); const o = db.prepare('SELECT * FROM offerte WHERE id = ? AND produttore_id = ?').get(id(req.params.id), p.id); if (!o) throw new Errore('Prodotto non trovato', 404);
    const d = datiOfferta(req.body || {}, o);
    db.prepare('UPDATE offerte SET voce_id = @voce_id, nome = @nome, descrizione = @descrizione, prezzo = @prezzo, unita = @unita, passo = @passo, bio = @bio, foto = @foto, disponibile = @disponibile WHERE id = @id').run({ ...d, id: o.id });
    return offerteDi(p.id, true);
  });
  app.delete('/api/produttore/offerte/:id', async (req) => { const p = mio(req); db.prepare('DELETE FROM offerte WHERE id = ? AND produttore_id = ?').run(id(req.params.id), p.id); return offerteDi(p.id, true); });
  app.put('/api/produttore/ordini/:id', async (req) => {
    const p = mio(req); const o = db.prepare('SELECT * FROM ordini WHERE id = ? AND produttore_id = ?').get(id(req.params.id), p.id); if (!o) throw new Errore('Ordine non trovato', 404);
    const stato = String(req.body?.stato || ''); if (!STATI.includes(stato)) throw new Errore('Stato non valido');
    db.prepare('UPDATE ordini SET stato = ?, aggiornato_il = ? WHERE id = ?').run(stato, adesso(), o.id);
    const frasi = {
      confermato: `${p.nome} ha confermato il tuo ordine n. ${o.id}. Ritiro: ${o.ritiro}.`,
      pronto: `Il tuo ordine n. ${o.id} da ${p.nome} è pronto: lo ritiri in ${p.indirizzo}${p.citta ? `, ${p.citta}` : ''} (${o.ritiro}) e paghi lì ${euro(o.totale)}.`,
      annullato: `${p.nome} non può preparare l'ordine n. ${o.id}: è stato annullato.`,
      ritirato: `Ordine n. ${o.id} da ${p.nome} ritirato. Grazie!`,
    };
    if (frasi[stato]) {
      avvisa(o.famiglia_id, frasi[stato], '#ordini');
      if (process.env.WHATSAPP_SERVIZIO) for (const u of db.prepare('SELECT telefono FROM utenti WHERE famiglia_id = ?').all(o.famiglia_id)) inviaWhatsapp(u.telefono, frasi[stato]).catch(() => {});
    }
    return vistaMia(req);
  });

  // ---------- per chi gestisce ----------
  const datiProduttore = async (b, prima = {}) => {
    const v = (k, f) => (b[k] !== undefined ? f(b[k]) : prima[k]);
    const d = { nome: v('nome', (x) => testo(x, 80)), descrizione: v('descrizione', (x) => testo(x, 400)) || '', indirizzo: v('indirizzo', (x) => testo(x, 160)) || '', citta: v('citta', (x) => testo(x, 60)) || '',
      telefono: v('telefono', (x) => { if (!String(x || '').trim()) return ''; const t = numeroTel(x); if (!t) throw new Errore('Il cellulare del produttore non è valido'); return t; }) || '',
      orari: v('orari', (x) => testo(x, 160)) || '', canone: v('canone', (x) => (x === '' || x == null ? 0 : numero(x, { min: 0, max: 1000, nome: 'Il canone mensile' }))) ?? 0,
      // se si scrive un canone senza dire «automatico», vale quello scritto
      canone_auto: b.canone_auto !== undefined ? (b.canone_auto ? 1 : 0) : b.canone !== undefined && Number(String(b.canone).replace(',', '.')) > 0 ? 0 : prima.canone_auto ?? 1,
      pagato_fino: v('pagato_fino', (x) => { const d = String(x || '').trim(); if (d && !DATA.test(d)) throw new Errore('La data «pagato fino a» non è valida'); return d; }) || '',
      inizio: v('inizio', (x) => { const d = String(x || '').trim(); if (d && !DATA.test(d)) throw new Errore('La data di inizio non è valida'); return d; }) || prima.inizio || oggi(),
      commissione: 0, attivo: v('attivo', (x) => (x ? 1 : 0)) ?? 1, lat: prima.lat ?? null, lng: prima.lng ?? null };
    if (!d.nome) throw new Errore('Scrivi il nome del produttore');
    if (d.indirizzo && (d.indirizzo !== prima.indirizzo || d.citta !== prima.citta || d.lat == null)) {
      const c = await mappe.coordinate(db, `${d.indirizzo}${d.citta && !d.indirizzo.toLowerCase().includes(d.citta.toLowerCase()) ? `, ${d.citta}` : ''}`);
      if (!c?.lat) throw new Errore('Non trovo l\'indirizzo sulla mappa: controlla via, numero e città');
      d.lat = c.lat; d.lng = c.lng;
    }
    return d;
  };
  app.post('/api/produttori', async (req) => {
    const d = await datiProduttore(req.body || {});
    const pid = db.prepare('INSERT INTO produttori (nome, descrizione, indirizzo, citta, lat, lng, telefono, orari, commissione, attivo, canone, pagato_fino, inizio, canone_auto) VALUES (@nome, @descrizione, @indirizzo, @citta, @lat, @lng, @telefono, @orari, @commissione, @attivo, @canone, @pagato_fino, @inizio, @canone_auto)').run(d).lastInsertRowid;
    const p = db.prepare('SELECT * FROM produttori WHERE id = ?').get(pid); collega(p); return p;
  });
  app.put('/api/produttori/:id', async (req) => {
    const p = db.prepare('SELECT * FROM produttori WHERE id = ?').get(id(req.params.id)); if (!p) throw new Errore('Produttore non trovato', 404);
    const d = await datiProduttore(req.body || {}, p);
    db.prepare('UPDATE produttori SET nome = @nome, descrizione = @descrizione, indirizzo = @indirizzo, citta = @citta, lat = @lat, lng = @lng, telefono = @telefono, orari = @orari, attivo = @attivo, canone = @canone, pagato_fino = @pagato_fino, inizio = @inizio, canone_auto = @canone_auto WHERE id = @id').run({ ...d, id: p.id });
    const n = db.prepare('SELECT * FROM produttori WHERE id = ?').get(p.id); collega(n); return n;
  });
  // i canoni: chi è in regola, chi è scaduto, e quanto vende ogni mese (per capire se il banco funziona)
  app.get('/api/canoni', async () => {
    const mesi = db.prepare("SELECT produttore_id, substr(aggiornato_il, 1, 7) mese, COUNT(*) ordini, ROUND(SUM(totale), 2) venduto FROM ordini WHERE stato = 'ritirato' GROUP BY produttore_id, mese ORDER BY mese DESC").all();
    return db.prepare('SELECT id, nome, attivo, canone, pagato_fino, inizio, lat, lng, canone_auto FROM produttori ORDER BY nome').all().map((p) => { const c = canoneEffettivo(p); return { ...p, canone: c.euro, canone_auto: !!p.canone_auto, calcolato: c.euro_calcolato, attivi: c.attivi, raggio: c.raggio, attivo: !!p.attivo, visibile: visibile(p), mesi: mesi.filter((m) => m.produttore_id === p.id).map(({ produttore_id, ...m }) => m) }; });
  });
  // segna il canone pagato fino a una data (chi gestisce)
  app.put('/api/canoni/:id', async (req) => {
    const p = db.prepare('SELECT * FROM produttori WHERE id = ?').get(id(req.params.id)); if (!p) throw new Errore('Produttore non trovato', 404);
    const d = String(req.body?.pagato_fino || '').trim(); if (d && !DATA.test(d)) throw new Errore('La data non è valida');
    db.prepare('UPDATE produttori SET pagato_fino = ? WHERE id = ?').run(d, p.id);
    return db.prepare('SELECT * FROM produttori WHERE id = ?').get(p.id);
  });
}
