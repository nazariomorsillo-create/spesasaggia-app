// Statistiche d'uso per chi gestisce: quante persone e famiglie, quante hanno installato l'app, quanto la usano,
// da dove (Nord, Centro, Sud e isole; le città più presenti). Solo numeri aggregati: niente nomi, niente telefoni.
import { zonaItalia } from './mappe.js';
import { piuGiorni } from './tempo.js';

const lunedi = (d) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };

export function statistiche(app, db, { oggi }) {
  // i giorni si contano dal giorno di oggi in ora italiana (come quelli registrati)
  const giorniFa = (n) => piuGiorni(oggi(), -n);
  // l'app segnala quando è installata sul telefono (schermata Home)
  app.post('/api/uso', async (req) => {
    if (req.body?.installata) db.prepare('UPDATE utenti SET installata = 1 WHERE id = ?').run(req.utente.id);
    return { ok: true };
  });

  app.get('/api/statistiche', async () => {
    const n = (sql, ...a) => db.prepare(sql).get(...a).n;
    const oggiS = oggi();
    const famiglie = db.prepare('SELECT f.id, f.casa, f.citta, f.regione, (SELECT COUNT(*) FROM utenti u WHERE u.famiglia_id = f.id) utenti FROM famiglie f').all()
      .map((f) => { let casa = {}; try { casa = JSON.parse(f.casa || '{}'); } catch { /* niente */ } return { ...f, lat: casa.lat ?? null, zona: casa.lat != null || f.regione ? zonaItalia(f.regione, casa.lat) : 'Non indicata' }; });
    const zone = ['Nord', 'Centro', 'Sud e isole', 'Non indicata'].map((z) => ({ zona: z, famiglie: famiglie.filter((f) => f.zona === z).length, utenti: famiglie.filter((f) => f.zona === z).reduce((t, f) => t + f.utenti, 0) }));
    const perCitta = new Map();
    for (const f of famiglie) { const c = String(f.citta || '').trim(); if (!c) continue; const k = c.toLowerCase(); const v = perCitta.get(k) || { citta: c, famiglie: 0, utenti: 0 }; v.famiglie++; v.utenti += f.utenti; perCitta.set(k, v); }
    const citta = [...perCitta.values()].sort((a, b) => b.famiglie - a.famiglie).slice(0, 12);
    // nuove persone per settimana (ultime 10) e persone attive per giorno (ultimi 14)
    const nuovi = new Map();
    for (const r of db.prepare("SELECT substr(creato_il, 1, 10) g FROM utenti WHERE creato_il >= ?").all(giorniFa(70))) { const k = lunedi(r.g); nuovi.set(k, (nuovi.get(k) || 0) + 1); }
    const settimane = []; for (let i = 9; i >= 0; i--) { const k = lunedi(giorniFa(i * 7)); settimane.push({ settimana: k, utenti: nuovi.get(k) || 0 }); }
    const giorni = []; for (let i = 13; i >= 0; i--) { const g = giorniFa(i); giorni.push({ giorno: g, utenti: n('SELECT COUNT(*) n FROM uso_giorni WHERE giorno = ?', g) }); }
    return {
      aggiornate: oggiS,
      persone: n('SELECT COUNT(*) n FROM utenti'), famiglie: famiglie.length,
      installazioni: n('SELECT COUNT(*) n FROM utenti WHERE installata = 1'),
      attivi: { oggi: n('SELECT COUNT(DISTINCT utente_id) n FROM uso_giorni WHERE giorno = ?', oggiS), settimana: n('SELECT COUNT(DISTINCT utente_id) n FROM uso_giorni WHERE giorno >= ?', giorniFa(6)), mese: n('SELECT COUNT(DISTINCT utente_id) n FROM uso_giorni WHERE giorno >= ?', giorniFa(29)) },
      // quante volte a settimana, in media, apre l'app chi l'ha aperta nell'ultimo mese
      // per ognuno si contano solo le settimane da quando è entrato (al massimo 4), così i nuovi non abbassano la media
      frequenza: (() => {
        const righe = db.prepare('SELECT utente_id, COUNT(*) aperture, MIN(giorno) primo FROM uso_giorni WHERE giorno >= ? GROUP BY utente_id').all(giorniFa(27));
        if (!righe.length) return 0;
        const perSett = righe.map((r) => { const giorni = Math.min(28, Math.round((Date.parse(oggiS) - Date.parse(r.primo)) / 86400000) + 1); return r.aperture / Math.max(1, giorni / 7); });
        return Math.round((perSett.reduce((t, x) => t + x, 0) / perSett.length) * 10) / 10;
      })(),
      zone, citta, settimane, giorni,
      contenuti: { liste: n('SELECT COUNT(*) n FROM righe_lista'), spese: n('SELECT COUNT(*) n FROM spese'), prezzi: n('SELECT COUNT(*) n FROM prezzi'), prezziMese: n('SELECT COUNT(*) n FROM prezzi WHERE creato_at >= ?', giorniFa(29)), scontrini: n('SELECT COUNT(*) n FROM scontrini_foto'), prodotti: n('SELECT COUNT(*) n FROM prodotti'), voti: n('SELECT COUNT(*) n FROM valutazioni'), supermercati: n('SELECT COUNT(DISTINCT catena_id) n FROM famiglia_catene') },
      produttori: { attivi: n('SELECT COUNT(*) n FROM produttori WHERE attivo = 1'), ordini: n('SELECT COUNT(*) n FROM ordini'), ordiniMese: n('SELECT COUNT(*) n FROM ordini WHERE creato_il >= ?', giorniFa(29)) },
    };
  });
}
