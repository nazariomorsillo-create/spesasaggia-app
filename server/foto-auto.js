// 0.76 (Nazario, 05/11): foto automatiche dei prodotti, da Open Food Facts (archivio libero; le foto hanno licenza CC BY-SA,
// per questo sotto la foto si scrive «Foto: Open Food Facts»).
// - con il codice a barre: la foto di quel codice (sicura)
// - senza codice: solo se marca, parole del nome e formato coincidono con un prodotto del catalogo (mai una foto «che somiglia»)
// Frutta, verdura e sfusi non si cercano. Una foto segnata «non è questa» non torna più. La foto si scarica e si salva qui:
// così chi apre l'app non chiede niente a un altro sito.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as catalogo from './catalogo.js';
import * as off from './off.js';
import { leggiFormato } from './qualita.js';

let _fetch = (...a) => globalThis.fetch(...a);
export function usaFetch(f) { _fetch = f; }

const VUOTE = new Set(['il', 'lo', 'la', 'le', 'gli', 'un', 'una', 'uno', 'di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'al', 'alla', 'allo', 'ai', 'agli', 'alle', 'con', 'per', 'da', 'in', 'e', 'ed', 'a', 'gr', 'g', 'kg', 'ml', 'cl', 'l', 'lt', 'pz', 'x', 'conf', 'confezione']);
const pulisci = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
const parole = (t) => pulisci(t).split(/\s+/).filter((w) => w.length >= 2 && !VUOTE.has(w) && !/\d/.test(w));
// la stessa parola anche al plurale, con un'altra desinenza (grattugiato / grattugiata) o abbreviata sullo scontrino (parz. / parzialmente)
const combacia = (a, b) => a === b || (a.length >= 4 && b.startsWith(a.slice(0, 5))) || (b.length >= 4 && a.startsWith(b.slice(0, 5)));

/** Il prodotto del catalogo che è sicuramente lo stesso (stessa marca, tutte le parole del nome, formato compatibile), o null. */
export function abbinaPerNome(p, candidati) {
  const marca = parole(p.marca || p.catena || '');
  if (!marca.length) return null; // senza marca troppi prodotti si somigliano: meglio nessuna foto che una sbagliata
  const mie = parole(p.nome).filter((w) => !marca.includes(w));
  if (mie.length < 2) return null;
  for (const c of candidati) {
    if (!c.foto) continue;
    const suaMarca = parole(c.marca);
    if (!marca.every((w) => suaMarca.includes(w) || parole(c.nome).includes(w))) continue;
    const sue = parole(`${c.nome} ${c.generico || ''}`);
    if (!mie.every((w) => sue.some((x) => combacia(w, x)))) continue;
    // formato: se tutti e due lo sanno, deve essere lo stesso (500 g ≠ 1 kg)
    const f = c.formato || leggiFormato(c.quantita || '');
    if (p.quantita > 0 && f?.quantita > 0 && (!p.unita || f.unita === p.unita) && Math.abs(f.quantita - p.quantita) / p.quantita > 0.08) continue;
    return c;
  }
  return null;
}

// la foto più grande che Open Food Facts tiene (400 px), se c'è; altrimenti quella che abbiamo
const piuGrande = (u) => u.replace(/\.(100|200)\.jpg$/, '.400.jpg');
async function scarica(url, cartella) {
  for (const u of [...new Set([piuGrande(url), url])]) {
    try {
      const r = await _fetch(u, { headers: { 'User-Agent': 'SpesaSaggia/0.76 (+https://spesasaggia.it)' }, signal: AbortSignal.timeout?.(15000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000 || buf.length > 3_000_000 || buf[0] !== 0xFF || buf[1] !== 0xD8) continue; // solo JPEG veri
      fs.mkdirSync(cartella, { recursive: true });
      const nome = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.jpg`;
      fs.writeFileSync(path.join(cartella, nome), buf);
      return `/foto/${nome}`;
    } catch { /* si prova la prossima */ }
  }
  return '';
}

const attesa = (ms) => new Promise((x) => setTimeout(x, ms));
let inCorso = null;
/** Cerca le foto mancanti (al massimo «limite» prodotti per volta). Ritorna quante ne ha trovate. */
export function cercaFoto(db, opz = {}) {
  if (inCorso) return inCorso; // una ricerca alla volta
  inCorso = giro(db, opz).finally(() => { inCorso = null; });
  return inCorso;
}
async function giro(db, { cartella, limite = 150, online = true, pausa = 1200, soloId = null } = {}) {
  // ogni prodotto si riprova al massimo una volta al mese (Open Food Facts cresce ogni giorno)
  const lista = db.prepare(`SELECT p.*, v.reparto, v.unita, c.nome catena FROM prodotti p JOIN voci v ON v.id = p.voce_id LEFT JOIN catene c ON c.id = p.catena_id
    WHERE p.foto = '' AND p.foto_no = 0 AND p.sfuso = 0 AND v.reparto IS NOT 'ortofrutta' AND (? IS NOT NULL AND p.id = ? OR ? IS NULL AND (p.foto_cercata IS NULL OR p.foto_cercata < date('now', '-30 day')))
    ORDER BY (p.ean = '') , p.id DESC LIMIT ?`).all(soloId, soloId, soloId, limite);
  const segna = db.prepare("UPDATE prodotti SET foto_cercata = date('now') WHERE id = ?");
  const metti = db.prepare("UPDATE prodotti SET foto = ?, foto_fonte = ?, foto_cercata = date('now') WHERE id = ? AND foto = ''");
  let trovate = 0;
  for (const p of lista) {
    let url = ''; let fonte = ''; let chiesto = false;
    if (p.ean) {
      url = catalogo.perCodice(p.ean)?.foto || '';
      if (!url && online) { const o = await off.cerca(p.ean).catch(() => null); chiesto = true; if (o && !o.errore) url = o.foto || ''; }
      if (url) fonte = 'off';
    }
    if (!url) {
      const c = abbinaPerNome(p, catalogo.cerca(`${p.nome} ${p.marca || ''}`, 12));
      if (c) { url = c.foto; fonte = 'off-nome'; }
    }
    const locale = url ? await scarica(url, cartella) : '';
    if (locale) { metti.run(locale, fonte, p.id); trovate++; } else segna.run(p.id);
    if (chiesto && pausa) await attesa(pausa); // gentili con Open Food Facts
  }
  if (lista.length) console.log(`foto automatiche: ${trovate} trovate su ${lista.length} prodotti senza foto`);
  return { guardati: lista.length, trovate };
}
