// Additivi alimentari: un giudizio prudente, basato su fonti pubbliche, da mostrare come semaforo.
//   rosso  = "da evitare se puoi"  (obbligo di avvertenza in etichetta, vietato nell'UE, o classificato dalla IARC come possibile cancerogeno)
//   giallo = "da limitare"         (EFSA ha abbassato la dose ammessa, chiesto altri studi o segnalato chi rischia di superarla)
//   tutti gli altri additivi autorizzati nell'UE = "nessun problema noto"
// Non è un parere medico: l'app dice sempre da dove viene il giudizio e non scrive mai "fa male".
const A = (livello, nome, perche) => ({ livello, nome, perche });
const AVVERTENZA_COLORANTI = 'Colorante: per legge (Reg. UE 1333/2008) in etichetta deve esserci l\'avvertenza "può influire negativamente sull\'attività e l\'attenzione dei bambini".';
const NITRITI = 'Conservante delle carni lavorate: può formare nitrosammine. L\'EFSA (2023) ha indicato un rischio per la salute con l\'esposizione attuale.';
const FOSFATI = 'Fosfati: l\'EFSA (2019) ha fissato una dose giornaliera e segnalato che chi ne consuma molti può superarla.';
const SOLFITI = 'Solfiti: possono dare reazioni a chi è sensibile (asma); sono tra gli allergeni da indicare in etichetta.';
const DOLCIFICANTE = 'Dolcificante: l\'OMS (2023) sconsiglia i dolcificanti per controllare il peso.';
const EMULSIONANTE = 'Emulsionante: sono in corso studi sui suoi effetti sulla flora intestinale.';

