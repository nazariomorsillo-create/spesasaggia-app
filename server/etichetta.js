// Etichetta di un prodotto letta dalla foto: dati liberi stampati sulla confezione (nome, formato, ingredienti, tabella nutrizionale).
// Il Nutri-Score si calcola qui con la formula pubblica (versione 2023, alimenti in genere e formaggi);
// per bevande, oli e grassi vale solo se è stampato sulla confezione.
import { codice } from './additivi.js';

const soglie = (x, lim) => { let p = 0; for (const s of lim) if (x > s) p++; return p; };
const ENERGIA = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350];
const ZUCCHERI = [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51];
const SATURI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SALE = [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4];
const FIBRE = [3, 4.1, 5.2, 6.3, 7.4];
const PROTEINE = [2.4, 4.8, 7.2, 9.6, 12, 14, 17];
const num = (x) => { if (x == null || String(x).trim() === '') return null; const n = Number(String(x).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null; };

/** Nutri-Score (lettera a-e) dai valori per 100 g; null se mancano dati o la categoria non è coperta. */
export function nutriScore(v, { categoria = 'cibo', frutta = 0 } = {}) {
  if (!v || !['cibo', 'formaggio'].includes(categoria)) return null;
  const kj = num(v.energia_kj) ?? (num(v.energia_kcal) != null ? num(v.energia_kcal) * 4.184 : null);
  const zuccheri = num(v.zuccheri); const saturi = num(v.grassi_saturi); const sale = num(v.sale) ?? (num(v.sodio) != null ? num(v.sodio) * 2.5 : null);
  if ([kj, zuccheri, saturi, sale].some((x) => x == null)) return null;
  const negativi = soglie(kj, ENERGIA) + soglie(zuccheri, ZUCCHERI) + soglie(saturi, SATURI) + soglie(sale, SALE);
  const f = num(frutta) || 0; const pFrutta = f > 80 ? 5 : f > 60 ? 2 : f > 40 ? 1 : 0;
  const pFibre = soglie(num(v.fibre) || 0, FIBRE); const pProteine = soglie(num(v.proteine) || 0, PROTEINE);
  const contaProteine = negativi < 11 || categoria === 'formaggio' || pFrutta === 5;
  const s = negativi - (pFrutta + pFibre + (contaProteine ? pProteine : 0));
  return s <= 0 ? 'a' : s <= 2 ? 'b' : s <= 10 ? 'c' : s <= 18 ? 'd' : 'e';
}

const testo = (x, n) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const CAMPI_VALORI = ['energia_kj', 'energia_kcal', 'grassi', 'grassi_saturi', 'carboidrati', 'zuccheri', 'fibre', 'proteine', 'sale', 'sodio'];
/** I valori nutrizionali per 100 g / 100 ml in JSON (con categoria e % di frutta), '' se non c'è niente. */
export function valoriJson(v, extra = {}) {
  let o = v; if (typeof v === 'string') { try { o = JSON.parse(v || '{}'); } catch { o = {}; } }
  const out = {}; for (const k of CAMPI_VALORI) { const n = num(o?.[k]); if (n != null && n < 5000) out[k] = Math.round(n * 100) / 100; }
  if (!Object.keys(out).length) return '';
  const categoria = ['cibo', 'formaggio', 'bevanda', 'grassi'].includes(extra.categoria ?? o?.categoria) ? (extra.categoria ?? o.categoria) : 'cibo';
  const frutta = num(extra.frutta ?? o?.frutta); return JSON.stringify({ ...out, categoria, ...(frutta ? { frutta } : {}) });
}
/** Nutri-Score dai valori salvati (JSON), null se non si può calcolare. */
export function nutriDaValori(json) { try { const o = JSON.parse(json || '{}'); return nutriScore(o, { categoria: o.categoria, frutta: o.frutta }); } catch { return null; } }
/** La risposta di Claude ripulita in campi pronti per la scheda prodotto. */
export function daLettura(o = {}) {
  const unita = ['kg', 'l', 'pz'].includes(o.unita) ? o.unita : null;
  const quantita = num(o.quantita) > 0 && unita ? num(o.quantita) : null;
  const pezzi = Math.round(num(o.pezzi) || 0) > 1 ? Math.round(num(o.pezzi)) : null;
  const ingredienti = testo(o.ingredienti, 2000);
  const additivi = Array.isArray(o.additivi) && ingredienti ? [...new Set(o.additivi.map(codice).filter(Boolean))] : null;
  const categoria = ['cibo', 'formaggio', 'bevanda', 'grassi'].includes(o.categoria) ? o.categoria : 'cibo';
  const stampato = /^[a-e]$/i.test(String(o.nutriscore_stampato || '')) ? String(o.nutriscore_stampato).toLowerCase() : null;
  const calcolato = nutriScore(o.valori_100 || {}, { categoria, frutta: o.frutta_verdura_percento });
  const valori = valoriJson(o.valori_100 || {}, { categoria, frutta: o.frutta_verdura_percento });
  return {
    nome: testo(o.nome, 100), marca: testo(o.marca, 60), quantita, unita, pezzi,
    ingredienti, additivi, nutriscore: stampato || calcolato || '', nutriscore_da: stampato ? 'stampato' : calcolato ? 'calcolato' : '',
    imballaggio: ['vetro', 'plastica', 'carta', 'metallo'].includes(o.confezione) ? o.confezione : '',
    bio: !!o.bio, origine: o.italiano ? 'italia' : '', produttore: testo(o.produttore, 120), descrizione: testo(o.descrizione, 300),
    valori, letto: !!(o.nome || ingredienti || quantita),
  };
}
