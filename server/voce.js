// Lista a voce: dal parlato ("due chili di patate, il latte e tre pacchi di pasta") alle righe della lista.
// La voce la trascrive il telefono (dettatura del browser): qui arriva solo il testo, che si interpreta senza servizi esterni.

const NUMERI = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
  tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciotto: 18, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50, cento: 100,
  duecento: 200, duecentocinquanta: 250, trecento: 300, quattrocento: 400, cinquecento: 500, settecento: 700, ottocento: 800, mezzo: 0.5, mezza: 0.5, qualche: 2 };
// [parole, unità, fattore]: "conf" = confezioni (pacchi, bottiglie, vasetti…), si convertono con il formato tipico della voce
const MISURE = [
  [/^(chili|chilo|kili|kilo|kg|chilogrammi|chilogrammo)$/, 'kg', 1], [/^(etti|etto|hg)$/, 'kg', 0.1], [/^(grammi|grammo|gr|g)$/, 'kg', 0.001],
  [/^(litri|litro|l|lt)$/, 'l', 1], [/^(millilitri|ml)$/, 'l', 0.001], [/^(centilitri|cl)$/, 'l', 0.01],
  [/^(pezzi|pezzo|pz)$/, 'pz', 1], [/^(paio|paia)$/, 'pz', 2], [/^(dozzina|dozzine)$/, 'pz', 12],
  [/^(pacchi|pacco|pacchetti|pacchetto|confezioni|confezione|scatole|scatola|scatolette|scatoletta|bottiglie|bottiglia|vasetti|vasetto|barattoli|barattolo|buste|busta|bustine|bustina|vaschette|vaschetta|lattine|lattina|cartoni|cartone|brick|tubetti|tubetto|rotoli|rotolo|mazzi|mazzo|mazzetti|mazzetto|cespi|cespo|cassette|cassetta|retine|retina|sacchetti|sacchetto|tavolette|tavoletta|vasi|vaso|flaconi|flacone|fardelli|fardello|casse|cassa)$/, 'conf', 1],
];
const ARTICOLI = new Set(['il', 'lo', 'la', 'i', 'gli', 'le', "l'", 'di', "d'", 'del', 'dello', 'della', "dell'", 'dei', 'degli', 'delle', 'un', 'uno', 'una', "un'"]);
const VUOTE = new Set(['di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'al', 'alla', 'allo', 'ai', 'alle', 'con', 'e', 'per', 'da', 'in', 'il', 'lo', 'la', 'i', 'gli', 'le', 'a']);
// frasi di contorno che non sono cose da comprare
const CONTORNO = /\b(allora|ok|okay|ecco|dunque|senti|ascolta|devo comprare|dobbiamo comprare|da comprare|comprare|compra|compro|prendi|prendere|prendo|aggiungi|aggiungere|metti|mettere|mettimi|scrivi|segna|in lista|nella lista|alla lista|sulla lista|la lista|mi serve|mi servono|ci serve|ci servono|serve|servono|ci vuole|ci vogliono|mi manca|mi mancano|manca|mancano|abbiamo finito|ho finito|finito|finita|per favore|grazie|e basta|basta|per la spesa|la spesa|un po' di|un po di|un pò di|un poco di|un pochino di|qualcosa)\b/g;
const QUALITA = [[/\b(bio|biologic[oaie])\b/, 'bio'], [/\b(italian[oaie]|nostran[oaie]|d'italia|di casa nostra)\b/, 'italiano']];

// Per una voce nuova: reparto e unità di confronto da un piccolo dizionario della spesa
const DIZIONARIO = [
  ['dispensa', 'kg', 'pelat polpa conserv'],
  // pesce in scatola e filetti: si confrontano a peso
  ['dispensa', 'kg', 'sgombr sardin alic acciugh filett tonn salmon merluzz vongol'],
  ['surgelati', 'kg', 'surgelat gelat bastoncin'],
  ['ortofrutta', 'kg', 'mel pere per banan aranc limon mandarin clementin kiwi uv fragol pesc albicocc ciliegi prugn susin cach melon anguri ananas fich nespol pompelm avocad mango frutt patat cipoll agli insalat lattug rucol radicchi spinac bietol cavol cavolfior brocc verz pomodor zucchin zucc melanzan peperon carot finocch sedan fagiolin pisell fung porr carciof asparag cetriol ravanell verdur minestron'],
  ['ortofrutta', 'pz', 'basilic prezzemol rosmarin salvi menta origan erbett'],
  ['pane', 'kg', 'pan panin focacc pizz grissin crackers fette biscottat piadin tramezzin'],
  ['fresco', 'l', 'latt pann kefir'],
  ['fresco', 'pz', 'uov'],
  ['fresco', 'kg', 'yogurt burr mozzarell formagg parmigian grana pecorin ricott stracchin gorgonzol scamorz provol prosciutt salam mortadell bresaol speck wurstel pancett carn poll tacchin manz maial vitell salsicc macinat hamburger salmon merluzz gamber cozz vongol tofu affettat'],
  ['bevande', 'l', 'acqu vin birr succ aranciat cola te spremut bibit gassos'],
  ['casa', 'pz', 'detersiv sapon shampo bagnoschium dentifric spazzolin carta igienic scottex tovagliol fazzolett ammorbident candeggin sgrassator spugn sacchett pannolin assorbent rasoi deodorant lavastovigl lavatric pellicol alluminio'],
  ['dispensa', 'l', 'oli acet passat'],
  ['dispensa', 'kg', 'past spaghett penn fusill rigaton riso farin zuccher sal caff biscott cere legum fagiol ceci lenticch tonn scatolett polpa pelat sugh marmellat crem nocciol miel cioccolat muesl fett orzo cous semol'],
];

export { radici };
export const togliAccenti = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const norma = (s) => togliAccenti(s).toLowerCase().replace(/['’]/g, "' ").replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
const radice = (w) => (w.length > 3 ? w.replace(/h?[aeio]$/, '') : w);
const radici = (s) => norma(s).split(' ').filter((w) => w && !VUOTE.has(w) && !w.endsWith("'")).map(radice);

export function indovina(nome) {
  // la prima parola è quella che conta ("succo di frutta" è una bevanda); "pelati", "surgelati" decidono da soli
  const r = radici(nome);
  const cerca = (x, voci) => voci.find(([, , parole]) => parole.split(' ').some((w) => { const p = radice(w); return x === p || x === w || (p.length >= 4 && x.startsWith(p)); }));
  const forte = r.map((x) => cerca(x, DIZIONARIO.slice(0, 2))).find(Boolean);
  const e = forte || r.map((x) => cerca(x, DIZIONARIO)).find(Boolean);
  if (!e) return null;
  // casa e igiene: i liquidi si confrontano al litro (ammorbidente, candeggina, bagnoschiuma…)
  if (e[0] === 'casa' && /ammorbid|candeggin|liquid|sgrassat|detergent|bagnoschium|shampo|collutori|ammoniac|alcol|igienizzant|anticalcar|brillantant/.test(String(nome).toLowerCase())) return { reparto: 'casa', unita: 'l' };
  return { reparto: e[0], unita: e[1] };
}
const PESO_PEZZO = { melon: 1.5, anguri: 5, ananas: 1.5, cavolfior: 1, cavol: 1, verz: 1, zucc: 1.5, lattug: 0.4, insalat: 0.3, radicchi: 0.3, finocch: 0.3, melanzan: 0.3, peperon: 0.25, sedan: 0.6, agli: 0.05, limon: 0.15, kiwi: 0.1, banan: 0.2, mel: 0.2, per: 0.2, aranc: 0.25, pomodor: 0.15, zucchin: 0.2, carot: 0.1, cipoll: 0.15, patat: 0.2, cetriol: 0.3, carciof: 0.25, avocad: 0.2, mandarin: 0.1, clementin: 0.1, cach: 0.25, pesc: 0.2 };
const pesoPezzo = (nome) => { for (const x of radici(nome)) if (PESO_PEZZO[x]) return PESO_PEZZO[x]; return 0.2; };

const numeroDi = (w) => {
  if (/^\d+([.,]\d+)?$/.test(w)) return Number(w.replace(',', '.'));
  return NUMERI[w.replace(/'$/, '')] ?? null;
};
const misuraDi = (w) => { for (const [re, u, f] of MISURE) if (re.test(w)) return { u, f }; return null; };

// Il testo intero diviso nelle singole cose: virgole, punti, "e", "poi", "anche", e un articolo dopo un nome ("patate il latte")
const ATTACCO = new Set(['di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', "dell'", "d'", 'a', 'al', 'alla', 'per', 'con', 'da', 'in', 'emezzo']);
const INIZIO = new Set(['il', 'lo', 'la', 'i', 'gli', 'le', "l'", 'un', 'uno', 'una', "un'"]);
export function dividi(testo) {
  const out = [];
  for (const frase of String(testo).split(/[,;.:!?\n]+/)) {
    let t = ` ${norma(frase)} `;
    t = t.replace(/\b(\d+)\s*(kg|g|gr|l|lt|ml|cl|hg)\b/g, '$1 $2');
    t = t.replace(/\b(chil[oi]|kil[oi]|kg|litr[oi]|lt|l|ett[oi]) e mezz[oa]\b/g, '$1 emezzo');
    t = t.replace(CONTORNO, ' , ');
    for (const pezzo of t.split(/,| e | ed | poi | piu | anche | inoltre | oppure /)) {
      const w = pezzo.split(' ').filter(Boolean);
      let cur = [];
      for (const x of w) {
        const prima = cur[cur.length - 1];
        if (INIZIO.has(x) && cur.length && !ATTACCO.has(prima) && numeroDi(prima) == null && !misuraDi(prima) && !INIZIO.has(prima)) { out.push(cur.join(' ')); cur = []; }
        cur.push(x);
      }
      if (cur.length) out.push(cur.join(' '));
    }
  }
  return out.map((x) => x.trim()).filter((x) => x && !/^(e|ed|poi|anche)$/.test(x));
}

// Una cosa: quantità, misura, qualità e nome. "2 kg di patate", "mezzo chilo di pomodori italiani", "latte bio 2 litri"
export function leggiPezzo(pezzo) {
  let w = pezzo.split(' ').filter(Boolean);
  let qualita = 'qualsiasi'; let resto = w.join(' ');
  const bio = QUALITA[0][0].test(resto); const ita = QUALITA[1][0].test(resto);
  if (bio || ita) { qualita = bio && ita ? 'bio_italiano' : bio ? 'bio' : 'italiano'; for (const [re] of QUALITA) resto = resto.replace(new RegExp(re.source, 'g'), ' '); w = resto.split(' ').filter(Boolean); }
  const quanto = (da) => {
    let i = da; let n = null; let m = null;
    while (i < w.length && numeroDi(w[i]) != null && !(w[i] === 'un' || w[i] === 'una' || w[i] === 'uno') ? true : (i < w.length && numeroDi(w[i]) != null && (misuraDi(w[i + 1] || '') || n == null) && i === da)) { n = (n ?? 0) + numeroDi(w[i]); i++; }
    if (i < w.length && misuraDi(w[i])) { m = misuraDi(w[i]); i++; }
    if (w[i] === 'emezzo') { n = (n ?? 1) + 0.5; i++; }
    if (m && n == null) n = 1;
    return { n, m, i };
  };
  let { n, m, i } = quanto(0);
  if (w[i] === 'emezzo') i++;
  while (i < w.length && ARTICOLI.has(w[i])) i++;
  let nome = w.slice(i);
  // quantità detta dopo: "patate 2 chili"
  for (let k = 1; k < nome.length && n == null; k++) {
    const q = (() => { const salva = w; w = nome; const r = quanto(k); w = salva; return r; })();
    if (q.n != null && q.i === nome.length) { n = q.n; m = q.m; nome = nome.slice(0, k); }
  }
  nome = nome.filter((x) => x !== 'emezzo');
  while (nome.length && ARTICOLI.has(nome[nome.length - 1])) nome.pop();
  return { n, m, qualita, nome: nome.join(' ').replace(/' /g, "'") };
}

function punteggio(nomeDetto, nomeVoce) {
  const a = radici(nomeDetto); const b = radici(nomeVoce);
  if (!a.length || !b.length) return 0;
  const inB = a.filter((x) => b.includes(x)).length; const inA = b.filter((x) => a.includes(x)).length;
  if (inB === a.length && inA === b.length) return 100;
  if (a[0] !== b[0]) return 0; // la prima parola decide: "pomodori" non è la "Passata di pomodoro"
  if (inB === a.length) return 85 - (b.length - a.length) * 5; // "latte" → "Latte intero"
  if (inA === b.length) return 70; // "zucchine verdi" → "Zucchine"
  return 0;
}

// Cerca la voce giusta: prima il nome della voce, poi i prodotti (nome o marca: "nutella" → crema di nocciole, marca Nutella)
// 0.81: nomi di categoria («Carni», «Formaggi», «Verdure»): non sono una cosa da comprare. «Carne di manzo» non va dentro «Carni»
export const CATEGORIE_GENERICHE = new Set(['carni', 'carne', 'formaggi', 'salumi', 'latticini', 'pesce', 'pesci', 'verdure', 'ortaggi', 'frutta', 'bevande', 'bibite', 'dolci', 'snack', 'surgelati', 'condimenti', 'cereali', 'legumi', 'alimenti', 'cibi', 'spezie', 'conserve', 'prodotti', 'cibi a base vegetale', 'alimenti a base vegetale', 'carni e derivati', 'prodotti lattiero-caseari', 'piatti pronti', 'colazione', 'dessert']);
export const generica = (nome) => CATEGORIE_GENERICHE.has(String(nome || '').trim().toLowerCase());
export function trovaVoce(nome, voci, prodotti) {
  let meglio = null;
  for (const v of voci) { const p = punteggio(nome, v.nome); if (p && !(p < 100 && generica(v.nome)) && (!meglio || p > meglio.p)) meglio = { v, p }; }
  if (meglio && meglio.p >= 70) return { voce: meglio.v, marca: 'qualsiasi', p: meglio.p };
  for (const p of prodotti) {
    const v = voci.find((x) => x.id === p.voce_id); if (!v) continue;
    if (p.marca && punteggio(nome, p.marca) >= 85) return { voce: v, marca: `brand:${p.marca}`, p: 90 };
    if (punteggio(nome, p.nome) >= 85) return { voce: v, marca: 'qualsiasi', p: 85 };
  }
  return null;
}

const tondo = (x, passo) => Number(Math.max(passo, Math.round(x / passo) * passo).toFixed(2));
function formatoTipico(voce, prodotti) {
  const q = prodotti.filter((p) => p.voce_id === voce.id && !p.sfuso && p.quantita > 0).map((p) => p.quantita).sort((a, b) => a - b);
  return q.length ? q[Math.floor(q.length / 2)] : null;
}
// Quanto mettere in lista, nell'unità della voce, e come dirlo
function quantita(voce, n, m, prodotti) {
  const u = voce.unita; const conf = formatoTipico(voce, prodotti);
  if (m && m.u === u) return { q: n * m.f, circa: false };
  if (m && m.u === 'conf') return u === 'pz' ? { q: n, circa: false } : { q: n * (conf || (u === 'kg' ? 0.5 : 1)), circa: !conf };
  if (m && m.u === 'pz') return u === 'pz' ? { q: n * m.f, circa: false } : { q: n * m.f * (conf || pesoPezzo(voce.nome)), circa: true };
  if (m) return { q: u === 'pz' ? 1 : (conf || 1), circa: true }; // misura che non torna (litri per una voce a peso): una confezione
  if (n != null) return u === 'pz' ? { q: n, circa: false } : conf ? { q: n * conf, circa: false } : { q: n * pesoPezzo(voce.nome), circa: true };
  return { q: u === 'pz' ? 1 : (conf || (u === 'kg' && voce.reparto !== 'ortofrutta' ? 0.5 : 1)), circa: false };
}
export const maiuscola = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Dal testo dettato alle proposte da confermare
export function capisci(testo, voci, prodotti) {
  const capito = []; const pezzi = [];
  for (const pezzo of dividi(testo)) {
    const l = leggiPezzo(pezzo);
    if (!l.nome) continue;
    // "latte pane uova" senza pause: se il pezzo intero non è una voce ma ogni parola lo è, sono più cose
    const parole = l.nome.split(' ').filter((x) => !VUOTE.has(x));
    const intero = trovaVoce(l.nome, voci, prodotti);
    const nota = (x) => (trovaVoce(x, voci, prodotti)?.p || 0) >= 85;
    if ((!intero || intero.p < 85) && parole.length > 1 && (parole.every(nota) || (parole.length >= 3 && parole.every((x) => nota(x) || indovina(x))))) {
      parole.forEach((x, k) => pezzi.push({ ...l, nome: x, n: k === 0 ? l.n : null, m: k === 0 ? l.m : null, detto: x }));
    } else pezzi.push({ ...l, detto: pezzo });
  }
  for (const l of pezzi) {
    const t = trovaVoce(l.nome, voci, prodotti);
    const voce = t?.voce || { id: null, nome: maiuscola(l.nome), ...(indovina(l.nome) || { reparto: 'dispensa', unita: 'pz' }) };
    const { q, circa } = quantita(voce, l.n, l.m, prodotti);
    const passo = voce.unita === 'pz' ? 1 : 0.05;
    const gia = capito.find((c) => (voce.id ? c.voce_id === voce.id : c.nuova && c.nome.toLowerCase() === voce.nome.toLowerCase()));
    if (gia) continue;
    capito.push({
      detto: l.detto, voce_id: voce.id, nome: voce.nome, nuova: voce.id ? null : { nome: voce.nome, reparto: voce.reparto, unita: voce.unita },
      unita: voce.unita, quantita: Math.min(200, tondo(q, passo)), circa, detta: l.n != null || !!l.m, qualita: l.qualita, marca: t?.marca || 'qualsiasi',
    });
  }
  return capito;
}
