// Lettura degli scontrini fotografati: OCR (tesseract di sistema, oppure tesseract.js) e poi le righe con prezzi e quantità.
// L'abbinamento ai prodotti usa "come è scritto sullo scontrino" (nome_scontrino) e, in mancanza, la somiglianza del nome.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { radici } from './voce.js';

let _ocr = null; // per le prove: una funzione che dà il testo
export function usaOcr(f) { _ocr = f; }

function comando(cmd, args, input) {
  return new Promise((ok, ko) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('error', ko); p.on('close', (c) => (c === 0 ? ok(out) : ko(new Error(err || `uscita ${c}`))));
  });
}
async function lingue() {
  try { const t = await comando('tesseract', ['--list-langs']); return t.split('\n').map((x) => x.trim()).filter((x) => /^[a-z]{3}$/.test(x)); } catch { return null; }
}
// Il testo dell'immagine. Prima tesseract installato sul server (veloce), altrimenti tesseract.js (scarica la lingua la prima volta).
export async function leggiTesto(file) {
  if (_ocr) return _ocr(file);
  const l = await lingue();
  if (l) {
    const lang = l.includes('ita') ? 'ita' : 'eng';
    return comando('tesseract', [file, 'stdout', '-l', lang, '--psm', '6']);
  }
  const { createWorker } = await import('tesseract.js');
  const cache = path.join(path.dirname(file), '..', 'tessdata'); fs.mkdirSync(cache, { recursive: true });
  const w = await createWorker('ita', 1, { cachePath: cache, logger: () => {} });
  try { const { data } = await w.recognize(file); return data.text; } finally { await w.terminate(); }
}

// ---------- dal testo alle righe ----------
const NUM = '(\\d{1,4}(?:[.,]\\d{1,3})?)';
const PREZZO = '(-?\\d{1,4}[.,]\\d{2})';
const SALTA = /^(totale|tot\.|subtotale|di cui|iva|pagamento|contante|carta|bancomat|resto|documento|descrizione|p\.iva|p\. iva|c\.f\.|arrotondamento|sconto fedelt|punti|saldo|importo|elettronico|cassa|operatore|scontrino|codice|lotteria|www\.|tel\.|grazie|arrivederci|euro|€\s*$)/i;
const FINE = /^(totale complessivo|totale|importo pagato|pagamento)/i;
const num = (s) => Number(String(s).replace('.', ',').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));

