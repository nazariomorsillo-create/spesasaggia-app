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

// per chi fa la spesa: manda le pagine del volantino (foto adesso o dalla galleria)
export function MandaVolantino({ admin }) {
  const camera = useRef(null); const galleria = useRef(null);
  const [catena, setCatena] = useState(null); const [stato, setStato] = useState(''); const [ok, setOk] = useState(false); const [ultimo, setUltimo] = useState(null);
  const [gia, setGia] = useState(null); const [forza, setForza] = useState(false); const [grande, setGrande] = useState(null); const [confronti, setConfronti] = useState([]);
  // le offerte e le pagine di quel supermercato già nell'app
  useEffect(() => { setGia(null); setForza(false); if (catena) api(`/api/volantini/catena/${catena}`).then(setGia).catch(() => {}); }, [catena]);
  const avviso = gia && (gia.offerte > 0 || gia.attesa > 0) && !forza;
  const scelta = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = ''; if (!files.length) return;
    setOk(false); setConfronti([]); setStato(files.length > 1 ? `Mando ${files.length} pagine…` : 'Mando la pagina…');
    try {
      let r = null; let mandate = 0; const doppie = []; const coppie = []; let errore = '';
      for (const f of files) {
        const dati = await riduciFoto(f, 2000, 0.85);
        try { r = await api('/api/volantini', { metodo: 'POST', corpo: { dati, catena_id: catena || undefined, phash: await impronta(dati) } }); mandate++; }
        catch (x) { if (/c'è già|già stata mandata/.test(x.message || '')) { doppie.push(x.message); coppie.push({ mia: dati, sua: x.dati?.gia_foto || null }); } else { errore = x.message; break; } }
      }
      setOk(mandate > 0); setUltimo(r); setConfronti(coppie);
      setStato([
        mandate ? `Grazie! ${mandate === 1 ? 'Ho ricevuto la pagina' : `Ho ricevuto ${mandate} pagine`}: la leggo adesso e le offerte sicure entrano subito nell'app.` : '',
        doppie.length ? (doppie.length === 1 && files.length === 1 ? doppie[0] : `${doppie.length === 1 ? '1 pagina c\'era già' : `${doppie.length} pagine c'erano già`}: non le ho rimandate.`) : '',
        errore,
      ].filter(Boolean).join(' '));
      if (catena) api(`/api/volantini/catena/${catena}`).then(setGia).catch(() => {});
    } catch (x) { setStato(x.message || 'Non sono riuscito a mandarla: riprova'); }
  };
  return <>
    <div className="intesta"><h1>Fotografa un volantino</h1><p>Fotografa le pagine del volantino del supermercato: le offerte, con il prezzo e fino a quando valgono, entrano nell'app per tutti.</p></div>
    <section className="carta">
      <span className="nome-gruppo">Di che supermercato è? (se lo sai)</span>
      <ScegliCatena valore={catena} onScelta={setCatena} />
      {avviso && <div className="avviso gia-volantino" role="status">
        {gia.offerte > 0 && <p><b>Le offerte {gia.catena} sono già nell'app</b>: {gia.offerte} prodotti in offerta{gia.dal ? ` dal ${fData(gia.dal)}` : ''}{gia.al ? ` al ${fData(gia.al)}` : ''}. Le trovi in «Offerte». Qui sotto vedi le pagine già mandate: fotografa solo quelle che mancano.</p>}
        {gia.attesa > 0 && <p>Qualcuno ha già mandato {gia.attesa === 1 ? '1 pagina' : `${gia.attesa} pagine`} del volantino {gia.catena}: le stiamo leggendo.</p>}
        <button type="button" className="b" onClick={() => setForza(true)}>Manca qualche pagina, o è un volantino nuovo: fotografo</button>
      </div>}
      {!avviso && <div className="due-vie">
        <button type="button" className="b pieno" onClick={() => camera.current?.click()}><Icona n="foto" /> Fotografa una pagina</button>
        <button type="button" className="b contorno viola" onClick={() => galleria.current?.click()}><Icona n="galleria" /> Scegli dalle foto</button>
        <p className="muto piccolo">Una foto per pagina, dritta e con buona luce. Dalle foto puoi sceglierne più di una insieme (anche gli screenshot del volantino online).</p>
      </div>}
      {gia?.pagine?.length > 0 && <div className="pagine-gia">
        <span className="nome-gruppo">Pagine {gia.catena} già mandate negli ultimi giorni</span>
        <p className="muto piccolo">Tocca una pagina per vederla grande.</p>
        <ul>{gia.pagine.map((p) => <li key={p.id}><Miniatura src={p.foto} onApri={setGrande} /><StatoPagina v={p} /></li>)}</ul>
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
      <FotoGrande src={grande} onChiudi={() => setGrande(null)} />
      {ok && admin && ultimo?.leggibile && <a className="b pieno" href="#altro/volantini">Leggili adesso</a>}
    </section>
  </>;
}

// per chi gestisce: l'elenco dei volantini e la lettura
export function GestioneVolantini() {
  const l = useDati('/api/volantini'); const [aperto, setAperto] = useState(null); const [grande, setGrande] = useState(null);
  if (l.errore) return <div className="errore">{l.errore}</div>;
  if (!l.dati) return <p className="muto">Carico…</p>;
  const d = l.dati;
  if (aperto) return <LetturaVolantino id={aperto} onChiudi={() => { setAperto(null); l.ricarica(); }} />;
  return <>
    <div className="intesta"><h1>Volantini</h1><p>Le pagine mandate da chi usa l'app. Claude le legge appena arrivano: le offerte sicure entrano da sole, a te restano solo le righe dubbie.</p></div>
    {!d.attivo && <div className="avviso">Per leggere i volantini manca la chiave di Claude: va scritta nel file .env del server come <b>ANTHROPIC_API_KEY</b>, poi si riavvia l'app.</div>}
    {d.attivo && <p className="muto piccolo">Le pagine si leggono da sole appena arrivano, con il modello economico ({d.modello}); tu controlli e carichi. Questo mese: {d.spesa.n} {d.spesa.n === 1 ? 'lettura' : 'letture'}, circa {euro(d.spesa.euro)} (stima). Oltre {euro(d.tetto)} al mese non si leggono più da sole (CLAUDE_TETTO_MESE nel .env).</p>}
    <a className="b contorno viola" href="#volantino">Fotografa un volantino</a>
    {!d.lista.length && <p className="muto">Nessun volantino ancora.</p>}
    {(() => {
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
      const daFare = d.lista.filter((v) => v.stato === 'da controllare' || v.stato === 'da leggere');
      const fatte = d.lista.filter((v) => !daFare.includes(v));
      return <>
        <h2 className="titoletto">Da controllare {daFare.length ? `(${daFare.length})` : ''}</h2>
        {daFare.length ? <ul className="volantini">{daFare.map(pagina)}</ul> : <p className="ok">Niente da controllare: le offerte sicure sono già entrate da sole.</p>}
        {fatte.length > 0 && <details className="altre"><summary>Pagine già fatte ({fatte.length})</summary><ul className="volantini">{fatte.map(pagina)}</ul></details>}
        <FotoGrande src={grande} onChiudi={() => setGrande(null)} />
      </>;
    })()}
  </>;
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
