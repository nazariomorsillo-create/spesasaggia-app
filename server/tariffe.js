// Tariffe per chi paga: produttori nella lista (canone mensile) e pubblicità in home (ogni 2 settimane, 3 posti).
// Il prezzo dipende dalle persone attive in zona: chi ha aperto l'app negli ultimi 30 giorni e abita entro il raggio.
import { leggi, scrivi } from './db.js';
import * as mappe from './mappe.js';

export const PREDEFINITE = {
  raggio_km: 20,
  // [fino a quante persone attive, euro]; l'ultimo senza limite
  produttori: [[250, 0], [500, 15], [1000, 25], [2500, 39], [5000, 59], [10000, 89], [null, 119]],
  home: [[500, 19], [1000, 29], [2500, 49], [5000, 79], [10000, 129], [null, 199]],
  // il 1° posto paga il prezzo pieno, il 2° e il 3° un po' meno (come le prime posizioni su Google)
  posizioni: [1, 0.9, 0.8],
  giorni_home: 14,
};
export const tariffe = (db) => ({ ...PREDEFINITE, ...(leggi(db, 'tariffe') || {}) });

// controlla e salva le tariffe scritte da chi gestisce
export function salvaTariffe(db, b, Errore) {
  const t = tariffe(db);
  const scaglioni = (x, nome) => {
    if (!Array.isArray(x) || !x.length) throw new Errore(`Scaglioni ${nome} non validi`);
    const r = x.map(([fino, euro], i) => {
      const f = fino === null || fino === '' || i === x.length - 1 ? null : Math.round(Number(fino));
      const e = Math.round(Number(String(euro).replace(',', '.')) * 100) / 100;
      if (f !== null && !(f > 0)) throw new Errore(`Nella tabella ${nome} il numero di persone non è valido`);
      if (!(e >= 0)) throw new Errore(`Nella tabella ${nome} il prezzo non è valido`);
      return [f, e];
    });
    for (let i = 1; i < r.length - 1; i++) if (r[i][0] <= r[i - 1][0]) throw new Errore(`Nella tabella ${nome} gli scaglioni devono crescere`);
    return r;
  };
  const n = {
    raggio_km: b.raggio_km !== undefined ? Math.max(1, Math.min(100, Math.round(Number(b.raggio_km)) || 20)) : t.raggio_km,
    produttori: b.produttori !== undefined ? scaglioni(b.produttori, 'produttori') : t.produttori,
    home: b.home !== undefined ? scaglioni(b.home, 'pubblicità') : t.home,
    posizioni: b.posizioni !== undefined ? b.posizioni.slice(0, 3).map((x) => Math.max(0.1, Math.min(1, Number(String(x).replace(',', '.')) || 1))) : t.posizioni,
    giorni_home: t.giorni_home,
  };
  scrivi(db, 'tariffe', n);
  return n;
}

const giorniFa = (g) => new Date(Date.now() - g * 86400000).toISOString().slice(0, 10);
// persone attive negli ultimi 30 giorni che abitano entro «km» dal punto (senza punto: in tutta l'app)
export function attiviVicino(db, centro, km) {
  const attivi = db.prepare(`SELECT DISTINCT u.id, f.casa FROM uso_giorni g JOIN utenti u ON u.id = g.utente_id JOIN famiglie f ON f.id = u.famiglia_id WHERE g.giorno >= ?`).all(giorniFa(29));
  if (!centro?.lat) return attivi.length;
  return attivi.filter((a) => { let c = {}; try { c = JSON.parse(a.casa || '{}'); } catch { /* niente */ } return c.lat != null && mappe.distanzaKm(centro, c) <= km; }).length;
}
export const prezzoDa = (scaglioni, n) => { for (const [fino, euro] of scaglioni) if (fino === null || n <= fino) return euro; return scaglioni.at(-1)[1]; };

export function canoneProduttore(db, p) {
  const t = tariffe(db); const n = attiviVicino(db, p.lat != null ? p : null, t.raggio_km);
  return { attivi: n, euro: prezzoDa(t.produttori, n), raggio: t.raggio_km };
}
// prezzi dei 3 posti in home per una zona (ogni 2 settimane, arrotondati all'euro)
export function prezziHome(db, centro) {
  const t = tariffe(db); const n = attiviVicino(db, centro?.lat != null ? centro : null, t.raggio_km); const base = prezzoDa(t.home, n);
  return { attivi: n, raggio: t.raggio_km, giorni: t.giorni_home, base, posti: t.posizioni.map((k) => Math.round(base * k)) };
}
