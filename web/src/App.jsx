// Dimmi la spesa: la lista (anche a voce), dove conviene comprare, e la gestione dei prezzi sotto "Altro".
// Pensata per chi non ha dimestichezza: testo grande, pulsanti grandi, una cosa per volta.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, useDati, euro, num, data, QUALITA, mem, quanto, perUnita, nomeQualita, Cartellino, Etichette, StatoPrezzo, Annuncio, Icona, Semaforo, riduciFoto, suCima, giudizioDi } from './base.jsx';
import { Rileva, Scanner, Prezzi, Negozi, Scontrini, Impostazioni, Pubblicita, NuovoDaCodice, NuovoVeloce, NuovoProdotto } from './gestione.jsx';
import { Scheda } from './scheda.jsx';
import { Scegli } from './scegli.jsx';
import { MieiSupermercati } from './supermercati.jsx';
import { Benvenuto } from './vicini.jsx';
import { InstallaApp } from './installa.jsx';
import { ComeFunziona, ComeScegliamo } from './come.jsx';
import { Offerte, MieiPreferiti } from './offerte.jsx';
import { StatoOrari } from './orari.jsx';
import { Spese, Spesa } from './spese.jsx';
import { Statistiche } from './statistiche.jsx';
import { MandaVolantino, GestioneVolantini } from './volantini.jsx';
import { LetturaScontrino } from './lettura.jsx';
import { Produttori, Produttore, Ordini, MioProduttore, GestioneProduttori } from './produttori.jsx';
import { Accesso, Privacy, invitoSalvato } from './accesso.jsx';
import { useMicrofono, Parla } from './voce.jsx';

