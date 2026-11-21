// Categorie delle offerte, più fini dei reparti: «Carne», «Formaggi e latticini», «Pasta, riso e cereali»…
// Si ricavano dal nome della voce e del prodotto; se nessuna parola aiuta, resta il reparto.
// Ordine: quello in cui compaiono nella pagina delle offerte.
const CATEGORIE = [
  // [chiave, nome, reparto d'origine (o null = qualsiasi), parole (radici) che la fanno scattare]
  ['frutta', 'Frutta', 'ortofrutta', 'mel per banan aranc limon mandarin clementin kiwi uv fragol pesc albicocc ciliegi prugn susin cach melon anguri ananas fich nespol pompelm avocad mango frutt noc mandorl castagn'],
  ['verdura', 'Verdura e ortaggi', 'ortofrutta', 'patat cipoll carot zucchin zucc pomodor insalat lattug radicchi spinac bietol cavol broccol finocch sedan peperon melanzan cetriol fagiolin pisell aglio porr asparag carciof funghi verdur ortagg rucol basilic prezzemol'],
  ['carne', 'Carne e pollo', null, 'carn poll tacchin manz maial vitell salsicc hamburg macinat bistecc fettin petto cosci arrost spezzatin agnell coniglio wurstel'],
  ['pesce', 'Pesce', null, 'pesc salmon merluzz orat branzin tonn sgombr sardin alic acciugh gamber calamar polp vongol cozz filett bastoncin surim'],
  ['salumi', 'Salumi', null, 'prosciutt salam mortadell bresaol speck pancett coppa cotechin salum affettat'],
  ['latticini', 'Formaggi, latte e uova', null, 'latt yogurt burr pann mozzarell formagg parmigian grana pecorin ricott stracchin gorgonzol scamorz provol kefir uov mascarpon philadelphia crescenz'],
  ['pane', 'Pane e forno', 'pane', 'pan panin focacc pizz grissin crackers fette biscottat piadin tramezzin'],
  ['pasta', 'Pasta, riso e cereali', null, 'past spaghett penn fusill rigaton riso farin cere fiocch muesl aven orzo cous polent gnocc tortellin ravioli lasagn farr quinoa bulgur migli grano saracen'],
  ['dolci', 'Dolci, biscotti e snack', null, 'biscott merendin crem nocciol cioccolat caramell torta croissant brioch wafer snack patatin gelat budin marmellat miel zuccher'],
  ['conserve', 'Conserve, sughi e scatolame', null, 'pelat polpa passat sugh pesto conserv legum fagiol ceci lenticch mais oliv sottol sottacet scatolett'],
  ['condimenti', 'Olio, aceto e condimenti', null, 'oli acet sal pepe spezi maionese ketchup senape dado brodo'],
  ['colazione', 'Caffè, tè e colazione', null, 'caff te tisan cacao orzo solub fette'],
  ['bevande', 'Acqua e bibite', 'bevande', 'acqu aranciat cola bibit gassos succ spremut energy the'],
  ['alcolici', 'Vino e birra', null, 'vin birr prosecc spumant lambrusc aperitiv liquor amar grappa'],
  ['surgelati', 'Surgelati', 'surgelati', 'surgelat gelat congelat'],
  ['bimbi', 'Bimbi', null, 'pannolin omogeneizz pappe biberon salviett bimb bambin'],
  ['animali', 'Animali', null, 'crocchett gatt can mangim lettier'],
  ['igiene', 'Igiene e cura della persona', null, 'sapon shampo bagnoschium dentifric spazzolin deodorant rasoi assorbent cotton crema viso corpo balsam collutor intim cerott lamett profum struccant'],
  ['pulizia', 'Detersivi e pulizia casa', null, 'detersiv ammorbident candeggin sgrassator lavastovigl pavimenti vetri spugn anticalcar igienizzant'],
  ['carta', 'Carta e usa e getta', null, 'carta igienic scottex tovagliol fazzolett rotol sacchett alluminio pellicol piatti bicchier'],
];
const RADICE = (w) => (w.length > 3 ? w.replace(/h?[aeio]$/, '') : w);
const parole = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((w) => w.length > 2);
const PER_REPARTO = { ortofrutta: 'frutta', pane: 'pane', fresco: 'latticini', dispensa: 'conserve', surgelati: 'surgelati', bevande: 'bevande', casa: 'pulizia', altro: 'altro' };
const NOMI = Object.fromEntries(CATEGORIE.map(([k, n]) => [k, n]));
NOMI.altro = 'Altro';
export const nomeCategoria = (k) => NOMI[k] || 'Altro';
export const ORDINE = [...CATEGORIE.map(([k]) => k), 'altro'];

