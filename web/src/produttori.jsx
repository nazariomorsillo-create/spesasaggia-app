// Produttori locali: li vedi, ordini, ritiri da loro e paghi lì. Il produttore gestisce i suoi prodotti e gli ordini.
import { useState } from 'react';
import { api, useDati, euro, num, data as fData, Icona, Cartellino, ScattaFoto } from './base.jsx';
import { CercaVoce } from './gestione.jsx';

const STATO = { nuovo: ['In attesa di conferma', 'giallo'], confermato: ['Confermato', 'verdino'], pronto: ['Pronto da ritirare', 'verde'], ritirato: ['Ritirato', 'ignoto'], annullato: ['Annullato', 'rosso'] };
const unitaTesto = (u) => (u === 'pz' ? 'pezzo' : u);
const quanto = (q, u) => (u === 'pz' ? `${num(q, 0)} ${q === 1 ? 'pezzo' : 'pezzi'}` : `${num(q, 2)} ${u}`);

export function Produttori() {
  const l = useDati('/api/produttori');
  if (l.errore) return <div className="errore">{l.errore}</div>;
  if (!l.dati) return <p className="muto">Carico…</p>;
  return <>
    <div className="intesta"><h1>Produttori locali</h1><p>Ordini qui, ritiri da loro e paghi lì. Prodotti freschi, prezzo del produttore.</p></div>
    {!l.dati.length && <div className="vuota"><p>Ancora nessun produttore nella tua zona.</p><p>Conosci un contadino, un caseificio, un apicoltore? Segnalalo qui sotto: lo contattiamo noi.</p></div>}
    <nav className="menu" aria-label="Produttori">{l.dati.map((p) => <a key={p.id} href={`#produttore/${p.id}`}><b>{p.nome}</b><span>{[p.km != null ? `${num(p.km, 1)} km` : p.citta, p.offerte === 1 ? '1 prodotto' : `${p.offerte} prodotti`, p.orari].filter(Boolean).join(' · ')}</span></a>)}</nav>
    <a className="b" href="#ordini">I miei ordini</a>
    <Segnala />
  </>;
}
// chi usa l'app segnala un produttore che conosce: arriva a chi gestisce, che lo contatta
function Segnala() {
  const [v, setV] = useState({ nome: '', telefono: '', dove: '', cosa: '' }); const [fatto, setFatto] = useState(false); const [err, setErr] = useState('');
  const c = (k, x) => setV((s) => ({ ...s, [k]: x }));
  if (fatto) return <div className="ok">Grazie! Abbiamo ricevuto la segnalazione: contatteremo noi il produttore.</div>;
  return <form className="carta segnala" onSubmit={async (e) => { e.preventDefault(); setErr(''); try { await api('/api/segnalazioni', { metodo: 'POST', corpo: v }); setFatto(true); } catch (x) { setErr(x.message); } }}>
    <h2>Segnala un produttore</h2>
    <p className="muto">Un contadino, un caseificio, un forno, un apicoltore dove compri volentieri? Dicci chi è.</p>
    <label className="campo">Nome<input value={v.nome} onChange={(e) => c('nome', e.target.value)} placeholder="Es. Azienda agricola Rossi" /></label>
    <label className="campo">Dove si trova<input value={v.dove} onChange={(e) => c('dove', e.target.value)} placeholder="Es. Pontelagoscuro, Via Ravenna" /></label>
    <label className="campo">Cosa vende<input value={v.cosa} onChange={(e) => c('cosa', e.target.value)} placeholder="Es. verdura, uova, formaggi" /></label>
    <label className="campo">Telefono (se lo sai)<input inputMode="tel" value={v.telefono} onChange={(e) => c('telefono', e.target.value)} /></label>
    {err && <div className="errore">{err}</div>}
    <button className="b pieno" disabled={v.nome.trim().length < 2}>Manda la segnalazione</button>
  </form>;
}

