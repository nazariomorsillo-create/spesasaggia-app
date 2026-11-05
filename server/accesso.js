// Accesso con il numero di cellulare e un codice di 6 cifre via WhatsApp: niente password da ricordare.
// Ogni persona appartiene a una famiglia; la famiglia ha la sua lista, le sue abitudini e il suo indirizzo di casa.
// I prezzi, i prodotti e i voti sono della community: li vedono tutti.
import crypto from 'node:crypto';
import { invia, stato as statoWhatsapp } from './whatsapp.js';
import QRCode from 'qrcode';

const COOKIE = 'ds';
const UN_ANNO = 365 * 24 * 3600;
const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
const ora = (secondi = 0) => new Date(Date.now() + secondi * 1000).toISOString().slice(0, 19).replace('T', ' ');
// "+39 392 508 6998", "0039 3925086998" → "3925086998"; solo cellulari italiani
export function numero(x) {
  let t = String(x || '').replace(/[^\d+]/g, '');
  t = t.replace(/^(\+39|0039)/, '');
  return /^3\d{8,9}$/.test(t) ? t : null;
}
const admin = (tel) => String(process.env.ADMIN || '').split(',').map(numero).filter(Boolean).includes(tel);
const cookie = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((x) => x.trim().split('=')).filter((x) => x[0]));
const ip = (req) => String(req.headers['x-real-ip'] || req.ip || '');