// la categoria di un prodotto: prima dalle parole della voce, poi da quelle del prodotto, poi dal reparto
export function categoriaDi(voce, prodotto = '', reparto = 'altro') {
  if (reparto === 'surgelati') return 'surgelati'; // un surgelato è un surgelato, anche se è una pizza
  for (const testo of [voce, prodotto]) {
    const ws = parole(testo); if (!ws.length) continue;
    const radici = ws.map(RADICE);
    // la prima parola della voce pesa di più («succo di frutta» → bevande, non frutta)
    for (const [i, r] of radici.entries()) {
      for (const [k, , rep, lista] of CATEGORIE) {
        if (rep && reparto !== rep && i > 0) continue; // le categorie legate a un reparto valgono se il reparto è quello (o è la parola principale)
        if (lista.split(' ').some((p) => r === p || ws[i] === p || (p.length >= 5 && r.startsWith(p)) || (r.length >= 5 && p.startsWith(r)))) return k;
      }
    }
  }
  // senza parole note: per reparto
  return PER_REPARTO[reparto] || 'altro';
}

// 1.3 (Nazario, 21/11): nel giro i prodotti di ogni supermercato si raggruppano per reparto, nell'ordine in cui di solito
// si gira un supermercato: frutta e verdura all'ingresso, poi pane, banco e frigo, dispensa, bevande, surgelati alla fine
// (per non scongelarli), e i prodotti per la persona e per la casa a parte.
const CORSIE = [
  // 1.4 (Nazario, 21/11): pane, pasta, riso, cereali (farro…), biscotti e dolci tutti insieme; frigo e surgelati insieme
  // (kefir, pasta sfoglia, pizza surgelata). Il freddo resta alla fine del giro, per non scaldarlo nel carrello.
  ['ortofrutta', 'Frutta e verdura', ['frutta', 'verdura']],
  ['dispensa', 'Pane, pasta, riso, cereali e dolci', ['pane', 'pasta', 'dolci', 'colazione']],
  ['conserve', 'Conserve, sughi e condimenti', ['conserve', 'condimenti']],
  ['bevande', 'Acqua, bibite, vino e birra', ['bevande', 'alcolici']],
  ['persona', 'Igiene e cura della persona', ['igiene', 'bimbi']],
  ['casa', 'Detersivi, pulizia e carta', ['pulizia', 'carta']],
  ['animali', 'Animali', ['animali']],
  ['carne', 'Carne e pesce', ['carne', 'pesce']],
  ['frigo', 'Frigo e surgelati', ['salumi', 'latticini', 'surgelati', 'frigo']],
];
const CORSIA_DI = new Map(CORSIE.flatMap(([k, n, cat], i) => cat.map((c) => [c, { corsia: k, corsia_nome: n, corsia_ordine: i + 1 }])));
// si conservano in frigo anche se il nome direbbe altro: pasta sfoglia, brisée, frolla, pasta fresca, gnocchi freschi
const DA_FRIGO = /sfoglia|bris[eé]|pasta frolla|pasta fresca|impasto per pizza|pasta per pizza|lievito di birra/i;
export function corsiaDi(voce, prodotto = '', reparto = 'altro') {
  let cat = categoriaDi(voce, prodotto, reparto);
  const testo = `${voce} ${prodotto}`;
  if (/solubil/i.test(testo)) cat = 'colazione'; // l'orzo solubile sta con il caffè, non con la pasta
  if ((cat === 'carne' || cat === 'pesce') && reparto === 'dispensa') cat = 'conserve'; // tonno e sgombro in scatola: scaffale delle conserve
  // 1.4: dal banco frigo o dal congelatore (reparto «fresco» o «surgelati»): nel gruppo del freddo, tranne carne, pesce, frutta e verdura
  if (DA_FRIGO.test(testo) || ((reparto === 'fresco' || reparto === 'surgelati') && !['carne', 'pesce', 'frutta', 'verdura'].includes(cat))) cat = 'frigo';
  return CORSIA_DI.get(cat) || { corsia: 'altro', corsia_nome: 'Altro', corsia_ordine: CORSIE.length + 1 };
}
