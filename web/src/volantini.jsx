// Volantini: tutti possono fotografare le pagine; chi gestisce le fa leggere a Claude, controlla e carica le offerte.
import { useEffect, useRef, useState } from 'react';
import { api, useDati, euro, num, data as fData, riduciFoto, ScegliCatena, Icona } from './base.jsx';
import { CercaVoce } from './gestione.jsx';

const fmt = (r) => (r.sfuso ? `al ${r.unita === 'pz' ? 'pezzo' : r.unita || 'kg'}` : r.quantita ? (r.unita === 'kg' && r.quantita < 1 ? `${Math.round(r.quantita * 1000)} g` : r.unita === 'l' && r.quantita < 1 ? `${Math.round(r.quantita * 1000)} ml` : `${num(r.quantita, 3)} ${r.unita === 'pz' ? 'pz' : r.unita || ''}`) : '');
const dataIt = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');

// impronta della foto (16×16, chiaro/scuro tra punti vicini): la stessa pagina rifotografata ha un'impronta simile
async function impronta(src) {
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const tela = document.createElement('canvas'); tela.width = 17; tela.height = 16;
    const g = tela.getContext('2d'); g.drawImage(img, 0, 0, 17, 16);
    const px = g.getImageData(0, 0, 17, 16).data;
    const luce = (x, y) => { const k = (y * 17 + x) * 4; return px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114; };
    let h = '';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x += 4) { let n = 0; for (let k = 0; k < 4; k++) n = (n << 1) | (luce(x + k, y) > luce(x + k + 1, y)); h += n.toString(16); }
    return h.length === 64 ? h : null;
  } catch { return null; }
}

// stato di una pagina, a parole e colore
const STATI_PAGINA = { 'da leggere': ['In lettura', 'grigio'], 'da controllare': ['Da controllare', 'arancio'], letto: ['Caricata', 'verde'], doppione: ['Già caricata', 'grigio'], scartato: ['Scartata', 'grigio'] };
function StatoPagina({ v }) {
  const [testo, colore] = STATI_PAGINA[v.stato] || [v.stato, 'grigio'];
  const quante = v.stato === 'letto' && v.caricate ? `, ${v.caricate === 1 ? '1 offerta' : `${v.caricate} offerte`}` : v.stato === 'da controllare' && v.dubbie ? `, ${v.dubbie === 1 ? '1 riga' : `${v.dubbie} righe`}` : '';
  return <span className={`stato-pagina ${colore}`}>{v.stato === 'letto' ? '✓ ' : ''}{testo}{quante}</span>;
}

