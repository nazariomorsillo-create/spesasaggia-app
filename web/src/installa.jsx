// Mettere l'icona dell'app sul telefono: guida passo passo con il disegno del telefono, diversa per iPhone, Android, Samsung, Firefox.
// Su Android con Chrome, se il telefono lo permette, basta un pulsante («Installa l'app»).
import { useEffect, useState } from 'react';
import { mem, Icona } from './base.jsx';

let promptInstalla = null; const ascoltatori = new Set();
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalla = e; ascoltatori.forEach((f) => f()); });
  addEventListener('appinstalled', () => { promptInstalla = null; mem.scrivi('installa-chiuso', true); ascoltatori.forEach((f) => f()); });
}
export const giaInstallata = () => (typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true));

// quale guida mostrare: Safari di iOS 26 ha il menu dei tre puntini, quelli prima il pulsante Condividi in basso
function dispositivo(ua = navigator.userAgent || '', ipad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
  if (/iPhone|iPad|iPod/.test(ua) || ipad) {
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS|EdgiOS|OPiOS/.test(ua)) return 'ios-altro';
    return Number((ua.match(/Version\/(\d+)/) || [])[1] || 0) >= 26 ? 'ios-safari-26' : 'ios-safari';
  }
  if (/Android/.test(ua)) return /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox/.test(ua) ? 'firefox' : 'android-chrome';
  return 'computer';
}

