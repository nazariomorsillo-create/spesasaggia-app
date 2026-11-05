// Archivio SQLite (data/spesa.sqlite): schema, colonne aggiunte nel tempo, impostazioni e dati caricati a versioni
// (gli scontrini si caricano una volta sola, anche su un archivio già avviato).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { settimana } from './tempo.js';
import { SCONTRINI } from './scontrini.js';

export const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = fs.readFileSync(path.join(RADICE, 'server/schema.sql'), 'utf8');

export const PREDEFINITE = {
  citta: 'Ferrara',
  area: 'centro-nord',  // per le catene con prezzi per area (Eurospin: uguali in tutto il Centro-Nord)
  casa: { indirizzo: '', lat: null, lng: null },
  euro_km: 0.25,        // costo dell'auto al km
  soglia_negozio: 3,    // un negozio in più deve far risparmiare almeno tanto (tempo, parcheggio, coda)
  sosta: 12,            // minuti in ogni negozio oltre al tragitto
  max_negozi: 3,
  giorni_validi: 60,    // un prezzo senza scadenza vale per tanti giorni dalla rilevazione (poi è "vecchio")
};
export const AMBITI = ['nazionale', 'centro-nord', 'sud', 'citta'];

// 0.2 (31/10/2026): sfuso esplicito (prima: formato vuoto = sfuso) e scheda prodotto
const COLONNE = {
  prodotti: [['imballaggio', "TEXT NOT NULL DEFAULT ''"], ['valori', "TEXT NOT NULL DEFAULT ''"], ['sfuso', 'INTEGER NOT NULL DEFAULT 0'], ['descrizione', "TEXT NOT NULL DEFAULT ''"], ['ingredienti', "TEXT NOT NULL DEFAULT ''"],
    ['produttore', "TEXT NOT NULL DEFAULT ''"], ['provenienza', "TEXT NOT NULL DEFAULT ''"], ['foto', "TEXT NOT NULL DEFAULT ''"],
    ['nutriscore', "TEXT NOT NULL DEFAULT ''"], ['note', "TEXT NOT NULL DEFAULT ''"],
    // 0.3: gruppo NOVA (1 = non lavorato … 4 = ultra-lavorato) da Open Food Facts
    ['nova', 'INTEGER'],
    // 0.30: quanti pezzi dentro la confezione (4 scatolette, 6 bottiglie…); quantita resta il contenuto totale
    ['pezzi', 'INTEGER'],
    // 0.5: additivi in JSON ("[\"E330\"]"); vuoto = non si sa
    ['additivi', "TEXT NOT NULL DEFAULT ''"],
    // 0.18: casa e igiene (lo tiene aggiornato un trigger dal reparto della voce)
    ['non_alimentare', 'INTEGER NOT NULL DEFAULT 0']],
  // 0.4: spunta "preso" nella lista mentre si fa la spesa
  prezzi: [['utente_id', 'INTEGER'], ['prezzo_pieno', 'REAL'], ['superato_il', 'TEXT']], // 0.26: prezzo prima dello sconto (dal volantino), per dire quanto si risparmia
  // 0.20: tipo «fornitore» per chi vende fuori dai supermercati (vendita diretta, online, farmacia): prezzo uguale ovunque
  catene: [['proposta_da', 'INTEGER'], ['tipo', "TEXT NOT NULL DEFAULT 'supermercato'"]],
  // 0.17: la pubblicità ha due pulsanti: Scrivimi su WhatsApp (numero e messaggio già scritto) e Scopri di più (link)
  annunci: [['whatsapp', "TEXT NOT NULL DEFAULT ''"], ['messaggio', "TEXT NOT NULL DEFAULT ''"],
    // 0.22: tre posti in home (1°, 2°, 3°), annunci miei o pagati ogni 2 settimane, zona dell'inserzionista
    ['posizione', 'INTEGER'], ['mio', 'INTEGER NOT NULL DEFAULT 0'], ['inserzionista', "TEXT NOT NULL DEFAULT ''"], ['zona', "TEXT NOT NULL DEFAULT ''"],
    ['lat', 'REAL'], ['lng', 'REAL'], ['pagato_fino', "TEXT NOT NULL DEFAULT ''"], ['prezzo', 'REAL']],
  // 0.14: negozi presi dalla mappa (OpenStreetMap) e insegna
  negozi: [['osm_id', 'TEXT'], ['nome', "TEXT NOT NULL DEFAULT ''"],
    // 0.24: orari di apertura (quelli in uso, quelli della mappa, da dove vengono: mappa | sito | mano), sito del negozio
    ['orari', "TEXT NOT NULL DEFAULT ''"], ['orari_osm', "TEXT NOT NULL DEFAULT ''"], ['orari_fonte', "TEXT NOT NULL DEFAULT ''"], ['orari_quando', 'TEXT'], ['orari_da', 'INTEGER'], ['sito', "TEXT NOT NULL DEFAULT ''"], ['sito_quando', 'TEXT'],
    // 0.27: orari cercati su internet (Claude con la ricerca web): quando, e la pagina da cui vengono
    ['web_quando', 'TEXT'], ['orari_url', "TEXT NOT NULL DEFAULT ''"]],
  // 0.15: regione e città dell'indirizzo (per le statistiche per zona), app installata sul telefono
  geocache: [['regione', "TEXT NOT NULL DEFAULT ''"], ['citta', "TEXT NOT NULL DEFAULT ''"]],
  // 0.16: il raggio (km) entro cui la famiglia guarda i supermercati vicini
  famiglie: [['regione', "TEXT NOT NULL DEFAULT ''"], ['raggio', 'INTEGER NOT NULL DEFAULT 10']],
  // 0.14: i produttori pagano un canone mensile per essere nell'app (niente commissione sugli ordini)
  produttori: [['canone', 'REAL NOT NULL DEFAULT 0'], ['pagato_fino', "TEXT NOT NULL DEFAULT ''"], ['inizio', "TEXT NOT NULL DEFAULT ''"], ['canone_auto', 'INTEGER NOT NULL DEFAULT 1']],
  // 0.46: impronta della foto (la stessa foto non entra due volte); lo scontrino caricato sa da quale foto viene
  scontrini_foto: [['lettura', 'TEXT'], ['impronta', 'TEXT']],
  volantini: [['impronta', 'TEXT'], ['phash', 'TEXT'], ['caricate', 'INTEGER'], ['dubbie', 'INTEGER'], ['dal', 'TEXT'], ['al', 'TEXT'], ['nota', 'TEXT']],
  scontrini: [['foto_id', 'INTEGER']],
  utenti: [['produttore_id', 'INTEGER'], ['installata', 'INTEGER NOT NULL DEFAULT 0']],
  // 0.41: catena_id = la riga va presa in quel supermercato (offerta scelta dalla lista); offerta_nascosta = «non mi interessa»
  righe_lista: [['preso', 'INTEGER NOT NULL DEFAULT 0'], ['famiglia_id', 'INTEGER'], ['scelto', 'INTEGER NOT NULL DEFAULT 0'], ['catena_id', 'INTEGER'], ['offerta_nascosta', 'INTEGER NOT NULL DEFAULT 0'], ['migliore_nascosto', 'INTEGER NOT NULL DEFAULT 0'], ['prodotto_prima', 'INTEGER'], ['quantita_prima', 'REAL'], ['libera', 'INTEGER NOT NULL DEFAULT 0'], ['catena_libera', 'INTEGER']],
  // 0.74: dove prendi una cosa generica (0 = dove capita), per la riga e come abitudine per la volta dopo
  abitudini: [['catena_libera', 'INTEGER']],
  // 0.18: casa e igiene. Il nome del «pezzo» di una voce a pezzi (lavaggio, rotolo, capsula) e i prodotti non alimentari
  voci: [['pezzo', "TEXT NOT NULL DEFAULT ''"]],
};
// un prodotto è non alimentare se la sua voce è nel reparto Casa e igiene: lo tengono aggiornato questi trigger
// 0.54: un prodotto ha UN prezzo per supermercato (e zona): l'ultimo rilevato. Quelli prima restano solo come storico
// (superato_il). Fanno eccezione le offerte con il periodo (dal… al…): convivono con il prezzo normale; un'offerta nuova
// che si sovrappone alla stessa di prima la sostituisce.
const NORMALE = (t) => `NOT (${t}offerta = 1 AND ${t}valido_al IS NOT NULL)`;
const TRIGGER = `
CREATE TRIGGER IF NOT EXISTS prezzo_unico AFTER INSERT ON prezzi WHEN ${NORMALE('NEW.')} BEGIN
  UPDATE prezzi SET superato_il = datetime('now') WHERE prodotto_id = NEW.prodotto_id AND catena_id = NEW.catena_id AND citta = NEW.citta AND id != NEW.id
    AND superato_il IS NULL AND ${NORMALE('')} AND (rilevato_il < NEW.rilevato_il OR (rilevato_il = NEW.rilevato_il AND id < NEW.id));
  UPDATE prezzi SET superato_il = datetime('now') WHERE id = NEW.id AND EXISTS (SELECT 1 FROM prezzi q WHERE q.prodotto_id = NEW.prodotto_id AND q.catena_id = NEW.catena_id
    AND q.citta = NEW.citta AND q.id != NEW.id AND q.superato_il IS NULL AND ${NORMALE('q.')} AND q.rilevato_il > NEW.rilevato_il);
END;
CREATE TRIGGER IF NOT EXISTS offerta_unica AFTER INSERT ON prezzi WHEN NEW.offerta = 1 AND NEW.valido_al IS NOT NULL BEGIN
  UPDATE prezzi SET superato_il = datetime('now') WHERE prodotto_id = NEW.prodotto_id AND catena_id = NEW.catena_id AND citta = NEW.citta AND id != NEW.id
    AND superato_il IS NULL AND offerta = 1 AND valido_al IS NOT NULL AND COALESCE(valido_dal, rilevato_il) <= NEW.valido_al AND valido_al >= COALESCE(NEW.valido_dal, NEW.rilevato_il);
END;
CREATE TRIGGER IF NOT EXISTS prodotto_reparto_ins AFTER INSERT ON prodotti BEGIN
  UPDATE prodotti SET non_alimentare = (SELECT reparto = 'casa' FROM voci WHERE id = NEW.voce_id) WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS prodotto_reparto_upd AFTER UPDATE OF voce_id ON prodotti BEGIN
  UPDATE prodotti SET non_alimentare = (SELECT reparto = 'casa' FROM voci WHERE id = NEW.voce_id) WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS voce_reparto_upd AFTER UPDATE OF reparto ON voci BEGIN
  UPDATE prodotti SET non_alimentare = (NEW.reparto = 'casa') WHERE voce_id = NEW.id; END;
`;