export function Produttore({ id }) {
  const s = useDati(`/api/produttori/${id}`);
  const [cesto, setCesto] = useState({}); const [ritiro, setRitiro] = useState(''); const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [fatto, setFatto] = useState(null); const [attesa, setAttesa] = useState(false);
  if (s.errore) return <div className="errore">{s.errore}</div>;
  if (!s.dati) return <p className="muto">Carico…</p>;
  const p = s.dati;
  const righe = p.offerte.filter((o) => cesto[o.id] > 0).map((o) => ({ o, q: cesto[o.id], importo: Math.round(cesto[o.id] * o.prezzo * 100) / 100 }));
  const totale = Math.round(righe.reduce((t, x) => t + x.importo, 0) * 100) / 100;
  const cambia = (o, d) => setCesto((c) => { const q = Math.max(0, Math.round(((c[o.id] || 0) + d * o.passo) * 100) / 100); return { ...c, [o.id]: q }; });
  const ordina = async () => {
    setErr(''); setAttesa(true);
    try { const r = await api('/api/ordini', { metodo: 'POST', corpo: { produttore_id: p.id, righe: righe.map((x) => ({ offerta_id: x.o.id, quantita: x.q })), ritiro, note } }); setFatto(r); setCesto({}); s.ricarica(); }
    catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  if (fatto) return <>
    <a className="torna" href="#produttori"><Icona n="indietro" d={22} />Produttori</a>
    <section className="fatto-scelta"><div className="riga"><Icona n="spunta" d={28} /><b>Ordine inviato a {p.nome}</b></div>
      <p>{fatto.righe.map((x) => `${x.nome} ${quanto(x.quantita, x.unita)}`).join(', ')}. Totale <b>{euro(fatto.totale)}</b>, da pagare al ritiro.</p>
      <p>Ti avviso quando il produttore conferma e quando è pronto. Ritiro in {p.indirizzo}{p.citta ? `, ${p.citta}` : ''}{p.orari ? ` (${p.orari})` : ''}.</p>
      <a className="b pieno grande" href="#ordini">I miei ordini</a>
    </section>
  </>;
  return <>
    <a className="torna" href="#produttori"><Icona n="indietro" d={22} />Produttori</a>
    <div className="intesta"><h1>{p.nome}</h1>{p.descrizione && <p>{p.descrizione}</p>}</div>
    <section className="carta" style={{ gap: 6 }}>
      <span><b>Dove:</b> {p.indirizzo}{p.citta ? `, ${p.citta}` : ''}{p.km != null ? ` (${num(p.km, 1)} km da casa)` : ''}</span>
      {p.orari && <span><b>Ritiro:</b> {p.orari}</span>}
      <span className="muto piccolo">Si paga al ritiro, direttamente al produttore.</span>
      {p.link && <a className="link" href={p.link} target="_blank" rel="noopener">Apri su Google Maps</a>}
    </section>
    {p.ordini.length > 0 && <div className="ok">Hai già {p.ordini.length === 1 ? 'un ordine' : `${p.ordini.length} ordini`} in corso qui: <a href="#ordini">vedi</a></div>}
    <h2>Cosa vende</h2>
    <ul className="offerte-prod">{p.offerte.map((o) => <li key={o.id}>
      {o.foto ? <img src={o.foto} alt="" /> : <span className="senza-foto" />}
      <div className="colonna" style={{ gap: 4, minWidth: 0 }}>
        <b>{o.nome}{o.bio ? <span className="pill bio" style={{ marginLeft: 6 }}>Bio</span> : null}</b>
        {o.descrizione && <span className="muto piccolo">{o.descrizione}</span>}
        <Cartellino n={o.prezzo} per={unitaTesto(o.unita)} />
        <div className="passi piccoli"><button type="button" aria-label="Di meno" disabled={!cesto[o.id]} onClick={() => cambia(o, -1)}>−</button><output>{cesto[o.id] ? quanto(cesto[o.id], o.unita) : '—'}</output><button type="button" aria-label="Di più" onClick={() => cambia(o, 1)}>+</button></div>
      </div>
    </li>)}</ul>
    {righe.length > 0 && <section className="carta ordine-box">
      <h2>Il tuo ordine</h2>
      <ul className="righe-ordine">{righe.map((x) => <li key={x.o.id}><span>{x.o.nome}, {quanto(x.q, x.o.unita)}</span><b>{euro(x.importo)}</b></li>)}</ul>
      <div className="riga fra"><span>Totale da pagare al ritiro</span><Cartellino n={totale} grande /></div>
      <label className="campo">Quando passi a ritirare?<input value={ritiro} onChange={(e) => setRitiro(e.target.value)} placeholder={p.orari || 'Es. venerdì verso le 18'} /></label>
      <label className="campo">Note per il produttore (facoltative)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. zucchine piccole, grazie" /></label>
      {err && <div className="errore">{err}</div>}
      <button type="button" className="b pieno grande" disabled={attesa} onClick={ordina}>{attesa ? 'Invio…' : `Ordina: ${euro(totale)}`}</button>
    </section>}
  </>;
}

export function Ordini() {
  const l = useDati('/api/ordini'); const [err, setErr] = useState('');
  if (l.errore) return <div className="errore">{l.errore}</div>;
  if (!l.dati) return <p className="muto">Carico…</p>;
  return <>
    <a className="torna" href="#produttori"><Icona n="indietro" d={22} />Produttori</a>
    <div className="intesta"><h1>I miei ordini</h1></div>
    {err && <div className="errore">{err}</div>}
    {!l.dati.length && <div className="vuota"><p>Nessun ordine ancora.</p><a className="b pieno grande" href="#produttori">Vedi i produttori</a></div>}
    {l.dati.map((o) => <section key={o.id} className="carta" style={{ gap: 8 }}>
      <div className="riga fra"><h2>{o.produttore?.nome}</h2><span className={`semaforo ${STATO[o.stato][1]} piccolo`}><span className="luce" aria-hidden="true" />{STATO[o.stato][0]}</span></div>
      <span className="muto piccolo">Ordine n. {o.id} del {fData(o.creato_il)}{o.ritiro ? ` · ritiro ${o.ritiro}` : ''}</span>
      <ul className="righe-ordine">{o.righe.map((x, i) => <li key={i}><span>{x.nome}, {quanto(x.quantita, x.unita)}</span><b>{euro(x.importo)}</b></li>)}</ul>
      <div className="riga fra"><span>Totale al ritiro</span><Cartellino n={o.totale} /></div>
      {o.stato === 'pronto' && <div className="ok">Pronto: ritiralo in {o.produttore?.indirizzo}{o.produttore?.citta ? `, ${o.produttore.citta}` : ''}.</div>}
      {o.produttore?.telefono && <a className="link" href={`tel:${o.produttore.telefono}`}>Chiama il produttore</a>}
      {['nuovo', 'confermato'].includes(o.stato) && <button type="button" className="b rosso piccolo" style={{ alignSelf: 'flex-start' }} onClick={async () => { if (!confirm('Annullo l\'ordine?')) return; try { await api(`/api/ordini/${o.id}`, { metodo: 'PUT', corpo: { stato: 'annullato' } }); l.ricarica(); } catch (e) { setErr(e.message); } }}>Annulla l'ordine</button>}
    </section>)}
  </>;
}

// ---------- il produttore: i suoi prodotti e i suoi ordini ----------
const dataIt = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
export function MioProduttore() {
  const s = useDati('/api/produttore/mio'); const voci = useDati('/api/voci');
  const [nuova, setNuova] = useState(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const riepilogo = useDati('/api/produttore/riepilogo');
  if (s.errore) return <div className="errore">{s.errore}</div>;
  if (!s.dati) return <p className="muto">Carico…</p>;
  const p = s.dati;
  const fai = async (f, ok) => { setErr(''); setMsg(''); try { await f(); await s.ricarica(); riepilogo.ricarica(); if (ok) setMsg(ok); } catch (e) { setErr(e.message); } };
  const aperti = p.ordini.filter((o) => ['nuovo', 'confermato', 'pronto'].includes(o.stato)); const chiusi = p.ordini.filter((o) => !['nuovo', 'confermato', 'pronto'].includes(o.stato));
  return <>
    <div className="intesta"><h1>{p.nome}</h1><p>I tuoi prodotti e le prenotazioni da preparare.</p></div>
    {msg && <div className="ok" role="status">{msg}</div>}{err && <div className="errore">{err}</div>}
    {!p.visibile && <div className="errore">{!p.attivo ? 'Il tuo banco è sospeso: chi fa la spesa non lo vede. Sentiti con chi gestisce l\'app.' : `Il tuo banco non è visibile: il canone risulta pagato fino al ${dataIt(p.pagato_fino)}. Appena il pagamento viene segnato, torna visibile.`}</div>}
    <section className="carta">
      <h2>Ordini da evadere{aperti.length ? ` (${aperti.length})` : ''}</h2>
      {!aperti.length && <p className="muto">Nessun ordine in corso.</p>}
      {aperti.map((o) => <div key={o.id} className="ordine-prod">
        <div className="riga fra"><b>N. {o.id} · {o.cliente || 'Cliente'}</b><span className={`semaforo ${STATO[o.stato][1]} piccolo`}><span className="luce" aria-hidden="true" />{STATO[o.stato][0]}</span></div>
        <span className="muto piccolo">{fData(o.creato_il)}{o.ritiro ? ` · ritiro: ${o.ritiro}` : ''}{o.note ? ` · «${o.note}»` : ''}</span>
        <ul className="righe-ordine">{o.righe.map((x, i) => <li key={i}><span>{x.nome}, {quanto(x.quantita, x.unita)}</span><b>{euro(x.importo)}</b></li>)}</ul>
        <div className="riga fra"><span>Totale {euro(o.totale)}</span>{o.telefono && <a className="link" href={`tel:${o.telefono}`}>Chiama</a>}</div>
        <div className="riga">
          {o.stato === 'nuovo' && <button type="button" className="b pieno" onClick={() => fai(() => api(`/api/produttore/ordini/${o.id}`, { metodo: 'PUT', corpo: { stato: 'confermato' } }), 'Confermato: il cliente è avvisato')}>Conferma</button>}
          {o.stato === 'confermato' && <button type="button" className="b pieno" onClick={() => fai(() => api(`/api/produttore/ordini/${o.id}`, { metodo: 'PUT', corpo: { stato: 'pronto' } }), 'Il cliente sa che è pronto')}>È pronto</button>}
          {o.stato === 'pronto' && <button type="button" className="b pieno" onClick={() => fai(() => api(`/api/produttore/ordini/${o.id}`, { metodo: 'PUT', corpo: { stato: 'ritirato' } }), 'Ordine chiuso')}>Ritirato e pagato</button>}
          <button type="button" className="b rosso piccolo" onClick={() => { if (confirm('Annullo questo ordine? Il cliente viene avvisato.')) fai(() => api(`/api/produttore/ordini/${o.id}`, { metodo: 'PUT', corpo: { stato: 'annullato' } })); }}>Annulla</button>
        </div>
      </div>)}
    </section>
    <section className="carta">
      <div className="riga fra"><h2>I tuoi prodotti</h2><button type="button" className="b pieno piccolo" onClick={() => setNuova({ nome: '', prezzo: '', unita: 'kg', passo: '1', bio: false, descrizione: '', foto: '', voce_id: null, voce: '' })}>Nuovo</button></div>
      {nuova && <FormOfferta v={nuova} voci={voci} onSalva={async (d) => { await fai(() => api('/api/produttore/offerte', { metodo: 'POST', corpo: d }), 'Prodotto aggiunto'); setNuova(null); }} onAnnulla={() => setNuova(null)} />}
      <ul className="offerte-prod">{p.offerte.map((o) => <OffertaMia key={o.id} o={o} voci={voci} fai={fai} />)}</ul>
    </section>
    <section className="carta">
      <h2>Il tuo canone</h2>
      <p>{p.canone > 0 ? <>Per stare nell'app paghi <b>{euro(p.canone)} al mese</b>{p.pagato_fino ? <>, pagato fino al <b>{dataIt(p.pagato_fino)}</b></> : ''}.</> : 'Al momento non paghi un canone.'}{p.inizio ? ` Nell'app dal ${dataIt(p.inizio)}.` : ''}</p>
      <p className="muto piccolo">Nessuna commissione sugli ordini: i clienti pagano direttamente a te, al ritiro.</p>
    </section>
    <section className="carta">
      <h2>Quanto hai venduto</h2>
      {!riepilogo.dati?.length ? <p className="muto">Ancora nessun ordine ritirato.</p> : <ul className="righe-ordine">{riepilogo.dati.map((m) => <li key={m.mese}><span>{m.mese.slice(5)}/{m.mese.slice(0, 4)}: {m.ordini} {m.ordini === 1 ? 'ordine' : 'ordini'}</span><b>{euro(m.venduto)}</b></li>)}</ul>}
      <p className="muto piccolo">Contano gli ordini segnati «Ritirato e pagato».</p>
    </section>
    {chiusi.length > 0 && <details className="altre"><summary>Ordini chiusi ({chiusi.length})</summary><ul className="righe-ordine">{chiusi.map((o) => <li key={o.id}><span>N. {o.id} · {o.cliente} · {STATO[o.stato][0]}</span><b>{euro(o.totale)}</b></li>)}</ul></details>}
  </>;
}
function OffertaMia({ o, voci, fai }) {
  const [mod, setMod] = useState(false);
  if (mod) return <li style={{ display: 'block' }}><FormOfferta v={{ ...o, prezzo: String(o.prezzo).replace('.', ','), passo: String(o.passo).replace('.', ',') }} voci={voci} onSalva={async (d) => { await fai(() => api(`/api/produttore/offerte/${o.id}`, { metodo: 'PUT', corpo: d }), 'Salvato'); setMod(false); }} onAnnulla={() => setMod(false)} /></li>;
  return <li className={o.disponibile ? '' : 'spenta'}>
    {o.foto ? <img src={o.foto} alt="" /> : <span className="senza-foto" />}
    <div className="colonna" style={{ gap: 4 }}>
      <b>{o.nome}{o.bio ? ' · bio' : ''}{!o.disponibile ? ' · non disponibile' : ''}</b>
      <span className="muto piccolo">{euro(o.prezzo)} al {unitaTesto(o.unita)}, minimo {quanto(o.passo, o.unita)}</span>
      <div className="riga"><button type="button" className="b piccolo" onClick={() => setMod(true)}>Modifica</button>
        <button type="button" className="b piccolo" onClick={() => fai(() => api(`/api/produttore/offerte/${o.id}`, { metodo: 'PUT', corpo: { disponibile: !o.disponibile } }))}>{o.disponibile ? 'Finito' : 'Di nuovo disponibile'}</button></div>
    </div>
  </li>;
}
function FormOfferta({ v, voci, onSalva, onAnnulla }) {
  const [d, setD] = useState(v); const [err, setErr] = useState('');
  const c = (k, x) => setD((s) => ({ ...s, [k]: x }));
  return <div className="colonna form-offerta">
    <ScattaFoto foto={d.foto} onFoto={(f) => c('foto', f)} />
    <label className="campo">Nome del prodotto<input value={d.nome} onChange={(e) => c('nome', e.target.value)} placeholder="Es. Zucchine, Uova fresche, Miele di acacia" /></label>
    <div className="griglia2">
      <label className="campo">Prezzo<span className="euro-campo"><input inputMode="decimal" value={d.prezzo} onChange={(e) => c('prezzo', e.target.value)} placeholder="2,50" /><b>€</b></span></label>
      <label className="campo">Si vende<select value={d.unita} onChange={(e) => c('unita', e.target.value)}><option value="kg">al kg</option><option value="pz">al pezzo</option><option value="l">al litro</option></select></label>
    </div>
    <label className="campo">Quantità minima ({d.unita === 'pz' ? 'pezzi' : d.unita})<input inputMode="decimal" value={d.passo} onChange={(e) => c('passo', e.target.value)} placeholder="1" /></label>
    <label className="riga"><input type="checkbox" checked={!!d.bio} onChange={(e) => c('bio', e.target.checked)} /> Biologico</label>
    <label className="campo">Descrizione (facoltativa)<input value={d.descrizione} onChange={(e) => c('descrizione', e.target.value)} placeholder="Es. raccolte la mattina stessa" /></label>
    <div className="gruppo"><span className="nome-gruppo">A quale cosa della lista corrisponde? {d.voce ? <span className="pill">{d.voce}</span> : <span className="muto piccolo">(così compare quando uno cerca, per esempio, le zucchine)</span>}</span>
      <CercaVoce etichetta="" voci={voci.dati} ricaricaVoci={voci.ricarica} onScelta={(x) => { c('voce_id', x.id); c('voce', x.nome); }} /></div>
    {err && <div className="errore">{err}</div>}
    <div className="riga"><button type="button" className="b pieno" onClick={async () => { try { await onSalva({ nome: d.nome, prezzo: d.prezzo, unita: d.unita, passo: d.passo, bio: d.bio, descrizione: d.descrizione, foto: d.foto, voce_id: d.voce_id }); } catch (e) { setErr(e.message); } }}>Salva</button><button type="button" className="b" onClick={onAnnulla}>Annulla</button></div>
  </div>;
}

// ---------- chi gestisce: i produttori e i canoni ----------
export function GestioneProduttori() {
  const l = useDati('/api/produttori/tutti'); const comm = useDati('/api/canoni'); const seg = useDati('/api/segnalazioni');
  const [pagato, setPagato] = useState({});
  const [nuovo, setNuovo] = useState(null); const [mod, setMod] = useState(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  if (l.errore) return <div className="errore">{l.errore}</div>;
  const fai = async (f, ok) => { setErr(''); setMsg(''); try { await f(); await l.ricarica(); comm.ricarica(); if (ok) setMsg(ok); } catch (e) { setErr(e.message); } };
  const vuoto = { nome: '', descrizione: '', indirizzo: '', citta: '', telefono: '', orari: '', canone: '', canone_auto: true, pagato_fino: '', attivo: true };
  return <>
    <div className="intesta"><h1>Produttori e canoni</h1><p>Chi è nell'app paga un canone mensile. Il produttore entra con il suo numero di cellulare e gestisce prodotti e prenotazioni da solo.</p></div>
    {msg && <div className="ok">{msg}</div>}{err && <div className="errore">{err}</div>}
    {seg.dati?.some((x) => x.stato === 'nuova') && <section className="carta"><h2>Segnalati da chi usa l'app</h2>
      <ul className="righe-ordine">{seg.dati.filter((x) => x.stato === 'nuova').map((x) => <li key={x.id}><span><b>{x.nome}</b>{x.dove ? `, ${x.dove}` : ''}{x.cosa ? ` · ${x.cosa}` : ''}{x.telefono ? <> · <a href={`tel:${x.telefono}`}>{x.telefono}</a></> : ''}<br /><small className="muto">da {x.da || '—'}, {x.creata_il.slice(8, 10)}/{x.creata_il.slice(5, 7)}</small></span>
        <span className="colonna" style={{ gap: 6 }}><button type="button" className="b piccolo pieno" onClick={() => setNuovo({ ...vuoto, nome: x.nome, telefono: x.telefono, citta: x.dove, descrizione: x.cosa })}>Crea</button><button type="button" className="b piccolo" onClick={async () => { await api(`/api/segnalazioni/${x.id}`, { metodo: 'PUT', corpo: {} }); seg.ricarica(); }}>Vista</button></span></li>)}</ul></section>}
    {!nuovo && <button type="button" className="b pieno" onClick={() => setNuovo(vuoto)}>Nuovo produttore</button>}
    {nuovo && <section className="carta"><h2>Nuovo produttore</h2><FormProduttore v={nuovo} onSalva={async (d) => { await fai(() => api('/api/produttori', { metodo: 'POST', corpo: d }), 'Produttore creato'); setNuovo(null); }} onAnnulla={() => setNuovo(null)} /></section>}
    {(l.dati || []).map((p) => <section key={p.id} className="carta" style={{ gap: 8 }}>
      {mod === p.id ? <FormProduttore v={{ ...p, canone: String(comm.dati?.find((y) => y.id === p.id)?.canone_auto ? '' : p.canone || ''), canone_auto: comm.dati?.find((y) => y.id === p.id)?.canone_auto ?? !!p.canone_auto, pagato_fino: p.pagato_fino || '' }} onSalva={async (d) => { await fai(() => api(`/api/produttori/${p.id}`, { metodo: 'PUT', corpo: d }), 'Salvato'); setMod(null); }} onAnnulla={() => setMod(null)} /> : <>
        <div className="riga fra"><h2>{p.nome}{!p.attivo ? ' (sospeso)' : ''}</h2><button type="button" className="b piccolo" onClick={() => setMod(p.id)}>Modifica</button></div>
        <span className="muto piccolo">{p.indirizzo}{p.citta ? `, ${p.citta}` : ''}{p.lat == null && p.indirizzo ? ' · posizione non trovata' : ''} · tel. {p.telefono || '—'} · {p.offerte} prodotti · {p.ordini} ordini</span>
        {(() => {
          const c = comm.dati?.find((x) => x.id === p.id); if (!c) return null;
          return <>
            <div className={`riga fra canone ${c.visibile ? 'ok' : 'avviso'}`}>
              <span>{c.canone_auto ? `Canone automatico: ${c.canone > 0 ? `${euro(c.canone)} al mese` : 'gratis (lancio)'} (${c.attivi} persone attive entro ${c.raggio} km)` : c.canone > 0 ? `Canone ${euro(c.canone)} al mese, fisso (calcolato sarebbe ${c.calcolato ? euro(c.calcolato) : 'gratis'})` : 'Senza canone'}{c.pagato_fino ? ` · pagato fino al ${dataIt(c.pagato_fino)}` : ' · nessuna scadenza segnata'}{!c.attivo ? ' · sospeso' : !c.visibile ? ' · SCADUTO: non visibile' : ''}</span>
            </div>
            <div className="riga">
              <label className="campo" style={{ flex: 1 }}>Pagato fino a<input type="date" value={pagato[p.id] ?? c.pagato_fino ?? ''} onChange={(e) => setPagato({ ...pagato, [p.id]: e.target.value })} /></label>
              <button type="button" className="b piccolo" onClick={() => fai(() => api(`/api/canoni/${p.id}`, { metodo: 'PUT', corpo: { pagato_fino: pagato[p.id] ?? c.pagato_fino ?? '' } }), 'Pagamento segnato')}>Segna</button>
              <button type="button" className="b piccolo" onClick={() => { const d = new Date((pagato[p.id] ?? c.pagato_fino) || Date.now()); if (d < new Date()) d.setTime(Date.now()); d.setMonth(d.getMonth() + 1); const v = d.toISOString().slice(0, 10); setPagato({ ...pagato, [p.id]: v }); fai(() => api(`/api/canoni/${p.id}`, { metodo: 'PUT', corpo: { pagato_fino: v } }), 'Aggiunto un mese'); }}>+1 mese</button>
            </div>
            {c.mesi?.length ? <ul className="righe-ordine">{c.mesi.map((m) => <li key={m.mese}><span>{m.mese.slice(5)}/{m.mese.slice(0, 4)}: {m.ordini} {m.ordini === 1 ? 'ordine ritirato' : 'ordini ritirati'}</span><b>{euro(m.venduto)}</b></li>)}</ul> : <span className="muto piccolo">Nessun ordine ritirato ancora.</span>}
          </>;
        })()}
      </>}
    </section>)}
  </>;
}
function FormProduttore({ v, onSalva, onAnnulla }) {
  const [d, setD] = useState(v); const [err, setErr] = useState('');
  const c = (k, x) => setD((s) => ({ ...s, [k]: x }));
  return <div className="colonna">
    <label className="campo">Nome<input value={d.nome} onChange={(e) => c('nome', e.target.value)} placeholder="Es. Azienda agricola Rossi" /></label>
    <label className="campo">Descrizione<input value={d.descrizione} onChange={(e) => c('descrizione', e.target.value)} placeholder="Es. verdura di stagione e uova, a Pontelagoscuro" /></label>
    <div className="griglia2">
      <label className="campo">Indirizzo (via e numero)<input value={d.indirizzo} onChange={(e) => c('indirizzo', e.target.value)} /></label>
      <label className="campo">Città<input value={d.citta} onChange={(e) => c('citta', e.target.value)} /></label>
    </div>
    <div className="griglia2">
      <label className="campo">Cellulare del produttore<input inputMode="tel" value={d.telefono} onChange={(e) => c('telefono', e.target.value)} placeholder="347 000 0000" /></label>
      <div className="colonna" style={{ gap: 6 }}><label className="riga"><input type="checkbox" checked={!!d.canone_auto} onChange={(e) => c('canone_auto', e.target.checked)} /> Canone automatico (dalle persone attive in zona)</label>
        {!d.canone_auto && <label className="campo">Canone mensile fisso (€)<input inputMode="decimal" value={d.canone} onChange={(e) => c('canone', e.target.value)} placeholder="Es. 30" /></label>}</div>
    </div>
    <label className="campo">Quando si ritira<input value={d.orari} onChange={(e) => c('orari', e.target.value)} placeholder="Es. martedì e venerdì 17-19" /></label>
    <label className="riga"><input type="checkbox" checked={!!d.attivo} onChange={(e) => c('attivo', e.target.checked)} /> Attivo (visibile a chi fa la spesa)</label>
    {err && <div className="errore">{err}</div>}
    <div className="riga"><button type="button" className="b pieno" onClick={async () => { try { await onSalva(d); } catch (e) { setErr(e.message); } }}>Salva</button><button type="button" className="b" onClick={onAnnulla}>Annulla</button></div>
  </div>;
}
