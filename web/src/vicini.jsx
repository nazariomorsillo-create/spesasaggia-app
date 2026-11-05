// I supermercati veri intorno a casa, sulla mappa e in elenco: si toccano per metterli tra i propri.
// Alla prima apertura è il passo "Benvenuto": indirizzo di casa → scegli i supermercati → via alla lista.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, Icona, mem, num } from './base.jsx';
import { StatoOrari, OrariAperti } from './orari.jsx';

// nomi e indirizzi della mappa (da OpenStreetMap) entrano nella finestrella come testo, mai come codice
const testo = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const RAGGI = [5, 10, 20, 30, 40];
const colore = (mia) => (mia ? '#F26A0F' : '#2F8FE0');
const spilla = (n) => L.divIcon({ className: 'spilla', html: `<span class="spilla-punta" style="background:${colore(n.mia)}"></span><span class="spilla-nome" style="border-color:${colore(n.mia)}">${n.mia ? '★ ' : ''}${n.catena.replace(/</g, '')}</span>`, iconSize: [0, 0], iconAnchor: [0, 0] });
const casaIcona = L.divIcon({ className: 'spilla', html: '<span class="spilla-casa">🏠</span>', iconSize: [0, 0], iconAnchor: [0, 0] });

function Mappa({ dati, onScegli }) {
  const rif = useRef(null); const mappa = useRef(null); const strato = useRef(null); const scegli = useRef(onScegli);
  scegli.current = onScegli;
  useEffect(() => {
    if (!rif.current || mappa.current) return undefined;
    const m = L.map(rif.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, tap: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(m);
    strato.current = L.layerGroup().addTo(m); mappa.current = m;
    L.DomEvent.on(m.getContainer(), 'click', (e) => { const b = e.target.closest?.('[data-negozio]'); if (b) { e.preventDefault(); scegli.current(Number(b.dataset.negozio), b.dataset.mia === '1'); m.closePopup(); } });
    return () => { m.remove(); mappa.current = null; };
  }, []);
  useEffect(() => {
    const m = mappa.current; if (!m || !dati) return;
    strato.current.clearLayers();
    L.marker([dati.casa.lat, dati.casa.lng], { icon: casaIcona, interactive: false, zIndexOffset: 1000 }).addTo(strato.current);
    for (const n of dati.negozi) {
      L.marker([n.lat, n.lng], { icon: spilla(n) }).addTo(strato.current)
        .bindPopup(`<b>${testo(n.catena)}</b>${n.nome && n.nome.toLowerCase() !== n.catena.toLowerCase() ? `<br>${testo(n.nome)}` : ''}<br>${testo(n.indirizzo || 'indirizzo sulla mappa')}${n.citta ? `, ${testo(n.citta)}` : ''}<br>${num(n.km, 1)} km da casa<br><button type="button" class="b ${n.mia ? '' : 'pieno'} piccolo" data-negozio="${n.id}" data-mia="${n.mia ? 1 : 0}">${n.mia ? 'Togli dai miei' : '★ Aggiungi ai miei'}</button>`, { maxWidth: 260 });
    }
    const punti = [[dati.casa.lat, dati.casa.lng], ...dati.negozi.map((n) => [n.lat, n.lng])];
    m.fitBounds(L.latLngBounds(punti).pad(0.1), { maxZoom: 15 });
  }, [dati]);
  return <div ref={rif} className="mappa" role="img" aria-label="Mappa dei supermercati intorno a casa" />;
}

export function Vicini({ onCambiato, compatta = false, conOrari = false }) {
  const [raggio, setRaggio] = useState(() => mem.leggi('raggio', 10));
  const [dati, setDati] = useState(null); const [stato, setStato] = useState(''); const [err, setErr] = useState(''); const [tutti, setTutti] = useState(false);
  const [aperto, setAperto] = useState(null); // il negozio di cui si vedono gli orari
  const carica = async (r) => {
    setErr(''); setStato('Cerco i supermercati sulla mappa… può volerci qualche secondo');
    try { setDati(await api(`/api/negozi/vicini?raggio=${r}`)); } catch (e) { setErr(e.message); } finally { setStato(''); }
  };
  useEffect(() => { carica(raggio); }, [raggio]); // eslint-disable-line react-hooks/exhaustive-deps
  const cambiaRaggio = (r) => { mem.scrivi('raggio', r); setRaggio(r); setTutti(false); };
  const scegli = async (id, mia) => {
    setErr('');
    try { setDati(await api(`/api/negozi/${id}/mio${mia ? `?raggio=${raggio}` : ''}`, { metodo: mia ? 'DELETE' : 'POST', corpo: mia ? undefined : { raggio } })); onCambiato?.(); }
    catch (e) { setErr(e.message); }
  };
  const negozi = dati?.negozi || []; const miei = negozi.filter((n) => n.mia).length;
  // i tuoi si vedono sempre; gli altri, i più vicini
  const visibili = tutti ? negozi : negozi.filter((n, i) => n.mia || i < (compatta ? 8 : 25));
  const ricarica = async () => { try { setDati(await api(`/api/negozi/vicini?raggio=${raggio}`)); } catch { /* resta com'è */ } onCambiato?.(); };
  return <section className="carta vicini">
    <h2>Vicino a casa</h2>
    <p className="muto">Quanto lontano vuoi guardare?</p>
    <div className="scelte" role="group" aria-label="Raggio">{RAGGI.map((r) => <button type="button" key={r} aria-pressed={raggio === r} onClick={() => cambiaRaggio(r)}>{r} km</button>)}</div>
    {stato && <p className="muto" role="status">{stato}</p>}
    {err && <div className="errore">{err}</div>}
    {dati?.avviso && <div className="avviso">{dati.avviso}</div>}
    {dati && <Mappa dati={dati} onScegli={scegli} />}
    {dati && <p className="muto">{negozi.length ? `${negozi.length} supermercati entro ${raggio} km${miei ? `, ${miei} ${miei === 1 ? 'è tuo' : 'sono tuoi'}` : ''}. Tocca ` : `Nessun supermercato trovato entro ${raggio} km: prova ad allargare il raggio. Tocca `}<b>Aggiungi</b> su quelli dove vai.</p>}
    <ul className="vicini-elenco">{visibili.map((n) => <li key={n.id} className={`${n.mia ? 'mio' : ''}${aperto === n.id ? ' aperto' : ''}`}>
      <div className="vicino-riga">
        {conOrari && n.mia
          ? <button type="button" className="vicino-testo apribile" aria-expanded={aperto === n.id} onClick={() => setAperto(aperto === n.id ? null : n.id)}>
            <b>★ {n.catena}<span className="freccia" aria-hidden="true" /></b>
            <span><span className="km">{num(n.km, 1)} km</span> · {n.nome && n.nome.toLowerCase() !== n.catena.toLowerCase() ? `${n.nome}, ` : ''}{n.indirizzo || 'indirizzo sulla mappa'}{n.indirizzo && n.citta ? `, ${n.citta}` : ''}</span>
            <StatoOrari testo={n.orari} />
          </button>
          : <div className="vicino-testo"><b>{n.mia ? '★ ' : ''}{n.catena}</b><span><span className="km">{num(n.km, 1)} km</span> · {n.nome && n.nome.toLowerCase() !== n.catena.toLowerCase() ? `${n.nome}, ` : ''}{n.indirizzo || 'indirizzo sulla mappa'}{n.indirizzo && n.citta ? `, ${n.citta}` : ''}</span></div>}
        {n.mia ? <div className="colonna" style={{ gap: 6 }}><a className="b pieno-blu piccolo" href={`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${n.lat},${n.lng}`} target="_blank" rel="noopener">Portami qui</a><button type="button" className="b piccolo" onClick={() => scegli(n.id, true)}>Togli</button></div> : <button type="button" className="b pieno piccolo" onClick={() => scegli(n.id, false)}>Aggiungi</button>}
      </div>
      {conOrari && aperto === n.id && <OrariAperti n={n} onCambiato={ricarica} />}
    </li>)}</ul>
    {negozi.length > visibili.length && <button type="button" className="b" onClick={() => setTutti(true)}>Mostra tutti ({negozi.length})</button>}
    <AggiungiNegozio onAggiunto={() => { carica(raggio); onCambiato?.(); }} />
  </section>;
}

// Il negozio che sulla mappa non c'è (capita in paese): nome e indirizzo, e diventa subito tra i tuoi
function AggiungiNegozio({ onAggiunto }) {
  const [apri, setApri] = useState(false); const [nome, setNome] = useState(''); const [ind, setInd] = useState('');
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [attesa, setAttesa] = useState(false);
  const salva = async (e) => {
    e.preventDefault(); setErr(''); setOk(''); setAttesa(true);
    try {
      const r = await api('/api/negozi/nuovo', { metodo: 'POST', corpo: { nome: nome.trim(), indirizzo: ind.trim() } });
      setOk(`★ ${r.catena} è tra i tuoi supermercati`); setNome(''); setInd(''); setApri(false); onAggiunto?.();
    } catch (x) { setErr(x.message); } finally { setAttesa(false); }
  };
  return <div className="non-lo-trovi">
    {ok && <div className="ok" role="status">{ok}</div>}
    {apri ? <form className="carta colonna" onSubmit={salva}>
      <h3>Aggiungi il tuo supermercato</h3>
      <p className="muto">Capita con i negozi di paese: sulla mappa non ci sono. Scrivi come si chiama e dov'è, e lo metto tra i tuoi.</p>
      <label className="campo">Nome del supermercato<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Rossotono, Despar, Alimentari Rossi" autoFocus /></label>
      <label className="campo">Indirizzo<input value={ind} onChange={(e) => setInd(e.target.value)} placeholder="Via, numero e paese" autoComplete="street-address" /></label>
      {err && <div className="errore">{err}</div>}
      <div className="riga">
        <button className="b pieno" disabled={attesa || nome.trim().length < 2 || ind.trim().length < 5}>{attesa ? 'Cerco l\'indirizzo…' : 'Aggiungi ai miei'}</button>
        <button type="button" className="b" onClick={() => { setApri(false); setErr(''); }}>Annulla</button>
      </div>
    </form>
      : <button type="button" className="b contorno" onClick={() => setApri(true)}><Icona n="mappa" /> Non trovi il tuo supermercato? Aggiungilo tu</button>}
  </div>;
}

// Prima apertura: casa, poi i supermercati vicini
export function Benvenuto({ stato, ricaricaStato, onFine }) {
  const [ind, setInd] = useState(''); const [err, setErr] = useState(''); const [attesa, setAttesa] = useState(false);
  const casa = stato.famiglia?.casa;
  const salvaCasa = async (e) => {
    e.preventDefault(); setErr(''); setAttesa(true);
    try { await api('/api/famiglia/casa', { metodo: 'PUT', corpo: { indirizzo: ind.trim() } }); await ricaricaStato(); } catch (x) { setErr(x.message); } finally { setAttesa(false); }
  };
  const fine = () => { mem.scrivi('benvenuto-saltato', true); onFine?.(); location.hash = '#lista'; ricaricaStato(); };
  return <>
    <div className="intesta"><h1>Benvenuto, {stato.utente.nome}</h1><p>{casa ? 'Scegli i supermercati dove fai la spesa.' : 'Due cose veloci e poi si parte.'}</p></div>
    {!casa && <form className="carta" onSubmit={salvaCasa}>
      <h2>1. Dove abiti?</h2>
      <p className="muto">Serve per trovare i supermercati vicini e per il giro della spesa. Lo vedete solo tu e la tua famiglia.</p>
      <label className="campo">Via, numero e città<input className="grosso" value={ind} onChange={(e) => setInd(e.target.value)} placeholder="Via Bologna 10, Ferrara" autoComplete="street-address" autoFocus /></label>
      {err && <div className="errore">{err}</div>}
      <button className="b pieno grande" disabled={attesa || ind.trim().length < 5}>{attesa ? 'Cerco l\'indirizzo…' : 'Avanti'}</button>
    </form>}
    {casa && <>
      <p className="muto">2. Tocca <b>Aggiungi</b> sui supermercati dove vai di solito. Potrai sempre cambiarli in Altro → I miei supermercati.</p>
      <Vicini onCambiato={ricaricaStato} />
      <button type="button" className="b pieno grande" onClick={fine}><Icona n="spunta" /> Ho scelto, vai alla lista</button>
    </>}
    <button type="button" className="link" onClick={fine}>Più tardi</button>
  </>;
}