export function analizza(testo, catene = []) {
  const righeTesto = String(testo || '').split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const testa = righeTesto.slice(0, 12).join(' ').toLowerCase();
  const ALIAS = { tosano: ['tosano', 'iper tosano', 'ipertosano'], coop: ['coop'], ipercoop: ['ipercoop'], conad: ['conad'], esselunga: ['esselunga'], famila: ['famila'], eurospin: ['eurospin'], lidl: ['lidl'], md: ['md s.p.a', 'md spa'], penny: ['penny'], aldi: ['aldi'], carrefour: ['carrefour'], pam: ['pam panorama', 'pam '], despar: ['despar', 'interspar', 'eurospar'], iper: ['iper,', 'iper la grande'], bennet: ['bennet'] };
  let catena = null;
  for (const c of [...catene].sort((x, y) => y.nome.length - x.nome.length)) { const k = c.nome.toLowerCase(); const forme = ALIAS[k] || [k]; if (forme.some((f) => testa.includes(f))) { catena = c; break; } }
  const data = (() => { const m = String(testo).match(/\b(\d{2})[-/.](\d{2})[-/.](\d{4}|\d{2})\b/); if (!m) return null; const a = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${a}-${m[2]}-${m[1]}`; })();
  const numero = (String(testo).match(/doc\.?\s*n\.?\s*([\d-]+)/i) || [])[1] || '';
  let totale = null;
  const righe = [];
  const reRigaPrezzo = new RegExp(`^(.*?)\\s+(?:\\d{1,2}\\s*%\\s*)?${PREZZO}\\s*[A-Z*]?$`);
  const rePeso = new RegExp(`^${NUM}\\s*(kg|g|hg|l|lt)?\\s*[xX×]\\s*${PREZZO}(?:\\s*(?:€|eur)\\s*/\\s*(kg|l|lt|pz)?)?(?:\\s+${PREZZO}\\s*[A-Z*]?)?$`, 'i');
  const rePezzi = new RegExp(`^(\\d{1,3})\\s*(?:pz|pezzi)?\\s*[xX×]\\s*${PREZZO}(?:\\s*€)?(?:\\s+${PREZZO}\\s*[A-Z*]?)?$`);
  let fine = false;
  for (const r of righeTesto) {
    if (fine) continue;
    if (FINE.test(r)) { const m = r.match(new RegExp(`${PREZZO}\\s*[A-Z*]?$`)); if (m) totale = num(m[1]); fine = true; continue; }
    if (SALTA.test(r)) continue;
    let m;
    if ((m = r.match(rePezzi))) { const prev = righe[righe.length - 1]; if (prev) { prev.quantita = Number(m[1]); prev.unita = 'pz'; prev.prezzo_unita = num(m[2]); if (m[3] && prev.importo == null) prev.importo = num(m[3]); } continue; }
    if ((m = r.match(rePeso))) {
      const prev = righe[righe.length - 1]; if (!prev) continue;
      const u = (m[2] || m[4] || 'kg').toLowerCase();
      let q = num(m[1]); let unita = 'kg';
      if (u === 'g') { q /= 1000; } else if (u === 'hg') { q /= 10; } else if (u === 'l' || u === 'lt') { unita = 'l'; } else if (u === 'pz') { unita = 'pz'; }
      prev.quantita = Math.round(q * 1000) / 1000; prev.unita = unita; prev.prezzo_unita = num(m[3]); if (m[5] && prev.importo == null) prev.importo = num(m[5]);
      continue;
    }
    if ((m = r.match(reRigaPrezzo))) {
      const desc = m[1].replace(/[|_]/g, ' ').trim(); const importo = num(m[2]);
      if (!desc || desc.length < 2) continue;
      if (/sconto|promo|ribasso|buono/i.test(desc) || importo < 0) { const prev = righe[righe.length - 1]; if (prev && importo < 0) prev.sconto = (prev.sconto || 0) + importo; continue; }
      righe.push({ testo: desc, importo, quantita: 1, unita: 'pz', prezzo_unita: importo });
    }
  }
  // sconto sulla riga: il prezzo pagato scende
  for (const x of righe) if (x.sconto) { x.importo = Math.round((x.importo + x.sconto) * 100) / 100; if (x.quantita) x.prezzo_unita = Math.round((x.importo / x.quantita) * 100) / 100; x.offerta = true; }
  return { catena_id: catena?.id ?? null, catena: catena?.nome ?? null, data, numero, totale, righe };
}

// ---------- abbinamento ai prodotti ----------
export const norma = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const lettere = (s) => norma(s).replace(/[^a-z]/g, '');
// distanza di modifica: quante lettere cambiano tra due parole (per gli errori di lettura: CAROTE i1kg ~ CAROTE 1kg)
function distanza(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Il prodotto di ogni riga: prima come lo scrive QUESTO supermercato (nomiCatena), poi tra i suoi prodotti, poi tra tutti.
export function abbina(righe, prodotti, voci, { nomiCatena = new Map(), inCatena = new Set(), catena_id = null } = {}) {
  const perScontrino = new Map(prodotti.filter((p) => p.nome_scontrino).map((p) => [norma(p.nome_scontrino), p]));
  const perId = new Map(prodotti.map((p) => [p.id, p]));
  const vociDi = new Map(voci.map((v) => [v.id, v]));
  return righe.map((r) => {
    const n = norma(r.testo);
    // 1. lo stesso testo, già visto in questo supermercato
    let p = nomiCatena.has(n) ? perId.get(nomiCatena.get(n)) || null : null; let sicuro = !!p;
    if (!p && nomiCatena.size) {
      const lt = lettere(r.testo); let vicino = null;
      for (const [k, pid] of nomiCatena) { const d = distanza(lt, lettere(k)); if (lt.length >= 5 && d <= Math.max(1, Math.floor(lt.length / 6)) && (!vicino || d < vicino.d) && perId.has(pid)) vicino = { q: perId.get(pid), d }; }
      if (vicino) { p = vicino.q; sicuro = true; }
    }
    // 2. il nome da scontrino del prodotto (visto in qualche supermercato): sicuro solo se il prodotto è di questo supermercato
    if (!p) { p = perScontrino.get(n) || null; sicuro = !!p && (!catena_id || inCatena.has(p.id)); }
    if (!p) {
      // quasi uguale a un nome da scontrino già noto (errore di lettura di una o due lettere)
      const lt = lettere(r.testo);
      let vicino = null;
      for (const [k, q] of perScontrino) { const d = distanza(lt, lettere(k)); if (lt.length >= 5 && d <= Math.max(1, Math.floor(lt.length / 6)) && (!vicino || d < vicino.d)) vicino = { q, d }; }
      if (vicino) { p = vicino.q; sicuro = !catena_id || inCatena.has(p.id); }
    }
    if (!p) {
      // somiglianza: le radici del testo dentro il nome (o il nome da scontrino) del prodotto
      // le parole del testo (senza numeri e sigle) dentro il nome del prodotto, il suo nome da scontrino o la voce
      const rt = radici(r.testo.replace(/\S*\d\S*/g, ' ')).filter((x) => x.length >= 3);
      let best = null;
      for (const q of prodotti) {
        const rp = [...new Set([...radici(q.nome), ...radici(q.nome_scontrino || ''), ...radici(vociDi.get(q.voce_id)?.nome || '')])];
        const hit = rt.filter((x) => rp.some((y) => y === x || (x.length >= 4 && (y.startsWith(x) || x.startsWith(y))))).length;
        const punti = rt.length ? hit / rt.length : 0;
        const precisione = rp.length ? hit / rp.length : 0; // a parità, il prodotto con meno parole "in più"
        // a parità, prima i prodotti di questo supermercato
        const qui = inCatena.has(q.id) ? 1 : 0;
        if (punti >= 0.6 && (!best || punti > best.punti || (punti === best.punti && (qui > best.qui || (qui === best.qui && precisione > best.precisione))))) best = { q, punti, precisione, qui };
      }
      if (best) { p = best.q; sicuro = best.punti >= 0.99 && best.precisione >= 0.5; }
    }
    const v = p ? vociDi.get(p.voce_id) : null;
    return { ...r, prodotto_id: p?.id ?? null, prodotto: p?.nome ?? null, voce: v?.nome ?? null, sfuso: p ? !!p.sfuso : r.unita !== 'pz', sicuro };
  });
}
