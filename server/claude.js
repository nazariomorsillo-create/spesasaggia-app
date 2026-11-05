// Lettura dei volantini con Claude (API di Anthropic): la foto di una pagina diventa l'elenco delle offerte.
// Serve ANTHROPIC_API_KEY nel file .env; il modello si cambia con CLAUDE_MODELLO.
import fs from 'node:fs';

let _fetch = (...a) => globalThis.fetch(...a);
export function usaFetch(f) { _fetch = f; }
// la chiave c'è se non è vuota e non è ancora quella d'esempio del file .env.esempio
export const chiave = () => { const k = String(process.env.ANTHROPIC_API_KEY || '').trim().replace(/^["']|["']$/g, ''); return /^LA-TUA/i.test(k) ? '' : k; };
export const attivo = () => !!chiave();
export const modello = () => String(process.env.CLAUDE_MODELLO || 'claude-sonnet-5-5').trim();
// I volantini si leggono con il modello economico (Haiku): costa circa 20 volte meno di Sonnet e per leggere prezzi basta.
// Per una pagina difficile chi gestisce può rileggerla con il modello più preciso (CLAUDE_MODELLO).
export const modelloVolantini = () => String(process.env.CLAUDE_MODELLO_VOLANTINI || 'claude-haiku-5-5').trim();
// listino in dollari per milione di token (ingresso, uscita), da platform.claude.com/docs/en/about-claude/pricing (11/2026)
const LISTINO = { 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };
const EURO_PER_DOLLARO = () => Number(process.env.EURO_PER_DOLLARO || 0.92);
const tariffe = (m) => { const l = LISTINO[m] || LISTINO['claude-sonnet-5-5']; return [Number(process.env.CLAUDE_EURO_MTOK_IN) || l[0] * EURO_PER_DOLLARO(), Number(process.env.CLAUDE_EURO_MTOK_OUT) || l[1] * EURO_PER_DOLLARO()]; };
const EURO_IN = (m = modello()) => tariffe(m)[0];
const EURO_OUT = (m = modello()) => tariffe(m)[1];
const EURO_RICERCA = () => Number(process.env.CLAUDE_EURO_RICERCA || 0.01);

const ISTRUZIONI = (oggi, catene) => `Sei un assistente che legge i volantini delle offerte dei supermercati italiani.
Nella foto c'è una pagina di volantino. Oggi è il ${oggi}.
Rispondi SOLO con un oggetto JSON, senza testo prima o dopo, con questa forma:
{
  "supermercato": "nome dell'insegna come scritto sul volantino, oppure null",
  "valido_dal": "AAAA-MM-GG oppure null",
  "valido_al": "AAAA-MM-GG oppure null",
  "offerte": [
    {
      "nome": "nome del prodotto come lo direbbe una persona, con la marca, senza il formato (es. \\"Biscotti Pan di Stelle\\")",
      "marca": "marca oppure null",
      "quantita": numero del contenuto della confezione nell'unità indicata (es. 0.5 per 500 g, 1.5 per 1,5 l, 6 per 6 uova) oppure null,
      "unita": "kg" | "l" | "pz" | null,
      "sfuso": true se il prezzo è al chilo o al pezzo e non a confezione (frutta, verdura, banco), altrimenti false,
      "prezzo": prezzo in offerta in euro (a confezione; per lo sfuso il prezzo al kg o al pezzo),
      "prezzo_pieno": prezzo prima dello sconto oppure null,
      "bio": true/false,
      "italiano": true se il volantino dice che è italiano o 100% italiano, altrimenti false,
      "condizioni": "condizioni particolari (es. \\"con carta fedeltà\\", \\"prendi 3 paghi 2\\", \\"dal 2° pezzo\\") oppure null"
    }
  ]
}
Regole: i grammi diventano chili (500 g = 0.5 kg), i millilitri diventano litri (750 ml = 0.75 l).
Se il volantino dice solo il giorno e il mese, usa l'anno più vicino a oggi.
Se una confezione multipla ha un prezzo unico (es. 4x125 g), quantita è il totale (0.5 kg).
Non inventare: se un prezzo non si legge bene, lascia fuori quell'offerta.
${catene.length ? `Insegne conosciute: ${catene.join(', ')}.` : ''}`;

// legge la foto (file JPEG) e restituisce { supermercato, valido_dal, valido_al, offerte[], uso: { input, output, euro } }
export async function leggiVolantino(file, { oggi, catene = [], modello: m = modelloVolantini() } = {}) {
  if (!attivo()) throw new Error('Manca la chiave di Claude (ANTHROPIC_API_KEY) nel file .env del server');
  const dati = fs.readFileSync(file).toString('base64');
  const r = await _fetch(process.env.CLAUDE_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': chiave(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m, max_tokens: 8000, messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dati } },
      { type: 'text', text: ISTRUZIONI(oggi, catene) },
    ] }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = j?.error?.message || `risposta ${r.status}`;
    if (r.status === 401) throw new Error('La chiave di Claude non è valida: controlla ANTHROPIC_API_KEY nel file .env');
    if (r.status === 429 || r.status === 529) throw new Error('Claude è occupato in questo momento: riprova tra un minuto');
    throw new Error(`Claude non ha risposto bene: ${m}`);
  }
  const testo = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const inizio = testo.indexOf('{'); const fine = testo.lastIndexOf('}');
  if (inizio < 0 || fine <= inizio) throw new Error('Claude non ha trovato offerte leggibili in questa foto');
  let o; try { o = JSON.parse(testo.slice(inizio, fine + 1)); } catch { throw new Error('Claude ha risposto in un modo che non riesco a leggere: riprova'); }
  const input = j.usage?.input_tokens || 0; const output = j.usage?.output_tokens || 0;
  return { ...o, uso: { input, output, euro: Math.round(((input * EURO_IN(m) + output * EURO_OUT(m)) / 1e6) * 10000) / 10000, modello: m } };
}

// Domanda di solo testo, con risposta JSON (es. gli orari di un negozio letti dalla sua pagina web)
export async function chiediJson(domanda, { max_tokens = 600, ricercaWeb = 0 } = {}) {
  if (!attivo()) throw new Error('Manca la chiave di Claude (ANTHROPIC_API_KEY) nel file .env del server');
  const r = await _fetch(process.env.CLAUDE_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': chiave(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: modello(), max_tokens, messages: [{ role: 'user', content: domanda }],
      // ricerca web di Anthropic: Claude cerca da solo su internet (al massimo «ricercaWeb» ricerche)
      ...(ricercaWeb > 0 ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: ricercaWeb }] } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Claude non ha risposto bene: ${j?.error?.message || r.status}`);
  const testo = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const inizio = testo.indexOf('{'); const fine = testo.lastIndexOf('}');
  if (inizio < 0 || fine <= inizio) return { dati: null, uso: null };
  let dati = null; try { dati = JSON.parse(testo.slice(inizio, fine + 1)); } catch { /* risposta non leggibile */ }
  const input = j.usage?.input_tokens || 0; const output = j.usage?.output_tokens || 0; const ricerche = j.usage?.server_tool_use?.web_search_requests || 0;
  // una ricerca web costa circa 1 centesimo (10 $ ogni 1000)
  return { dati, uso: { input, output, ricerche, euro: Math.round(((input * EURO_IN() + output * EURO_OUT()) / 1e6 + ricerche * EURO_RICERCA()) * 1000) / 1000 } };
}

// Etichetta di un prodotto (1-3 foto JPEG in base64): nome, formato, ingredienti, tabella nutrizionale. Modello economico.
const ISTRUZIONI_ETICHETTA = `Leggi l'etichetta di un prodotto alimentare o per la casa venduto in Italia (le foto sono della stessa confezione).
Rispondi SOLO con un oggetto JSON, senza testo prima o dopo:
{
  "nome": "nome come lo direbbe una persona, con la marca, senza il formato (es. \\"Yogurt intero Mila\\")",
  "marca": "marca oppure null",
  "quantita": contenuto della confezione nell'unità indicata (0.5 per 500 g, 1 per 1000 g, 1.5 per 1,5 l, 6 per 6 uova) oppure null,
  "unita": "kg" | "l" | "pz" | null,
  "pezzi": numero di pezzi in una confezione multipla (4 per 4 x 125 g) oppure null,
  "ingredienti": "elenco ingredienti come stampato, in italiano, oppure null",
  "additivi": ["codici E degli additivi presenti negli ingredienti, anche quelli scritti per nome (acido citrico = E330)"],
  "nutriscore_stampato": "a"-"e" solo se il logo Nutri-Score è stampato sulla confezione, altrimenti null,
  "valori_100": { "energia_kj": numero, "energia_kcal": numero, "grassi_saturi": numero, "zuccheri": numero, "sale": numero, "sodio": numero, "fibre": numero, "proteine": numero } per 100 g o 100 ml, null dove non si legge,
  "frutta_verdura_percento": percentuale di frutta, verdura e legumi dagli ingredienti oppure null,
  "categoria": "cibo" | "formaggio" | "bevanda" | "grassi" (oli, burro, margarina, frutta secca),
  "bio": true se è biologico (logo o scritta), altrimenti false,
  "italiano": true solo se l'etichetta dice origine Italia, 100% italiano o materia prima italiana, altrimenti false,
  "confezione": "vetro" | "plastica" | "carta" | "metallo" | null (il materiale della confezione, se si vede o è scritto),
  "produttore": "chi lo produce o lo confeziona oppure null",
  "descrizione": "una frase breve su cos'è (es. yogurt intero bianco) oppure null"
}
Non inventare: quello che non si legge resta null. Se non è un'etichetta di prodotto, rispondi {"nome": null}.`;
export async function leggiEtichetta(immagini, { modello: m = modelloVolantini() } = {}) {
  if (!attivo()) throw new Error('La lettura delle etichette non è attiva su questo server');
  const r = await _fetch(process.env.CLAUDE_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': chiave(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m, max_tokens: 2000, messages: [{ role: 'user', content: [
      ...immagini.map((dati) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dati } })),
      { type: 'text', text: ISTRUZIONI_ETICHETTA },
    ] }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 429 || r.status === 529) throw new Error('Il lettore è occupato in questo momento: riprova tra un minuto');
    throw new Error('Non sono riuscito a leggere l\'etichetta: riprova');
  }
  const t = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  let o = {}; if (a >= 0 && b > a) { try { o = JSON.parse(t.slice(a, b + 1)); } catch { o = {}; } }
  const input = j.usage?.input_tokens || 0; const output = j.usage?.output_tokens || 0;
  return { dati: o, uso: { input, output, euro: Math.round(((input * EURO_IN(m) + output * EURO_OUT(m)) / 1e6) * 10000) / 10000, modello: m } };
}