// la foto a tutto schermo (si chiude toccando o con Esc)
function FotoGrande({ src, onChiudi }) {
  useEffect(() => { const esc = (e) => { if (e.key === 'Escape') onChiudi(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onChiudi]);
  if (!src) return null;
  return <div className="foto-grande" role="dialog" aria-modal="true" aria-label="Pagina del volantino" onClick={onChiudi}>
    <button type="button" className="b tondo" onClick={onChiudi} aria-label="Chiudi"><Icona n="chiudi" /></button>
    <img src={src} alt="Pagina del volantino" />
  </div>;
}

// miniatura che si tocca per vederla grande (la foto si toglie quando le offerte scadono)
function Miniatura({ src, onApri, titolo = 'Ingrandisci la pagina' }) {
  if (!src) return <span className="mini-vuota" title="Foto tolta: offerte scadute">Foto tolta</span>;
  return <button type="button" className="mini" onClick={() => onApri(src)} aria-label={titolo}><img src={src} alt="" loading="lazy" /></button>;
}

// 0.98 (Nazario, 11/11): si lavora per VOLANTINO, non per pagina sciolta. Scegli il supermercato una volta, poi ogni foto
// entra nel volantino in corso, numerata, con lo stato aggiornato dal vivo. Se fai una pausa, qui trovi «Volantini in corso»
// e riprendi da dove eri. Le date valgono per tutto il volantino. «Ho finito» lo chiude; «È un volantino nuovo» ricomincia.
const quando = (iso) => { const d = new Date(`${iso.replace(' ', 'T')}Z`); const oggi = new Date(); const stesso = d.toDateString() === oggi.toDateString(); return `${stesso ? 'oggi' : d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })} alle ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`; };
function RigaRiepilogo({ r }) {
  const parti = [r.pagine === 1 ? '1 pagina' : `${r.pagine} pagine`, r.caricate ? (r.caricate === 1 ? '1 offerta entrata' : `${r.caricate} offerte entrate`) : '', r.dubbie ? (r.dubbie === 1 ? '1 riga da controllare' : `${r.dubbie} righe da controllare`) : '', r.inLettura ? `${r.inLettura} in lettura` : ''].filter(Boolean);
  return <span className="muto piccolo">{parti.join(' · ')}</span>;
}
export function MandaVolantino({ admin }) {
  const camera = useRef(null); const galleria = useRef(null);
  const [aperte, setAperte] = useState(null); const [r, setR] = useState(null); const [catena, setCatena] = useState(null);
  const [stato, setStato] = useState(''); const [ok, setOk] = useState(false); const [grande, setGrande] = useState(null); const [confronti, setConfronti] = useState([]);
  const [date, setDate] = useState(false); const [dal, setDal] = useState(''); const [al, setAl] = useState(''); const [fine, setFine] = useState(null); const [attesa, setAttesa] = useState(false);
  const caricaAperte = () => api('/api/raccolte').then(setAperte).catch(() => setAperte([]));
  useEffect(() => { caricaAperte(); }, []);
  const apri = async (rid) => { const x = await api(`/api/raccolte/${rid}`); setR(x); setCatena(x.catena_id); setDal(x.dal || ''); setAl(x.al || ''); setFine(null); setStato(''); setConfronti([]); };
  // scelto il supermercato: si apre (o si crea) il suo volantino in corso
  const scegli = async (cid, nuova = false) => {
    setCatena(cid); if (!cid) { setR(null); return; }
    try { const x = await api('/api/raccolte', { metodo: 'POST', corpo: { catena_id: cid, nuova } }); await apri(x.id); } catch (e) { setStato(e.message); }
  };
  // mentre ci sono pagine in lettura, il riquadro si aggiorna da solo
  useEffect(() => {
    if (!r || !r.inLettura || fine) return undefined;
    const t = setInterval(() => api(`/api/raccolte/${r.id}`).then(setR).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [r?.id, r?.inLettura, fine]); // eslint-disable-line
  const scelta = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = ''; if (!files.length || !r) return;
    setOk(false); setConfronti([]); setStato(files.length > 1 ? `Mando ${files.length} pagine…` : 'Mando la pagina…');
    let mandate = 0; const doppie = []; const coppie = []; let errore = '';
    for (const f of files) {
      try {
        const dati = await riduciFoto(f, 2000, 0.85);
        try { await api('/api/volantini', { metodo: 'POST', corpo: { dati, raccolta_id: r.id, phash: await impronta(dati) } }); mandate++; setStato(`Mandate ${mandate} su ${files.length}…`); }
        catch (x) { if (/c'è già|già stata mandata/.test(x.message || '')) { doppie.push(x.message); coppie.push({ mia: dati, sua: x.dati?.gia_foto || null }); } else { errore = x.message; break; } }
      } catch (x) { errore = x.message || 'Una foto non si apre'; break; }
    }
    setOk(mandate > 0); setConfronti(coppie);
    setStato([
      mandate ? `${mandate === 1 ? 'Pagina ricevuta' : `${mandate} pagine ricevute`}: ${mandate === 1 ? 'la leggo' : 'le leggo'} adesso. Puoi continuare a fotografare.` : '',
      doppie.length ? (doppie.length === 1 && files.length === 1 ? doppie[0] : `${doppie.length === 1 ? '1 pagina c\'era già' : `${doppie.length} pagine c'erano già`}: non l${doppie.length === 1 ? "'" : 'e '}ho rimandat${doppie.length === 1 ? 'a' : 'e'}.`) : '',
      errore,
    ].filter(Boolean).join(' '));
    try { setR(await api(`/api/raccolte/${r.id}`)); } catch { /* si aggiorna al prossimo giro */ }
  };
  const salvaDate = async () => { setAttesa(true); try { setR({ ...r, ...(await api(`/api/raccolte/${r.id}`, { metodo: 'PUT', corpo: { dal, al } })) }); setDate(false); setStato(''); } catch (e) { setStato(e.message); } finally { setAttesa(false); } };
  const chiudi = async () => { setAttesa(true); try { const x = await api(`/api/raccolte/${r.id}`, { metodo: 'PUT', corpo: { chiusa: true } }); setFine(x); setR({ ...r, ...x }); caricaAperte(); } catch (e) { setStato(e.message); } finally { setAttesa(false); } };
  const togli = async (p) => { if (!confirm(`Tolgo la pagina ${p.numero}? (sfocata, doppia, non è un volantino)`)) return; try { await api(`/api/volantini/${p.id}`, { metodo: 'DELETE' }); setR(await api(`/api/raccolte/${r.id}`)); } catch (e) { setStato(e.message); } };
  const altreAperte = (aperte || []).filter((x) => !r || x.id !== r.id);
  return <>
    <div className="intesta"><h1>Fotografa un volantino</h1><p>Una foto per pagina: le offerte, con il prezzo e fino a quando valgono, entrano nell'app per tutti.</p></div>
    {!r && aperte === null && <p className="muto">Carico…</p>}
    {!r && altreAperte.length > 0 && <section className="carta in-corso">
      <h2>Volantini in corso</h2>
      <p className="muto piccolo">Hai lasciato a metà? Riprendi da qui: le pagine già mandate ci sono tutte.</p>
      <ul className="elenco-raccolte">{altreAperte.map((x) => <li key={x.id}><div className="colonna" style={{ gap: 2, minWidth: 0 }}><b>{x.catena}</b><RigaRiepilogo r={x} /><span className="muto piccolo">ultima pagina {quando(x.ultima)}</span></div><button type="button" className="b pieno piccolo" onClick={() => apri(x.id)}>Continua</button></li>)}</ul>
    </section>}
    {!r && <section className="carta">
      <span className="nome-gruppo">{altreAperte.length ? 'Oppure un altro volantino: di che supermercato è?' : 'Di che supermercato è il volantino?'}</span>
      <ScegliCatena valore={catena} onScelta={(cid) => scegli(cid)} />
      {stato && <div className="avviso" role="status">{stato}</div>}
    </section>}
    {r && <section className="carta raccolta">
      <div className="riga fra"><h2>Volantino {r.catena}</h2><button type="button" className="link" onClick={() => { setR(null); setCatena(null); setFine(null); setStato(''); caricaAperte(); }}>Cambia supermercato</button></div>
      <p className="muto piccolo">Iniziato {quando(r.creata_il)}{r.utente ? ` da ${r.utente}` : ''}. {r.pagine ? <RigaRiepilogo r={r} /> : 'Ancora nessuna pagina.'}</p>
      {/* le date, una volta per tutto il volantino */}
      {!date && <p className="date-volantino">{r.al ? <>Offerte valide <b>dal {fData(r.dal || r.al)} al {fData(r.al)}</b> · <button type="button" className="link" onClick={() => setDate(true)}>cambia</button></>
        : <>Date delle offerte: <b>le leggo dalla copertina</b> (se non è chiaro, <button type="button" className="link" onClick={() => setDate(true)}>scrivile tu</button>)</>}</p>}
      {date && <div className="avviso colonna"><b>Fino a quando valgono le offerte?</b>
        <div className="griglia2"><label className="campo">dal<input type="date" value={dal} onChange={(e) => setDal(e.target.value)} /></label><label className="campo">al<input type="date" value={al} onChange={(e) => setAl(e.target.value)} /></label></div>
        <div className="riga"><button type="button" className="b pieno" disabled={attesa || !al} onClick={salvaDate}>Salva le date</button><button type="button" className="link" onClick={() => setDate(false)}>Annulla</button></div></div>}
      {!fine && <div className="due-vie">
        <button type="button" className="b pieno grande" onClick={() => camera.current?.click()}><Icona n="foto" /> {r.pagine ? `Fotografa la pagina ${r.pagine + 1}` : 'Fotografa la prima pagina'}</button>
        <button type="button" className="b contorno viola" onClick={() => galleria.current?.click()}><Icona n="galleria" /> Scegli dalle foto</button>
        <p className="muto piccolo">Una foto per pagina, dritta e con buona luce. Dalle foto puoi sceglierne più di una insieme (anche gli screenshot del volantino online).</p>
      </div>}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={scelta} />
      <input ref={galleria} type="file" accept="image/*" multiple hidden onChange={scelta} />
      {stato && <div className={ok ? 'ok' : 'avviso'} role="status">{stato}</div>}
      {confronti.length > 0 && <div className="confronti">
        <p className="muto piccolo">Tocca una foto per vederla grande. Se non è la stessa pagina, scrivici dal menu Altro.</p>
        {confronti.map((c, i) => <div key={i} className="confronto">
          <figure><Miniatura src={c.mia} onApri={setGrande} titolo="Ingrandisci la tua foto" /><figcaption>La tua foto</figcaption></figure>
          <figure><Miniatura src={c.sua} onApri={setGrande} titolo="Ingrandisci la pagina già mandata" /><figcaption>Quella già mandata</figcaption></figure>
        </div>)}
      </div>}
      {r.elenco?.length > 0 && <div className="pagine-gia">
        <span className="nome-gruppo">Le pagine di questo volantino</span>
        <ul>{r.elenco.map((p) => <li key={p.id} className={p.stato === 'scartato' ? 'spenta' : ''}><span className="numero-pagina">{p.numero}</span><Miniatura src={p.foto} onApri={setGrande} /><StatoPagina v={p} />
          {p.stato !== 'scartato' && !(p.stato === 'letto' && p.caricate) && <button type="button" className="link piccolo" onClick={() => togli(p)}>Togli</button>}</li>)}</ul>
      </div>}
      {fine ? <div className="ok colonna"><b>Volantino {r.catena} chiuso.</b><span>{fine.caricate ? (fine.caricate === 1 ? '1 offerta è entrata nell\'app' : `${fine.caricate} offerte sono entrate nell'app`) : 'Nessuna offerta entrata per ora'}{fine.dubbie ? (fine.dubbie === 1 ? ', 1 riga aspetta il controllo di chi gestisce' : `, ${fine.dubbie} righe aspettano il controllo di chi gestisce`) : ''}{fine.inLettura ? `, ${fine.inLettura} pagine ancora in lettura (entrano da sole)` : ''}.</span>
        {admin && fine.dubbie > 0 && <a className="b pieno" href={`#altro/volantini/${r.id}`}>{fine.dubbie === 1 ? 'Controlla la riga adesso' : `Controlla le ${fine.dubbie} righe adesso`}</a>}
        <button type="button" className="b" onClick={() => { setR(null); setCatena(null); setFine(null); setStato(''); caricaAperte(); }}>Un altro volantino</button></div>
        : r.pagine > 0 && <div className="colonna chiusura">
          <button type="button" className="b pieno-verde grande" disabled={attesa} onClick={chiudi}>Ho finito con questo volantino</button>
          {admin && r.dubbie > 0 && <a className="b contorno viola" href={`#altro/volantini/${r.id}`}>{r.dubbie === 1 ? 'Controlla la riga dubbia' : `Controlla le ${r.dubbie} righe dubbie`}</a>}
          <button type="button" className="link" onClick={() => { if (confirm(`Chiudo il volantino ${r.catena} in corso e ne apro uno nuovo?`)) scegli(r.catena_id, true); }}>È un volantino nuovo di {r.catena}: ricomincio da capo</button>
        </div>}
      <FotoGrande src={grande} onChiudi={() => setGrande(null)} />
    </section>}
  </>;
}

// per chi gestisce: i volantini (raccolte), uno per supermercato e periodo; dentro, il controllo di tutte le righe dubbie in una volta
export function GestioneVolantini({ raccoltaId = null }) {
  const l = useDati('/api/volantini'); const [aperto, setAperto] = useState(null); const [grande, setGrande] = useState(null);
  const [raccolta, setRaccolta] = useState(raccoltaId ? Number(raccoltaId) : null);
  useEffect(() => { setRaccolta(raccoltaId ? Number(raccoltaId) : null); }, [raccoltaId]);
  if (l.errore) return <div className="errore">{l.errore}</div>;
  if (!l.dati) return <p className="muto">Carico…</p>;
  const d = l.dati;
  if (raccolta) return <ControlloRaccolta id={raccolta} attivo={d.attivo} onChiudi={() => { setRaccolta(null); history.replaceState(null, '', '#altro/volantini'); l.ricarica(); }} />;
  if (aperto) return <LetturaVolantino id={aperto} onChiudi={() => { setAperto(null); l.ricarica(); }} />;
  const sciolte = d.lista.filter((v) => !v.raccolta_id);
  const pagina = (v) => <li key={v.id} className={`vol-${v.stato.replace(' ', '-')}`}>
    <Miniatura src={v.foto} onApri={setGrande} />
    <div className="colonna" style={{ gap: 4 }}><b>{v.catena || 'Supermercato da indicare'}{v.dal && v.al ? <span className="muto piccolo"> · {dataIt(v.dal)}–{dataIt(v.al)}</span> : null}</b>
      <span className="muto piccolo">{v.creato_il.slice(8, 10)}/{v.creato_il.slice(5, 7)} · da {v.nome || '—'}{v.nota ? ` · ${v.nota}` : ''}</span>
      <StatoPagina v={v} />
      <div className="riga" style={{ gap: 8 }}>
        {v.stato === 'da controllare' && <button type="button" className="b pieno piccolo" onClick={() => setAperto(v.id)}>Controlla {v.dubbie ? (v.dubbie === 1 ? '1 riga' : `${v.dubbie} righe`) : ''}</button>}
        {v.stato === 'da leggere' && <button type="button" className="b pieno piccolo" disabled={!d.attivo && !v.letto} onClick={() => setAperto(v.id)}>{v.letto ? 'Controlla' : 'Leggi'}</button>}
        {(v.stato === 'letto' || v.stato === 'doppione') && <button type="button" className="link" onClick={() => setAperto(v.id)}>Vedi</button>}
        {(v.stato === 'da leggere' || v.stato === 'da controllare') && <button type="button" className="b piccolo" onClick={async () => { await api(`/api/volantini/${v.id}`, { metodo: 'PUT', corpo: { stato: 'scartato' } }); l.ricarica(); }}>Scarta</button>}
      </div></div>
  </li>;
  const daFare = (r) => r.dubbie > 0 || r.inLettura > 0;
  return <>
    <div className="intesta"><h1>Volantini</h1><p>Un volantino per supermercato e periodo. Claude legge le pagine appena arrivano: le offerte sicure entrano da sole, a te restano le righe dubbie, tutte insieme.</p></div>
    {!d.attivo && <div className="avviso">Per leggere i volantini manca la chiave di Claude: va scritta nel file .env del server come <b>ANTHROPIC_API_KEY</b>, poi si riavvia l'app.</div>}
    {d.attivo && <p className="muto piccolo">Questo mese: {d.spesa.n} {d.spesa.n === 1 ? 'lettura' : 'letture'}, circa {euro(d.spesa.euro)} (modello {d.modello}). Oltre {euro(d.tetto)} al mese le pagine aspettano te (CLAUDE_TETTO_MESE nel .env).</p>}
    <a className="b contorno viola" href="#volantino">Fotografa un volantino</a>
    {!d.raccolte.length && !sciolte.length && <p className="muto">Nessun volantino ancora.</p>}
    {d.raccolte.length > 0 && <ul className="elenco-raccolte gestione">{d.raccolte.map((r) => <li key={r.id} className={r.chiusa_il ? 'chiusa' : ''}>
      <div className="colonna" style={{ gap: 2, minWidth: 0 }}>
        <b>{r.catena}{r.al ? <span className="muto piccolo"> · {dataIt(r.dal || r.al)}–{dataIt(r.al)}</span> : <span className="muto piccolo"> · date da leggere</span>}{r.chiusa_il ? null : <span className="pill bio"> in corso</span>}</b>
        <RigaRiepilogo r={r} />
        <span className="muto piccolo">ultima pagina {quando(r.ultima)}</span>
      </div>
      <button type="button" className={`b piccolo ${daFare(r) ? 'pieno' : ''}`} onClick={() => setRaccolta(r.id)}>{r.dubbie ? `Controlla ${r.dubbie}` : r.inLettura ? 'Apri' : 'Vedi'}</button>
    </li>)}</ul>}
    {sciolte.length > 0 && <details className="altre"><summary>Pagine sciolte, senza volantino ({sciolte.length})</summary><ul className="volantini">{sciolte.map(pagina)}</ul></details>}
    <FotoGrande src={grande} onChiudi={() => setGrande(null)} />
  </>;
}

// 0.98: il controllo di un volantino intero: tutte le righe dubbie di tutte le pagine, supermercato fisso, date una volta, un solo «Carica»
function ControlloRaccolta({ id, attivo, onChiudi }) {
  const r = useDati(`/api/raccolte/${id}`); const voci = useDati('/api/voci');
  const [righe, setRighe] = useState([]); const [dal, setDal] = useState(''); const [al, setAl] = useState(''); const [grande, setGrande] = useState(null);
  const [attesa, setAttesa] = useState(false); const [err, setErr] = useState(''); const [esito, setEsito] = useState(null); const [pagine, setPagine] = useState(false);
  useEffect(() => {
    if (!r.dati) return;
    setDal(r.dati.dal || ''); setAl(r.dati.al || '');
    const tutte = [];
    for (const p of r.dati.elenco || []) { if (p.stato === 'scartato' || !p.lettura) continue; (p.lettura.righe || []).forEach((x, k) => { if (!x.fatto) tutte.push({ ...x, indice: k, volantino_id: p.id, numero: p.numero, foto: p.foto, usa: !!(x.prodotto_id || x.voce_id || x.voce_nuova) }); }); }
    setRighe(tutte);
  }, [r.dati]);
  // mentre ci sono pagine in lettura, si aggiorna da solo
  useEffect(() => { if (!r.dati?.inLettura) return undefined; const t = setInterval(() => r.ricarica(), 5000); return () => clearInterval(t); }, [r.dati?.inLettura]); // eslint-disable-line
  if (r.errore) return <div className="errore">{r.errore}</div>;
  if (!r.dati) return <p className="muto">Carico…</p>;
  const d = r.dati;
  const cambia = (i, x) => setRighe((rs) => rs.map((q, k) => (k === i ? { ...q, ...x } : q)));
  const n = righe.filter((q) => q.usa).length;
  const carica = async (scartaResto = false) => {
    setErr(''); setAttesa(true);
    try { const x = await api(`/api/raccolte/${id}/carica`, { metodo: 'POST', corpo: { valido_dal: dal, valido_al: al, righe: scartaResto ? [] : righe.filter((q) => q.usa).map(({ foto, ...q }) => q), scarta_resto: scartaResto } }); setEsito(x); await r.ricarica(); }
    catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  const azionePagina = async (p, cosa) => {
    setErr(''); setAttesa(true);
    try {
      if (cosa === 'scarta') await api(`/api/volantini/${p.id}`, { metodo: 'PUT', corpo: { stato: 'scartato' } });
      else { await api(`/api/volantini/${p.id}/leggi`, { metodo: 'POST', corpo: cosa === 'preciso' ? { preciso: true } : {} }); await api(`/api/volantini/${p.id}/elabora`, { metodo: 'POST', corpo: {} }); }
      await r.ricarica();
    } catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  const perPagina = []; for (const q of righe) { let g = perPagina.find((x) => x.volantino_id === q.volantino_id); if (!g) { g = { volantino_id: q.volantino_id, numero: q.numero, foto: q.foto, righe: [] }; perPagina.push(g); } g.righe.push(q); }
  const daLeggere = (d.elenco || []).filter((p) => p.stato === 'da leggere' && !p.lettura);
  return <section className="carta lettura">
    <div className="riga fra"><h2>Volantino {d.catena}</h2><button type="button" className="b tondo" onClick={onChiudi} aria-label="Chiudi"><Icona n="chiudi" /></button></div>
    <p className="muto piccolo">Iniziato {quando(d.creata_il)} · <RigaRiepilogo r={d} />{d.chiusa_il ? ' · chiuso' : ' · in corso'}</p>
    <div className="griglia2">
      <label className="campo">Offerte valide dal<input type="date" value={dal} onChange={(e) => setDal(e.target.value)} /></label>
      <label className="campo">al<input type="date" value={al} onChange={(e) => setAl(e.target.value)} /></label>
    </div>
    {!al && <p className="avviso">Mancano le date: senza la data di fine le offerte non entrano. Guardale sulla copertina (prima pagina) e scrivile qui: valgono per tutto il volantino.</p>}
    {al && al !== (d.al || '') && <button type="button" className="b piccolo" disabled={attesa} onClick={async () => { setAttesa(true); try { await api(`/api/raccolte/${id}`, { metodo: 'PUT', corpo: { dal, al } }); await r.ricarica(); } catch (e) { setErr(e.message); } finally { setAttesa(false); } }}>Salva le date (le pagine ferme si caricano da sole)</button>}
    <details className="altre" open={pagine} onToggle={(e) => setPagine(e.target.open)}><summary>Le {d.pagine} pagine</summary>
      <ul className="pagine-gia">{(d.elenco || []).map((p) => <li key={p.id} className={p.stato === 'scartato' ? 'spenta' : ''}><span className="numero-pagina">{p.numero}</span><Miniatura src={p.foto} onApri={setGrande} /><StatoPagina v={p} />
        {p.nota && <span className="muto piccolo">{p.nota}</span>}
        {p.stato !== 'scartato' && <span className="riga" style={{ gap: 6, flexWrap: 'wrap' }}>
          {attivo && <button type="button" className="link piccolo" disabled={attesa} onClick={() => azionePagina(p, 'leggi')}>{p.lettura ? 'Rileggi' : 'Leggi'}</button>}
          {attivo && p.lettura && <button type="button" className="link piccolo" disabled={attesa} title="Costa circa 20 volte di più" onClick={() => azionePagina(p, 'preciso')}>Preciso</button>}
          {p.stato !== 'letto' && <button type="button" className="link piccolo" disabled={attesa} onClick={() => azionePagina(p, 'scarta')}>Scarta</button>}
        </span>}</li>)}</ul>
    </details>
    {daLeggere.length > 0 && <p className="avviso">{daLeggere.length === 1 ? '1 pagina non è ancora stata letta' : `${daLeggere.length} pagine non sono ancora state lette`}{attivo ? ': tocca «Leggi» accanto alla pagina (sopra, in «Le pagine»)' : ' e la lettura automatica non è attiva'}.</p>}
    {err && <div className="errore">{err}</div>}
    {esito && <div className="ok">Fatto: {esito.prezzi} offerte caricate{esito.nuovi?.length ? `, ${esito.nuovi.length} prodotti nuovi` : ''}{esito.gia ? `, ${esito.gia} già presenti (non ripetute)` : ''}.</div>}
    {righe.length ? <>
      <p className="muto piccolo">Controlla prezzi e prodotti. ✓ verde: prodotto già nell'app. Giallo: prodotto nuovo, si crea sotto la voce indicata. Togli la spunta a quello che non va caricato.</p>
      {perPagina.map((g) => <div key={g.volantino_id} className="gruppo-pagina">
        <div className="riga" style={{ gap: 10, alignItems: 'center' }}><Miniatura src={g.foto} onApri={setGrande} /><b>Pagina {g.numero}</b><span className="muto piccolo">{g.righe.length === 1 ? '1 riga' : `${g.righe.length} righe`}</span></div>
        <ul className="righe-lettura">{g.righe.map((q) => { const i = righe.indexOf(q); return <li key={`${q.volantino_id}-${q.indice}`} className={q.usa ? '' : 'spenta'}>
          <label className="riga-lettura"><input type="checkbox" checked={q.usa} onChange={(e) => cambia(i, { usa: e.target.checked })} />
            <div className="colonna" style={{ gap: 4, minWidth: 0 }}>
              <b>{q.nome}</b>
              <span className="muto piccolo">{[fmt(q), q.bio ? 'bio' : '', q.italiano ? 'italiano' : '', q.prezzo_pieno ? `prima ${euro(q.prezzo_pieno)}` : '', q.condizioni].filter(Boolean).join(' · ')}</span>
              <span className="euro-campo piccolo-campo"><input inputMode="decimal" value={String(q.prezzo).replace('.', ',')} onChange={(e) => cambia(i, { prezzo: e.target.value })} aria-label={`Prezzo di ${q.nome}`} /><b>€</b></span>
              {q.prodotto_id ? <span className="pill bio">✓ {q.prodotto}</span>
                : q.voce_id ? <span className="pill vecchio">Nuovo prodotto in «{q.voce}»</span>
                  : q.voce_nuova ? <span className="pill vecchio">Nuovo prodotto e nuova voce «{q.voce_nuova.nome}»</span>
                    : <span className="pill scaduto">Scegli la voce</span>}
              <CambiaAbbinamento r={q} voci={voci} onScelto={(x) => cambia(i, { ...x, usa: true })} />
            </div></label>
        </li>; })}</ul>
      </div>)}
      <div className="colonna">
        <button type="button" className="b pieno grande" disabled={attesa || !al || !n} onClick={() => carica(false)}>Carica {n} {n === 1 ? 'offerta' : 'offerte'}</button>
        {righe.length > n && <button type="button" className="link" disabled={attesa} onClick={() => { if (confirm(`Le ${righe.length - n} righe senza spunta non entrano e non tornano più da controllare. Confermi?`)) carica(true); }}>Le righe senza spunta non servono: segna il volantino come controllato</button>}
      </div>
    </> : <p className="ok">Niente da controllare in questo volantino{d.inLettura ? `: ${d.inLettura === 1 ? '1 pagina' : `${d.inLettura} pagine`} in lettura, le offerte sicure entrano da sole` : ''}.</p>}
    <FotoGrande src={grande} onChiudi={() => setGrande(null)} />
  </section>;
}

function LetturaVolantino({ id, onChiudi }) {
  const v = useDati(`/api/volantini/${id}`); const voci = useDati('/api/voci');
  const [l, setL] = useState(null); const [righe, setRighe] = useState([]); const [catena, setCatena] = useState(null); const [grande, setGrande] = useState(null);
  const [dal, setDal] = useState(''); const [al, setAl] = useState(''); const [attesa, setAttesa] = useState(false); const [err, setErr] = useState(''); const [esito, setEsito] = useState(null);
  // preciso: rilegge con il modello più caro (per le pagine difficili)
  const leggi = async (preciso = false) => { setAttesa(true); setErr(''); try { setL(await api(`/api/volantini/${id}/leggi`, { metodo: 'POST', corpo: preciso === true ? { preciso: true } : {} })); } catch (e) { setErr(e.message); } finally { setAttesa(false); } };
  useEffect(() => { if (!v.dati) return; if (v.dati.lettura) setL(v.dati.lettura); else leggi(); }, [v.dati]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!l) return; setRighe(l.righe.map((r) => ({ ...r, usa: !r.fatto && !!(r.prodotto_id || r.voce_id || r.voce_nuova) }))); setCatena(l.catena_id); setDal(l.valido_dal || ''); setAl(l.valido_al || ''); }, [l]);
  const cambia = (i, x) => setRighe((rs) => rs.map((r, k) => (k === i ? { ...r, ...x } : r)));
  const n = righe.filter((r) => r.usa).length;
  const carica = async () => {
    setErr(''); setAttesa(true);
    try { setEsito(await api(`/api/volantini/${id}/carica`, { metodo: 'POST', corpo: { catena_id: catena, valido_dal: dal, valido_al: al, righe: righe.filter((r) => r.usa) } })); }
    catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  return <section className="carta lettura">
    <div className="riga fra"><h2>Lettura del volantino</h2><button type="button" className="b tondo" onClick={onChiudi} aria-label="Chiudi"><Icona n="chiudi" /></button></div>
    {v.dati?.foto ? <button type="button" className="mini" onClick={() => setGrande(v.dati.foto)} aria-label="Ingrandisci la pagina"><img className="foto-lettura" src={v.dati.foto} alt="Pagina del volantino" /></button>
      : v.dati && <p className="muto">La foto di questa pagina è stata tolta: le offerte sono scadute.</p>}
    <FotoGrande src={grande} onChiudi={() => setGrande(null)} />
    {attesa && !l && <p className="muto" role="status">Claude sta leggendo la pagina… di solito meno di un minuto.</p>}
    {err && <div className="errore">{err}</div>}
    {esito ? <div className="ok">Fatto: {esito.prezzi} offerte caricate{esito.nuovi.length ? `, ${esito.nuovi.length} prodotti nuovi` : ''}{esito.gia ? `, ${esito.gia} già presenti (non ripetute)` : ''}. Chi ha questi prodotti tra i preferiti riceve l'avviso.</div> : l && <>
      <p className="muto piccolo">{l.righe.length} offerte lette{l.supermercato ? ` · sul volantino: «${l.supermercato}»` : ''}{l.uso ? ` · costo circa ${euro(l.uso.euro)}` : ''}</p>
      {l.gia && <div className="avviso"><b>Attenzione: per {l.catena} ci sono già {l.gia.offerte} offerte caricate</b>{l.gia.dal ? ` (dal ${fData(l.gia.dal)} al ${fData(l.gia.al)})` : ''}. Se è lo stesso volantino, le offerte uguali non vengono ripetute: entrano solo quelle nuove.</div>}
      <div className="gruppo"><span className="nome-gruppo">Supermercato</span><ScegliCatena valore={catena} onScelta={setCatena} /></div>
      <div className="griglia2">
        <label className="campo">Offerte valide dal<input type="date" value={dal} onChange={(e) => setDal(e.target.value)} /></label>
        <label className="campo">al<input type="date" value={al} onChange={(e) => setAl(e.target.value)} /></label>
      </div>
      <p className="muto piccolo">Controlla prezzi e prodotti. ✓ verde: prodotto già nell'app. Giallo: prodotto nuovo, si crea sotto la voce indicata.</p>
      {righe.some((r) => r.fatto) && <p className="ok">{righe.filter((r) => r.fatto === 'caricata').length} offerte già caricate da sole{righe.some((r) => r.fatto === 'gia') ? `, ${righe.filter((r) => r.fatto === 'gia').length} c'erano già` : ''}: qui sotto restano da controllare solo le altre.</p>}
      <ul className="righe-lettura">{righe.map((r, i) => (r.fatto ? <li key={i} className="spenta fatta">
        <div className="riga-lettura"><span className="pill bio">{r.fatto === 'caricata' ? '✓ Caricata' : "C'era già"}</span>
          <div className="colonna" style={{ gap: 2, minWidth: 0 }}><b>{r.nome}</b><span className="muto piccolo">{euro(Number(r.prezzo))}{r.prodotto ? ` · ${r.prodotto}` : ''}</span></div></div>
      </li> : <li key={i} className={r.usa ? '' : 'spenta'}>
        <label className="riga-lettura"><input type="checkbox" checked={r.usa} onChange={(e) => cambia(i, { usa: e.target.checked })} />
          <div className="colonna" style={{ gap: 4, minWidth: 0 }}>
            <b>{r.nome}</b>
            <span className="muto piccolo">{[fmt(r), r.bio ? 'bio' : '', r.italiano ? 'italiano' : '', r.prezzo_pieno ? `prima ${euro(r.prezzo_pieno)}` : '', r.condizioni].filter(Boolean).join(' · ')}</span>
            <span className="euro-campo piccolo-campo"><input inputMode="decimal" value={String(r.prezzo).replace('.', ',')} onChange={(e) => cambia(i, { prezzo: e.target.value })} aria-label={`Prezzo di ${r.nome}`} /><b>€</b></span>
            {r.prodotto_id ? <span className="pill bio">✓ {r.prodotto}</span>
              : r.voce_id ? <span className="pill vecchio">Nuovo prodotto in «{r.voce}»</span>
                : r.voce_nuova ? <span className="pill vecchio">Nuovo prodotto e nuova voce «{r.voce_nuova.nome}»</span>
                  : <span className="pill scaduto">Scegli la voce</span>}
            <CambiaAbbinamento r={r} voci={voci} onScelto={(x) => cambia(i, { ...x, usa: true })} />
          </div></label>
      </li>))}</ul>
      <div className="riga"><button type="button" className="b pieno grande" disabled={attesa || !catena || !al || !n} onClick={carica}>Carica {n} {n === 1 ? 'offerta' : 'offerte'}</button>
        <button type="button" className="b" disabled={attesa} onClick={() => leggi(false)}>Rileggi</button>
        <button type="button" className="b" disabled={attesa} onClick={() => leggi(true)} title="Per le pagine difficili: costa circa 20 volte di più">Rileggi con il modello più preciso</button></div>
      {!al && <p className="avviso">Manca la data di fine delle offerte: scrivila prima di caricare.</p>}
    </>}
  </section>;
}

// cambia l'abbinamento: un prodotto già nell'app, oppure un prodotto nuovo sotto una voce
function CambiaAbbinamento({ r, voci, onScelto }) {
  const [apri, setApri] = useState(false); const [q, setQ] = useState(''); const [ris, setRis] = useState([]); const [voce, setVoce] = useState(false);
  useEffect(() => { if (!apri || q.trim().length < 2) { setRis([]); return undefined; } const t = setTimeout(() => api(`/api/prodotti?q=${encodeURIComponent(q.trim())}`).then((x) => setRis(x.slice(0, 8))).catch(() => {}), 250); return () => clearTimeout(t); }, [q, apri]);
  if (!apri) return <button type="button" className="link" onClick={(e) => { e.preventDefault(); setApri(true); setQ(r.nome.split(' ')[0]); }}>Cambia</button>;
  return <div className="abbina" onClick={(e) => e.preventDefault()}>
    {!voce ? <>
      <input className="in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un prodotto già nell'app" autoFocus />
      {ris.length > 0 && <div className="suggerimenti">{ris.map((p) => <button type="button" key={p.id} onClick={() => { onScelto({ prodotto_id: p.id, prodotto: p.nome, voce_id: p.voce_id, voce: p.voce, voce_nuova: null }); setApri(false); }}>{p.nome} <span className="muto piccolo">({p.voce})</span></button>)}</div>}
      <div className="riga"><button type="button" className="link" onClick={() => setVoce(true)}>È un prodotto nuovo: scegli la voce</button><button type="button" className="link" onClick={() => setApri(false)}>Annulla</button></div>
    </> : <>
      <CercaVoce etichetta="La voce (es. Biscotti, Latte)" voci={voci.dati} ricaricaVoci={voci.ricarica} onScelta={(v) => { onScelto({ prodotto_id: null, prodotto: null, voce_id: v.id, voce: v.nome, voce_nuova: null }); setApri(false); setVoce(false); }} />
      <button type="button" className="link" onClick={() => setVoce(false)}>Indietro</button>
    </>}
  </div>;
}
