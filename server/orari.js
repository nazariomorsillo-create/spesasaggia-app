// Orari di apertura dei negozi. Si leggono nel formato di OpenStreetMap («Mo-Sa 08:00-20:00; Su 09:00-13:00; PH off»)
// e diventano una tabella della settimana. Questo file non usa niente di Node: lo usa anche l'app sul telefono.
const GIORNI = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const NOMI_GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const ORA = /^(\d{1,2}):(\d{2})$/;
const minuti = (s) => { const m = ORA.exec(s.trim()); if (!m) return null; const v = Number(m[1]) * 60 + Number(m[2]); return v <= 24 * 60 ? v : null; };

// selettore dei giorni («Mo-Fr,Su,PH») → { giorni: Set(0..6), festivi: bool } oppure null se contiene cose che non gestiamo
function selettore(s) {
  const giorni = new Set(); let festivi = false;
  for (const parte of s.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (parte === 'PH') { festivi = true; continue; }
    const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(parte);
    if (!m) return null;
    const a = GIORNI.indexOf(m[1]); const b = m[2] ? GIORNI.indexOf(m[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) { giorni.add(i); if (i === b) break; }
  }
  return { giorni, festivi };
}

// fasce orarie («08:00-13:00,15:30-19:30») → [[480, 780], [930, 1170]] oppure null
function fasce(s) {
  const out = [];
  for (const f of s.split(',').map((x) => x.trim()).filter(Boolean)) {
    const [a, b] = f.split('-'); const x = a != null && minuti(a); const y = b != null && minuti(b);
    if (x == null || y == null || x === false || y === false) return null;
    out.push([x, y > x ? y : y + 24 * 60]);
  }
  return out.length ? out.sort((p, q) => p[0] - q[0]) : null;
}

// Legge il testo. Restituisce { giorni: [7 elenchi di fasce, lunedì per primo], festivi: fasce | null (= non detto) } o null.
export function leggiOrari(testo) {
  let t = String(testo || '').trim(); if (!t) return null;
  t = t.replace(/\s+/g, ' ').replace(/–|—/g, '-').replace(/(\d)\.(\d\d)/g, '$1:$2').replace(/\b(\d):(\d\d)\b/g, '0$1:$2').replace(/ ?- ?(?=\d)/g, '-');
  if (/^24\/7$/.test(t)) return { giorni: Array.from({ length: 7 }, () => [[0, 1440]]), festivi: [[0, 1440]] };
  const giorni = Array.from({ length: 7 }, () => null); let festivi = null; let letto = false;
  // le regole sono divise da «;»; una virgola seguita da un giorno inizia anch'essa una regola nuova
  const regole = t.split(';').flatMap((r) => r.split(/(?<=\d|off|closed),\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/)).map((r) => r.trim()).filter(Boolean);
  for (const r of regole) {
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:\s*,\s*(?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?))*)?\s*(.*)$/.exec(r);
    const sel = m[1] ? selettore(m[1].replace(/\s/g, '')) : { giorni: new Set([0, 1, 2, 3, 4, 5, 6]), festivi: false };
    if (!sel) continue;
    const resto = m[2].replace(/"[^"]*"/g, '').trim();
    let f;
    if (/^(off|closed|chiuso)$/i.test(resto)) f = [];
    else { f = fasce(resto); if (!f) continue; }
    for (const g of sel.giorni) giorni[g] = f;
    if (sel.festivi) festivi = f;
    letto = true;
  }
  if (!letto) return null;
  return { giorni: giorni.map((g) => g || []), festivi };
}