export function apri(file = process.env.FILE_DATI || path.join(RADICE, 'data/spesa.sqlite')) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // 0.5: le abitudini della 0.4.2 non avevano la famiglia: si ripartono da zero
  const ab = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'abitudini'").get();
  if (ab && !db.prepare('PRAGMA table_info(abitudini)').all().some((c) => c.name === 'famiglia_id')) db.exec('DROP TABLE abitudini');
  db.exec(SCHEMA);
  for (const [tab, col] of Object.entries(COLONNE)) {
    const ci = new Set(db.prepare(`PRAGMA table_info(${tab})`).all().map((c) => c.name));
    for (const [n, tipo] of col) if (!ci.has(n)) db.exec(`ALTER TABLE ${tab} ADD COLUMN ${n} ${tipo}`);
  }
  db.exec(TRIGGER);
  aggiornaDati(db);
  riordinaPrezzi(db);
  return db;
}
// 0.54: i prezzi si mettono in ordine (uno per prodotto, supermercato e zona: il più recente); serve anche dopo un'unione di prodotti
export function riordinaPrezzi(db) {
  db.exec(`UPDATE prezzi SET superato_il = datetime('now') WHERE superato_il IS NULL AND ${NORMALE('')} AND EXISTS (SELECT 1 FROM prezzi q
    WHERE q.prodotto_id = prezzi.prodotto_id AND q.catena_id = prezzi.catena_id AND q.citta = prezzi.citta AND q.superato_il IS NULL AND ${NORMALE('q.')}
    AND (q.rilevato_il > prezzi.rilevato_il OR (q.rilevato_il = prezzi.rilevato_il AND q.id > prezzi.id)))`);
}