// l'indirizzo si legge già all'avvio: link d'invito e #giro/fatta si sistemano prima di disegnare (niente pagina bianca)
function leggiHash() {
  const h = location.hash.slice(1);
  const invito = h.match(/^invito\/([A-Za-z0-9_-]+)/);
  if (invito) {
    mem.scrivi('invito', invito[1]);
    try { history.replaceState(null, '', `${location.pathname}#lista`); } catch { /* niente */ }
    return 'lista';
  }
  if (h === 'giro/fatta') {
    try { history.replaceState(null, '', `${location.pathname}#spese`); } catch { /* niente */ }
    return 'spese';
  }
  return h || 'lista';
}
function useHash() {
  const [h, setH] = useState(leggiHash);
  useEffect(() => { const f = () => { setH(leggiHash()); suCima(); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h;
}

export default function App() {
  const pagina = useHash();
  const stato = useDati('/api/stato');
  const [versione, setVersione] = useState(0);
  const [avviso, setAvviso] = useState('');
  const [parla, setParla] = useState(false);
  const [proposte, setProposte] = useState([]);
  const [attesa, setAttesa] = useState(false);
  const [inBenvenuto, setInBenvenuto] = useState(false);
  useEffect(() => { const f = () => stato.ricarica(); addEventListener('accesso', f); return () => removeEventListener('accesso', f); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // quando si torna sull'app (da un'altra app o dal telefono bloccato) lo stato si rilegge
  useEffect(() => { const f = () => { if (document.visibilityState === 'visible') stato.ricarica(); }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // il server ha una versione nuova: si ricarica la pagina una volta sola per quella versione
  useEffect(() => {
    const nuova = stato.dati?.versione;
    if (!nuova || nuova === __VERSIONE__) return undefined;
    let gia = '';
    try { gia = sessionStorage.getItem('ricaricata-per') || ''; } catch { /* niente */ }
    if (gia !== nuova) { try { sessionStorage.setItem('ricaricata-per', nuova); } catch { /* niente */ } location.reload(); }
  }, [stato.dati?.versione]);
  useEffect(() => {
    if (!stato.dati?.utente) return undefined;
    const segnala = () => { if (mem.leggi('installata-segnalata', false)) return; mem.scrivi('installata-segnalata', true); api('/api/uso', { metodo: 'POST', corpo: { installata: true } }).catch(() => mem.scrivi('installata-segnalata', false)); };
    if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) segnala();
    addEventListener('appinstalled', segnala); return () => removeEventListener('appinstalled', segnala);
  }, [stato.dati?.utente]); // eslint-disable-line react-hooks/exhaustive-deps
  // iPhone, in Safari: un gettone usa-e-getta finisce nell'icona, così l'app nella schermata Home entra da sola
  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installata = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (stato.dati?.utente && ios && !installata) {
      api('/api/accesso/ponte/nuovo', { metodo: 'POST', corpo: { vecchio: mem.leggi('ponte', '') } }).then((r) => {
        if (!r?.ponte) return;
        mem.scrivi('ponte', r.ponte);
        const m = document.querySelector('link[rel="manifest"]');
        if (m) m.href = `/manifest-app.webmanifest?v=3&ponte=${r.ponte}`;
      }).catch(() => {});
    }
  }, [!!stato.dati?.utente, stato.dati?.utente?.nome]); // eslint-disable-line react-hooks/exhaustive-deps
  const daAccogliere = !!(stato.dati?.famiglia && (!stato.dati.famiglia.casa || !stato.dati.famiglia.supermercati)) && !mem.leggi('benvenuto-saltato', false);
  useEffect(() => { if (daAccogliere) setInBenvenuto(true); }, [daAccogliere]);
  useEffect(() => { if (!avviso) return undefined; const t = setTimeout(() => setAvviso(''), 5000); return () => clearTimeout(t); }, [avviso]);

  const capito = useCallback(async (testo) => {
    setAttesa(true);
    try {
      const r = await api('/api/lista/voce', { metodo: 'POST', corpo: { testo } });
      setProposte((prima) => {
        const nuove = r.capito.filter((c) => !prima.some((p) => (c.voce_id ? p.voce_id === c.voce_id : p.nome.toLowerCase() === c.nome.toLowerCase())));
        return [...prima, ...nuove];
      });
      if (!r.capito.length) mic.setErrore(`Ho sentito «${testo}» ma non ho trovato cose da comprare. Riprova dicendo, per esempio: «il latte e due chili di patate».`);
    } catch (e) { mic.setErrore(e.message); } finally { setAttesa(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const mic = useMicrofono(capito);
  const apriParla = () => { setProposte([]); setParla(true); mic.avvia(); };
  const conferma = async (righe) => {
    await api('/api/lista/voce/conferma', { metodo: 'POST', corpo: { righe } });
    setAvviso(`Messo in lista: ${righe.map((r) => r.nome).join(', ')}.`);
    setProposte([]); setParla(false); setVersione((v) => v + 1);
    location.hash = '#lista';
    await vaiAScegliere();
  };

  const s = stato.dati;
  const [base, sotto, terzo] = pagina.split('/');
  if (base === 'privacy') return <Privacy titolare={s?.titolare} />;
  if (s && !s.utente) return <Accesso titolare={s.titolare} onFatto={() => { stato.ricarica(); location.hash = '#lista'; }} />;
  // prima apertura: casa e supermercati, poi la lista (resta aperta finché non si tocca «Ho scelto» o «Più tardi»)
  const benvenuto = inBenvenuto && ['lista', ''].includes(base);
  const sezione = ['giro'].includes(base) ? 'giro' : base === 'offerte' ? 'offerte' : ['altro', 'rileva', 'nuovo-prodotto', 'prezzi', 'prodotto', 'famiglia', 'supermercati', 'produttori', 'produttore', 'ordini', 'spese', 'volantino', 'installa', 'preferiti'].includes(base) ? 'altro' : 'lista';
  return (<>
    {/* 0.84 (Nazario, 07/11): niente striscia in alto con logo e nome: più spazio per la lista */}
    <main id="contenuto">
      {avviso && <div className="ok" role="status">{avviso}</div>}
      {stato.errore && <div className="errore">{stato.errore}</div>}
      {!s ? <p className="muto">Carico…</p> : benvenuto ? <Benvenuto stato={s} ricaricaStato={stato.ricarica} onFine={() => setInBenvenuto(false)} /> : (
        base === 'giro' ? <Giro annuncio={s.annuncio} tutto={sotto === 'fatta'} /> :
        base === 'rileva' ? <><Torna a="#altro" t="Altro" /><Rileva stato={s} /></> :
        base === 'nuovo-prodotto' ? <><Torna a="#altro" t="Altro" /><NuovoProdotto /></> :
        base === 'prodotto' ? <Scheda key={pagina} id={sotto} chiedi={terzo} /> :
        base === 'prezzi' ? <><Torna a={sotto ? '#prezzi' : '#altro'} t={sotto ? 'Prezzi' : 'Altro'} /><Prezzi stato={s} id={sotto} /></> :
        base === 'altro' ? <Altro stato={s} ricaricaStato={stato.ricarica} sezione={sotto} /> :
        base === 'famiglia' ? <><Torna a="#altro" t="Altro" /><Famiglia stato={s} ricaricaStato={stato.ricarica} /></> :
        base === 'scegli' ? <Scegli id={sotto} onCambiata={() => setVersione((v) => v + 1)} /> :
        base === 'supermercati' ? <><Torna a="#altro" t="Altro" /><MieiSupermercati stato={s} /></> :
        base === 'produttori' ? <><Torna a="#altro" t="Altro" /><Produttori /></> :
        base === 'produttore' ? (sotto === 'mio' ? <><Torna a="#altro" t="Altro" /><MioProduttore /></> : <Produttore id={sotto} />) :
        base === 'ordini' ? <Ordini /> :
        base === 'volantino' ? <><Torna a="#altro" t="Altro" /><MandaVolantino admin={!!s.utente?.admin} /></> :
        base === 'come' ? <ComeFunziona /> :
        base === 'come-scegliamo' ? <ComeScegliamo /> :
        base === 'preferiti' ? <><Torna a="#altro" t="Altro" /><MieiPreferiti /></> :
        base === 'offerte' ? <Offerte stato={s} /> :
        base === 'installa' ? <><Torna a="#altro" t="Altro" /><InstallaApp sempre /></> :
        base === 'spese' ? (sotto ? <Spesa id={sotto} /> : <><Torna a="#altro" t="Altro" /><Spese /></>) :
        <Lista stato={s} versione={versione} onParla={apriParla} />
      )}
    </main>
    <nav className="dock" aria-label="Sezioni">
      <a href="#lista" aria-current={sezione === 'lista' ? 'page' : undefined}><Icona n="lista" />La lista</a>
      <a href="#giro" aria-current={sezione === 'giro' ? 'page' : undefined}><Icona n="negozio" />Il giro</a>
      <a href="#offerte" aria-current={sezione === 'offerte' ? 'page' : undefined}><Icona n="offerta" />Offerte{s?.offerte > 0 && <span className="conta" aria-label={`${s.offerte} offerte`}>{s.offerte > 99 ? '99+' : s.offerte}</span>}</a>
      <a href="#altro" aria-current={sezione === 'altro' ? 'page' : undefined}><Icona n="altro" />Altro</a>
    </nav>
    {parla && <Parla mic={mic} proposte={proposte} setProposte={setProposte} attesa={attesa} onTesto={capito} onChiudi={() => { setParla(false); setProposte([]); }} onFatto={conferma} />}
  </>);
}
function Torna({ a, t = 'Indietro' }) {
  return <a className="torna" href={a || '#'} onClick={(e) => { if (!a) { e.preventDefault(); history.back(); } }}><Icona n="indietro" d={22} />{t}</a>;
}

// ---------- la lista ----------
// dopo aver aggiunto: si va a scegliere la prima cosa ancora senza scelta
// 0.80: dopo aver aggiunto si va alla scelta della cosa APPENA aggiunta (prima andava alla prima della lista ancora da scegliere:
// scrivevi «petto di pollo» e ti trovavi la zucca messa ieri). Con «libera» la cosa è già generica e si chiede il supermercato.
export async function vaiAScegliere(prima = null, libera = false) {
  const l = await api('/api/lista');
  const da = (prima ? l.filter((x) => !prima.has(x.id)) : l).find((x) => !x.preso && !x.scelto);
  if (da && libera) await api(`/api/lista/${da.id}/scegli`, { metodo: 'POST', corpo: { libera: true } });
  if (da) location.hash = `#scegli/${da.id}`;
  l.aperta = da?.id || null;
  return l;
}
function Lista({ stato, versione, onParla }) {
  const lista = useDati('/api/lista');
  const [err, setErr] = useState(''); const [inModulo, setInModulo] = useState(false); // il modulo «nuovo prodotto» occupa la pagina da solo
  useEffect(() => { if (versione) lista.ricarica(); }, [versione]); // eslint-disable-line react-hooks/exhaustive-deps
  const fai = async (p) => { setErr(''); try { lista.setDati(await p); } catch (e) { setErr(e.message); } };
  const [avvisoLista, setAvvisoLista] = useState('');
  useEffect(() => { if (!avvisoLista) return undefined; const t = setTimeout(() => setAvvisoLista(''), 3500); return () => clearTimeout(t); }, [avvisoLista]);
  useEffect(() => { const f = () => lista.ricarica(); addEventListener('lista-cambiata', f); return () => removeEventListener('lista-cambiata', f); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // spunta: il segno compare subito, il server si aggiorna dopo (se non riesce, si torna indietro)
  const [appenaPreso, setAppenaPreso] = useState(null);
  useEffect(() => { if (!appenaPreso) return undefined; const t = setTimeout(() => setAppenaPreso(null), 7000); return () => clearTimeout(t); }, [appenaPreso]);
  const spunta = async (r) => {
    const nuovo = r.preso ? 0 : 1; setAppenaPreso(nuovo ? r : null);
    lista.setDati((l) => l.map((x) => (x.id === r.id ? { ...x, preso: nuovo } : x)));
    try { await api(`/api/lista/${r.id}?breve=1`, { metodo: 'PUT', corpo: { preso: !!nuovo } }); } catch (e) { setErr(e.message); lista.ricarica(); }
  };
  // cestino: la riga sparisce subito; per 7 secondi «Annulla» la rimette
  const [tolto, setTolto] = useState(null);
  useEffect(() => { if (!tolto) return undefined; const t = setTimeout(() => setTolto(null), 7000); return () => clearTimeout(t); }, [tolto]);
  const togli = async (r) => {
    setErr(''); lista.setDati((l) => l.filter((x) => x.id !== r.id));
    try { lista.setDati(await api(`/api/lista/${r.id}`, { metodo: 'DELETE' })); } catch (e) { setErr(e.message); lista.ricarica(); }
  };
  const rimetti = () => {
    const r = tolto; setTolto(null);
    fai(api('/api/lista', { metodo: 'POST', corpo: { voce_id: r.voce_id, prodotto_id: r.prodotto_id, quantita: r.quantita, qualita: r.qualita, marca: r.marca, scelto: !!r.scelto } }));
  };
  // chiude la spesa: le cose prese vanno nello storico (con la pagella) e spariscono dalla lista
  const chiudi = async () => { setErr(''); try { const sp = await api('/api/spese', { metodo: 'POST', corpo: {} }); location.hash = sp.ids?.length === 1 ? `#spese/${sp.ids[0]}` : '#spese'; } catch (e) { setErr(e.message); } };
  const tutte = lista.dati || [];
  const da = tutte.filter((r) => !r.preso); const presi = tutte.filter((r) => r.preso);
  const daScegliere = da.filter((r) => !r.scelto);
  // 0.79 (Nazario, 06/11): le cose che hanno già il loro supermercato vanno nelle pagine del giro; qui restano quelle da sistemare
  const calc = useDati('/api/calcolo'); const [tutta, setTutta] = useState(false);
  useEffect(() => { if (lista.dati) calc.ricarica(); }, [lista.dati]); // eslint-disable-line react-hooks/exhaustive-deps
  const dove = new Map(); const pagineGiro = [];
  if (calc.dati) {
    const segna = (id, chiave, nome) => { dove.set(id, chiave); let g = pagineGiro.find((x) => x.chiave === chiave); if (!g) { g = { chiave, nome, n: 0 }; pagineGiro.push(g); } g.n++; };
    for (const n of calc.dati.soluzioni?.[0]?.negozi || []) for (const x of n.righe) segna(x.riga.id, `c${n.catena_id}`, n.catena);
    for (const g of calc.dati.negoziLiberi || []) for (const l of g.liberi) segna(l.riga.id, `c${g.catena_id}`, g.catena);
    for (const l of calc.dati.ovunque || []) segna(l.riga.id, 'ovunque', 'Dove capita');
  }
  const nelGiro = (r) => r.scelto && dove.has(r.id);
  const qui = tutta ? da : da.filter((r) => !nelGiro(r));
  const apriGiro = (chiave) => { mem.scrivi('giro-pagina', chiave); location.hash = '#giro'; };
  const svuota = <button type="button" className="b rosso svuota" onClick={() => { if (confirm('Vuoi svuotare tutta la lista? Le cose già prese e quelle da prendere spariscono.')) fai(api('/api/lista', { metodo: 'DELETE' })); }}>Svuota la lista</button>;
  return (<>
    <div className="intesta">
      <h1>La tua lista</h1>
      {lista.dati && <p>{!tutte.length ? 'È vuota: scrivi qui sotto cosa ti serve.' : da.length ? (da.length === 1 ? '1 cosa da prendere' : `${da.length} cose da prendere`) : presi.length ? 'Hai preso tutto.' : ''}{daScegliere.length ? `, ${daScegliere.length} da scegliere` : ''}</p>}
    </div>
    <InvitoInSospeso onFatto={() => lista.ricarica()} />
    <Avvisi versione={versione} />
    <Ricerca onAggiungi={(p) => fai(p)} onAvviso={setAvvisoLista} onModulo={setInModulo} inMezzo={<>
      <button type="button" className="parla-riga" onClick={onParla}>
        <span className="microfono medio" aria-hidden="true"><Icona n="microfono" d={34} /></span>
        <span><b>Oppure parla</b><span>Tocca e di' cosa ti serve: «il latte e due chili di patate»</span></span>
      </button>
      {stato.offerte > 0 && <a className="parla-riga offerte-riga" href="#offerte">
        <span className="tondo-offerte" aria-hidden="true"><Icona n="offerta" d={32} /></span>
        <span><b>Oppure parti dalle offerte</b><span>{stato.offerte === 1 ? '1 prodotto in offerta oggi' : `${stato.offerte} prodotti in offerta oggi`} nei tuoi supermercati, reparto per reparto</span></span>
      </a>}
      <a className="come-link" href="#come"><Icona n="aiuto" d={26} /> Come funziona l'app</a>
    </>} />
    {!inModulo && <>
    {avvisoLista && <div className="ok" role="status">{avvisoLista}</div>}
    {appenaPreso && <div className="tolto" role="status"><span>Comprato: <b>{appenaPreso.voce}</b></span><button type="button" className="b piccolo" onClick={() => { const r = appenaPreso; setAppenaPreso(null); spunta({ ...r, preso: 1 }); }}>Annulla</button></div>}
    {tolto && <div className="tolto" role="status"><span>Tolto dalla lista: <b>{tolto.prodotto_id && tolto.scelto ? tolto.prodotto_scelto : tolto.voce}</b></span><button type="button" className="b piccolo" onClick={rimetti}>Annulla</button></div>}
    {err && <div className="errore">{err}</div>}
    {lista.dati && !tutte.length && <InstallaApp />}
    {pagineGiro.length > 0 && <section className="gia-nei-super">
      <b>Già nei supermercati</b>
      <div className="gia-tasti">{pagineGiro.map((g) => <button key={g.chiave} type="button" onClick={() => apriGiro(g.chiave)}>{g.nome}<span className="conta">{g.n}</span></button>)}</div>
      <button type="button" className="link" onClick={() => setTutta(!tutta)}>{tutta ? 'Mostra solo quelle da sistemare' : 'Mostra qui tutta la lista'}</button>
    </section>}
    {da.length > 0 && !qui.length && !tutta && <p className="muto">Ogni cosa ha già il suo supermercato: le trovi nelle pagine del giro.</p>}
    {qui.length > 0 && <ul className="foglio" aria-label="La lista della spesa">
      {qui.map((r) => <RigaLista key={r.id} r={r} fai={fai} spunta={spunta} togli={togli} />)}
    </ul>}
    {/* 0.84 (Nazario, 07/11): le cose comprate non restano qui: vanno in «Le mie spese», una spesa per supermercato e giorno */}
    {presi.length > 0 && <button type="button" className={`b${da.length ? '' : ' pieno grande'} gia-comprati`} onClick={chiudi}><Icona n="spunta" /> {presi.length === 1 ? 'Hai comprato 1 cosa' : `Hai comprato ${presi.length} cose`}: vedi «Le mie spese»</button>}
    {da.length > 0 && <div className="avvia">
      {daScegliere.length ? <p>Mancano {daScegliere.length === 1 ? '1 scelta' : `${daScegliere.length} scelte`}: tocca <b>Scegli</b> accanto a ogni cosa. Poi <b>Avvia giro spesa</b> ti dice in quali supermercati andare e cosa prendere in ognuno.</p>
        : <p>Hai scelto tutto. Tocca <b>Avvia giro spesa</b>: ti dico in quali supermercati andare, in che ordine e cosa prendere in ognuno.</p>}
      {daScegliere.length > 0 && <a className="b grande contorno viola" href={`#scegli/${daScegliere[0].id}`}>Scegli: {daScegliere[0].voce}</a>}
      {svuota}
      <a className="b pieno-verde grande" href="#giro"><Icona n="negozio" /> Avvia giro spesa</a>
    </div>}
    {tutte.length > 0 && !da.length && svuota}
    <InvitaRiga />
    {(stato.annunci || []).map((a) => <Annuncio key={a.id} a={a} />)}
    </>}
  </>);
}

function RigaLista({ r, fai, spunta, togli }) {
  const cambia = (corpo) => fai(api(`/api/lista/${r.id}`, { metodo: 'PUT', corpo }));
  const tipo = [nomeQualita(r.qualita).toLowerCase(), r.marca === 'marca' ? 'di marca' : r.marca === 'supermercato' ? 'marchio del supermercato' : r.marca.startsWith('brand:') ? r.marca.slice(6) : ''].filter(Boolean).join(', ');
  // prodotto scelto: in grassetto il prodotto (dice già il formato) con la bolla del supermercato; sotto solo prezzo e confezioni
  const conProdotto = !!(r.prodotto_id && r.prodotto_scelto && (r.scelto || r.preso));
  const nome = conProdotto ? r.prodotto_scelto : r.voce;
  const sup = r.super;
  let sotto;
  if (r.preso) sotto = 'preso';
  else if (conProdotto) sotto = [sup?.confezioni > 1 ? `${sup.confezioni} confezioni` : r.prodotto_quantita > 0 ? '' : quanto(r.quantita, r.unita, false, r.pezzo), sup?.prezzo != null && sup?.confezioni > 1 ? `${euro(sup.prezzo)} in tutto` : ''].filter(Boolean).join(', ');
  else if (r.scelto && r.libera) sotto = `${quanto(r.quantita, r.unita, false, r.pezzo)}, lo scegli tu al supermercato${r.dove_libera === 'dove capita' ? ', dove capita' : r.dove_libera ? ` da ${r.dove_libera}` : ': tocca per dire in quale'}`;
  else if (r.scelto) sotto = `decido io: il più conveniente${tipo ? ` (${tipo})` : ''}`;
  else sotto = `${quanto(r.quantita, r.unita, false, r.pezzo)}${tipo ? `, ${tipo}` : ''}`;
  const testa = <span className="voce-nome"><b>{nome}</b>{!r.preso && r.scelto && r.libera ? <span className="pill bolla-libera">Scegli al supermercato</span> : null}{conProdotto ? <Semaforo q={r.voto_prodotto} piccolo sempre /> : null}{conProdotto && sup?.catena ? <span className="pill super-lista">{sup.catena}</span> : null}{conProdotto && sup?.scelto_qui && sup.offerta ? <span className="pill offerta">offerta</span> : null}</span>;
  // un'offerta che conviene altrove; se non c'è, un prodotto migliore allo stesso prezzo (mai tutti e due)
  const altrove = r.preso ? null : r.altrove;
  const migliore = !r.preso && !altrove ? r.migliore : null;
  const prendiMigliore = () => fai(api(`/api/lista/${r.id}/scegli`, { metodo: 'POST', corpo: { prodotto_id: migliore.prodotto_id, da_suggerimento: true, ...(migliore.mio ? {} : { catena_id: migliore.catena_id }) } }).then((x) => x.lista));
  const tornaPrima = () => fai(api(`/api/lista/${r.id}/scegli`, { metodo: 'POST', corpo: { prodotto_id: sup.prima.id, migliore_nascosto: true } }).then((x) => x.lista));
  const alUnita = r.unita === 'kg' ? 'al kg' : r.unita === 'l' ? 'al litro' : `al ${r.pezzo || 'pezzo'}`;
  return <li className={`voce${r.preso ? ' presa' : ''}${!r.preso && !r.scelto ? ' da-scegliere' : ''}`}>
    <div className="voce-riga">
      <button type="button" className="spunta" role="checkbox" aria-checked={!!r.preso} aria-label={`${nome}: ${r.preso ? 'preso' : 'da prendere'}`} onClick={() => (spunta ? spunta(r) : cambia({ preso: !r.preso }))}>{r.preso ? <Icona n="spunta" d={28} /> : null}</button>
      {conProdotto && r.foto ? <img className="voce-foto" src={r.foto} alt="" loading="lazy" /> : null}
      {r.preso ? <div className="voce-testo">{testa}<span>{sotto}</span></div>
        : <a className="voce-testo" href={`#scegli/${r.id}`}>{testa}{sotto ? <span>{sotto}</span> : null}{r.scelto ? <span className="cambia-qui">Cambia</span> : null}</a>}
      {!r.preso && !r.scelto && <a className="b pieno piccolo scegli" href={`#scegli/${r.id}`}>Scegli</a>}
      {conProdotto && sup?.uno != null && <span className="cartellino-col voce-prezzo"><Cartellino n={sup.uno} /><small>{r.prodotto_quantita > 0 ? 'la confezione' : alUnita}</small></span>}
      <Cestino nome={nome} onSi={() => togli(r)} />
    </div>
    {altrove && <div className="altrove-riga">
      <p><span className="pill offerta">Offerta</span> da <b>{altrove.catena}</b> a <b>{euro(altrove.prezzo)}</b>{altrove.confezioni > 1 ? ` (${altrove.confezioni} confezioni)` : ''}: risparmi <b>{euro(altrove.risparmio)}</b>{altrove.valido_al ? `, fino al ${data(altrove.valido_al)}` : ''}</p>
      <div className="altrove-azioni">
        <button type="button" className="b pieno-verde piccolo" onClick={() => cambia({ catena_id: altrove.catena_id })}>Prendilo da {altrove.catena}</button>
        <button type="button" className="chiudi-offerta" aria-label="Non mi interessa: togli il suggerimento" onClick={() => cambia({ offerta_nascosta: true })}><Icona n="chiudi" d={22} /></button>
      </div>
    </div>}
    {migliore && <div className="altrove-riga migliore">
      {migliore.foto ? <img className="migliore-foto" src={migliore.foto} alt="" loading="lazy" /> : null}
      <p><span className="pill migliore">Migliore</span> <b>{migliore.nome}</b> da <b>{migliore.catena}</b>: {migliore.perche.join(', ')}. {migliore.uguale ? 'Stesso prezzo' : 'Costa anche meno'}: {euro(migliore.unitario)} {alUnita}{migliore.uguale ? '' : ` invece di ${euro(migliore.unitario_ora)}`}{migliore.prezzo == null ? '' : ` (${migliore.confezioni > 1 ? `${migliore.confezioni} confezioni, ` : ''}${euro(migliore.prezzo)})`}.</p>
      <div className="altrove-azioni">
        <button type="button" className="b pieno-verde piccolo" onClick={prendiMigliore}>Prendi questo</button>
        <button type="button" className="chiudi-offerta" aria-label="Non mi interessa: togli il suggerimento" onClick={() => cambia({ migliore_nascosto: true })}><Icona n="chiudi" d={22} /></button>
      </div>
    </div>}
    {!r.preso && !!r.libera && r.offerta_voce && <div className="altrove-riga offerta-voce">
      <span className="pill offerta">Offerta</span> <span><a href={`#prodotto/${r.offerta_voce.prodotto_id}`}>{r.offerta_voce.nome}</a> da <b>{r.offerta_voce.catena}</b> a <b>{euro(r.offerta_voce.prezzo)}</b>{r.offerta_voce.valido_al ? ` fino al ${data(r.offerta_voce.valido_al)}` : ''}</span>
    </div>}
    {!r.preso && sup?.scelto_qui && <div className="altrove-riga scelto">
      <p>Lo prendi da <b>{sup.catena}</b>{sup.offerta ? ' in offerta' : ''}: il giro passa anche da lì.</p>
      {sup.prima ? <button type="button" className="b piccolo" onClick={tornaPrima}>Torna a «{sup.prima.nome}»</button>
        : <button type="button" className="b piccolo" onClick={() => cambia({ catena_id: null, offerta_nascosta: true })}>{sup.torna ? `Torna a ${sup.torna}` : 'Annulla'}</button>}
    </div>}
  </li>;
}

// ---------- cerca e aggiungi ----------
const OPZIONI = [['scelta', 'Miglior scelta'], ['migliore', 'Il migliore'], ['economico', 'Più economico'], ['italiano', 'Italiano più economico'], ['bio', 'Bio più economico'], ['preferito', 'Il mio preferito']];
const QUALITA_DI = { economico: 'qualsiasi', italiano: 'italiano', bio: 'bio' };
// Mette in lista partendo dal testo (come la voce): quantità sensata e voce nuova se serve
// esatto (0.95): scritto a mano o toccato «Metti in lista «riso»»: vale solo la voce con quel nome, altrimenti ne nasce una generica
async function perTesto(testo, extra = {}, esatto = false) {
  const r = await api('/api/lista/voce', { metodo: 'POST', corpo: { testo, esatto } });
  if (!r.capito.length) throw new Error(`Non ho capito cosa mettere in lista con «${testo}»`);
  const l = await api('/api/lista/voce/conferma', { metodo: 'POST', corpo: { righe: r.capito.map((c) => ({ ...c, ...extra })) } });
  l.capito = r.capito.map((c) => c.nome); // 0.81: per dire «era già in lista» se non nasce una riga nuova
  return l;
}
const DISTINTIVI = { scelta: 'Miglior rapporto qualità/prezzo', economico: 'Il più conveniente', qualita: 'Qualità più alta' };
// il formato scritto per esteso: «6 × 1,5 litri (9 litri)», «sfuso, a peso»
function formatoDi(f) {
  if (!f) return null;
  if (f.sfuso) return `sfuso, a ${f.unita === 'kg' ? 'peso' : f.pezzo || 'pezzo'}`;
  if (f.pezzi > 1 && f.unita !== 'pz') return `${f.pezzi} × ${quanto(f.quantita / f.pezzi, f.unita)} (${quanto(f.quantita, f.unita)})`;
  return quanto(f.quantita, f.unita, false, f.pezzo);
}
// un prodotto tra i suggerimenti: formato, prezzo della confezione e al kg/l, qualità, perché è consigliato
function RigaSuggerita({ x, attesa, prendi }) {
  const g = giudizioDi(x.qualita); const formato = formatoDi(x.formato);
  const alUnita = x.unita === 'kg' ? 'al kg' : x.unita === 'l' ? 'al litro' : `al ${x.pezzo || 'pezzo'}`;
  return <>
    <button type="button" className="sug-riga" disabled={attesa} onClick={() => prendi(x)} aria-label={`Metti in lista ${x.nome}`}>
      {x.foto ? <img src={x.foto} alt="" loading="lazy" /> : <span className="segno" aria-hidden="true"><Icona n="negozio" d={24} /></span>}
      <span className="testo">
        {x.consigliato && <span className="sug-consigliato"><span className="bolla-consigliato">✓ Scelta saggia</span><span className="perche-consigliato">{x.consigliato}</span></span>}
        <b>{x.nome}</b>
        <span className="sug-formato">{formato ? <span className="formato-chiaro">{formato}</span> : <span className="formato-manca">formato non indicato</span>}{x.bio ? <span className="pill bio">Bio</span> : null}{x.italiano ? <span className="pill ita">Italiano</span> : null}{x.tipo === 'solito' ? <span className="pill solito">Lo compri di solito</span> : null}</span>
        {x.prezzo == null ? <span className="muto">ancora senza prezzo</span> : <span className="sug-prezzi">
          <span className="sug-lato"><Cartellino n={x.prezzo} /><small>{x.formato?.sfuso ? alUnita : 'la confezione'}</small></span>
          <span className="sug-unitario">{x.unitario == null ? <span className="muto">prezzo al {x.unita === 'l' ? 'litro' : x.unita === 'kg' ? 'kg' : 'pezzo'}: manca il formato</span> : <><b>{euro(x.unitario)}</b> {alUnita}</>}</span>
          {(x.catena || x.offerta) && <span className="sug-confezione">{x.catena ? <span className="pill super-lista">{x.catena}</span> : null}{x.offerta ? <span className="pill offerta">offerta</span> : null}</span>}
        </span>}
        <span className={`sug-qualita ${g ? g.colore : 'ignoto'}`}><span className="luce" aria-hidden="true" />{g ? <><b>{x.qualita}/100</b> {g.parola}</> : 'Qualità da scoprire'}</span>
        {x.distintivi?.length ? <span className="sug-distintivi">{x.distintivi.map((d) => <span key={d} className={`distintivo ${d}`}>{DISTINTIVI[d]}{d === 'economico' ? ` ${alUnita}` : ''}</span>)}</span> : null}
        {x.altrove && <span className="altrove-offerta"><span className="pill offerta">Offerta</span> da <b>{x.altrove.catena}</b> a <b>{euro(x.altrove.prezzo)}</b>: risparmi {euro(x.altrove.risparmio)}{x.altrove.valido_al ? ` (fino al ${data(x.altrove.valido_al)})` : ''}</span>}
      </span>
      <span className="piu" aria-hidden="true">+</span>
    </button>
    <a className="sug-scheda" href={`#prodotto/${x.prodotto_id}`}>{!formato || !g ? 'Completa la scheda' : 'Apri la scheda'}</a>
  </>;
}
function Ricerca({ onAggiungi, onAvviso, onModulo, inMezzo = null }) {
  const [q, setQ] = useState(''); const [sug, setSug] = useState(null); const [err, setErr] = useState(''); const [attesa, setAttesa] = useState(false);
  const [scansione, setScansione] = useState(null); const [manoCodice, setManoCodice] = useState(false); const [codiceMano, setCodiceMano] = useState('');
  const [quanti, setQuanti] = useState(null); // prodotto toccato: prima si chiede quanto ne serve
  useEffect(() => { onModulo?.(!!scansione); }, [scansione]); // eslint-disable-line react-hooks/exhaustive-deps
  const voci = useDati(scansione ? '/api/voci' : null);
  // mentre scrivi: l'elenco si restringe parola dopo parola (prima quello che compri di solito)
  useEffect(() => {
    const t = q.trim(); if (t.length < 2) { setSug(null); return undefined; }
    let vivo = true; const h = setTimeout(() => api(`/api/suggerisci?q=${encodeURIComponent(t)}`).then((r) => { if (vivo) setSug(r); }).catch(() => {}), 150);
    return () => { vivo = false; clearTimeout(h); };
  }, [q]);
  const pulisci = () => { setQ(''); setSug(null); };
  // 0.79: mentre scrivi la casella resta in vista (con la lista lunga e la tastiera aperta finiva fuori dallo schermo)
  const casella = useRef(null);
  useEffect(() => { if (q.length === 1) casella.current?.scrollIntoView({ block: 'start' }); }, [q.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  // si guarda cosa c'era in lista PRIMA di aggiungere, così poi si apre la scelta della cosa nuova
  const fatto = async (aggiungi, libera = false) => {
    setErr('');
    try {
      const prima = new Set((await api('/api/lista')).map((x) => x.id)); const p = aggiungi(); await onAggiungi(p); const nuova = await p; pulisci();
      const l = await vaiAScegliere(prima, libera);
      if (!l.aperta) onAvviso?.(`«${(nuova.capito || []).join(', ')}» era già nella tua lista: ho aggiornato quella riga.`);
    }
    catch (e) { setErr(e.message); }
  };
  const prendi = async (x) => {
    setErr(''); setAttesa(true);
    try {
      if (x.tipo === 'voce') { await fatto(() => perTesto(x.nome), true); return; }
      if (x.tipo === 'catalogo') await onAggiungi(api(`/api/catalogo/${x.ean}/usa`, { metodo: 'POST', corpo: { lista: true } }).then(() => api('/api/lista')));
      else if (x.prodotto_id && !x.quantitaScelta) { setQuanti(x); return; }
      else await onAggiungi(api('/api/lista', { metodo: 'POST', corpo: { voce_id: x.voce_id, prodotto_id: x.prodotto_id, quantita: x.quantitaScelta ?? x.quantita, scelto: true } }));
      setQuanti(null); onAvviso?.(`Messo in lista: ${x.nome}`); pulisci();
    } catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  const scansionato = async (ean) => {
    setErr('');
    try { const r = await api(`/api/scansiona/${encodeURIComponent(ean)}`); if (r.prodotto_id) location.hash = r.nuovo ? `#prodotto/${r.prodotto_id}/nuovo` : `#prodotto/${r.prodotto_id}/manca`; /* 0.87: già conosciuto → solo quello che manca */ else setScansione(r); } catch (e) { setErr(e.message); }
  };
  // salvato: alla scheda; il prezzo si chiede ancora solo se non l'ha scritto nel modulo
  // 0.82: prodotto che non conosce nessuno → percorso veloce (due foto, prezzo, salva); se forse c'è già → il modulo con «È questo?»
  if (scansione && !scansione.proposta) return <NuovoVeloce ean={scansione.ean} avviso={scansione.avviso} onFatto={(p, info) => { setScansione(null); location.hash = info?.manca ? `#prodotto/${p.id}/manca` : info?.conPrezzo ? `#prodotto/${p.id}` : `#prodotto/${p.id}/prezzo`; }} onAnnulla={() => setScansione(null)} />;
  if (scansione) return <NuovoDaCodice s={scansione} voci={voci} onFatto={(p, info) => { setScansione(null); location.hash = info?.conPrezzo ? `#prodotto/${p.id}` : `#prodotto/${p.id}/prezzo`; }} onAnnulla={() => setScansione(null)} />;
  const esatta = sug?.some((x) => x.tipo === 'voce' && x.nome.toLowerCase() === q.trim().toLowerCase());
  // 0.95 (Nazario, 10/11): «riso» trovava solo «Risotto» e «Riso nerone», e «Metti in lista «riso»» spariva. Ora c'è sempre
  // (se non esiste già una voce con quel nome) e sta in cima quando le voci trovate non cominciano con la parola scritta
  const primaParola = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(Boolean)[0] || '';
  // in cima se una voce ha proprio quella parola ma dice di più («Riso nerone») o se nessuna comincia così; in fondo mentre
  // si sta ancora scrivendo («zucch» → «Zucchine»)
  const stessaParola = sug?.some((x) => x.tipo === 'voce' && primaParola(x.nome) === primaParola(q));
  const inizia = sug?.some((x) => x.tipo === 'voce' && primaParola(x.nome).startsWith(primaParola(q)));
  const copre = !stessaParola && inizia;
  const mettiGenerico = !esatta && q.trim().length >= 2 && <li className={copre ? '' : 'metti-prima'}><button type="button" className="metti" onClick={() => fatto(() => perTesto(q.trim(), {}, true))}><span className="testo"><span className="bolla-libera">Scegli al supermercato</span><b>Metti in lista «{q.trim()}»</b><span>{copre ? 'e scegli dopo quale prendere' : 'proprio questo, non quelli qui sotto: lo scegli al supermercato'}</span></span><span className="piu" aria-hidden="true">+</span></button></li>;
  return <div className="colonna">
    <form className="cerca" ref={casella} onSubmit={(e) => { e.preventDefault(); if (q.trim()) fatto(() => perTesto(q.trim(), {}, true)); }}>
      <label className="campo-cerca cerca-grande"><Icona n="cerca" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scrivi cosa ti serve: latte, pane…" aria-label="Scrivi cosa ti serve" autoComplete="off" enterKeyHint="search" />
        {q && <button type="button" className="cancella" aria-label="Cancella" onClick={pulisci}><Icona n="chiudi" d={22} /></button>}</label>
    </form>
    {q.trim().length >= 2 && <ul className="suggeriti" aria-label="Prodotti trovati">
      {sug && !copre && mettiGenerico}
      {(sug || []).map((x, n) => <li key={`${x.tipo}-${x.prodotto_id || x.voce_id || x.ean}-${n}`} className={x.prodotto_id ? 'sug-prodotto' : x.tipo === 'voce' ? 'sug-voce' : ''}>{x.prodotto_id ? <RigaSuggerita x={x} attesa={attesa} prendi={prendi} /> : <button type="button" disabled={attesa} onClick={() => prendi(x)}>
        {x.foto ? <img src={x.foto} alt="" loading="lazy" /> : <span className="segno" aria-hidden="true">{x.tipo === 'voce' ? <Icona n="lista" d={24} /> : <Icona n="negozio" d={24} />}</span>}
        {/* 0.72: la riga generica («Mandarini, qualsiasi») è sempre ben staccata, per chi non vuole scegliere il prodotto adesso */}
        <span className="testo">{x.tipo === 'voce' && <span className="bolla-libera">Scegli al supermercato</span>}<b>{x.nome}</b>
          <span>{x.tipo === 'voce' ? 'Qualsiasi: scegli dopo quale' : 'Dal catalogo, ancora senza prezzo'}</span></span>
        <span className="piu" aria-hidden="true">+</span>
      </button>}</li>)}
      {sug && !sug.length && <li className="muto nessuno">Nessun prodotto con queste parole: toglierne una aiuta.</li>}
      {sug?.some((x) => x.prodotto_id) && <li className="come-scegliamo"><a href="#come-scegliamo">Come ordiniamo i risultati e scegliamo la Scelta saggia</a></li>}
      {sug && copre && mettiGenerico}
    </ul>}
    {quanti && <QuantoServe x={quanti} attesa={attesa} onConferma={(n) => prendi({ ...quanti, quantitaScelta: n })} onAnnulla={() => setQuanti(null)} />}
    {err && <div className="errore">{err}</div>}
    {!q && inMezzo}
    {!q && <div className="azioni-due">
      <Scanner classe="b tasto-due tasto-codice" onCodice={scansionato} etichetta={<><Icona n="codice" d={34} /><b>Codice a barre</b><span>Fotografalo sul prodotto</span></>} />
      <FotoScontrino />
    </div>}
    {!q && <button type="button" className="link codice-link" onClick={() => setManoCodice(true)}>Il codice a barre non si legge? Scrivilo a mano</button>}
    {manoCodice && <form className="carta codice-mano" onSubmit={(e) => { e.preventDefault(); const c = codiceMano.replace(/\D/g, ''); if (c.length < 8 || c.length > 14) { setErr('Il codice a barre ha 8 o 13 cifre: controlla e riprova.'); return; } setManoCodice(false); setCodiceMano(''); scansionato(c); }}>
      <label className="campo">Scrivi le cifre sotto il codice a barre<input inputMode="numeric" autoComplete="off" value={codiceMano} onChange={(e) => setCodiceMano(e.target.value)} placeholder="Es. 8001234567890" autoFocus /></label>
      <div className="riga"><button className="b pieno" disabled={codiceMano.replace(/\D/g, '').length < 8}>Cerca il prodotto</button><button type="button" className="link" onClick={() => setManoCodice(false)}>Annulla</button></div>
    </form>}
  </div>;
}
function RisultatoVoce({ r, onVoce, onProdotto }) {
  // la stessa offerta può essere insieme la più economica, l'italiana e il preferito: una riga sola con più etichette
  const righe = [];
  for (const [k, t] of OPZIONI) {
    const o = r[k]; if (!o) continue;
    const g = righe.find((x) => x.o.prodotto.id === o.prodotto.id && x.o.catena === o.catena);
    if (g) g.chi.push([k, t]); else righe.push({ o, chi: [[k, t]] });
  }
  const unit = perUnita(r.voce.unita, r.voce.pezzo);
  const ov = r.offertaVicina;
  return <section className="risultato">
    <div className="ris-testa"><h3>{r.voce.nome}</h3><button type="button" className="b pieno" onClick={onVoce}>Metti in lista</button></div>
    {ov && <div className="offerta-vicina">
      <span className="pill offerta">In offerta</span>
      <p><b>{ov.prodotto.nome}</b> da <b>{ov.catena}</b>{ov.km != null ? ` a ${num(ov.km, 1)} km da casa` : ''}: <b>{euro(ov.unitario)}</b> al {unit}{ov.valido_al ? `, fino al ${data(ov.valido_al)}` : ''}{!ov.mia ? ' (non è tra i tuoi supermercati)' : ''}.</p>
      <button type="button" className="b pieno piccolo" onClick={() => onProdotto(r, ov, [['offerta', 'In offerta']])}>Prendi questo</button>
    </div>}
    {righe.length ? <ul className="offerte">{righe.map(({ o, chi }) => <li key={`${o.prodotto.id}-${o.catena}`}>
      <div className="off-testo">
        <span className="etichette">{chi.map(([k, t]) => <span key={k} className={`pill ${k === 'bio' ? 'bio' : k === 'italiano' ? 'ita' : k === 'preferito' ? 'offerta' : k === 'scelta' || k === 'migliore' ? 'forte' : ''}`}>{t}</span>)}</span>
        <a href={`#prodotto/${o.prodotto.id}`}>{o.prodotto.nome}</a>
        <span className="muto">{o.catena || 'nessun prezzo valido'}{o.offerta ? ', in offerta' : ''}</span>
        {o.qualita != null && <Semaforo q={o.qualita} piccolo />}
      </div>
      <div className="off-prezzo">{o.catena && <Cartellino n={o.unitario} per={unit} />}
        <button type="button" className="b piccolo" onClick={() => onProdotto(r, o, chi)}>Prendi questo</button></div>
    </li>)}</ul> : <p className="muto">Ancora nessun prezzo confrontabile{r.daCompletare?.length ? ` (${r.daCompletare.length} da completare nella scheda)` : ''}.</p>}
  </section>;
}

// ---------- dove conviene comprare ----------
function Giro({ annuncio, tutto = false }) {
  const c = useDati(tutto ? '/api/calcolo?tutto=1' : '/api/calcolo');
  // 0.72: si spunta anche qui (vale per la lista); quello che non trovi lo lasci e resta in lista per la prossima volta
  const [presi, setPresi] = useState(() => new Set()); const [nonCera, setNonCera] = useState(() => new Set(nonTrovatiOggi()));
  const [msg, setMsg] = useState('');
  const miei = useDati(tutto ? null : '/api/supermercati-giro');
  if (c.errore) return <div className="errore">{c.errore}</div>;
  if (!c.dati) return <p className="muto">Confronto i supermercati…</p>;
  const r = c.dati; const [prima, ...altre] = r.soluzioni;
  // 0.74: le cose generiche stanno nel supermercato che hai scelto tu; se lì non c'è altro da prendere, quel supermercato ha la sua lista
  const gl = r.negoziLiberi || [];
  const base = prima ? prima.negozi.map((n) => ({ ...n, liberi: gl.find((g) => g.catena_id === n.catena_id)?.liberi || [] })) : [];
  const carte = [...base, ...gl.filter((g) => !base.some((n) => n.catena_id === g.catena_id))];
  const scelte = (miei.dati || []).map((x) => ({ id: x.id, nome: x.nome }));
  const sposta = async (riga, cid) => {
    setMsg('');
    try { await api(`/api/lista/${riga.id}/dove`, { metodo: 'POST', corpo: { catena_libera: cid } }); await c.ricarica(); setMsg(cid === '' ? `«${riga.voce}» torna nel supermercato dove conviene.` : `«${riga.voce}» ${cid === 0 ? 'lo prendi dove capita' : `lo prendi da ${scelte.find((x) => x.id === cid)?.nome || 'lì'}`}${riga.libera ? ': me lo ricordo anche la prossima volta' : ''}.`); dispatchEvent(new Event('lista-cambiata')); }
    catch (e) { setMsg(e.message); }
  };
  // 0.84: si segna anche il supermercato dove l'hai preso (lo storico fa una spesa per supermercato e giorno)
  const spunta = async (riga, cid = null) => {
    const nuovo = !presi.has(riga.id); const p2 = new Set(presi); if (nuovo) p2.add(riga.id); else p2.delete(riga.id); setPresi(p2); setMsg('');
    try { await api(`/api/lista/${riga.id}?breve=1`, { metodo: 'PUT', corpo: { preso: nuovo, preso_da: cid || null } }); dispatchEvent(new Event('lista-cambiata')); } catch (e) { setMsg(e.message); }
  };
  const nonTrovato = (riga) => {
    const n2 = new Set(nonCera); if (n2.has(riga.id)) n2.delete(riga.id); else { n2.add(riga.id); setMsg(`«${riga.voce}» resta in lista: lo prendi la prossima volta.`); }
    setNonCera(n2); mem.scrivi('non-trovati', { giorno: oggiIso(), righe: [...n2] });
  };
  // 0.88 (Nazario, 07/11): cestino accanto al nome; si chiede solo «Eliminare? Sì / No», poi sparisce (nessun avviso che resta)
  const togli = async (riga) => {
    setMsg('');
    try { await api(`/api/lista/${riga.id}`, { metodo: 'DELETE' }); await c.ricarica(); dispatchEvent(new Event('lista-cambiata')); } catch (e) { setMsg(e.message); }
  };
  const propLib = { scelte, onSposta: sposta, presi, nonCera, onSpunta: spunta, onNonCera: nonTrovato, onTogli: togli };
  if (!tutto) {
    // 0.77 (Nazario, 06/11): una pagina per supermercato, si scorre col dito; in alto i nomi con quante cose restano
    const fuori = r.fuoriGiro || [];
    const senzaPrezzo = prima ? prima.mancanti.filter((m) => !fuori.some((f) => f.id === m.id)) : [];
    const restano = (l) => l.filter((x) => !presi.has(x.riga.id) && !nonCera.has(x.riga.id)).length;
    const pagine = [];
    if ((r.daScegliere || []).length) pagine.push({ chiave: 'scegli', titolo: 'Dove li prendi?', conta: r.daScegliere.length, el: <section className="soluzione negozio-giro-carta da-scegliere-dove"><h2>Dove li prendi?</h2><p className="muto">Le hai lasciate da scegliere al supermercato: dimmi in quale, così le trovi nella sua lista.</p>
      <ul className="acquisti da-spuntare">{r.daScegliere.map((l) => <RigaLibera key={l.riga.id} l={l} chiedi {...propLib} />)}</ul></section> });
    for (const n of carte) pagine.push({ chiave: `c${n.catena_id}`, titolo: n.catena, conta: restano([...n.righe, ...(n.liberi || [])]), el: <Negozio n={n} liberi={n.liberi} propLib={propLib} presi={presi} nonCera={nonCera} onSpunta={spunta} onNonCera={nonTrovato} /> });
    if ((r.ovunque || []).length) pagine.push({ chiave: 'ovunque', titolo: 'Dove capita', conta: restano(r.ovunque), el: <section className="soluzione negozio-giro-carta"><h2>Dove capita</h2><p className="muto">Le prendi nel primo supermercato dove passi.</p>
      <ul className="acquisti da-spuntare">{r.ovunque.map((l) => <RigaLibera key={l.riga.id} l={l} qui={0} {...propLib} />)}</ul></section> });
    const riepilogo = <div className="riepilogo-giro">
      {r.avvisi.map((a, i) => <div key={i} className="avviso">{a}</div>)}
      {senzaPrezzo.length > 0 && <div className="avviso">Senza un prezzo nei tuoi supermercati: {senzaPrezzo.map((m) => m.voce).join(', ')}.</div>}
      {fuori.length > 0 && <div className="fornitore-box"><b>Da comprare a parte, dal fornitore</b>{fuori.map((f) => <span key={f.id}>{f.voce}: {f.prodotto} da <b>{f.fornitore}</b>, {euro(f.prezzo)}</span>)}</div>}
      {prima && prima.negozi.length > 1 && <p className="totale-giro">In tutto, se prendi tutto: <Cartellino n={prima.spesa} /></p>}
      {prima && r.risparmio && (r.risparmio.unSolo || r.risparmio.altrove) && <Risparmio r={r} prima={prima} />}
      {r.giudizi && <Giudizi g={r.giudizi} />}
      {altre.length > 0 && <details className="altre"><summary>Altre possibilità ({altre.length})</summary>{altre.map((x, i) => <Soluzione key={i} s={x} />)}</details>}
      {r.singoli.length > 1 && <details className="altre"><summary>Tutto in un negozio solo</summary>
        <ul className="singoli">{r.singoli.map((x) => <li key={x.catena}><div><b>{x.catena}</b><span>{x.mancanti ? `${x.mancanti === 1 ? 'manca 1 cosa' : `mancano ${x.mancanti} cose`}` : 'c\'è tutto'}</span></div><Cartellino n={x.spesa} /></li>)}</ul></details>}
      {r.impostazioni && <p className="muto piccolo">Per dividere la spesa tra i supermercati conto anche la strada ({euro(r.impostazioni.euro_km)} al km): un negozio in più viene proposto solo se fa risparmiare almeno {euro(r.impostazioni.soglia_negozio)}.</p>}
    </div>;
    if (pagine.length) pagine.push({ chiave: 'riepilogo', titolo: 'Riepilogo', el: riepilogo });
    return (<>
      <a className="b tenue-marca torna-lista torna-su" href="#lista"><Icona n="indietro" d={22} /> Torna alla lista e aggiungi</a>
      <div className="intesta"><h1>Il giro della spesa</h1>{r.righe.length > 0 && <p>Scorri col dito da un supermercato all'altro. Tocca un prodotto per depennarlo.</p>}</div>
      {!r.righe.length && <div className="vuota"><p>La lista è vuota: prima scrivi o detta cosa ti serve.</p><a className="b pieno grande" href="#lista">Vai alla lista</a></div>}
      {msg && <div className="ok" role="status">{msg}</div>}
      {!pagine.length && r.avvisi.map((a, i) => <div key={i} className="avviso">{a}</div>)}
      {!r.soluzioni.length && r.righe.length > fuori.length + (r.liberi || []).length && <div className="avviso">Non ci sono ancora prezzi per le cose della tua lista.</div>}
      {pagine.length ? <PagineGiro pagine={pagine} /> : riepilogo}
      <a className="b torna-lista torna-giu" href="#lista"><Icona n="indietro" d={22} /> Torna alla lista e aggiungi</a>
      <Annuncio a={annuncio} />
    </>);
  }
  return (<>
    {!tutto && <a className="b tenue-marca torna-lista torna-su" href="#lista"><Icona n="indietro" d={22} /> Torna alla lista e aggiungi</a>}
    <div className="intesta"><h1>{tutto ? 'Com\'è andata la spesa' : 'Il giro della spesa'}</h1>{r.righe.length > 0 && <p>{tutto ? `Per ${r.righe.length === 1 ? '1 cosa' : `${r.righe.length} cose`} della tua lista` : 'Ogni supermercato ha la sua lista: vai da uno oggi e dagli altri quando vuoi. Spunta quello che prendi; quello che non trovi resta in lista.'}</p>}</div>
    {!r.righe.length && !tutto && <div className="vuota"><p>La lista è vuota: prima scrivi o detta cosa ti serve.</p><a className="b pieno grande" href="#lista">Vai alla lista</a></div>}
    {msg && <div className="ok" role="status">{msg}</div>}

    {r.avvisi.map((a, i) => <div key={i} className="avviso">{a}</div>)}
    {!tutto && (r.daScegliere || []).length > 0 && <section className="soluzione negozio-giro-carta da-scegliere-dove"><h2>Dove li prendi?</h2><p className="muto">Le hai lasciate da scegliere al supermercato: dimmi in quale, così le trovi nella sua lista.</p>
      <ul className="acquisti da-spuntare">{r.daScegliere.map((l) => <RigaLibera key={l.riga.id} l={l} chiedi {...propLib} />)}</ul></section>}
    {!r.soluzioni.length && r.righe.length > (r.fuoriGiro || []).length + (r.liberi || []).length && <div className="avviso">Non ci sono ancora prezzi per le cose della tua lista.</div>}
    {!r.soluzioni.length && (r.fuoriGiro || []).length > 0 && <div className="fornitore-box"><b>Da comprare a parte, dal fornitore</b>{r.fuoriGiro.map((f) => <span key={f.id}>{f.voce}: {f.prodotto} da <b>{f.fornitore}</b>, {euro(f.prezzo)}</span>)}</div>}
    {tutto && prima && <Soluzione s={prima} prima fuori={r.fuoriGiro || []} />}
    {!tutto && carte.map((n) => <Negozio key={n.catena_id || n.catena} n={n} liberi={n.liberi} propLib={propLib} presi={presi} nonCera={nonCera} onSpunta={spunta} onNonCera={nonTrovato} />)}
    {!tutto && (r.ovunque || []).length > 0 && <section className="soluzione negozio-giro-carta"><h2>Dove capita</h2><p className="muto">Le prendi nel primo supermercato dove passi.</p>
      <ul className="acquisti da-spuntare">{r.ovunque.map((l) => <RigaLibera key={l.riga.id} l={l} qui={0} {...propLib} />)}</ul></section>}
    {prima && !tutto && (<>
        {prima.mancanti.filter((m) => !(r.fuoriGiro || []).some((f) => f.id === m.id)).length > 0 && <div className="avviso">Senza un prezzo nei tuoi supermercati: {prima.mancanti.filter((m) => !(r.fuoriGiro || []).some((f) => f.id === m.id)).map((m) => m.voce).join(', ')}.</div>}
        {(r.fuoriGiro || []).length > 0 && <div className="fornitore-box"><b>Da comprare a parte, dal fornitore</b>{r.fuoriGiro.map((f) => <span key={f.id}>{f.voce}: {f.prodotto} da <b>{f.fornitore}</b>, {euro(f.prezzo)}</span>)}</div>}
        {prima.negozi.length > 1 && <p className="totale-giro">In tutto, se prendi tutto: <Cartellino n={prima.spesa} /></p>}
      </>)}
    {prima && r.risparmio && (r.risparmio.unSolo || r.risparmio.altrove) && <Risparmio r={r} prima={prima} />}
    {r.giudizi && <Giudizi g={r.giudizi} />}
    {altre.length > 0 && <details className="altre"><summary>Altre possibilità ({altre.length})</summary>{altre.map((s, i) => <Soluzione key={i} s={s} />)}</details>}
    {r.singoli.length > 1 && <details className="altre"><summary>Tutto in un negozio solo</summary>
      <ul className="singoli">{r.singoli.map((x) => <li key={x.catena}><div><b>{x.catena}</b><span>{x.mancanti ? `${x.mancanti === 1 ? 'manca 1 cosa' : `mancano ${x.mancanti} cose`}` : 'c\'è tutto'}</span></div><Cartellino n={x.spesa} /></li>)}</ul></details>}
    {r.impostazioni && <p className="muto piccolo">Per dividere la spesa tra i supermercati conto anche la strada ({euro(r.impostazioni.euro_km)} al km): un negozio in più viene proposto solo se fa risparmiare almeno {euro(r.impostazioni.soglia_negozio)}.</p>}
    {!tutto && <a className="b torna-lista torna-giu" href="#lista"><Icona n="indietro" d={22} /> Torna alla lista e aggiungi</a>}
    <Annuncio a={annuncio} />
  </>);
}
// 0.77: le pagine del giro, una per supermercato: si scorrono col dito (scroll-snap) o si sceglie il nome in alto.
// Si ricorda l'ultima pagina guardata (riaprendo il giro sei di nuovo nel supermercato dove eri); l'altezza segue la pagina aperta.
function PagineGiro({ pagine }) {
  const box = useRef(null); const schede = useRef(null); const primo = useRef(true);
  const [attiva, setAttiva] = useState(() => { const k = mem.leggi('giro-pagina', ''); const i = pagine.findIndex((p) => p.chiave === k); return i >= 0 ? i : 0; });
  const i0 = Math.min(attiva, pagine.length - 1);
  const vai = (i, liscio = true) => { const el = box.current; const p = el?.children[i]; if (p) el.scrollTo({ left: p.offsetLeft, behavior: liscio ? 'smooth' : 'auto' }); };
  useEffect(() => { vai(i0, false); schede.current?.children[i0]?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // cambiata pagina: il nome giusto in vista nella barra, e se eri in fondo a una lista si riparte dall'inizio di quella nuova
  useEffect(() => {
    if (primo.current) { primo.current = false; return; }
    schede.current?.children[i0]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    const el = box.current; if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [i0]);
  useEffect(() => { mem.scrivi('giro-pagina', pagine[i0]?.chiave || ''); }, [i0, pagine]);
  useEffect(() => {
    const el = box.current; const p = el?.children[i0]; if (!p) return undefined;
    const fissa = () => { el.style.height = `${p.offsetHeight}px`; };
    fissa(); const ro = new ResizeObserver(fissa); ro.observe(p); return () => ro.disconnect();
  }, [i0, pagine.length]);
  const scorri = () => {
    const el = box.current; if (!el) return; let migliore = 0;
    [...el.children].forEach((p, i) => { if (Math.abs(p.offsetLeft - el.scrollLeft) < Math.abs(el.children[migliore].offsetLeft - el.scrollLeft)) migliore = i; });
    if (migliore !== i0) setAttiva(migliore);
  };
  return <>
    <nav className="giro-schede" ref={schede} aria-label="Supermercati del giro">{pagine.map((p, i) => <button key={p.chiave} type="button" className={i === i0 ? 'attiva' : ''} aria-current={i === i0 ? 'page' : undefined} onClick={() => { setAttiva(i); vai(i); }}>
      {p.titolo}{p.conta > 0 ? <span className="conta">{p.conta}</span> : p.conta === 0 ? <span className="conta fatto">✓</span> : null}</button>)}</nav>
    <div className="giro-pagine" ref={box} onScroll={scorri}>{pagine.map((p) => <div className="giro-pagina" key={p.chiave}>{p.el}</div>)}</div>
  </>;
}
// le cose segnate «non c'era» valgono solo per oggi: domani si riprova
const oggiIso = () => new Date().toLocaleDateString('sv-SE');
function nonTrovatiOggi() { const x = mem.leggi('non-trovati', null); return x && x.giorno === oggiIso() ? x.righe || [] : []; }
const strada = (n) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(n.lat != null ? `${n.lat},${n.lng}` : `${n.indirizzo || n.nome || n.catena}${n.citta ? `, ${n.citta}` : ''}`)}`;
// 0.72: un supermercato del giro, da fare quando vuoi: orario di chiusura in una riga, la sua lista da spuntare, «Portami qui»
function Negozio({ n, liberi = [], propLib, presi, nonCera, onSpunta, onNonCera }) {
  const tutte = [...n.righe, ...liberi]; const fatti = tutte.filter((x) => presi.has(x.riga.id)).length;
  return <section className="soluzione negozio-giro-carta">
    <div className="sol-testa">
      <div><h2>{n.catena}</h2>{(n.indirizzo || n.nome) && <p>{n.indirizzo || n.nome}{n.indirizzo && n.citta ? `, ${n.citta}` : ''}</p>}</div>
      {n.subtotale > 0 && <Cartellino n={n.subtotale} grande />}
    </div>
    <StatoOrari testo={n.orari} />
    {/* 0.82: in alto quello che resta da prendere; quello che non c'era sotto; quello già preso in fondo */}
    <ul className="acquisti da-spuntare">{[...n.righe.map((x) => ({ x })), ...liberi.map((l) => ({ l }))]
      .map((e, i) => { const id = (e.x || e.l).riga.id; return { ...e, i, rango: presi.has(id) ? 2 : nonCera.has(id) ? 1 : 0 }; })
      .sort((a, b) => a.rango - b.rango || a.i - b.i)
      .map(({ x, l }) => { if (l) return <RigaLibera key={l.riga.id} l={l} qui={n.catena_id} {...propLib} />;
      const preso = presi.has(x.riga.id); const manca = !preso && nonCera.has(x.riga.id);
      return <li key={x.riga.id} className={`${preso ? 'preso' : ''}${manca ? ' non-cera' : ''}`} onClick={(e) => { if (!e.target.closest('button, a')) onSpunta(x.riga, n.catena_id); }}>
        <button type="button" className="spunta" role="checkbox" aria-checked={preso} aria-label={`${x.riga.voce}: ${preso ? 'preso' : 'da prendere'}`} onClick={() => onSpunta(x.riga, n.catena_id)}>{preso ? <Icona n="spunta" d={28} /> : null}</button>
        {x.foto ? <img className="giro-foto" src={x.foto} alt="" loading="lazy" /> : null}
        <div><span className="nome-cestino"><b>{x.riga.voce}</b>{!preso && propLib.onTogli && <Cestino nome={x.riga.voce} onSi={() => propLib.onTogli(x.riga)} />}</span><span>{x.confezioni ? `${x.confezioni} ${x.confezioni === 1 ? 'confezione' : 'confezioni'}` : quanto(x.riga.quantita, x.riga.unita)}: {x.prodotto}</span>
          <span className="etichette"><Semaforo q={x.qualita} piccolo sempre /><Etichette p={x} />{x.offerta && <span className="pill offerta">offerta</span>}<StatoPrezzo s={x.stato} al={x.valido_al} /></span>
        </div>
        <Cartellino n={x.costo} />
        {!preso && <div className="libera-azioni non-cera-tasto">
          {manca ? <span className="pill per-dopo">Per la prossima volta: resta in lista</span> : <button type="button" className="link" onClick={() => onNonCera(x.riga)}>Non c'era: tienilo per dopo</button>}
          <AltroSuper riga={x.riga} qui={n.catena_id} scelte={propLib.scelte} onSposta={propLib.onSposta} />
        </div>}</li>; })}</ul>
    {fatti > 0 && <p className="muto">{fatti === tutte.length ? `Da ${n.catena} hai preso tutto.` : `Presi ${fatti} su ${tutte.length}.`}</p>}
    <a className="b pieno-verde portami" href={strada(n)} target="_blank" rel="noopener"><Icona n="mappa" /> Portami da {n.catena}</a>
  </section>;
}
// 0.74: una cosa generica nel giro: la scegli tu sul banco, nel supermercato che hai scelto tu (lo puoi cambiare); il prezzo è indicativo
// 0.88: il cestino chiede solo conferma, lì sulla riga
function Cestino({ nome, onSi }) {
  const [chiedi, setChiedi] = useState(false);
  return <>
    <button type="button" className={`cestino${chiedi ? ' attivo' : ''}`} aria-label={`Togli ${nome} dalla lista`} aria-expanded={chiedi} onClick={() => setChiedi(!chiedi)}><Icona n="cestino" d={24} /></button>
    {chiedi && <span className="conferma-togli" role="group" aria-label={`Eliminare ${nome}?`}><span>Eliminare?</span>
      <button type="button" className="b piccolo si" onClick={() => { setChiedi(false); onSi(); }}>Sì</button>
      <button type="button" className="b piccolo" onClick={() => setChiedi(false)}>No</button></span>}
  </>;
}
function RigaLibera({ l, qui = null, chiedi = false, scelte = [], onSposta, presi, nonCera, onSpunta, onNonCera, onTogli }) {
  const x = l.riga; const preso = presi.has(x.id); const manca = !preso && nonCera.has(x.id);
  const [cambia, setCambia] = useState(false);
  const altre = [...scelte.filter((c) => c.id !== qui), ...(qui === 0 ? [] : [{ id: 0, nome: 'Dove capita' }])];
  return <li className={`libera-giro${preso ? ' preso' : ''}${manca ? ' non-cera' : ''}`} onClick={(e) => { if (!chiedi && !e.target.closest('button, a')) onSpunta(x, qui); }}>
    <button type="button" className="spunta" role="checkbox" aria-checked={preso} aria-label={`${x.voce}: ${preso ? 'preso' : 'da prendere'}`} onClick={() => onSpunta(x, qui)}>{preso ? <Icona n="spunta" d={28} /> : null}</button>
    {l.foto ? <img className="giro-foto" src={l.foto} alt="" loading="lazy" /> : null}
    <div><span className="nome-cestino"><b>{x.voce}</b>{!preso && onTogli && <Cestino nome={x.voce} onSi={() => onTogli(x)} />}</span><span>{quanto(x.quantita, x.unita)}: {x.libera ? 'lo scegli tu sul banco' : x.prodotto_scelto || 'il prodotto che hai scelto'}</span>
      <span className="etichette">{x.libera ? <span className="pill bolla-libera">Scegli al supermercato</span> : <span className="pill super-lista">spostato qui</span>}{l.da != null && <span className="muto piccolo">{x.libera ? 'da circa ' : ''}{euro(l.da)}</span>}</span></div>
    {!preso && <div className="libera-azioni">
      {!chiedi && (manca ? <span className="pill per-dopo">Per la prossima volta: resta in lista</span> : <button type="button" className="link non-cera-tasto" onClick={() => onNonCera(x)}>Non c'era: tienilo per dopo</button>)}
      {chiedi || cambia
        ? <div className="scelte">{altre.map((c) => <button key={c.id} type="button" onClick={() => { setCambia(false); onSposta(x, c.id); }}>{c.nome}</button>)}</div>
        : <button type="button" className="link" onClick={() => setCambia(true)}>{x.libera ? 'Cambia supermercato' : 'Compralo in un altro supermercato'}</button>}
      {!x.libera && <button type="button" className="link" onClick={() => onSposta(x, '')}>Rimettilo dove conviene</button>}
    </div>}
  </li>;
}
// 0.82: «Compralo in un altro supermercato»: un tocco sul nome e il prodotto passa nella pagina di quel supermercato
function AltroSuper({ riga, qui, scelte = [], onSposta }) {
  const [apri, setApri] = useState(false);
  const altri = [...scelte.filter((c) => c.id !== qui), { id: 0, nome: 'Dove capita' }];
  if (!apri) return <button type="button" className="link" onClick={() => setApri(true)}>Compralo in un altro supermercato</button>;
  return <div className="scelte">{altri.map((c) => <button key={c.id} type="button" onClick={() => { setApri(false); onSposta(riga, c.id); }}>{c.nome}</button>)}</div>;
}
function Soluzione({ s, prima = false, fuori = [] }) {
  return <section className={`soluzione${prima ? ' prima' : ''}`}>
    <div className="sol-testa">
      <div><h2>{s.catene.join(' e ')}</h2></div>
      <Cartellino n={s.spesa} grande />
    </div>
    {s.negozi.map((n, k) => <div key={n.catena} className="negozio">
      {s.negozi.length > 1 && <h3>{k + 1}. {n.catena}</h3>}
      {(n.indirizzo || n.nome) && <p className="muto">{n.indirizzo || n.nome}{n.indirizzo && n.citta ? `, ${n.citta}` : ""}</p>}
      <ul className="acquisti">{n.righe.map((x) => <li key={x.riga.id}>
        <div><b>{x.riga.voce}</b><span>{x.confezioni ? `${x.confezioni} ${x.confezioni === 1 ? 'confezione' : 'confezioni'}` : quanto(x.riga.quantita, x.riga.unita)}: {x.prodotto}</span>
          <span className="etichette"><Semaforo q={x.qualita} piccolo sempre /><Etichette p={x} />{x.offerta && <span className="pill offerta">offerta</span>}<StatoPrezzo s={x.stato} al={x.valido_al} /></span></div>
        <Cartellino n={x.costo} /></li>)}</ul>
      {s.negozi.length > 1 && <p className="subtotale">Da {n.catena} spendi <b>{euro(n.subtotale)}</b></p>}
    </div>)}
    {s.mancanti.filter((m) => !fuori.some((f) => f.id === m.id)).length > 0 && <div className="avviso">Non trovato con queste scelte: {s.mancanti.filter((m) => !fuori.some((f) => f.id === m.id)).map((m) => m.voce).join(', ')}.</div>}
    {prima && fuori.length > 0 && <div className="fornitore-box"><b>Da comprare a parte, dal fornitore</b>{fuori.map((f) => <span key={f.id}>{f.voce}: {f.prodotto} da <b>{f.fornitore}</b>, {euro(f.prezzo)}</span>)}</div>}
  </section>;
}

// 0.76: foto automatiche dei prodotti (Open Food Facts): quante mancano e «cerca adesso»
function FotoAutomatiche() {
  const c = useDati('/api/foto-automatiche'); const [attesa, setAttesa] = useState(false); const [esito, setEsito] = useState(''); const [err, setErr] = useState('');
  const cerca = async (tutti) => { setErr(''); setEsito(''); setAttesa(true);
    try { const r = await api('/api/foto-automatiche', { metodo: 'POST', corpo: { tutti } }); setEsito(r.guardati ? `Guardati ${r.guardati} prodotti senza foto: ${r.trovate === 1 ? 'trovata 1 foto' : `trovate ${r.trovate} foto`}.` : 'Nessun prodotto da guardare adesso: sono già stati cercati in questo mese.'); c.ricarica(); }
    catch (e) { setErr(e.message); } finally { setAttesa(false); } };
  const d = c.dati;
  return <>
    <div className="intesta"><h1>Foto automatiche</h1><p>Ogni mezz'ora l'app cerca la foto dei prodotti che non ce l'hanno su Open Food Facts, l'archivio libero dei prodotti: con il codice a barre, oppure con nome, marca e formato quando corrispondono del tutto. Frutta, verdura e sfusi restano senza.</p></div>
    {c.errore && <div className="errore">{c.errore}</div>}
    {d && <section className="carta">
      <p><b>{d.senza}</b> prodotti ancora senza foto · <b>{d.automatiche}</b> foto prese in automatico · <b>{d.scartate}</b> segnate «non è questa»</p>
      {!d.catalogo && <div className="avviso">Sul server manca il catalogo di Open Food Facts: le foto si trovano solo con il codice a barre. Per cercarle anche per nome serve il catalogo (si prepara con «node server/catalogo.js»).</div>}
      {err && <div className="errore">{err}</div>}{esito && <div className="ok" role="status">{esito}</div>}
      <div className="riga"><button type="button" className="b pieno" disabled={attesa} onClick={() => cerca(false)}>{attesa ? 'Cerco…' : 'Cerca le foto adesso'}</button>
        <button type="button" className="b" disabled={attesa} onClick={() => cerca(true)}>Riprova anche quelli già cercati</button></div>
      <p className="muto piccolo">Le foto di Open Food Facts hanno licenza CC BY-SA: sotto ogni foto c'è scritto da dove viene. Chiunque può toccare «Non è questa foto» se è sbagliata, e quella foto non torna più.</p>
    </section>}
  </>;
}

// ---------- altro: preferenze e gestione ----------
function Altro({ stato, ricaricaStato, sezione }) {
  if (sezione === 'negozi') return <Negozi stato={stato} />;
  if (sezione === 'scontrini') return <Scontrini />;
  if (sezione === 'impostazioni') return <Impostazioni stato={stato} ricarica={ricaricaStato} />;
  if (sezione === 'pubblicita') return <Pubblicita />;
  if (sezione === 'foto-scontrini') return <><Torna a="#altro" t="Altro" /><ScontriniDaLeggere /></>;
  if (sezione === 'whatsapp') return <><Torna a="#altro" t="Altro" /><WhatsappApp /></>;
  if (sezione === 'produttori') return <><Torna a="#altro" t="Altro" /><GestioneProduttori /></>;
  if (sezione === 'statistiche') return <><Torna a="#altro" t="Altro" /><Statistiche /></>;
  if (sezione === 'volantini') return <><Torna a="#altro" t="Altro" /><GestioneVolantini /></>;
  if (sezione === 'doppioni') return <><Torna a="#altro" t="Altro" /><SchedeDoppie /></>;
  if (sezione === 'foto') return <><Torna a="#altro" t="Altro" /><FotoAutomatiche /></>;
  const c = stato.conti; const u = stato.utente;
  return <>
    <div className="intesta"><h1>Altro</h1><p>Ciao {u.nome}</p></div>
    <InvitaPersone />
    <nav className="menu" aria-label="La mia famiglia">
      <a href="#nuovo-prodotto"><b>Inserisci un nuovo prodotto</b><span>Un prodotto che non c'è ancora (frutta, verdura, banco…): tutti i dati e il prezzo in una pagina sola</span></a>
      <a href="#rileva"><b>Inserisci un prezzo</b><span>Di un prodotto che c'è già: cerchi il prodotto, scegli il supermercato, scrivi il prezzo</span></a>
      <a href="#famiglia"><b>La mia famiglia</b><span>Chi fa la spesa con te, indirizzo di casa</span></a>
      <a href="#supermercati"><b>I miei supermercati</b><span>Dove fai la spesa: il giro guarda solo questi</span></a>
      <a href="#preferiti"><b>I miei preferiti</b><span>I prodotti buoni a buon prezzo che compri, divisi per supermercato: dove ti conviene di più</span></a>
      <a href="#spese"><b>Le mie spese</b><span>Lo storico con la pagella e cosa cambiare la prossima volta</span></a>
      <a href="#produttori"><b>Segnala produttori locali</b><span>{stato.produttori ? `${stato.produttori === 1 ? '1 produttore' : `${stato.produttori} produttori`}: ordini e ritiri da loro` : 'Ordina dal contadino e ritira da lui'}</span></a>
      {u.produttore_id && <a href="#produttore/mio"><b>Il mio banco</b><span>I tuoi prodotti e gli ordini da evadere</span></a>}
      <a href="#come"><b>Come funziona l'app</b><span>Sei passi semplici, a caratteri grandi</span></a>
      <a href="#installa"><b>Metti l'icona sul telefono</b><span>Per aprire l'app come le altre, dalla schermata Home</span></a>
      <a href="#volantino"><b>Fotografa un volantino</b><span>Fotografa le offerte del supermercato: entrano per tutti</span></a>
      <a href="#prezzi"><b>Prezzi e prodotti</b><span>{c.prodotti} prodotti, {c.prezzi} prezzi</span></a>
    </nav>
    <p className="muto">Quando scegli italiano, bio o una marca per una cosa della lista, l'app se lo ricorda: la prossima volta che la metti in lista è già scelta così.</p>
    {u.admin && <>
      <h2 className="titoletto">Gestione</h2>
      <nav className="menu" aria-label="Gestione">
        <a href="#altro/foto"><b>Foto automatiche</b><span>Le foto dei prodotti prese da Open Food Facts</span></a>
        <a href="#altro/doppioni"><b>Schede doppie{c.doppioni ? ` (${c.doppioni} da controllare)` : ''}</b><span>Lo stesso prodotto entrato due volte (scontrino, volantino, codice a barre)</span></a>
        <a href="#altro/negozi"><b>Supermercati e negozi</b><span>{c.catene} supermercati, {c.negozi} negozi</span></a>
        <a href="#altro/foto-scontrini"><b>Scontrini fotografati{c.daLeggere ? ` (${c.daLeggere} da leggere)` : ''}</b><span>Quelli mandati da chi usa l'app</span></a>
        <a href="#altro/volantini"><b>Volantini{c.volantiniDaLeggere ? ` (${c.volantiniDaLeggere} da leggere)` : ''}</b><span>Letti da Claude, controllati da te</span></a>
        <a href="#altro/scontrini"><b>Scontrini caricati</b><span>{c.scontrini === 1 ? '1 scontrino' : `${c.scontrini} scontrini`}</span></a>
        <a href="#altro/impostazioni"><b>Impostazioni generali</b><span>Città predefinita, costo della strada</span></a>
        <a href="#altro/pubblicita"><b>La mia pubblicità</b><span>Gli annunci nell'app</span></a>
        <a href="#altro/whatsapp"><b>WhatsApp per i codici</b><span>Il numero che manda i codici di accesso</span></a>
        <a href="#altro/produttori"><b>Produttori e canoni</b><span>Chi è nell'app e se il canone è in regola</span></a>
        <a href="#altro/statistiche"><b>Statistiche d'uso</b><span>Persone, installazioni, da dove, quanto si usa</span></a>
      </nav>
    </>}
    <p className="muto piccolo"><a href="#privacy">Privacy</a> · Versione {__VERSIONE__}{stato.versione && stato.versione !== __VERSIONE__ ? ` (sul server ${stato.versione}: chiudi e riapri l'app)` : ''}{stato.catalogo ? ` · Catalogo: ${Number(stato.catalogo.prodotti).toLocaleString('it-IT')} prodotti, aggiornato il ${stato.catalogo.aggiornato}` : ''}</p>
  </>;
}

// ---------- invita persone a usare l'app: più siamo, più i prezzi sono freschi ----------
// manda l'invito; vero se si è aperto WhatsApp nel browser (allora si mostra anche l'indirizzo da copiare)
async function mandaInvito() {
  const testo = `Faccio la spesa con Spesa Saggia: confronta i prezzi dei supermercati vicino a casa e ti dice dove conviene andare. Più persone la usano, più i prezzi sono aggiornati e più risparmiamo tutti. È gratis, provala: ${location.origin}`;
  if (navigator.share) { try { await navigator.share({ title: 'Spesa Saggia', text: testo }); mem.scrivi('invito-fatto', Date.now()); return false; } catch (e) { if (e?.name === 'AbortError') return false; } }
  window.open(`https://wa.me/?text=${encodeURIComponent(testo)}`, '_blank', 'noopener'); mem.scrivi('invito-fatto', Date.now());
  return true;
}
const GIORNO = 24 * 60 * 60 * 1000;
// nella lista: una riga verde; la X la nasconde per un po'
function InvitaRiga() {
  const [nascosta, setNascosta] = useState(() => Date.now() - mem.leggi('invito-chiuso-2', 0) < 7 * GIORNO);
  if (nascosta) return null;
  return <div className="invita-riga">
    <button type="button" className="invita-riga-tasto" onClick={async () => { await mandaInvito(); }}>
      <span className="invita-icona"><Icona n="persone" d={26} /></span>
      <span><b>Invita persone</b><span>Più siamo, più i prezzi sono aggiornati e più risparmiamo tutti</span></span>
    </button>
    <button type="button" className="chiudi-offerta" aria-label="Più tardi" onClick={() => { mem.scrivi('invito-chiuso-2', Date.now()); setNascosta(true); }}><Icona n="chiudi" d={22} /></button>
  </div>;
}
function InvitaPersone() {
  const [link, setLink] = useState(false);
  const url = location.origin;
  const invita = async () => { if (await mandaInvito()) setLink(true); };
  return <section className="invita-persone">
    <div className="invita-testa"><span className="invita-icona"><Icona n="persone" d={30} /></span>
      <p><b>Più persone usano l'app, più i prezzi sono aggiornati: e più risparmiamo tutti.</b> Mandala ad amici, parenti e vicini.</p></div>
    <button type="button" className="b pieno-verde grande" onClick={invita}><Icona n="whatsapp" /> Invita persone</button>
    {link && <p className="piccolo">Se non si è aperto WhatsApp, copia questo indirizzo: <span className="link-invito">{url}</span></p>}
    <p className="muto piccolo">Vuoi fare la spesa con la stessa lista? Quello è un'altra cosa: vai in <a href="#famiglia">La mia famiglia</a>.</p>
  </section>;
}

// ---------- invito aperto quando si è già dentro ----------
function InvitoInSospeso({ onFatto }) {
  const [codice, setCodice] = useState(invitoSalvato); const [err, setErr] = useState('');
  if (!codice) return null;
  const chiudi = () => { mem.scrivi('invito', null); setCodice(null); };
  return <div className="carta">
    <h2>Ti hanno invitato</h2>
    <p>Qualcuno ti ha invitato nella sua famiglia: avrete la stessa lista della spesa. La tua lista di adesso resta qui, nella famiglia che lasci.</p>
    {err && <div className="errore">{err}</div>}
    <button type="button" className="b pieno grande" onClick={async () => { try { await api('/api/famiglia/unisciti', { metodo: 'POST', corpo: { codice } }); chiudi(); onFatto(); } catch (e) { setErr(e.message); } }}>Entra nella sua famiglia</button>
    <button type="button" className="b" onClick={chiudi}>No, grazie</button>
  </div>;
}

// ---------- la mia famiglia ----------
function Famiglia({ stato, ricaricaStato }) {
  const f = useDati('/api/famiglia');
  const [ind, setInd] = useState(null); const [area, setArea] = useState(null);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [link, setLink] = useState('');
  if (!f.dati) return <p className="muto">Carico…</p>;
  const d = f.dati;
  const fai = async (p, ok) => { setErr(''); setMsg(''); try { await p; await f.ricarica(); ricaricaStato(); if (ok) setMsg(ok); } catch (e) { setErr(e.message); } };
  const invita = async () => {
    setErr('');
    try {
      const { codice } = await api('/api/famiglia/invito', { metodo: 'POST', corpo: {} });
      const url = `${location.origin}/#invito/${codice}`; setLink(url);
      const testo = `Facciamo la spesa insieme con Spesa Saggia: apri questo link ed entra con il tuo numero. ${url}`;
      if (navigator.share) { try { await navigator.share({ title: 'Spesa Saggia', text: testo }); return; } catch { /* annullato: resta il link */ } }
      window.open(`https://wa.me/?text=${encodeURIComponent(testo)}`, '_blank', 'noopener');
    } catch (e) { setErr(e.message); }
  };
  return <>
    <div className="intesta"><h1>{d.nome}</h1><p>Avete la stessa lista della spesa.</p></div>
    {msg && <div className="ok" role="status">{msg}</div>}{err && <div className="errore">{err}</div>}
    <section className="carta">
      <h2>Chi fa la spesa con te</h2>
      <ul className="membri">{d.membri.map((m) => <li key={m.id}><b>{m.nome}{m.io ? ' (tu)' : ''}</b><span>{m.telefono}</span></li>)}</ul>
      <button type="button" className="b pieno grande" onClick={invita}>Invita qualcuno</button>
      <p className="muto">Gli mandi un link su WhatsApp: lo apre, entra con il suo numero e vede la vostra lista. Il link vale 7 giorni.</p>
      {link && <p className="piccolo">Se non si è aperto WhatsApp, copia questo link: <span className="link-invito">{link}</span></p>}
    </section>
    <a className="b" href="#supermercati">★ I miei supermercati</a>
    <section className="carta">
      <h2>Indirizzo di casa</h2>
      <p className="muto">Serve per calcolare il giro dei negozi: si parte e si torna qui. Lo vedete solo voi.</p>
      <label className="campo">Via, numero e città<input value={ind ?? d.casa?.indirizzo ?? ''} onChange={(e) => setInd(e.target.value)} placeholder="Via Bologna 10, Ferrara" autoComplete="street-address" /></label>
      <span className="campo">Dove fai la spesa</span>
      <div className="scelte grandi">{[['centro-nord', 'Centro-Nord'], ['sud', 'Sud e isole']].map(([k, t]) => <button type="button" key={k} aria-pressed={(area ?? (d.area || stato.impostazioni.area)) === k} onClick={() => setArea(k)}>{t}</button>)}</div>
      <button type="button" className="b pieno" onClick={() => fai(api('/api/famiglia/casa', { metodo: 'PUT', corpo: { indirizzo: ind ?? d.casa?.indirizzo ?? '', area: area ?? (d.area || stato.impostazioni.area) } }), 'Salvato')}>Salva</button>
    </section>
    <section className="colonna">
      <button type="button" className="b" onClick={() => { if (confirm('Vuoi uscire da questa famiglia? Avrai una lista tua, vuota.')) fai(api('/api/famiglia/esci', { metodo: 'POST', corpo: {} }), 'Ora hai una lista tutta tua'); }}>Lascia questa famiglia</button>
      <button type="button" className="b rosso" onClick={async () => { await api('/api/accesso/esci', { metodo: 'POST', corpo: {} }); ricaricaStato(); }}>Esci da questo telefono</button>
    </section>
  </>;
}

// ---------- WhatsApp che manda i codici (amministratore) ----------
function WhatsappApp() {
  const w = useDati('/api/whatsapp'); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { if (w.dati?.pronto) return undefined; const t = setInterval(() => w.ricarica(), 5000); return () => clearInterval(t); }, [w.dati?.pronto]); // eslint-disable-line react-hooks/exhaustive-deps
  if (w.errore) return <div className="errore">{w.errore}</div>;
  if (!w.dati) return <p className="muto">Controllo…</p>;
  const d = w.dati;
  return <section className="carta">
    <h1>WhatsApp per i codici</h1>
    {!d.configurato ? <div className="avviso">Il servizio WhatsApp dell'app non è ancora acceso. Per ora i codici si leggono nel registro del server.</div>
      : d.errore ? <div className="errore">{d.errore}</div>
      : d.pronto ? <div className="ok">Collegato al numero {d.numero}{d.nome ? ` (${d.nome})` : ''}. I codici partono da qui.</div>
      : d.qr ? <>
        <p>Sul telefono con il numero dell'app apri WhatsApp, poi <b>Impostazioni → Dispositivi collegati → Collega un dispositivo</b>, e inquadra questo codice.</p>
        <img className="qr" src={d.qr} alt="QR code da inquadrare con WhatsApp" />
        <p className="muto piccolo">Il codice cambia ogni tanto: la pagina si aggiorna da sola.</p>
      </> : <p className="muto">Il servizio si sta avviando…</p>}
    {msg && <div className="ok" role="status">{msg}</div>}{err && <div className="errore">{err}</div>}
    {d.pronto && <button type="button" className="b pieno" onClick={async () => { setErr(''); setMsg(''); try { await api('/api/whatsapp/prova', { metodo: 'POST', corpo: {} }); setMsg('Messaggio di prova mandato al tuo numero'); } catch (e) { setErr(e.message); } }}>Manda una prova al mio numero</button>}
  </section>;
}

// ---------- scontrino fotografato: va a chi gestisce i prezzi ----------
// 0.84: anche dentro una spesa fatta («invito»): i due tasti si vedono subito
export function FotoScontrino({ invito = false }) {
  const camera = useRef(null); const galleria = useRef(null);
  const [stato, setStato] = useState(''); const [ok, setOk] = useState(false); const [aperto, setAperto] = useState(invito);
  const scelta = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = ''; if (!files.length) return;
    setOk(false); setAperto(false); setStato(files.length > 1 ? `Mando ${files.length} scontrini…` : 'Mando lo scontrino…');
    try {
      const ricevuti = [];
      for (const f of files) ricevuti.push(await api('/api/scontrini/foto', { metodo: 'POST', corpo: { dati: await riduciFoto(f, 2200, 0.85) } }));
      setOk(true);
      if (!ricevuti.some((r) => r.automatico)) { setStato(files.length > 1 ? `Grazie! Ho ricevuto ${files.length} scontrini: i prezzi entrano nell'app appena vengono letti.` : 'Grazie! Ho ricevuto lo scontrino: i prezzi entrano nell\'app appena viene letto.'); return; }
      // il server li legge da solo: si aspetta il risultato (al massimo un minuto e mezzo)
      setStato(files.length > 1 ? `Grazie! Leggo i ${files.length} scontrini…` : 'Grazie! Leggo lo scontrino…');
      const fine = Date.now() + 90000; let esiti = [];
      while (Date.now() < fine) {
        await new Promise((r) => setTimeout(r, 3000));
        esiti = await Promise.all(ricevuti.map((r) => api(`/api/scontrini/mio/${r.id}`).catch(() => null)));
        if (esiti.every((r) => r && (r.letto || r.stato !== 'da leggere'))) break;
      }
      const prezzi = esiti.reduce((s, r) => s + (r?.prezzi || 0), 0);
      const resto = esiti.reduce((s, r) => s + (r?.resto || 0), 0);
      const doppi = esiti.filter((r) => r?.stato === 'doppione').length;
      const nonLetti = esiti.filter((r) => !r || r.stato === 'da leggere').length;
      setStato([
        prezzi ? `Fatto: sono entrati ${prezzi} prezzi${esiti[0]?.catena ? ` (${esiti.map((r) => r?.catena).filter(Boolean).filter((c, i, a) => a.indexOf(c) === i).join(', ')})` : ''}.` : 'Ho letto lo scontrino, ma nessun prodotto era già nell\'app con sicurezza.',
        resto ? `${resto === 1 ? '1 riga la controlla' : `${resto} righe le controlla`} chi gestisce l'app.` : '',
        doppi ? 'Uno scontrino era già stato caricato: non l\'ho contato due volte.' : '',
        nonLetti ? 'Non sono riuscito a leggere tutto da solo: ci pensa chi gestisce l\'app.' : '',
      ].filter(Boolean).join(' '));
    } catch (x) { setStato(x.message || 'Non sono riuscito a mandarlo: riprova'); }
  };
  return <>
    {!invito && <button type="button" className="b tasto-due tenue-marca" aria-expanded={aperto} onClick={() => setAperto((a) => !a)}><Icona n="scontrino" d={34} /><b>Scontrino</b><span>Scansiona la spesa fatta</span></button>}
    {aperto && <div className={`due-vie${invito ? ' nuda' : ''}`} style={{ gridColumn: '1 / -1' }}>
      <button type="button" className="b pieno" onClick={() => camera.current?.click()}><Icona n="foto" /> Fotografa adesso</button>
      <button type="button" className="b contorno viola" onClick={() => galleria.current?.click()}><Icona n="galleria" /> Scegli dalle foto</button>
      {!invito && <p className="muto piccolo">Puoi fotografare lo scontrino al momento, oppure fare la foto con calma e mandarla dopo dalle tue foto (anche più di una).</p>}
    </div>}
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={scelta} />
    <input ref={galleria} type="file" accept="image/*" multiple hidden onChange={scelta} />
    {stato && <div className={ok ? 'ok' : 'avviso'} role="status" style={{ gridColumn: '1 / -1' }}>{stato}</div>}
  </>;
}
function ScontriniDaLeggere() {
  const l = useDati('/api/scontrini/foto'); const [aperto, setAperto] = useState(null);
  if (l.errore) return <div className="errore">{l.errore}</div>;
  if (!l.dati) return <p className="muto">Carico…</p>;
  const segna = async (id, stato) => { await api(`/api/scontrini/foto/${id}`, { metodo: 'PUT', corpo: { stato } }); l.ricarica(); };
  if (aperto) return <LetturaScontrino foto={aperto} onFatto={() => l.ricarica()} onChiudi={() => setAperto(null)} />;
  return <section className="carta">
    <h1>Scontrini fotografati</h1>
    <p className="muto">L'app legge gli scontrini da sola appena arrivano e carica i prodotti che riconosce con sicurezza. «Da controllare»: restano righe da abbinare a mano. «Leggi»: quelli che non è riuscita a leggere.</p>
    {!l.dati.length && <p className="muto">Ancora nessuno.</p>}
    <ul className="scontrini-foto">{l.dati.map((x) => <li key={x.id} className={x.stato === 'da leggere' ? '' : 'fatto'}>
      <a href={x.foto} target="_blank" rel="noopener"><img src={x.foto} alt={`Scontrino del ${data(x.creato_il)}`} /></a>
      <div className="colonna" style={{ gap: 6 }}>
        <b>{x.nome || 'Utente'}, {data(x.creato_il)}</b><span className="muto">{x.stato}</span>
        {x.stato === 'da controllare' ? <div className="riga"><button type="button" className="b pieno piccolo" onClick={() => setAperto(x)}>Controlla le righe</button><button type="button" className="b piccolo" onClick={() => segna(x.id, 'letto')}>Va bene così</button></div>
          : x.stato === 'doppione' ? <span className="pill vecchio">già caricato da un'altra foto</span>
          : x.stato === 'da leggere' ? <div className="riga"><button type="button" className="b pieno piccolo" onClick={() => setAperto(x)}>Leggi</button><button type="button" className="b piccolo" onClick={() => segna(x.id, 'letto')}>Già fatto</button><button type="button" className="b piccolo" onClick={() => segna(x.id, 'scartato')}>Scarta</button></div>
          : <button type="button" className="b piccolo" onClick={() => segna(x.id, 'da leggere')}>Rimetti da leggere</button>}
      </div>
    </li>)}</ul>
  </section>;
}

// ---------- avvisi: un preferito in offerta ----------
function Avvisi({ versione }) {
  const a = useDati('/api/avvisi');
  useEffect(() => { if (versione) a.ricarica(); }, [versione]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a.dati?.length) return null;
  return <div className="colonna" style={{ gap: 8 }}>{a.dati.map((x) => <div key={x.id} className="avviso-offerta">
    <span className="pill offerta">Offerta</span>
    <a href={x.link || '#lista'}>{x.testo}</a>
    <button type="button" className="b tondo" aria-label="Ho letto" onClick={async () => { await api(`/api/avvisi/${x.id}`, { metodo: 'PUT', corpo: {} }); a.ricarica(); }}><Icona n="chiudi" d={22} /></button>
  </div>)}</div>;
}

// ---------- quanto risparmi ----------
function Risparmio({ r, prima }) {
  const x = r.risparmio; const unSolo = x.unSolo; const piu = prima.catene.length > 1;
  const [aggiunto, setAggiunto] = useState(false);
  return <section className="risparmio">
    <h2>Quanto risparmi</h2>
    {unSolo && piu && x.rispettoUnSolo > 0 && <p className="grande-risparmio"><b>{euro(x.rispettoUnSolo)}</b> rispetto a comprare tutto da {unSolo.catena} ({euro(unSolo.totale)} con la strada). Il giro tra {prima.catene.join(' e ')} costa {euro(prima.totale)}.</p>}
    {unSolo && !piu && <p>Con i prezzi di oggi conviene fare tutto da <b>{prima.catene[0]}</b>: dividere la spesa tra i tuoi supermercati non farebbe risparmiare abbastanza da ripagare la strada{r.impostazioni ? ` (almeno ${euro(r.impostazioni.soglia_negozio)} per negozio in più)` : ''}.</p>}
    {x.altrove && <div className="altrove">
      <p><b>Fuori dai tuoi supermercati risparmieresti altri {euro(x.altrove.risparmio)}</b>, passando anche da {x.altrove.nuove.join(' e ')}{x.altrove.km != null ? ` (${num(x.altrove.km, 1)} km di giro)` : ''}:</p>
      <ul>{x.altrove.differenze.slice(0, 6).map((d, i) => <li key={i}>{d.voce}: {d.prodotto} da {d.catena} <b>{euro(d.costo)}</b> invece di {euro(d.prima)} da {d.primaCatena}</li>)}</ul>
      {!aggiunto ? <button type="button" className="b contorno viola" onClick={async () => { try { const c = await api('/api/catene'); for (const n of x.altrove.nuove) { const k = c.find((y) => y.nome === n); if (k) await api('/api/miei-supermercati', { metodo: 'POST', corpo: { catena_id: k.id } }); } setAggiunto(true); } catch { /* niente */ } }}>Aggiungi {x.altrove.nuove.join(' e ')} ai miei supermercati</button>
        : <p className="ok">Aggiunto. Riapri il giro per vedere il nuovo percorso.</p>}
    </div>}
    <p className="muto piccolo">Più prezzi inseriscono tutti, più questo confronto diventa preciso.</p>
  </section>;
}
// ---------- com'è la spesa: promossi e scarsi ----------
function Giudizi({ g }) {
  const n = g.promossi.length + g.cosiCosi.length + g.scarsi.length;
  if (!n && !g.ignoti.length) return null;
  const Riga = ({ v }) => <li>
    <div className="riga" style={{ gap: 8 }}><Semaforo q={v.qualita} piccolo sempre /><b>{v.prodotto}</b></div>
    <span className="muto">{v.voce}, da {v.catena}, {euro(v.costo)}</span>
    {v.alternativa && <span className="alternativa">Meglio: <a href={`#prodotto/${v.alternativa.prodotto_id}`}>{v.alternativa.prodotto}</a> ({v.alternativa.giudizio.parola}) da {v.alternativa.catena}{v.alternativa.differenza != null ? `, ${v.alternativa.differenza > 0 ? `+${euro(v.alternativa.differenza)}` : v.alternativa.differenza < 0 ? `e risparmi ${euro(-v.alternativa.differenza)}` : 'allo stesso prezzo'}` : ''}</span>}
  </li>;
  return <section className="carta giudizi">
    <h2>Com'è la tua spesa</h2>
    <p className="muto">{g.promossi.length ? `${g.promossi.length} ${g.promossi.length === 1 ? 'prodotto buono' : 'prodotti buoni'}` : 'Nessun prodotto giudicato buono'}{g.scarsi.length ? `, ${g.scarsi.length} ${g.scarsi.length === 1 ? 'scarso' : 'scarsi'}` : ''}{g.cosiCosi.length ? `, ${g.cosiCosi.length} così così` : ''}{g.ignoti.length ? `, ${g.ignoti.length} senza dati` : ''}.</p>
    {g.scarsi.length > 0 && <><h3>Da ripensare</h3><ul className="voti">{g.scarsi.map((v) => <Riga key={v.prodotto_id} v={v} />)}</ul></>}
    {g.cosiCosi.length > 0 && <><h3>Così così</h3><ul className="voti">{g.cosiCosi.map((v) => <Riga key={v.prodotto_id} v={v} />)}</ul></>}
    {g.promossi.length > 0 && <><h3>Promossi</h3><ul className="voti">{g.promossi.map((v) => <Riga key={v.prodotto_id} v={v} />)}</ul></>}
    {g.ignoti.length > 0 && <details className="altre"><summary>Senza giudizio ({g.ignoti.length})</summary><ul className="voti">{g.ignoti.map((v) => <Riga key={v.prodotto_id} v={v} />)}</ul></details>}
    <p className="muto piccolo">Il giudizio viene da Nutri-Score, additivi, lavorazione, bio, origine e dai voti di chi compra. È un'indicazione, non un parere medico.</p>
  </section>;
}

// ---------- schede doppie: lo stesso prodotto entrato due volte (amministratore) ----------
function SchedeDoppie() {
  const l = useDati('/api/doppioni');
  const [err, setErr] = useState(''); const [fatti, setFatti] = useState({}); const [conferma, setConferma] = useState(null);
  if (l.errore) return <div className="errore">{l.errore}</div>;
  if (!l.dati) return <p className="muto">Carico…</p>;
  const chiave = (c) => `${c.a.id}-${c.b.id}`;
  const decidi = async (c, cosa) => {
    setErr('');
    try { await api(`/api/prodotti/${c.a.id}/${cosa}`, { metodo: 'POST', corpo: { altro: c.b.id } }); setFatti({ ...fatti, [chiave(c)]: cosa === 'unisci' ? 'Unite' : 'Segnate come diverse' }); setConferma(null); } catch (e) { setErr(e.message); }
  };
  const riquadro = (p) => <div className="doppione-testo">
    <a href={`#prodotto/${p.id}`}><b>{p.nome}</b></a>
    <span className="etichette">{p.catena ? <span className="pill super-lista">{p.catena}{p.prezzo == null ? '' : ` · ${euro(p.prezzo)}`}</span> : <span className="muto piccolo">senza prezzo</span>}{p.ean ? <span className="muto piccolo">codice {p.ean}</span> : null}{p.nome_scontrino ? <span className="muto piccolo">scontrino «{p.nome_scontrino}»</span> : null}</span>
  </div>;
  return <section className="carta colonna">
    <h2>Schede doppie</h2>
    <p className="muto">Coppie di schede che sembrano lo stesso prodotto: stesso supermercato e nome, ingredienti, formato o prezzo uguali. Le controlla l'app da sola ogni volta che entra un prodotto o un prezzo.</p>
    {!l.dati.length && <p className="avviso">Nessuna scheda doppia da controllare.</p>}
    {l.dati.map((c) => <div key={chiave(c)} className="doppioni">
      {fatti[chiave(c)] ? <p><b>{fatti[chiave(c)]}:</b> {c.a.nome} e {c.b.nome}</p> : <>
        <div className="doppione coppia">
          {riquadro(c.a)}
          {riquadro(c.b)}
          <span className="motivi" style={{ gridColumn: '1 / -1' }}>{c.motivi.map((m) => <span key={m}>{m}</span>)}</span>
          {conferma === chiave(c) ? <div className="colonna">
            <button type="button" className="b pieno-verde" onClick={() => decidi(c, 'unisci')}>Sì, uniscile</button>
            <button type="button" className="b" onClick={() => setConferma(null)}>Annulla</button>
          </div> : <div className="colonna">
            <button type="button" className="b pieno-verde" onClick={() => setConferma(chiave(c))}>È lo stesso prodotto</button>
            <button type="button" className="b" onClick={() => decidi(c, 'diversi')}>Sono diversi</button>
          </div>}
        </div>
      </>}
    </div>)}
    {err && <div className="errore">{err}</div>}
  </section>;
}

// ---------- quanto te ne serve: prima di mettere in lista un prodotto ----------
function QuantoServe({ x, attesa, onConferma, onAnnulla }) {
  const confezioni = !x.sfuso && x.formato && x.formato.quantita > 0;
  const passo = x.sfuso && (x.unita === 'kg' || x.unita === 'l') ? 0.5 : 1;
  const [n, setN] = useState(x.sfuso ? 1 : 1);
  const formato = formatoDi(x.formato);
  const unita = x.unita === 'kg' ? 'kg' : x.unita === 'l' ? 'l' : x.pezzo || 'pezzi';
  const scritto = confezioni ? `${n} ${n === 1 ? 'confezione' : 'confezioni'}` : x.sfuso ? `${String(n).replace('.', ',')} ${unita}` : `${n} ${n === 1 ? 'pezzo' : 'pezzi'}`;
  // la quantità che va in lista, nell'unità della voce
  const quantita = confezioni ? Math.round(n * x.formato.quantita * 1000) / 1000 : x.sfuso ? n : n * (x.quantita || 1);
  useEffect(() => { const f = (e) => { if (e.key === 'Escape') onAnnulla(); }; addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="velo" role="dialog" aria-modal="true" aria-labelledby="quanti-titolo" onClick={(e) => { if (e.target === e.currentTarget) onAnnulla(); }}>
    <div className="pannello-voce quanti-pannello">
      <div className="quanti-testa">
        {x.foto ? <img src={x.foto} alt="" /> : <span />}
        <div><h2 id="quanti-titolo">{x.nome}</h2><span className="muto">{formato || ''}{x.catena ? ` · ${x.catena}` : ''}</span></div>
        {x.prezzo != null && <span className="cartellino-col"><Cartellino n={x.prezzo} /><small>{x.sfuso ? `al ${unita}` : 'la confezione'}</small></span>}
      </div>
      <span className="nome-gruppo">{confezioni ? `Quante confezioni${formato ? ` (da ${formato})` : ''}?` : 'Quanto te ne serve?'}</span>
      <div className="passi">
        <button type="button" aria-label="Meno" disabled={n <= passo} onClick={() => setN(Math.round((n - passo) * 10) / 10)}>−</button>
        <output>{scritto}</output>
        <button type="button" aria-label="Di più" onClick={() => setN(Math.round((n + passo) * 10) / 10)}>+</button>
      </div>
      <button type="button" className="b pieno grande" disabled={attesa} onClick={() => onConferma(quantita)}>Metti in lista</button>
      <button type="button" className="b" onClick={onAnnulla}>Annulla</button>
    </div>
  </div>;
}