// ---------- il telefono disegnato: barre, menu, finestre, e il dito che indica dove toccare ----------
const segno = (tratti) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tratti}</svg>;
const SIMBOLI = {
  condividi: segno(<><path d="M12 15V3M8 7l4-4 4 4" /><path d="M8 10H5v11h14V10h-3" /></>),
  'tre-oriz': segno(<><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>),
  'tre-vert': segno(<><circle cx="12" cy="5" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="19" r="1.3" fill="currentColor" /></>),
  righe: segno(<path d="M4 7h16M4 12h16M4 17h16" />),
  indietro: segno(<path d="M15 5l-7 7 7 7" />),
  avanti: segno(<path d="M9 5l7 7-7 7" />),
  libro: segno(<><path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z" /><path d="M20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" /></>),
  schede: segno(<><rect x="4" y="4" width="12" height="12" rx="2" /><path d="M8 20h10a2 2 0 0 0 2-2V8" /></>),
  casa: segno(<><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></>),
  piu: segno(<path d="M12 5v14M5 12h14" />),
  stella: segno(<path d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9 5.5-.8z" />),
  copia: segno(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>),
  occhiali: segno(<><circle cx="7" cy="14" r="3" /><circle cx="17" cy="14" r="3" /><path d="M10 14h4M4 14l2-6M20 14l-2-6" /></>),
  aggiungi: segno(<><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></>),
  download: segno(<><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>),
  orologio: segno(<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>),
  ingranaggio: segno(<><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></>),
  telefono: segno(<><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></>),
  lente: segno(<><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3" /></>),
  giu: segno(<path d="M6 9l6 6 6-6" />),
  qr: segno(<><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><path d="M14 14h2v2h-2zM18 18h2v2h-2z" /></>),
  cerca: segno(<><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>),
  nota: segno(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 15c2-4 3 2 5-2s2 1 3 0" /></>),
  dispositivo: segno(<><rect x="3" y="5" width="12" height="10" rx="1" /><path d="M2 18h14" /><rect x="17" y="9" width="5" height="10" rx="1" /></>),
  installa: segno(<><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M12 8v6M9 11l3 3 3-3M8 21h8" /></>),
};
// la mano con il dito che indica
const Dito = () => <span className="tel-dito" aria-hidden="true"><svg viewBox="0 0 64 84" width="64" height="84">
  <g stroke="#3B2A1E" strokeWidth="5" strokeLinejoin="round"><rect x="22" y="2" width="13" height="44" rx="6.5" /><rect x="34" y="26" width="11" height="26" rx="5.5" /><rect x="44" y="30" width="10" height="24" rx="5" /><rect x="11" y="36" width="44" height="44" rx="15" /><rect x="3" y="42" width="12" height="26" rx="6" transform="rotate(-28 9 55)" /></g>
  <g fill="#FFD9BC"><rect x="22" y="2" width="13" height="44" rx="6.5" /><rect x="34" y="26" width="11" height="26" rx="5.5" /><rect x="44" y="30" width="10" height="24" rx="5" /><rect x="11" y="36" width="44" height="44" rx="15" /><rect x="3" y="42" width="12" height="26" rx="6" transform="rotate(-28 9 55)" /></g>
  <path d="M25 9a4 3 0 0 1 7 0" stroke="#E9B994" strokeWidth="2.5" fill="none" strokeLinecap="round" />
</svg></span>;
const Tasto = ({ i, punta }) => <span className={`tel-tasto${punta ? ' punta' : ''}`}>{SIMBOLI[i]}{punta && <Dito />}</span>;

function Pagina() {
  return <div className="tel-pagina" aria-hidden="true">
    <div className="tel-app"><img src="/icona-192.png" alt="" /><b>Spesa Saggia</b></div>
    <span className="tel-riga" style={{ width: '80%' }} /><span className="tel-riga" style={{ width: '60%' }} /><span className="tel-riga" style={{ width: '70%' }} /><span className="tel-riga" style={{ width: '45%' }} />
  </div>;
}
function Barra({ b }) {
  return <div className={`tel-barra ${b.dove}`}>{b.icone.map((i) => (i === 'indirizzo' ? <span key={i} className="tel-indirizzo">spesasaggia.it</span> : <Tasto key={i} i={i} punta={b.punta === i} />))}</div>;
}
function Voci({ voci, punta, griglia }) {
  return <div className={griglia ? 'tel-griglia' : 'tel-voci'}>{voci.map(([i, t], k) => <div key={t} className={`tel-voce${k === punta ? ' punta' : ''}`}>{SIMBOLI[i]}<span>{t}</span>{k === punta && <Dito />}</div>)}</div>;
}
// l'ultima finestra prima dell'icona: «Aggiungi a Home» su iPhone, «Installa app» su Android
function Conferma({ tipo }) {
  if (tipo === 'ios' || tipo === 'ios26') return <div className="tel-conferma ios">
    <div className="tel-conferma-testa"><span>Annulla</span><b>Aggiungi a Home</b><span className="tel-voce punta tel-aggiungi">Aggiungi<Dito /></span></div>
    <div className="riga"><img src="/icona-192.png" alt="" /><div className="colonna"><b>Spesa Saggia</b><span className="muto">spesasaggia.it</span></div></div>
    {tipo === 'ios26' && <div className="riga fra tel-interruttore"><span>Apri come app web</span><span className="tel-switch" aria-label="acceso" /></div>}
  </div>;
  return <div className="tel-velo"><div className="tel-dialogo">
    <b>{tipo === 'samsung' ? 'Aggiungi a schermata Home' : 'Installa app'}</b>
    <div className="riga"><img src="/icona-192.png" alt="" /><span>Spesa Saggia</span></div>
    <div className="riga fra"><span className="muto">Annulla</span><span className="tel-voce punta">{tipo === 'android' ? 'Installa' : 'Aggiungi'}<Dito /></span></div>
  </div></div>;
}
function SchermataHome() {
  return <div className="tel-home" aria-hidden="true">
    {['#7DB7F0', '#F2B84B', '#9AD07F', '#E58FA8', '#B49CE8', '#7FD3C8', '#F28C66', '#C9C2BA'].map((c, i) => <span key={i} className="tel-app-icona" style={{ background: c }} />)}
    <span className="tel-app-icona nostra"><img src="/icona-192.png" alt="" /><small>Spesa Saggia</small></span>
  </div>;
}
// la finestra «Condividi» dell'iPhone: chiusa (con le app) o aperta con «Visualizza altro»
function FoglioCondividi({ f }) {
  return <div className="tel-velo"><div className="tel-foglio">
    <div className="tel-foglio-testa"><img src="/icona-192.png" alt="" /><div className="colonna"><b>Spesa Saggia</b><span>spesasaggia.it</span></div></div>
    {!f.aperto && <div className="tel-foglio-app">{[['#2F7CF6', 'AirDrop'], ['#34C759', 'Messaggi'], ['#2F7CF6', 'Mail'], ['#fff', 'Safari']].map(([c, t]) => <span key={t}><i style={{ background: c }} />{t}</span>)}</div>}
    <div className="tel-foglio-azioni">{[['copia', 'Copia'], ['dispositivo', 'Invia al dispositivo'], ['occhiali', 'Elenco lettura'], [f.aperto ? 'giu' : 'giu', f.aperto ? 'Mostra meno' : 'Visualizza altro']].map(([i, t], k) => <span key={t} className={`tel-azione${!f.aperto && k === 3 ? ' punta' : ''}`}><i className={f.aperto && k === 3 ? 'su' : ''}>{SIMBOLI[i]}</i>{t}{!f.aperto && k === 3 && <Dito />}</span>)}</div>
    {f.aperto && <>
      <div className="tel-foglio-lista">{[['stella', 'Aggiungi ai preferiti'], ['qr', 'Crea un codice QR'], ['cerca', 'Trova nella pagina']].map(([i, t]) => <div key={t} className="tel-voce">{SIMBOLI[i]}<span>{t}</span></div>)}</div>
      <div className="tel-foglio-lista">
        <div className="tel-voce punta">{SIMBOLI.aggiungi}<span>Aggiungi alla schermata Home</span><Dito /></div>
        <div className="tel-voce">{SIMBOLI.nota}<span>Aggiungi a nuova nota rapida</span></div>
      </div>
    </>}
  </div></div>;
}
// s = come appare lo schermo in quel passo: barra/barre, menu, foglio, conferma, oppure la schermata Home
function Telefono({ s }) {
  if (s.home) return <div className="tel"><SchermataHome /></div>;
  return <div className="tel">
    {[s.barra, ...(s.barre || [])].filter((b) => b?.dove === 'sopra').map((b, i) => <Barra key={i} b={b} />)}
    <Pagina />
    {[s.barra, ...(s.barre || [])].filter((b) => b?.dove === 'sotto').map((b, i) => <Barra key={i} b={b} />)}
    {s.menu && <div className="tel-velo"><div className={`tel-menu ${s.menu.da}`}>
      {s.menu.titolo && <b className="tel-menu-titolo">{s.menu.titolo}</b>}
      <Voci voci={s.menu.voci} punta={s.menu.punta} griglia={s.menu.griglia} />
    </div></div>}
    {s.foglio && <FoglioCondividi f={s.foglio} />}
    {s.conferma && <Conferma tipo={s.conferma} />}
  </div>;
}

// ---------- i passi, telefono per telefono ----------
const PASSI_CONDIVIDI = [
  { s: { foglio: { aperto: false } }, t: <>Si apre la finestra di condivisione. Tocca il tasto tondo con la freccia in giù: <b>«Visualizza altro»</b>.</> },
  { s: { foglio: { aperto: true } }, t: <>Nell'elenco tocca <b>«Aggiungi alla schermata Home»</b>.</>, nota: 'Se non la vedi subito, scorri un po\' verso il basso.' },
];
const FATTO = { s: { home: true }, t: <>Fatto! Ora trovi l'icona di <b>Spesa Saggia</b> tra le tue app: da adesso aprila da lì, come le altre.</> };
const GUIDE = {
  'ios-safari-26': { nome: 'iPhone · Safari', passi: [
    { s: { barra: { dove: 'sotto', icone: ['indietro', 'indirizzo', 'tre-oriz'], punta: 'tre-oriz' } }, t: <>In basso, a destra dell'indirizzo, tocca i <b>tre puntini</b> <Tasto i="tre-oriz" />.</> },
    { s: { barra: { dove: 'sotto', icone: ['indietro', 'indirizzo', 'tre-oriz'] }, menu: { da: 'sotto', voci: [['condividi', 'Condividi'], ['stella', 'Aggiungi ai Preferiti'], ['libro', 'Aggiungi segnalibro'], ['schede', 'Nuovo pannello']], punta: 0 } }, t: <>Nel menu che si apre tocca <b>«Condividi»</b> <Tasto i="condividi" />.</> },
    ...PASSI_CONDIVIDI,
    { s: { conferma: 'ios26' }, t: <>Lascia acceso <b>«Apri come app web»</b> e tocca <b>«Aggiungi»</b> in alto a destra.</> },
    FATTO,
  ] },
  'ios-safari': { nome: 'iPhone · Safari (iOS meno recente)', passi: [
    { s: { barra: { dove: 'sotto', icone: ['indietro', 'avanti', 'condividi', 'libro', 'schede'], punta: 'condividi' } }, t: <>Nella barra in basso tocca il pulsante <b>Condividi</b> <Tasto i="condividi" />: il quadrato con la freccia verso l'alto.</>, nota: 'Se la barra non si vede, tocca una volta in fondo allo schermo e ricompare.' },
    ...PASSI_CONDIVIDI,
    { s: { conferma: 'ios' }, t: <>Tocca <b>«Aggiungi»</b> in alto a destra.</> },
    FATTO,
  ] },
  'ios-chrome': { nome: 'iPhone · Chrome', passi: [
    { s: { barra: { dove: 'sopra', icone: ['lente', 'indirizzo', 'condividi'], punta: 'condividi' }, barre: [{ dove: 'sotto', icone: ['indietro', 'avanti', 'piu', 'schede', 'tre-oriz'] }] }, t: <>In alto a destra, dentro la barra dell'indirizzo, tocca <b>Condividi</b> <Tasto i="condividi" />: il quadrato con la freccia verso l'alto.</> },
    ...PASSI_CONDIVIDI,
    { s: { conferma: 'ios' }, t: <>Tocca <b>«Aggiungi»</b> in alto a destra.</> },
    FATTO,
  ] },
  'ios-altro': { nome: 'iPhone · altro browser', passi: [
    { s: { barra: { dove: 'sotto', icone: ['indietro', 'indirizzo', 'righe'], punta: 'righe' } }, t: <>Apri il <b>menu</b> del browser <Tasto i="righe" /> e cerca <b>«Condividi»</b>.</>, nota: 'Se non trovi la voce, apri spesasaggia.it con Safari: lì i passi sono sicuri.' },
    ...PASSI_CONDIVIDI,
    { s: { conferma: 'ios' }, t: <>Tocca <b>«Aggiungi»</b> in alto a destra.</> },
    FATTO,
  ] },
  'android-chrome': { nome: 'Android · Chrome', passi: [
    { s: { barra: { dove: 'sopra', icone: ['casa', 'indirizzo', 'schede', 'tre-vert'], punta: 'tre-vert' } }, t: <>In alto a destra tocca i <b>tre puntini</b> <Tasto i="tre-vert" />.</> },
    { s: { barra: { dove: 'sopra', icone: ['casa', 'indirizzo', 'schede', 'tre-vert'] }, menu: { da: 'alto', voci: [['piu', 'Nuova scheda'], ['orologio', 'Cronologia'], ['download', 'Download'], ['telefono', 'Aggiungi a schermata Home'], ['ingranaggio', 'Impostazioni']], punta: 3 } }, t: <>Tocca <b>«Aggiungi a schermata Home»</b>.</>, nota: 'Su alcuni telefoni la voce si chiama «Installa app».' },
    { s: { conferma: 'android' }, t: <>Tocca <b>«Installa»</b>.</>, nota: 'Se compare una seconda finestra, tocca di nuovo «Aggiungi» o «Installa».' },
    FATTO,
  ] },
  samsung: { nome: 'Samsung · Internet', passi: [
    { s: { barra: { dove: 'sotto', icone: ['indietro', 'avanti', 'casa', 'schede', 'righe'], punta: 'righe' } }, t: <>In basso a destra tocca le <b>tre righe</b> <Tasto i="righe" />.</> },
    { s: { barra: { dove: 'sotto', icone: ['indietro', 'avanti', 'casa', 'schede', 'righe'] }, menu: { da: 'sotto', griglia: true, voci: [['stella', 'Preferiti'], ['aggiungi', 'Aggiungi pagina a'], ['download', 'Download'], ['orologio', 'Cronologia'], ['ingranaggio', 'Impostazioni'], ['schede', 'Schede']], punta: 1 } }, t: <>Tocca <b>«Aggiungi pagina a»</b>.</> },
    { s: { barra: { dove: 'sotto', icone: ['indietro', 'avanti', 'casa', 'schede', 'righe'] }, menu: { da: 'sotto', titolo: 'Aggiungi pagina a', voci: [['stella', 'Preferiti'], ['telefono', 'Schermata Home'], ['libro', 'Accesso rapido']], punta: 1 } }, t: <>Tocca <b>«Schermata Home»</b>.</> },
    { s: { conferma: 'samsung' }, t: <>Conferma con <b>«Aggiungi»</b>.</> },
    FATTO,
  ] },
  firefox: { nome: 'Android · Firefox', passi: [
    { s: { barra: { dove: 'sotto', icone: ['casa', 'indirizzo', 'schede', 'tre-vert'], punta: 'tre-vert' } }, t: <>Tocca i <b>tre puntini</b> <Tasto i="tre-vert" /> accanto all'indirizzo (in basso o in alto, dipende da come hai impostato Firefox).</> },
    { s: { barra: { dove: 'sotto', icone: ['casa', 'indirizzo', 'schede', 'tre-vert'] }, menu: { da: 'sotto', voci: [['stella', 'Aggiungi ai preferiti'], ['download', 'Download'], ['telefono', 'Aggiungi alla schermata Home'], ['ingranaggio', 'Impostazioni']], punta: 2 } }, t: <>Tocca <b>«Aggiungi alla schermata Home»</b>.</>, nota: 'Su alcune versioni la voce si chiama «Installa» oppure è dentro «Altro».' },
    { s: { conferma: 'android' }, t: <>Conferma con <b>«Aggiungi»</b>.</> },
    FATTO,
  ] },
};
const SCELTE = [['ios-safari-26', 'iPhone Safari'], ['ios-safari', 'iPhone Safari (vecchio)'], ['ios-chrome', 'iPhone Chrome'], ['android-chrome', 'Android Chrome'], ['samsung', 'Samsung Internet'], ['firefox', 'Firefox']];

// la guida: un passo alla volta, con il telefono disegnato; se lo schermo è diverso si sceglie un'altra guida
function GuidaInstalla({ iniziale }) {
  const [chi, setChi] = useState(iniziale); const [passo, setPasso] = useState(0); const [scegli, setScegli] = useState(false);
  const g = GUIDE[chi];
  if (!g) return null;
  const p = g.passi[passo]; const ultimo = passo === g.passi.length - 1;
  const cambia = (k) => { setChi(k); setPasso(0); setScegli(false); };
  return <div className="guida-installa">
    <div className="riga fra"><span className="muto piccolo">{g.nome}</span><span className="muto piccolo">Passo {passo + 1} di {g.passi.length}</span></div>
    <div className="guida-passo">
      <Telefono s={p.s} />
      <div className="colonna guida-testo">
        <p className="guida-frase" aria-live="polite"><span className="numero-passo">{passo + 1}</span>{p.t}</p>
        {p.nota && <p className="muto piccolo">{p.nota}</p>}
      </div>
    </div>
    <div className="pallini" aria-hidden="true">{g.passi.map((_, i) => <span key={i} className={i === passo ? 'on' : ''} />)}</div>
    <div className="riga">
      {passo > 0 && <button type="button" className="b" onClick={() => setPasso(passo - 1)}>Indietro</button>}
      {!ultimo && <button type="button" className="b pieno grande" onClick={() => setPasso(passo + 1)}>Fatto, avanti</button>}
      {ultimo && <button type="button" className="b" onClick={() => setPasso(0)}>Rivedi dall'inizio</button>}
    </div>
    {chi.startsWith('ios') && <p className="muto piccolo">Hai aperto il link da WhatsApp e non vedi questi pulsanti? Tocca la <b>bussola</b> (o «Apri in Safari») in basso a destra, poi rifai i passi.</p>}
    <button type="button" className="link" onClick={() => setScegli(!scegli)}>Il tuo schermo è diverso? Scegli il telefono e il browser</button>
    {scegli && <div className="scelte">{SCELTE.map(([k, t]) => <button type="button" key={k} aria-pressed={chi === k} onClick={() => cambia(k)}>{t}</button>)}</div>}
  </div>;
}

// sempre = pagina dal menu (Altro); altrimenti è il riquadro che compare finché non la si installa o lo si chiude
export function InstallaApp({ sempre = false }) {
  const [, aggiorna] = useState(0); const [chiuso, setChiuso] = useState(() => mem.leggi('installa-chiuso', false));
  const [guida, setGuida] = useState(sempre); // dal menu la guida è già aperta
  useEffect(() => { const f = () => aggiorna((n) => n + 1); ascoltatori.add(f); return () => ascoltatori.delete(f); }, []);
  if (giaInstallata()) return sempre ? <section className="carta"><h2>L'app è già sul telefono</h2><p>La stai usando dall'icona: non serve fare altro.</p></section> : null;
  if (!sempre && chiuso) return null;
  const d = dispositivo();
  const chiudi = () => { mem.scrivi('installa-chiuso', true); setChiuso(true); };
  const installa = async () => { const p = promptInstalla; if (!p) return; p.prompt(); try { const r = await p.userChoice; if (r?.outcome === 'accepted') chiudi(); } catch { /* niente */ } promptInstalla = null; aggiorna((n) => n + 1); };
  return <section className="carta installa">
    <div className="riga fra"><h2>Metti l'app sul telefono</h2>{!sempre && <button type="button" className="b tondo" onClick={chiudi} aria-label="Chiudi"><Icona n="chiudi" d={22} /></button>}</div>
    <p>Così la apri dall'icona, come le altre app, senza cercare il sito. Ci vuole un minuto.</p>
    {promptInstalla && <button type="button" className="b pieno grande" onClick={installa}>Installa l'app</button>}
    {d === 'computer' ? <p>Questa app è fatta per il telefono: apri <b>spesasaggia.it</b> sul cellulare e qui trovi la guida passo passo. <span className="muto piccolo">Sul computer, con Chrome o Edge, puoi installarla dall'icona con la freccia nella barra dell'indirizzo.</span></p>
      : guida ? <GuidaInstalla iniziale={d} />
      : <button type="button" className={`b grande${promptInstalla ? '' : ' pieno'}`} onClick={() => setGuida(true)}>{promptInstalla ? 'Non funziona? Guida passo passo' : 'Mostrami come fare, passo passo'}</button>}
    {!sempre && <button type="button" className="link" onClick={chiudi}>L'ho fatto, non mostrarlo più</button>}
  </section>;
}