export const ADDITIVI = {
  E102: A('rosso', 'Tartrazina', AVVERTENZA_COLORANTI), E104: A('rosso', 'Giallo di chinolina', AVVERTENZA_COLORANTI), E110: A('rosso', 'Giallo tramonto', AVVERTENZA_COLORANTI),
  E122: A('rosso', 'Azorubina', AVVERTENZA_COLORANTI), E124: A('rosso', 'Rosso cocciniglia A', AVVERTENZA_COLORANTI), E129: A('rosso', 'Rosso allura', AVVERTENZA_COLORANTI),
  E171: A('rosso', 'Biossido di titanio', 'Colorante vietato negli alimenti nell\'UE dal 2022: l\'EFSA (2021) non lo considera più sicuro.'),
  E249: A('rosso', 'Nitrito di potassio', NITRITI), E250: A('rosso', 'Nitrito di sodio', NITRITI), E251: A('rosso', 'Nitrato di sodio', NITRITI), E252: A('rosso', 'Nitrato di potassio', NITRITI),
  E320: A('rosso', 'BHA (butilidrossianisolo)', 'Antiossidante classificato dalla IARC come possibile cancerogeno (gruppo 2B).'),
  E951: A('rosso', 'Aspartame', 'Dolcificante classificato dalla IARC (2023) come possibile cancerogeno (gruppo 2B); l\'EFSA lo considera sicuro entro la dose giornaliera ammessa.'),
  E150C: A('giallo', 'Caramello ammoniacale', 'Colorante caramello: può contenere 4-MEI, sostanza su cui l\'EFSA ha fissato limiti.'),
  E150D: A('giallo', 'Caramello solfito-ammoniacale', 'Colorante caramello: può contenere 4-MEI, sostanza su cui l\'EFSA ha fissato limiti.'),
  E210: A('giallo', 'Acido benzoico', 'Conservante: insieme alla vitamina C può formare piccole quantità di benzene.'),
  E211: A('giallo', 'Benzoato di sodio', 'Conservante: insieme alla vitamina C può formare piccole quantità di benzene.'),
  E212: A('giallo', 'Benzoato di potassio', 'Conservante: insieme alla vitamina C può formare piccole quantità di benzene.'),
  E213: A('giallo', 'Benzoato di calcio', 'Conservante: insieme alla vitamina C può formare piccole quantità di benzene.'),
  E220: A('giallo', 'Anidride solforosa', SOLFITI), E221: A('giallo', 'Solfito di sodio', SOLFITI), E222: A('giallo', 'Bisolfito di sodio', SOLFITI), E223: A('giallo', 'Metabisolfito di sodio', SOLFITI),
  E224: A('giallo', 'Metabisolfito di potassio', SOLFITI), E226: A('giallo', 'Solfito di calcio', SOLFITI), E227: A('giallo', 'Bisolfito di calcio', SOLFITI), E228: A('giallo', 'Bisolfito di potassio', SOLFITI),
  E321: A('giallo', 'BHT (butilidrossitoluene)', 'Antiossidante: l\'EFSA ha fissato una dose giornaliera bassa.'),
  E338: A('giallo', 'Acido fosforico', FOSFATI), E339: A('giallo', 'Fosfati di sodio', FOSFATI), E340: A('giallo', 'Fosfati di potassio', FOSFATI), E341: A('giallo', 'Fosfati di calcio', FOSFATI),
  E343: A('giallo', 'Fosfati di magnesio', FOSFATI), E450: A('giallo', 'Difosfati', FOSFATI), E451: A('giallo', 'Trifosfati', FOSFATI), E452: A('giallo', 'Polifosfati', FOSFATI),
  E407: A('giallo', 'Carragenina', 'Addensante: l\'EFSA (2018) ne ha confermato l\'uso ma ha chiesto altri studi.'),
  E407A: A('giallo', 'Alghe Eucheuma trasformate', 'Addensante: l\'EFSA (2018) ne ha confermato l\'uso ma ha chiesto altri studi.'),
  E433: A('giallo', 'Polisorbato 80', EMULSIONANTE), E466: A('giallo', 'Carbossimetilcellulosa', EMULSIONANTE),
  E621: A('giallo', 'Glutammato monosodico', 'Esaltatore di sapidità: l\'EFSA (2017) ha abbassato la dose giornaliera ammessa.'),
  E950: A('giallo', 'Acesulfame K', DOLCIFICANTE), E952: A('giallo', 'Ciclammato', DOLCIFICANTE), E954: A('giallo', 'Saccarina', DOLCIFICANTE), E955: A('giallo', 'Sucralosio', DOLCIFICANTE),
  E301: A('verde', 'Ascorbato di sodio', ''), E302: A('verde', 'Ascorbato di calcio', ''), E316: A('verde', 'Eritorbato di sodio', ''), E325: A('verde', 'Lattato di sodio', ''),
  E326: A('verde', 'Lattato di potassio', ''), E327: A('verde', 'Lattato di calcio', ''), E331: A('verde', 'Citrati di sodio', ''), E332: A('verde', 'Citrati di potassio', ''), E333: A('verde', 'Citrati di calcio', ''),
  E260: A('verde', 'Acido acetico', ''), E262: A('verde', 'Acetati di sodio', ''), E401: A('verde', 'Alginato di sodio', ''), E406: A('verde', 'Agar-agar', ''), E414: A('verde', 'Gomma arabica', ''),
  E418: A('verde', 'Gomma di gellano', ''), E460: A('verde', 'Cellulosa', ''), E501: A('verde', 'Carbonati di potassio', ''), E504: A('verde', 'Carbonati di magnesio', ''), E509: A('verde', 'Cloruro di calcio', ''),
  E516: A('verde', 'Solfato di calcio', ''), E570: A('verde', 'Acidi grassi', ''), E575: A('verde', 'Glucono-delta-lattone', ''), E1400: A('verde', 'Destrine', ''), E1404: A('verde', 'Amido ossidato', ''),
  E1412: A('verde', 'Amido modificato', ''), E1414: A('verde', 'Amido modificato', ''), E1420: A('verde', 'Amido modificato', ''), E1450: A('verde', 'Amido modificato', ''), E160B: A('verde', 'Annatto', ''),
  E162: A('verde', 'Rosso di barbabietola', ''), E163: A('verde', 'Antociani', ''), E140: A('verde', 'Clorofille', ''), E141: A('verde', 'Clorofille rameiche', ''), E150A: A('verde', 'Caramello semplice', ''),
  E153: A('verde', 'Carbone vegetale', ''), E170: A('verde', 'Carbonato di calcio', ''), E965: A('verde', 'Maltitolo', ''), E967: A('verde', 'Xilitolo', ''), E968: A('verde', 'Eritritolo', ''),
  E330: A('verde', 'Acido citrico', ''), E300: A('verde', 'Acido ascorbico (vitamina C)', ''), E322: A('verde', 'Lecitine', ''), E440: A('verde', 'Pectine', ''),
  E412: A('verde', 'Farina di semi di guar', ''), E415: A('verde', 'Gomma di xanthan', ''), E410: A('verde', 'Farina di semi di carrube', ''), E500: A('verde', 'Carbonati di sodio (bicarbonato)', ''),
  E503: A('verde', 'Carbonati di ammonio', ''), E296: A('verde', 'Acido malico', ''), E270: A('verde', 'Acido lattico', ''), E306: A('verde', 'Tocoferoli (vitamina E)', ''),
  E202: A('verde', 'Sorbato di potassio', ''), E200: A('verde', 'Acido sorbico', ''), E160A: A('verde', 'Caroteni', ''), E160C: A('verde', 'Estratto di paprika', ''), E100: A('verde', 'Curcumina', ''),
  E471: A('verde', 'Mono e digliceridi degli acidi grassi', ''), E472E: A('verde', 'Esteri mono e diacetiltartarici', ''), E290: A('verde', 'Anidride carbonica', ''), E941: A('verde', 'Azoto', ''),
  E960: A('verde', 'Glicosidi steviolici (stevia)', ''), E420: A('verde', 'Sorbitolo', ''), E422: A('verde', 'Glicerolo', ''), E1442: A('verde', 'Amido modificato', ''), E1422: A('verde', 'Amido modificato', ''),
};

// "en:e330", "E 250", "e150d" → "E330", "E250", "E150D"
export const codice = (x) => { const m = String(x || '').toUpperCase().replace(/^EN:/, '').replace(/\s+/g, '').match(/^E(\d{3,4}[A-F]?)/); return m ? `E${m[1]}` : null; };
// dagli ingredienti scritti: "conservante: E250", "antiossidante E 301"
export function daIngredienti(testo) {
  const out = new Set();
  for (const m of String(testo || '').matchAll(/\bE\s?-?(\d{3,4}[a-f]?)\b/gi)) out.add(`E${m[1].toUpperCase()}`);
  return [...out];
}
export function elenco(codici) {
  return [...new Set((codici || []).map(codice).filter(Boolean))].map((c) => ({ codice: c, ...(ADDITIVI[c] || { livello: 'verde', nome: '', perche: '' }) }))
    .sort((a, b) => ['rosso', 'giallo', 'verde'].indexOf(a.livello) - ['rosso', 'giallo', 'verde'].indexOf(b.livello));
}
// 100 senza additivi preoccupanti; -40 per ogni rosso, -15 per ogni giallo
export function puntiAdditivi(codici) {
  const e = elenco(codici);
  return Math.max(0, 100 - e.filter((x) => x.livello === 'rosso').length * 40 - e.filter((x) => x.livello === 'giallo').length * 15);
}