// 0.57: nome del prodotto in italiano (Open Food Facts a volte lo ha solo in inglese o tedesco, es. «Peanuts roasted & salted»).
// Modello economico, una riga sola di risposta. Se qualcosa non va, resta il nome di prima.
export async function nomeItaliano(nome, marca = '') {
  if (!attivo() || !String(nome || '').trim()) return nome;
  const m = modelloVolantini();
  const r = await _fetch(process.env.CLAUDE_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': chiave(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m, max_tokens: 60, messages: [{ role: 'user', content: `Nome di un prodotto da supermercato: «${nome}»${marca ? ` (marca ${marca})` : ''}.
Scrivilo in italiano come lo scriverebbe un supermercato italiano, tenendo la marca e il formato (es. 500 g). Se è già in italiano, lascialo com'è.
Rispondi SOLO con il nome, senza virgolette.` }] }),
  }).catch(() => null);
  if (!r?.ok) return nome;
  const j = await r.json().catch(() => ({}));
  const t = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' ').replace(/^["«']|["»']$/g, '').trim();
  return t && t.length <= 120 && !/\n/.test(t) ? t : nome;
}

// 0.59: nome italiano di una categoria (voce della lista), es. «Fresh mandarin oranges» → «Mandarini»
export async function voceItaliana(nome) {
  if (!attivo() || !String(nome || '').trim()) return nome;
  const r = await _fetch(process.env.CLAUDE_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': chiave(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: modelloVolantini(), max_tokens: 30, messages: [{ role: 'user', content: `Categoria di prodotti da supermercato: «${nome}».
Scrivi come la si chiama in una lista della spesa italiana: una o due parole, in italiano, senza marca e senza formato (es. «Mandarini», «Arachidi salate», «Yogurt bianco»). Se è già in italiano, lasciala com'è.
Rispondi SOLO con il nome, senza virgolette.` }] }),
  }).catch(() => null);
  if (!r?.ok) return nome;
  const j = await r.json().catch(() => ({}));
  const t = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' ').replace(/^["«']|["»'.]$/g, '').trim();
  return t && t.length <= 40 && !/\n/.test(t) ? t : nome;
}