const hhmm = (m) => { const v = m === 1440 ? m : m % 1440; return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const hh = (m) => { const v = m === 1440 ? m : m % 1440; return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
export const scriviFasce = (f) => (f.length ? f.map(([a, b]) => `${hhmm(a)}–${hhmm(b)}`).join(' e ') : 'chiuso');

// tabella (7 giorni di fasce) → testo nel formato OpenStreetMap, raggruppando i giorni uguali e di fila
export function scriviOrari(giorni, festivi = null) {
  const chiave = (f) => (f.length ? f.map(([a, b]) => `${hh(a)}-${hh(b)}`).join(',') : 'off');
  const parti = []; let i = 0;
  while (i < 7) { let j = i; while (j + 1 < 7 && chiave(giorni[j + 1]) === chiave(giorni[i])) j++; parti.push(`${GIORNI[i]}${j > i ? `-${GIORNI[j]}` : ''} ${chiave(giorni[i])}`); i = j + 1; }
  if (festivi) parti.push(`PH ${chiave(festivi)}`);
  return parti.join('; ');
}

// ---------- festivi nazionali ----------
function pasqua(anno) { // algoritmo di Gauss (calendario gregoriano)
  const a = anno % 19; const b = Math.floor(anno / 100); const c = anno % 100; const d = Math.floor(b / 4); const e = b % 4;
  const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31); const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, mese - 1, giorno);
}
const chiaveData = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function festivo(d) {
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // dal 2026 anche il 4 ottobre (San Francesco) è festa nazionale
  if (['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].includes(md) || (md === '10-04' && d.getFullYear() >= 2026)) return true;
  const p = pasqua(d.getFullYear()); const lun = new Date(p); lun.setDate(p.getDate() + 1);
  return chiaveData(d) === chiaveData(p) || chiaveData(d) === chiaveData(lun);
}

// ---------- aperto o chiuso adesso ----------
const indice = (d) => (d.getDay() + 6) % 7; // lunedì = 0
function fasceDel(o, d) { const fest = festivo(d); return { f: fest && o.festivi ? o.festivi : o.giorni[indice(d)], festaIncerta: fest && !o.festivi }; }

// { noto, aperto, chiude ('20:00'), traMinuti, riapre: { quando: 'oggi'|'domani'|'lunedì'…, ora }, festaIncerta }
export function statoOrari(o, adesso = new Date()) {
  if (!o) return { noto: false };
  const ora = adesso.getHours() * 60 + adesso.getMinutes();
  const oggi = fasceDel(o, adesso);
  // le fasce di ieri che passano la mezzanotte
  const ieri = new Date(adesso); ieri.setDate(ieri.getDate() - 1);
  const daIeri = fasceDel(o, ieri).f.filter(([, b]) => b > 1440).map(([, b]) => [0, b - 1440]);
  const tutte = [...daIeri, ...oggi.f].sort((a, b) => a[0] - b[0]);
  const qui = tutte.find(([a, b]) => ora >= a && ora < b);
  if (qui) {
    let fine = qui[1]; for (const [a, b] of tutte) if (a <= fine && b > fine) fine = b; // fasce attaccate
    return { noto: true, aperto: true, chiude: hhmm(fine), traMinuti: fine - ora, festaIncerta: oggi.festaIncerta };
  }
  const dopo = tutte.find(([a]) => a > ora);
  if (dopo) return { noto: true, aperto: false, riapre: { quando: 'oggi', ora: hhmm(dopo[0]) }, festaIncerta: oggi.festaIncerta };
  for (let k = 1; k <= 7; k++) {
    const d = new Date(adesso); d.setDate(d.getDate() + k);
    const f = fasceDel(o, d).f;
    if (f.length) return { noto: true, aperto: false, riapre: { quando: k === 1 ? 'domani' : NOMI_GIORNI[indice(d)], ora: hhmm(f[0][0]) }, festaIncerta: oggi.festaIncerta };
  }
  return { noto: true, aperto: false, riapre: null, festaIncerta: oggi.festaIncerta };
}

// la frase da mostrare, con il colore: verde (aperto), arancio (chiude presto), rosso (chiuso), grigio (non si sa)
export function fraseOrari(testo, adesso = new Date(), presto = 60) {
  const o = leggiOrari(testo); const s = statoOrari(o, adesso);
  if (!s.noto) return { colore: 'grigio', frase: 'Orari non ancora noti' };
  if (o.giorni.every((f) => f.length === 1 && f[0][0] === 0 && f[0][1] >= 1440)) return { colore: 'verde', frase: 'Aperto 24 ore su 24', ...s };
  const festa = s.festaIncerta ? ' · oggi è festa: gli orari potrebbero cambiare' : '';
  const alle = (h) => (h === '24:00' ? 'a mezzanotte' : `alle ${h}`);
  if (s.aperto && s.traMinuti <= presto) return { colore: 'arancio', frase: `Chiude tra ${s.traMinuti} ${s.traMinuti === 1 ? 'minuto' : 'minuti'}, ${alle(s.chiude)}${festa}`, ...s };
  if (s.aperto) return { colore: 'verde', frase: s.chiude === '24:00' ? `Aperto fino a mezzanotte${festa}` : `Aperto fino alle ${s.chiude}${festa}`, ...s };
  return { colore: 'rosso', frase: `Chiuso adesso${s.riapre ? ` · riapre ${s.riapre.quando} alle ${s.riapre.ora}` : ''}${festa}`, ...s };
}