export function leggi(db, chiave) {
  const r = db.prepare('SELECT valore FROM impostazioni WHERE chiave = ?').get(chiave);
  return r ? JSON.parse(r.valore) : PREDEFINITE[chiave];
}
export function scrivi(db, chiave, valore) {
  db.prepare('INSERT INTO impostazioni (chiave, valore) VALUES (?, ?) ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore').run(chiave, JSON.stringify(valore));
}
export function impostazioni(db) { return Object.fromEntries(Object.keys(PREDEFINITE).map((k) => [k, leggi(db, k)])); }

// Zona in cui vale un prezzo della catena
export function zonaDi(catena, s) { return catena.ambito === 'nazionale' ? '' : catena.ambito === 'citta' ? s.citta : catena.ambito; }

// ---------- dati a versioni ----------
function aggiornaDati(db) {
  let v = leggi(db, 'versione_dati') ?? (db.prepare('SELECT 1 FROM catene').get() ? 1 : 0);
  const tx = db.transaction(() => {
    if (v < 1) { for (const s of SCONTRINI.filter((x) => x.versione === 1)) caricaScontrino(db, s); annuncioIniziale(db); v = 1; }
    if (v < 2) {
      // 0.1 → 0.2: il formato vuoto voleva dire sfuso
      db.prepare('UPDATE prodotti SET sfuso = 1 WHERE quantita IS NULL').run();
      // Eurospin: frutta e verdura italiane (Nazario compra solo vegetali italiani); prezzi uguali in tutto il Centro-Nord
      const e = db.prepare("SELECT id FROM catene WHERE nome = 'Eurospin'").get();
      if (e) {
        db.prepare("UPDATE catene SET ambito = 'centro-nord' WHERE id = ?").run(e.id);
        db.prepare("UPDATE prezzi SET citta = 'centro-nord' WHERE catena_id = ?").run(e.id);
        db.prepare(`UPDATE prodotti SET origine = 'italia' WHERE nome_scontrino IN ('CAROTE 1kg', 'CETRIOLI', 'RADICCHIO TONDO RO', 'ZUCCHINE', 'CLEMENTINE CON FOG')
          AND voce_id IN (SELECT id FROM voci WHERE reparto = 'ortofrutta')`).run();
      }
      for (const s of SCONTRINI.filter((x) => x.versione === 2)) caricaScontrino(db, s);
      v = 2;
    }
    if (v < 3) {
      // 0.7: il latte Sterilgarda dello scontrino Tosano è la confezione da 4 litri (3,99 € = 1,00 € al litro)
      const p = db.prepare("SELECT * FROM prodotti WHERE nome = 'Latte microfiltrato UHT parz. scremato Sterilgarda'").get();
      if (p && !(p.quantita > 1)) {
        db.prepare('UPDATE prodotti SET quantita = 4, sfuso = 0, nome = ? WHERE id = ?').run('Latte microfiltrato UHT parz. scremato Sterilgarda 4 x 1 l', p.id);
        db.prepare('UPDATE prezzi SET unitario = prezzo / 4 WHERE prodotto_id = ?').run(p.id);
      }
      v = 3;
    }
    if (v < 4) {
      // 0.9: le catene più diffuse in Italia, pronte da scegliere. Prezzi uguali in tutta Italia solo per i discount a listino nazionale;
      // per le altre il prezzo vale nella città (Coop e Conad cambiano da cooperativa a cooperativa).
      const ins = db.prepare('INSERT INTO catene (nome, ambito) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM catene WHERE lower(nome) = lower(?))');
      for (const n of ['Aldi', 'MD', 'Penny', "In's Mercato", 'Todis', 'Dpiù']) ins.run(n, 'nazionale', n);
      for (const n of ['Coop', 'Ipercoop', 'Conad', 'Esselunga', 'Famila', 'Interspar', 'Despar', 'Eurospar', 'Carrefour', 'Pam', 'Panorama', 'Crai', 'Sigma', 'Iper', 'Bennet', 'Il Gigante', 'Tigre', 'Prix', 'Alì', 'Unes', 'Iperal', 'Decò', 'Sisa', 'Gros', 'Sidis', 'Mercatò', 'Rossetto', 'NaturaSì', 'Sapori e Dintorni', 'Galassia', 'Spazio Conad', 'Conad City', 'Coop Alleanza 3.0', 'Nova Coop', 'Esselunga Superstore', 'Tuodì', 'Lando', 'Migross', 'Maxi Dì', 'Prezzemolo e Vitale', 'Doro', 'Dok', 'Deco', 'Ard Discount', 'Eté', 'Famila Superstore', 'Metà', 'Cadoro', 'Basko', 'Pewex', 'Elite', 'Oasi', 'Emisfero', 'Simply', 'Punto Simply', 'Carrefour Express', 'Carrefour Market', 'Ipersimply', 'Il Viaggiator Goloso', 'Unes U2', 'Tosano']) ins.run(n, 'citta', n);
      v = 4;
    }
    if (v < 5) {
      // 0.17: il link WhatsApp della pubblicità diventa il pulsante «Scrivimi su WhatsApp»; «Scopri di più» porta alla pagina del sito
      for (const a of db.prepare("SELECT * FROM annunci WHERE link LIKE 'https://wa.me/%'").all()) {
        const m = a.link.match(/^https:\/\/wa\.me\/(\d+)(?:\?text=(.*))?$/);
        if (!m) continue;
        db.prepare('UPDATE annunci SET whatsapp = ?, messaggio = ?, link = ?, bottone = ? WHERE id = ?')
          .run(m[1], m[2] ? decodeURIComponent(m[2]) : '', 'https://nazariosoluzionifinanziarie.it/cessione-del-quinto-ferrara/', 'Scopri di più', a.id);
      }
      v = 5;
    }
    if (v < 6) {
      // 0.18: casa e igiene — prodotti non alimentari; detersivo a lavaggi, carta a rotoli
      db.exec("UPDATE prodotti SET non_alimentare = (SELECT reparto = 'casa' FROM voci WHERE voci.id = prodotti.voce_id)");
      db.prepare("UPDATE voci SET pezzo = 'rotolo' WHERE unita = 'pz' AND pezzo = '' AND lower(nome) LIKE '%carta%rotoli%'").run();
      // il detersivo per lavatrice si confronta al lavaggio, se nessun suo prodotto ha già un formato in litri
      for (const v2 of db.prepare("SELECT * FROM voci WHERE lower(nome) LIKE 'detersivo%lavatrice%' AND unita = 'l'").all()) {
        if (!db.prepare('SELECT 1 FROM prodotti WHERE voce_id = ? AND quantita > 0').get(v2.id)) db.prepare("UPDATE voci SET unita = 'pz', pezzo = 'lavaggio' WHERE id = ?").run(v2.id);
      }
      v = 6;
    }
    if (v < 7) {
      // 0.22: l'annuncio che c'è già è il mio, al 1° posto; i produttori con un canone scritto a mano lo tengono
      const a = db.prepare('SELECT id FROM annunci WHERE attivo = 1 ORDER BY id LIMIT 1').get();
      if (a) db.prepare('UPDATE annunci SET mio = 1, posizione = 1 WHERE id = ?').run(a.id);
      db.prepare('UPDATE produttori SET canone_auto = 0 WHERE canone > 0').run();
      v = 7;
    }
    scrivi(db, 'versione_dati', v);
  });
  tx();
}