// Indirizzi senza accesso e indirizzi solo per l'amministratore (chi carica prezzi, negozi, scontrini, pubblicità)
const LIBERI = [/^\/api\/accesso/, /^\/api\/stato$/];
// il servizio WhatsApp dell'app avvisa qui (dall'interno del server) di messaggi e connessione
const DAL_SERVER = (req) => !req.headers['x-real-ip'] && !req.headers['x-forwarded-for'] && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
const SOLO_ADMIN = [['PUT', /^\/api\/impostazioni/], ['POST', /^\/api\/produttori$/], ['PUT', /^\/api\/produttori\/\d+$/], ['GET', /^\/api\/canoni/], ['PUT', /^\/api\/canoni/], ['GET', /^\/api\/statistiche/], ['GET', /^\/api\/volantini(?!\/catena\/\d+$)/], ['PUT', /^\/api\/volantini/], ['POST', /^\/api\/volantini\/\d+\//], ['PUT', /^\/api\/catene/], ['PUT', /^\/api\/negozi\/\d+$/], ['PUT', /^\/api\/negozi\/\d+\/pagina-orari$/],
  ['PUT', /^\/api\/voci\//], ['GET', /^\/api\/scontrini(?!\/mio\/)/], ['PUT', /^\/api\/scontrini/], ['POST', /^\/api\/scontrini\/foto\/\d+\//], ['GET', /^\/api\/annunci/], ['POST', /^\/api\/annunci/], ['PUT', /^\/api\/annunci/], ['GET', /^\/api\/tariffe/], ['PUT', /^\/api\/tariffe/], ['GET', /^\/api\/segnalazioni/], ['PUT', /^\/api\/segnalazioni/]];

export function accesso(app, db, { Errore }) {
  const utenteDa = (req) => {
    const t = cookie(req)[COOKIE]; if (!t) return null;
    const s = db.prepare('SELECT u.* FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.impronta = ? AND s.scade > ?').get(sha(t), ora());
    return s || null;
  };
  const famigliaDi = (u) => {
    const f = u?.famiglia_id ? db.prepare('SELECT * FROM famiglie WHERE id = ?').get(u.famiglia_id) : null;
    if (!f) return null;
    let casa = {}; try { casa = JSON.parse(f.casa || '{}'); } catch { /* vuota */ }
    return { ...f, casa };
  };

  db.exec('CREATE TABLE IF NOT EXISTS ponti (impronta TEXT PRIMARY KEY, utente_id INTEGER NOT NULL, scade TEXT NOT NULL, usato INTEGER NOT NULL DEFAULT 0)');
  const apriSessione = (req, rep, uid) => {
    db.prepare('UPDATE utenti SET ultimo_accesso = ? WHERE id = ?').run(ora(), uid);
    const gettone = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessioni (impronta, utente_id, scade) VALUES (?, ?, ?)').run(sha(gettone), uid, ora(UN_ANNO));
    rep.header('Set-Cookie', `${COOKIE}=${gettone}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${UN_ANNO}${req.headers['x-forwarded-proto'] === 'https' || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers.host || '')) ? '; Secure' : ''}`);
  };

  app.addHook('onRequest', async (req, rep) => {
    const url = req.url.split('?')[0];
    if (url.startsWith('/api/whatsapp-web/')) { if (DAL_SERVER(req)) return undefined; rep.code(403).send({ errore: 'no' }); return rep; }
    req.utente = utenteDa(req); req.famiglia = famigliaDi(req.utente);
    if (req.utente?.admin && String(process.env.ADMIN || '').trim() && !admin(req.utente.telefono)) { db.prepare('UPDATE utenti SET admin = 0 WHERE id = ?').run(req.utente.id); req.utente = { ...req.utente, admin: 0 }; }
    if (!url.startsWith('/api/') || LIBERI.some((r) => r.test(url))) return undefined;
    if (!req.utente || !req.famiglia) { rep.code(401).send({ errore: 'accesso' }); return rep; }
    if (!req.utente.admin && SOLO_ADMIN.some(([m, r]) => m === req.method && r.test(url))) { rep.code(403).send({ errore: 'Questa parte è riservata a chi gestisce i prezzi' }); return rep; }
    return undefined;
  });

  // 1. chiede il codice
  app.post('/api/accesso/codice', async (req) => {
    const tel = numero(req.body?.telefono); if (!tel) throw new Errore('Scrivi un numero di cellulare italiano, per esempio 333 123 4567');
    const daUnOra = ora(-3600);
    if (db.prepare('SELECT COUNT(*) n FROM invii_codici WHERE telefono = ? AND il > ?').get(tel, daUnOra).n >= 4) throw new Errore('Hai chiesto troppi codici: riprova fra un\'ora', 429);
    if (db.prepare('SELECT COUNT(*) n FROM invii_codici WHERE ip = ? AND il > ?').get(ip(req), daUnOra).n >= Number(process.env.MAX_CODICI_IP || 12)) throw new Errore('Troppe richieste da questa connessione: riprova più tardi', 429);
    if (db.prepare('SELECT COUNT(*) n FROM invii_codici WHERE il > ?').get(ora(-86400)).n >= Number(process.env.MAX_CODICI_GIORNO || 300)) throw new Errore('Oggi abbiamo mandato troppi codici: riprova domani', 429);
    const codice = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    db.prepare('INSERT INTO codici (telefono, impronta, scade, tentativi) VALUES (?, ?, ?, 0) ON CONFLICT(telefono) DO UPDATE SET impronta = excluded.impronta, scade = excluded.scade, tentativi = 0').run(tel, sha(`${tel}:${codice}`), ora(600));
    db.prepare('INSERT INTO invii_codici (telefono, ip) VALUES (?, ?)').run(tel, ip(req));
    db.prepare('DELETE FROM invii_codici WHERE il < ?').run(ora(-2 * 86400));
    const r = await invia(tel, `Il tuo codice per Spesa Saggia è ${codice}. Vale 10 minuti. Non darlo a nessuno.`);
    if (r.stato === 'errore') {
      console.error(r.errore);
      // l'amministratore non resta mai chiuso fuori: se WhatsApp non va, il codice è nel registro del server
      if (admin(tel)) console.log(`[accesso amministratore] codice per ${tel}: ${codice}`);
      else throw new Errore('Non riesco a mandare il messaggio WhatsApp in questo momento: riprova fra poco', 502);
    }
    return { ok: true, nuovo: !db.prepare('SELECT 1 FROM utenti WHERE telefono = ?').get(tel) };
  });

  // 2. controlla il codice; chi è nuovo dice il nome, e se ha un invito entra nella famiglia di chi l'ha invitato
  app.post('/api/accesso/entra', async (req, rep) => {
    const tel = numero(req.body?.telefono); if (!tel) throw new Errore('Numero di cellulare non valido');
    const c = db.prepare('SELECT * FROM codici WHERE telefono = ?').get(tel);
    if (!c || c.scade < ora()) throw new Errore('Il codice è scaduto: chiedine uno nuovo');
    if (c.tentativi >= 5) throw new Errore('Troppi tentativi: chiedi un codice nuovo', 429);
    if (sha(`${tel}:${String(req.body?.codice || '').replace(/\D/g, '')}`) !== c.impronta) {
      db.prepare('UPDATE codici SET tentativi = tentativi + 1 WHERE telefono = ?').run(tel);
      throw new Errore('Il codice non è giusto: controlla il messaggio e riprova');
    }
    let u = db.prepare('SELECT * FROM utenti WHERE telefono = ?').get(tel);
    const invito = req.body?.invito ? db.prepare('SELECT * FROM inviti WHERE codice = ? AND scade > ?').get(String(req.body.invito), ora()) : null;
    if (!u) {
      const nome = String(req.body?.nome || '').trim().slice(0, 40);
      if (!nome) return { serveNome: true };
      db.transaction(() => {
        const fid = invito ? invito.famiglia_id : db.prepare('INSERT INTO famiglie (nome) VALUES (?)').run(`Famiglia di ${nome}`).lastInsertRowid;
        const uid = db.prepare('INSERT INTO utenti (telefono, nome, famiglia_id, admin) VALUES (?, ?, ?, ?)').run(tel, nome, fid, admin(tel) ? 1 : 0).lastInsertRowid;
        // il primo amministratore si prende la lista, i preferiti e i voti fatti prima che ci fossero gli accessi
        if (admin(tel) && db.prepare('SELECT COUNT(*) n FROM utenti WHERE admin = 1').get().n === 1) {
          db.prepare('UPDATE righe_lista SET famiglia_id = ? WHERE famiglia_id IS NULL').run(fid);
          db.prepare("UPDATE preferiti SET utente = ? WHERE utente = 'io'").run(`f${fid}`);
          db.prepare("UPDATE valutazioni SET utente = ? WHERE utente = 'io'").run(`u${uid}`);
          db.prepare('UPDATE famiglie SET casa = ? WHERE id = ?').run(JSON.stringify(JSON.parse(db.prepare("SELECT valore FROM impostazioni WHERE chiave = 'casa'").get()?.valore || '{}')), fid);
        }
      })();
      u = db.prepare('SELECT * FROM utenti WHERE telefono = ?').get(tel);
    } else if (invito && invito.famiglia_id !== u.famiglia_id) {
      db.prepare('UPDATE utenti SET famiglia_id = ? WHERE id = ?').run(invito.famiglia_id, u.id);
    }
    if (admin(tel) && !u.admin) db.prepare('UPDATE utenti SET admin = 1 WHERE id = ?').run(u.id);
    // se l'elenco dei gestori è impostato, chi non c'è perde il ruolo (familiari e amici restano utenti normali)
    if (String(process.env.ADMIN || '').trim() && !admin(tel) && u.admin) db.prepare('UPDATE utenti SET admin = 0 WHERE id = ?').run(u.id);
    // se il numero è quello di un produttore locale, l'utente gestisce quel produttore
    const pr = db.prepare('SELECT id FROM produttori WHERE telefono = ? AND attivo = 1').get(tel);
    if (pr && u.produttore_id !== pr.id) db.prepare('UPDATE utenti SET produttore_id = ? WHERE id = ?').run(pr.id, u.id);
    db.prepare('DELETE FROM codici WHERE telefono = ?').run(tel);
    apriSessione(req, rep, u.id);
    return { ok: true };
  });

  // ---------- il «ponte» per l'iPhone ----------
  // Su iPhone l'app messa nella schermata Home non vede l'accesso fatto in Safari (regola di Apple): ripartirebbe dal codice.
  // Chi è già dentro riceve un gettone usa-e-getta (30 giorni) che finisce nell'indirizzo di partenza dell'icona;
  // la prima volta che l'app installata si apre, lo usa per entrare senza codice. Usato una volta, non vale più.
  app.post('/api/accesso/ponte/nuovo', async (req) => {
    if (!req.utente) return { ponte: null };
    db.prepare('DELETE FROM ponti WHERE scade < ?').run(ora());
    const vecchio = String(req.body?.vecchio || '');
    if (/^[A-Za-z0-9_-]{20,64}$/.test(vecchio)) {
      const p = db.prepare('SELECT * FROM ponti WHERE impronta = ?').get(sha(vecchio));
      if (p && !p.usato && p.utente_id === req.utente.id && p.scade > ora(7 * 86400)) return { ponte: vecchio };
    }
    const t = crypto.randomBytes(24).toString('base64url');
    db.prepare('INSERT INTO ponti (impronta, utente_id, scade) VALUES (?, ?, ?)').run(sha(t), req.utente.id, ora(30 * 86400));
    return { ponte: t };
  });
  app.post('/api/accesso/ponte', async (req, rep) => {
    if (req.utente) return { ok: true, gia: true };
    const t = String(req.body?.ponte || ''); if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return { ok: false };
    const p = db.prepare('SELECT * FROM ponti WHERE impronta = ?').get(sha(t));
    if (!p || p.usato || p.scade < ora()) return { ok: false };
    const u = db.prepare('SELECT id FROM utenti WHERE id = ?').get(p.utente_id); if (!u) return { ok: false };
    db.prepare('UPDATE ponti SET usato = 1 WHERE impronta = ?').run(sha(t));
    apriSessione(req, rep, u.id);
    return { ok: true };
  });

  app.post('/api/accesso/esci', async (req, rep) => {
    const t = cookie(req)[COOKIE]; if (t) db.prepare('DELETE FROM sessioni WHERE impronta = ?').run(sha(t));
    rep.header('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  // ---------- la mia famiglia ----------
  const vistaFamiglia = (req) => {
    const f = famigliaDi(req.utente);
    const membri = db.prepare('SELECT id, nome, telefono FROM utenti WHERE famiglia_id = ? ORDER BY id').all(f.id)
      .map((m) => ({ id: m.id, nome: m.nome, telefono: `${m.telefono.slice(0, 3)} ••• ${m.telefono.slice(-3)}`, io: m.id === req.utente.id }));
    return { id: f.id, nome: f.nome, casa: f.casa, citta: f.citta, area: f.area, membri };
  };
  app.get('/api/famiglia', async (req) => vistaFamiglia(req));
  app.post('/api/famiglia/invito', async (req) => {
    const codice = crypto.randomBytes(9).toString('base64url');
    db.prepare('INSERT INTO inviti (codice, famiglia_id, scade) VALUES (?, ?, ?)').run(codice, req.famiglia.id, ora(7 * 86400));
    db.prepare('DELETE FROM inviti WHERE scade < ?').run(ora());
    return { codice };
  });
  // un invito aperto da chi è già dentro: entra nella famiglia nuova
  app.post('/api/famiglia/unisciti', async (req) => {
    const inv = db.prepare('SELECT * FROM inviti WHERE codice = ? AND scade > ?').get(String(req.body?.codice || ''), ora());
    if (!inv) throw new Errore('L\'invito è scaduto: chiedine uno nuovo a chi te l\'ha mandato');
    db.prepare('UPDATE utenti SET famiglia_id = ? WHERE id = ?').run(inv.famiglia_id, req.utente.id);
    req.utente.famiglia_id = inv.famiglia_id;
    return vistaFamiglia(req);
  });
  app.put('/api/io', async (req) => {
    const nome = String(req.body?.nome || '').trim().slice(0, 40); if (!nome) throw new Errore('Scrivi il tuo nome');
    db.prepare('UPDATE utenti SET nome = ? WHERE id = ?').run(nome, req.utente.id);
    return { ok: true };
  });
  // esce dalla famiglia: ne apre una sua, con la lista vuota
  app.post('/api/famiglia/esci', async (req) => {
    const fid = db.prepare('INSERT INTO famiglie (nome) VALUES (?)').run(`Famiglia di ${req.utente.nome}`).lastInsertRowid;
    db.prepare('UPDATE utenti SET famiglia_id = ? WHERE id = ?').run(fid, req.utente.id);
    req.utente.famiglia_id = fid;
    return vistaFamiglia(req);
  });

  // ---------- WhatsApp dell'app (solo amministratore) ----------
  // Il servizio è lo stesso del CRM e crede di parlare con il CRM: qui si annota e basta, nessun contatto viene salvato.
  app.post('/api/whatsapp-web/:cosa', async (req) => {
    const b = req.body || {};
    if (req.params.cosa === 'session') console.log(`[whatsapp] ${b.event || ''} ${b.number || ''} ${b.reason || ''}`);
    if (req.params.cosa === 'incoming') console.log(`[whatsapp] messaggio ricevuto da ${String(b.from || '').slice(0, 6)}… (non salvato)`);
    return { ok: true };
  });
  app.get('/api/whatsapp', async (req) => {
    if (!req.utente.admin) throw new Errore('Questa parte è riservata a chi gestisce l\'app', 403);
    const s = await statoWhatsapp();
    if (s.qr && !String(s.qr).startsWith('data:image')) s.qr = await QRCode.toDataURL(String(s.qr), { margin: 1, width: 320 });
    return s;
  });
  app.post('/api/whatsapp/prova', async (req) => {
    if (!req.utente.admin) throw new Errore('Questa parte è riservata a chi gestisce l\'app', 403);
    const r = await invia(req.utente.telefono, 'Prova da Spesa Saggia: i codici di accesso partono da questo numero.');
    if (r.stato === 'errore') throw new Errore(r.errore, 502);
    return r;
  });

  return { famigliaDi };
}