function annuncioIniziale(db) {
  if (db.prepare('SELECT 1 FROM annunci').get()) return;
  // la pubblicità del credito deve dire chi la fa: iscrizione OAM e banca mandante; nessun tasso o rata senza esempio con il TAEG
  db.prepare('INSERT INTO annunci (titolo, testo, whatsapp, messaggio, link, bottone, nota) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'La spesa costa meno. E le rate?',
    'Hai più finanziamenti? Ti aiuto a capire se riunirli in uno solo ti conviene. Consulenza senza impegno.',
    '393925086998', 'Ciao Nazario, vorrei una consulenza sulle mie rate',
    'https://nazariosoluzionifinanziarie.it/cessione-del-quinto-ferrara/', 'Scopri di più',
    'Nazario Morsillo · Agente in attività finanziaria iscritto OAM A16947, per Banca del Fucino');
}

// Carica uno scontrino (una volta sola): catena, negozio, voci, prodotti, prezzi della giornata
export function caricaScontrino(db, s) {
  const s0 = impostazioni(db);
  let cat = db.prepare('SELECT * FROM catene WHERE nome = ?').get(s.catena.nome);
  if (!cat) cat = db.prepare('SELECT * FROM catene WHERE id = ?').get(db.prepare('INSERT INTO catene (nome, ambito) VALUES (?, ?)').run(s.catena.nome, s.catena.ambito).lastInsertRowid);
  if (db.prepare('SELECT 1 FROM scontrini WHERE catena_id = ? AND numero = ? AND data = ?').get(cat.id, s.numero, s.data)) return null;
  let neg = db.prepare('SELECT * FROM negozi WHERE catena_id = ? AND indirizzo = ?').get(cat.id, s.negozio.indirizzo);
  if (!neg) neg = { id: db.prepare('INSERT INTO negozi (catena_id, indirizzo, citta) VALUES (?, ?, ?)').run(cat.id, s.negozio.indirizzo, s.negozio.citta).lastInsertRowid };
  const zona = zonaDi(cat, s0);
  const righe = []; const prezzi = [];
  for (const r of s.righe) {
    if (!r.voce) { righe.push({ testo: r.testo, quantita: r.q, unita: r.unita || 'pz', prezzo_unita: r.pu, importo: r.importo, prodotto_id: null }); continue; }
    const [vn, rep, un] = r.voce;
    let voce = db.prepare('SELECT * FROM voci WHERE lower(nome) = lower(?)').get(vn);
    if (!voce) voce = db.prepare('SELECT * FROM voci WHERE id = ?').get(db.prepare('INSERT INTO voci (nome, reparto, unita) VALUES (?, ?, ?)').run(vn, rep, un).lastInsertRowid);
    const p = { tipo: 'senza', marca: '', origine: '', bio: 0, quantita: null, sfuso: 0, note: '', ...r.prodotto };
    let prod = db.prepare('SELECT * FROM prodotti WHERE voce_id = ? AND nome = ?').get(voce.id, p.nome);
    if (!prod) {
      const pid = db.prepare(`INSERT INTO prodotti (voce_id, nome, tipo, marca, catena_id, origine, bio, quantita, sfuso, nome_scontrino, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(voce.id, p.nome, p.tipo, p.marca, p.tipo === 'supermercato' ? cat.id : null, p.origine, p.bio ? 1 : 0, p.quantita, p.sfuso ? 1 : 0, r.testo, p.note).lastInsertRowid;
      prod = db.prepare('SELECT * FROM prodotti WHERE id = ?').get(pid);
    }
    righe.push({ testo: r.testo, quantita: r.q, unita: r.unita || (prod.sfuso ? voce.unita : 'pz'), prezzo_unita: r.pu, importo: r.importo, prodotto_id: prod.id });
    // stesso prodotto due volte sullo scontrino: un prezzo solo
    if (!prezzi.some((x) => x.prodotto_id === prod.id)) prezzi.push({ prodotto_id: prod.id, prezzo: r.pu, unitario: prod.quantita > 0 ? r.pu / prod.quantita : r.pu, orto: voce.reparto === 'ortofrutta' });
  }
  const sid = db.prepare('INSERT INTO scontrini (catena_id, negozio_id, data, ora, numero, totale, righe) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(cat.id, neg.id, s.data, s.ora, s.numero, s.totale, JSON.stringify(righe)).lastInsertRowid;
  const ins = db.prepare("INSERT INTO prezzi (prodotto_id, catena_id, citta, prezzo, unitario, rilevato_il, valido_dal, valido_al, fonte, scontrino_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scontrino', ?)");
  const sett = s.fresco || settimana(s.data);
  for (const x of prezzi) ins.run(x.prodotto_id, cat.id, zona, x.prezzo, x.unitario, s.data, x.orto ? sett.dal : null, x.orto ? sett.al : null, sid);
  return sid;
}
