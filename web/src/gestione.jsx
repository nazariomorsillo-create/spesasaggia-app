// Gestione (per chi carica prezzi e prodotti): rilevazione, schede, confronto, negozi, scontrini, impostazioni, pubblicità.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, useDati, euro, num, data, UNITA, QUALITA, REPARTI, TIPI, conVirgola, Etichette, StatoPrezzo, mem, ScattaFoto, ScegliCatena, FormatoConfezione, FORMATO_VUOTO, datiFormato, numeroDa, Semaforo, Icona, riduciFoto, quanto, Cartellino } from './base.jsx';

function CercaVoce({ onScelta, etichetta = 'Cosa compri?', voci, ricaricaVoci }) {
  const [q, setQ] = useState(''); const [nuova, setNuova] = useState(null); const [err, setErr] = useState('');
  const trovate = useMemo(() => { const t = q.trim().toLowerCase(); return t ? (voci || []).filter((v) => v.nome.toLowerCase().includes(t)).slice(0, 8) : []; }, [q, voci]);
  const esatta = (voci || []).some((v) => v.nome.toLowerCase() === q.trim().toLowerCase());
  if (nuova) return <div className="colonna">
    <label className="campo">Nome<input value={nuova.nome} onChange={(e) => setNuova({ ...nuova, nome: e.target.value })} /></label>
    <div className="griglia2">
      <label className="campo">Reparto<select value={nuova.reparto} onChange={(e) => setNuova({ ...nuova, reparto: e.target.value, unita: e.target.value === 'ortofrutta' ? 'kg' : nuova.unita })}>{REPARTI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      <label className="campo">Si confronta al<select value={nuova.unita} onChange={(e) => setNuova({ ...nuova, unita: e.target.value })}><option value="kg">kg</option><option value="l">litro</option><option value="pz">pezzo</option></select></label>
    </div>
    {err && <div className="errore">{err}</div>}
    <div className="riga"><button type="button" className="b pieno" onClick={async () => { try { const v = await api('/api/voci', { metodo: 'POST', corpo: nuova }); await ricaricaVoci?.(); setNuova(null); setQ(''); onScelta(v); } catch (e) { setErr(e.message); } }}>Crea</button><button type="button" className="b" onClick={() => setNuova(null)}>Annulla</button></div>
  </div>;
  return <div className="colonna">
    <label className="campo">{etichetta}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Es. zucchine, crema di nocciole, latte" autoComplete="off" /></label>
    {q.trim() && <div className="suggerimenti">
      {trovate.map((v) => <button type="button" key={v.id} onClick={() => { setQ(''); onScelta(v); }}><b>{v.nome}</b> <span className="muto piccolo">· al {UNITA[v.unita]}</span></button>)}
      {!esatta && <button type="button" onClick={async () => { let g = { reparto: 'dispensa', unita: 'pz' }; try { g = await api(`/api/voci/indovina?nome=${encodeURIComponent(q.trim())}`); } catch { /* proposta di base */ } setNuova({ nome: q.trim(), reparto: g.reparto, unita: g.unita }); }}>➕ Aggiungi «{q.trim()}»</button>}
    </div>}
  </div>;
}

// ---------- rilevazione dei prezzi ----------
function Rileva({ stato }) {
  const catene = useDati('/api/catene'); const voci = useDati('/api/voci');
  const [catena, setCatena] = useState(() => mem.leggi('catena', null));
  const [q, setQ] = useState(''); const [trovati, setTrovati] = useState([]);
  const [prodotto, setProdotto] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (catene.dati?.length && !catene.dati.some((c) => c.id === catena)) setCatena(catene.dati[0].id); }, [catene.dati]); // eslint-disable-line
  useEffect(() => { const t = setTimeout(() => { if (q.trim().length >= 2) api(`/api/prodotti?q=${encodeURIComponent(q.trim())}`).then(setTrovati).catch(() => {}); else setTrovati([]); }, 250); return () => clearTimeout(t); }, [q]);
  const perEan = async (ean) => {
    const r = await api(`/api/prodotti?ean=${encodeURIComponent(ean)}`);
    if (r[0]) { setProdotto(r[0]); setQ(''); return; }
    const s = await api(`/api/scansiona/${encodeURIComponent(ean)}`).catch(() => null);
    // non c'è ancora: si va alla pagina «nuovo prodotto», con il codice (e i dati di Open Food Facts) già scritti
    mem.scrivi('nuovo-prodotto', s?.proposta ? { ...s.proposta, ean } : { ean }); location.hash = '#nuovo-prodotto';
  };
  return (<>
    <section className="carta">
      <h2>Inserisci un prezzo</h2>
      <p className="muto piccolo">Per un prodotto che c'è già. Se non c'è, usa «Inserisci un nuovo prodotto».</p>
      <span className="campo">Supermercato</span><ScegliCatena valore={catena} onScelta={(id) => { setCatena(id); mem.scrivi('catena', id); }} />
      {msg && <div className="ok">{msg}</div>}
      {!prodotto && <>
        <label className="campo">Prodotto<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, marca o codice a barre" autoComplete="off" inputMode="search" /></label>
        <Scanner onCodice={perEan} />
        {trovati.length > 0 && <div className="suggerimenti">{trovati.map((p) => <button key={p.id} type="button" onClick={() => { setProdotto(p); setQ(''); setMsg(''); }}><b>{p.nome}</b> <span className="muto piccolo">· {p.voce}</span> <Etichette p={p} /></button>)}</div>}
        {/^\d{8,14}$/.test(q.trim()) && <button className="b" onClick={() => perEan(q.trim())}>Cerca il codice {q.trim()}</button>}
        {q.trim().length >= 2 && <div className="avviso">Non trovi il prodotto? <a href="#nuovo-prodotto" onClick={() => mem.scrivi('nuovo-prodotto', { nome: q.trim() })}>Inseriscilo come nuovo prodotto</a>: tutti i dati e il prezzo in una pagina sola.</div>}
      </>}
    </section>
    {prodotto && catena && <FormPrezzo key={`${prodotto.id}-${catena}`} p={prodotto} catena={catene.dati?.find((c) => c.id === catena)} stato={stato} onFatto={(t) => { setProdotto(null); setMsg(t); }} onAnnulla={() => setProdotto(null)} />}
  </>);
}
const campoManoSemplice = (codice, setCodice, manda, annulla) => <form className="codice-mano" onSubmit={manda}><label className="campo">Scrivi le cifre sotto il codice a barre<input inputMode="numeric" value={codice} onChange={(e) => setCodice(e.target.value)} autoFocus /></label><div className="riga"><button className="b pieno">Cerca il prodotto</button><button type="button" className="link" onClick={annulla}>Annulla</button></div></form>;
const VIDEO = { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } };
// 0.85 (Nazario, 07/11): l'iPhone chiedeva il permesso della fotocamera a ogni scansione. Ora la fotocamera si apre una volta
// e tra una scansione e l'altra resta pronta (con l'immagine spenta) per qualche minuto: niente nuova richiesta.
// Si chiude del tutto dopo 10 minuti senza scansioni o quando esci dall'app.
const cam = { stream: null, timer: null };
const camViva = () => cam.stream?.getVideoTracks().some((t) => t.readyState === 'live');
function chiudiCamera() { clearTimeout(cam.timer); cam.stream?.getTracks().forEach((t) => t.stop()); cam.stream = null; }
async function prendiCamera() {
  clearTimeout(cam.timer);
  if (camViva()) { cam.stream.getVideoTracks().forEach((t) => { t.enabled = true; }); return cam.stream; }
  cam.stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO });
  try { await cam.stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* non tutti i telefoni */ }
  return cam.stream;
}
function lasciaCamera() {
  if (!cam.stream) return;
  cam.stream.getVideoTracks().forEach((t) => { t.enabled = false; });
  clearTimeout(cam.timer); cam.timer = setTimeout(chiudiCamera, 10 * 60 * 1000);
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) chiudiCamera(); });
function Scanner({ onCodice, etichetta = '📷 Inquadra il codice a barre', classe = 'b' }) {
  const [attivo, setAttivo] = useState(false); const [err, setErr] = useState(''); const v = useRef(null);
  const [aMano, setAMano] = useState(false); const [codice, setCodice] = useState('');
  const manda = (e) => { e?.preventDefault(); const c = codice.replace(/\D/g, ''); if (c.length < 8 || c.length > 14) { setErr('Il codice a barre ha 8 o 13 cifre: controlla e riprova.'); return; } setErr(''); setAttivo(false); setAMano(false); setCodice(''); onCodice(c); };
  const disponibile = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  useEffect(() => {
    if (!attivo) return undefined;
    let fermo = false; let ferma = null;
    const trovato = (codice) => { if (fermo) return; fermo = true; setAttivo(false); onCodice(codice); };
    (async () => {
      try {
        const stream = await prendiCamera();
        if (fermo || !v.current) return;
        v.current.srcObject = stream; await v.current.play();
        if ('BarcodeDetector' in window) {
          const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
          while (!fermo) {
            const c = await det.detect(v.current).catch(() => []);
            if (c[0]?.rawValue) { trovato(c[0].rawValue); break; }
            await new Promise((r) => setTimeout(r, 120));
          }
        } else {
          // iPhone (Safari non ha il lettore nativo): ZXing, caricato solo quando serve
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
          const suggerimenti = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]], [DecodeHintType.TRY_HARDER, true]]);
          const lettore = new BrowserMultiFormatReader(suggerimenti, { delayBetweenScanAttempts: 80 });
          // si legge dal video già acceso (decodeFromConstraints aprirebbe e chiuderebbe la fotocamera ogni volta)
          const ctrl = lettore.scan(v.current, (r) => { if (r) trovato(r.getText()); });
          ferma = () => ctrl.stop();
          if (fermo) ferma();
        }
      } catch { setErr('Fotocamera non disponibile (serve https o il permesso): scrivi il codice a mano.'); setAttivo(false); }
    })();
    return () => { fermo = true; ferma?.(); if (v.current) v.current.srcObject = null; lasciaCamera(); };
  }, [attivo]); // eslint-disable-line
  if (!disponibile) return <div style={{ gridColumn: '1 / -1' }}>{aMano ? campoManoSemplice(codice, setCodice, manda, () => setAMano(false)) : <button type="button" className={classe} onClick={() => setAMano(true)}>Scrivi il codice a barre</button>}</div>;
  const campoMano = <form className="codice-mano" onSubmit={manda}>
    <label className="campo">Scrivi le cifre sotto il codice a barre<input inputMode="numeric" autoComplete="off" value={codice} onChange={(e) => setCodice(e.target.value)} placeholder="Es. 8001234567890" autoFocus /></label>
    <div className="riga"><button className="b pieno" disabled={codice.replace(/\D/g, '').length < 8}>Cerca il prodotto</button><button type="button" className="link" onClick={() => { setAMano(false); setCodice(''); }}>Annulla</button></div>
  </form>;
  return <>{attivo ? <><div className="scanner-box"><video ref={v} className="scanner" playsInline muted /><span className="mirino" aria-hidden="true" /></div>
      <p className="muto piccolo" style={{ gridColumn: '1 / -1' }}>Tieni il codice dritto dentro il riquadro, a 10–15 cm, con buona luce.</p>
      <div className="riga" style={{ gridColumn: '1 / -1' }}><button className="b" onClick={() => setAttivo(false)}>Chiudi la fotocamera</button><button type="button" className="b" onClick={() => { setAttivo(false); setAMano(true); }}>Scrivilo a mano</button></div></>
    : aMano ? <div style={{ gridColumn: '1 / -1' }}>{campoMano}</div>
      : <button className={classe} onClick={() => { setErr(''); setAttivo(true); }}>{etichetta}</button>}{err && <div className="avviso">{err}</div>}</>;
}
function FormPrezzo({ p, catena, stato, onFatto, onAnnulla }) {
  const orto = p.reparto === 'ortofrutta'; const sfuso = !!p.sfuso; const senzaFormato = !sfuso && !(p.quantita > 0);
  const [v, setV] = useState({ prezzo: '', offerta: false, rilevato_il: stato.oggi, valido_dal: orto ? stato.settimana.dal : '', valido_al: orto ? stato.settimana.al : '', fonte: 'scaffale' });
  const [err, setErr] = useState(''); const cambia = (k, x) => setV((s) => ({ ...s, [k]: x }));
  const etichetta = sfuso ? `Prezzo al ${p.unita === 'pz' ? 'pezzo' : p.unita}` : senzaFormato ? 'Prezzo della confezione' : `Prezzo della confezione (${num(p.quantita, 3)} ${p.unita})`;
  const n = Number(String(v.prezzo).replace(',', '.'));
  const unit = !sfuso && !senzaFormato && n > 0 ? n / p.quantita : null;
  return <section className="carta">
    <div><h2>{p.nome}</h2><div className="riga muto piccolo">{p.voce} · {catena?.nome} <Etichette p={p} /></div></div>
    <label className="campo">{etichetta} €<input inputMode="decimal" value={v.prezzo} onChange={(e) => cambia('prezzo', e.target.value)} autoFocus placeholder="Es. 1,69" /></label>
    {unit && <p className="muto piccolo">Fa {euro(unit)} al {p.unita}.</p>}
    {senzaFormato && <p className="avviso">Manca il formato della confezione: senza, il prezzo si salva ma non si confronta al {p.unita}. <a href={`#prodotto/${p.id}`}>Completa la scheda</a></p>}
    <label className="riga"><input type="checkbox" checked={v.offerta} onChange={(e) => cambia('offerta', e.target.checked)} /> In offerta</label>
    <label className="campo">Rilevato il<input type="date" value={v.rilevato_il} onChange={(e) => cambia('rilevato_il', e.target.value)} /></label>
    {(orto || v.offerta) && <div className="griglia2">
      <label className="campo">Valido dal<input type="date" value={v.valido_dal} onChange={(e) => cambia('valido_dal', e.target.value)} /></label>
      <label className="campo">al<input type="date" value={v.valido_al} onChange={(e) => cambia('valido_al', e.target.value)} /></label></div>}
    {orto && <p className="muto piccolo">Frutta e verdura: il prezzo vale per la settimana indicata, poi non si usa più nel confronto.</p>}
    <div className="scelte">{[['scaffale', 'Dallo scaffale'], ['scontrino', 'Dallo scontrino']].map(([k, t]) => <button type="button" key={k} aria-pressed={v.fonte === k} onClick={() => cambia('fonte', k)}>{t}</button>)}</div>
    {err && <div className="errore">{err}</div>}
    <button className="b pieno grande" onClick={async () => { try { await api('/api/prezzi', { metodo: 'POST', corpo: { ...v, prodotto_id: p.id, catena_id: catena.id } }); onFatto(`Salvato: ${p.nome} da ${catena.nome}, ${v.prezzo} €.`); } catch (e) { setErr(e.message); } }}>Salva il prezzo</button>
    <button className="b" onClick={onAnnulla}>Annulla</button>
  </section>;
}
// i disegni dei passi della lettura: il davanti (nome, marca, peso) e il retro (ingredienti e tabella)
const DisegnoDavanti = () => <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true">
  <rect x="22" y="14" width="76" height="92" rx="10" fill="#fff" stroke="#3A3632" strokeWidth="3" />
  <rect x="32" y="28" width="56" height="10" rx="3" fill="#F26A0F" />
  <rect x="36" y="46" width="48" height="6" rx="3" fill="#C9C2BA" />
  <circle cx="60" cy="72" r="12" fill="#FFEBDD" stroke="#F26A0F" strokeWidth="2" />
  <text x="60" y="98" textAnchor="middle" fontSize="11" fontWeight="700" fill="#3A3632">1000 g</text>
  <path d="M10 10h14M10 10v14M110 10H96M110 10v14M10 110h14M10 110V96M110 110H96M110 110V96" stroke="#2E8B2A" strokeWidth="4" fill="none" />
</svg>;
const DisegnoRetro = () => <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true">
  <rect x="22" y="14" width="76" height="92" rx="10" fill="#fff" stroke="#3A3632" strokeWidth="3" />
  <text x="30" y="30" fontSize="8" fontWeight="700" fill="#3A3632">Ingredienti</text>
  <rect x="30" y="34" width="60" height="4" rx="2" fill="#C9C2BA" />
  <rect x="30" y="41" width="52" height="4" rx="2" fill="#C9C2BA" />
  <rect x="28" y="54" width="64" height="44" rx="4" fill="#FFF6EF" stroke="#F26A0F" strokeWidth="2.5" strokeDasharray="5 3" />
  <text x="32" y="64" fontSize="7" fontWeight="700" fill="#3A3632">Valori nutrizionali</text>
  {[71, 78, 85, 92].map((y) => <path key={y} d={`M32 ${y}h56`} stroke="#C9C2BA" strokeWidth="2" />)}
  <path d="M10 10h14M10 10v14M110 10H96M110 10v14M10 110h14M10 110V96M110 110H96M110 110V96" stroke="#2E8B2A" strokeWidth="4" fill="none" />
</svg>;
// l'app compila la scheda dalle foto dell'etichetta: il davanti, poi gli ingredienti (fino a 2 foto), poi la lettura sul server
// 0.83: soloIngredienti = il prodotto ha già nome e foto: manca solo il giudizio, quindi si fotografano solo gli ingredienti
function LeggiEtichetta({ onLetta, evidente, soloIngredienti = false, titolo = 'Compilo io la scheda dalle foto dell\'etichetta', testoFatto = 'Ho compilato i campi qui sotto: controllali e salva.' }) {
  const inizio = soloIngredienti ? 'retro' : 'inizio';
  const [fronte, setFronte] = useState(''); const [retro, setRetro] = useState([]); const [passo, setPasso] = useState(inizio);
  const [prepara, setPrepara] = useState(''); const [err, setErr] = useState('');
  const fotocamera = useRef(null); const galleria = useRef(null); const quale = useRef('fronte');
  const apri = (chi, daGalleria = false) => { quale.current = chi; setErr(''); (daGalleria ? galleria : fotocamera).current?.click(); };
  const presa = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setPrepara('Preparo la foto…');
    try {
      const foto = await riduciFoto(f, 1400, 0.85);
      if (quale.current === 'fronte') { setFronte(foto); setPasso('fronte-fatto'); } else { setRetro((r) => [...r, foto].slice(0, 2)); setPasso('retro-fatto'); }
      setPrepara('');
    } catch (x) { setPrepara(''); setErr(x.message || 'Questa foto non si apre: riprova'); }
  };
  const leggi = async () => {
    setPasso('lettura'); setErr('');
    try { await onLetta(await api('/api/etichetta', { metodo: 'POST', corpo: { foto: [fronte, ...retro].filter(Boolean) } })); setPasso('fatto'); } catch (e) { setErr(e.message); setPasso('errore'); }
  };
  const rifai = () => { setFronte(''); setRetro([]); setPasso(inizio); setErr(''); };
  const numero = (passo === 'inizio' || passo === 'fronte-fatto' ? 1 : passo === 'retro' || passo === 'retro-fatto' ? 2 : 3) - (soloIngredienti ? 1 : 0);
  const passi = soloIngredienti ? ['Ingredienti', 'Lettura'] : ['Davanti', 'Ingredienti', 'Lettura'];
  const Scatta = ({ chi, testo }) => <div className="riga" style={{ flexWrap: 'wrap' }}>
    <button type="button" className="b pieno grande" onClick={() => apri(chi)}><Icona n="foto" /> {testo}</button>
    <button type="button" className="b" onClick={() => apri(chi, true)}><Icona n="galleria" /> Dalle foto</button>
  </div>;
  if (passo === 'fatto') return <div className="leggi-etichetta fatto"><b>✓ Etichetta letta</b><span className="muto piccolo">{testoFatto}</span><button type="button" className="link" onClick={rifai}>Rifai le foto</button></div>;
  return <div className={`leggi-etichetta${evidente ? ' evidente' : ''}`}>
    <b className="titolo-etichetta">{titolo}</b>
    <ol className="passi-etichetta" aria-label="Passi">{passi.map((t, i) => <li key={t} className={i + 1 === numero ? 'ora' : i + 1 < numero ? 'fatto' : ''}><span>{i + 1 < numero ? '✓' : i + 1}</span>{t}</li>)}</ol>
    {passo === 'inizio' && <div className="passo-etichetta"><DisegnoDavanti /><div className="colonna">
      <p className="frase-etichetta">Fotografa il <b>DAVANTI</b></p>
      <p className="muto">nome, marca e peso</p>
      <Scatta chi="fronte" testo="Fotografa il davanti" />
    </div></div>}
    {passo === 'fronte-fatto' && <div className="passo-etichetta"><img src={fronte} alt="Il davanti fotografato" className="miniatura" /><div className="colonna">
      <p className="frase-etichetta">Si legge bene?</p>
      <div className="riga" style={{ flexWrap: 'wrap' }}><button type="button" className="b pieno grande" onClick={() => setPasso('retro')}>Sì, avanti</button><button type="button" className="b" onClick={() => apri('fronte')}>Rifalla</button></div>
    </div></div>}
    {passo === 'retro' && <div className="passo-etichetta"><DisegnoRetro /><div className="colonna">
      <p className="frase-etichetta">Fotografa gli <b>INGREDIENTI</b></p>
      <p className="muto">e la tabella dei valori nutrizionali, da vicino</p>
      <Scatta chi="retro" testo="Fotografa gli ingredienti" />
      {!soloIngredienti && <button type="button" className="link" onClick={leggi}>Non ci sono: leggi solo il davanti</button>}
    </div></div>}
    {passo === 'retro-fatto' && <div className="passo-etichetta"><div className="riga">{[fronte, ...retro].filter(Boolean).map((f, i) => <img key={i} src={f} alt={`Foto ${i + 1}`} className="miniatura piccola" />)}</div><div className="colonna">
      <p className="frase-etichetta">Si leggono bene?</p>
      <p className="muto">La tabella è su un altro lato? Aggiungi una foto.</p>
      <div className="riga" style={{ flexWrap: 'wrap' }}><button type="button" className="b pieno grande" onClick={leggi}>Leggi l'etichetta</button>{retro.length < 2 && <button type="button" className="b" onClick={() => apri('retro')}>Aggiungi un'altra foto</button>}<button type="button" className="b" onClick={() => { setRetro([]); setPasso('retro'); }}>Rifalla</button></div>
    </div></div>}
    {passo === 'lettura' && <div className="passo-etichetta"><span className="girandola" aria-hidden="true" /><p role="status" className="frase-etichetta">Sto leggendo…</p></div>}
    {passo === 'errore' && <div className="colonna">
      <div className="errore">{err}</div>
      <div className="riga" style={{ flexWrap: 'wrap' }}><button type="button" className="b pieno" onClick={leggi}>Riprova</button><button type="button" className="b" onClick={rifai}>Rifai le foto</button></div>
      <span className="muto piccolo">Puoi anche compilare i campi a mano qui sotto.</span>
    </div>}
    {prepara && <span className="muto piccolo" role="status">{prepara}</span>}
    {err && passo !== 'errore' && <div className="errore">{err}</div>}
    <input ref={fotocamera} type="file" accept="image/*" capture="environment" hidden onChange={presa} />
    <input ref={galleria} type="file" accept="image/*" hidden onChange={presa} />
  </div>;
}
function FormProdotto({ iniziale = {}, voci, catene, onSalvato, onAnnulla, senzaPrezzo = false, dettagliAperti = false }) {
  // Una pagina sola, dall'inizio alla fine: foto e nome → che cos'è (lo propone l'app dal nome) → formato → tipo, marca, origine → prezzo e supermercato → dettagli → salva.
  const modifica = !!iniziale.id;
  const [voce, setVoce] = useState(iniziale.voce_id ? { id: iniziale.voce_id, nome: iniziale.voce, unita: iniziale.unita, reparto: iniziale.reparto, pezzo: iniziale.pezzo || '' } : null);
  const [voceAuto, setVoceAuto] = useState(!iniziale.voce_id); // finché non la cambi tu, la voce la propone l'app dal nome
  const [proposta, setProposta] = useState(null); const [nuovaVoce, setNuovaVoce] = useState(null); const [cambiaVoce, setCambiaVoce] = useState(false);
  const [v, setV] = useState({ nome: iniziale.nome || '', tipo: iniziale.tipo || 'senza', marca: iniziale.marca || '', catena_id: iniziale.catena_id || '', origine: iniziale.origine || '', bio: !!iniziale.bio, quantita: iniziale.quantita != null ? conVirgola(iniziale.quantita) : '', ean: iniziale.ean || '', nome_scontrino: iniziale.nome_scontrino || '' });
  const unitaVoce = voce?.unita || nuovaVoce?.unita || 'pz'; const pezzoVoce = voce?.pezzo || '';
  const [formato, setFormato] = useState(iniziale.sfuso ? 'sfuso' : modifica && !(iniziale.quantita > 0) ? 'manca' : 'confezione');
  // il formato scritto come lo legge una persona: 3 l, 500 g, 4 x 125 g (il server lo porta all'unità della voce)
  const [fu, setFu] = useState(() => {
    const q = iniziale.quantita > 0 ? iniziale.quantita : iniziale.formato?.quantita > 0 ? iniziale.formato.quantita : null; const u = iniziale.quantita > 0 ? iniziale.unita : iniziale.formato?.unita || iniziale.unita;
    const pezzi = iniziale.pezzi > 1 ? String(iniziale.pezzi) : iniziale.formato?.pezzi?.n > 1 ? String(iniziale.formato.pezzi.n) : '';
    const base = { pezzi, modo: pezzi ? 'tutti' : 'uno' };
    if (q == null) return { ...FORMATO_VUOTO(iniziale.formato?.unita === 'kg' ? 'g' : iniziale.formato?.unita || (u === 'kg' ? 'g' : u === 'l' ? 'l' : 'g')), ...base };
    if (u === 'kg') return { ...base, ...(q < 1 ? { n: conVirgola(Math.round(q * 1000)), u: 'g' } : { n: conVirgola(q), u: 'kg' }) };
    if (u === 'l') return { ...base, ...(q < 1 ? { n: conVirgola(Math.round(q * 1000)), u: 'ml' } : { n: conVirgola(q), u: 'l' }) };
    return { ...base, n: conVirgola(q), u: 'pz' };
  });
  // dal nome: «4 x 125 g», «500 g», «6 bottiglie da 1,5 l»
  const leggiNome = (nome) => { const t = String(nome).toLowerCase().replace(',', '.'); const m = t.match(/(?:(\d+)\s*(?:x|×|pezzi da|scatolette da|bottiglie da|confezioni da|pz da)\s*)?(\d+(?:\.\d+)?)\s*(kg|chili|grammi|gr|g|ml|cl|litri|litro|lt|l|pezzi|pz|rotoli|lavaggi|capsule)\b/); if (!m) return null;
    const u = { chili: 'kg', gr: 'g', grammi: 'g', lt: 'l', litri: 'l', litro: 'l', pezzi: 'pz', rotoli: 'pz', lavaggi: 'pz', capsule: 'pz' }[m[3]] || m[3];
    return { n: m[2].replace('.', ','), u, pezzi: m[1] && Number(m[1]) > 1 && u !== 'pz' ? m[1] : '', modo: 'uno' }; };
  const dalNome = (nome) => { if (fu.n) return; const f = leggiNome(nome); if (f) { setFu({ ...fu, ...f }); setFormato('confezione'); } };
  const [dett, setDett] = useState({ imballaggio: iniziale.imballaggio || '', valori: iniziale.valori || '', descrizione: iniziale.descrizione || '', produttore: iniziale.produttore || '', provenienza: iniziale.provenienza || '', ingredienti: iniziale.ingredienti || '', note: iniziale.note || '', foto: iniziale.foto || '', nutriscore: iniziale.nutriscore || '', nova: iniziale.nova || null,
    additivi: Array.isArray(iniziale.additivi) ? (iniziale.additivi.length ? iniziale.additivi.map((x) => x.codice || x).join(', ') : 'nessuno') : '' });
  const [altro, setAltro] = useState(dettagliAperti);
  const [letto, setLetto] = useState('');
  // dall'etichetta letta: si riempie solo quello che è ancora vuoto (quello che hai scritto tu resta)
  const daEtichetta = (r) => {
    setV((s) => ({ ...s, nome: s.nome.trim() ? s.nome : r.nome, ...(r.marca && s.tipo === 'senza' ? { tipo: 'marca', marca: r.marca } : {}), origine: s.origine || r.origine, bio: s.bio || r.bio }));
    if (r.quantita > 0 && !fu.n.trim()) {
      const q = r.quantita; const u = r.unita;
      const f = u === 'kg' ? (q < 1 ? { n: conVirgola(Math.round(q * 1000)), u: 'g' } : { n: conVirgola(q), u: 'kg' }) : u === 'l' ? (q < 1 ? { n: conVirgola(Math.round(q * 1000)), u: 'ml' } : { n: conVirgola(q), u: 'l' }) : { n: conVirgola(q), u: 'pz' };
      setFu({ ...fu, ...f, pezzi: r.pezzi > 1 && u !== 'pz' ? String(r.pezzi) : '', modo: 'tutti' }); setFormato('confezione');
    }
    setDett((d) => ({ ...d, foto: d.foto || r.foto || '', imballaggio: d.imballaggio || r.imballaggio || '', valori: d.valori || r.valori || '', ingredienti: d.ingredienti || r.ingredienti,
      additivi: d.additivi || (Array.isArray(r.additivi) ? (r.additivi.length ? r.additivi.join(', ') : 'nessuno') : ''), nutriscore: d.nutriscore || r.nutriscore, produttore: d.produttore || r.produttore, descrizione: d.descrizione || r.descrizione, foto: d.foto || r.foto }));
    setAltro(true); setCercaSimili((n) => n + 1);
    setLetto([r.nome && `«${r.nome}»`, r.quantita > 0 && 'formato', r.ingredienti && 'ingredienti', Array.isArray(r.additivi) && (r.additivi.length ? `additivi ${r.additivi.join(', ')}` : 'nessun additivo'),
      r.nutriscore && `Nutri-Score ${r.nutriscore.toUpperCase()}${r.nutriscore_da === 'calcolato' ? ' (calcolato dalla tabella nutrizionale)' : ''}`].filter(Boolean).join(', '));
  };
  const [err, setErr] = useState(''); const [attesa, setAttesa] = useState(false); const cambia = (k, x) => setV((s) => ({ ...s, [k]: x }));
  const oggiLocale = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // in modifica: prezzo e supermercato dell'ultimo prezzo valido, già scritti (si salva un prezzo nuovo solo se li cambi)
  const ultimo = (() => {
    if (!modifica) return null;
    const u = [...(iniziale.ultimi?.length ? iniziale.ultimi : iniziale.prezzi || []).filter((x) => !x.superato_il && x.catena_id)].sort((a, b) => String(b.rilevato_il || '').localeCompare(String(a.rilevato_il || '')))[0];
    return u ? { prezzo: Number(u.prezzo).toFixed(2).replace('.', ','), catena: u.catena_id, offerta: !!u.offerta, dal: u.valido_dal || oggiLocale(), al: u.valido_al || '' } : null;
  })();
  const [pr, setPr] = useState(ultimo || { prezzo: '', catena: mem.leggi('catena', null), offerta: false, dal: oggiLocale(), al: '' });
  // la voce la propone l'app mentre scrivi il nome (con un attimo di ritardo); la prima proposta è quella che vale, finché non la cambi
  useEffect(() => {
    if (!voceAuto) return undefined;
    const nome = v.nome.trim(); if (nome.length < 3) { setProposta(null); setVoce(null); setNuovaVoce(null); return undefined; }
    const t = setTimeout(() => api(`/api/voci/proposta?nome=${encodeURIComponent(nome)}`).then((r) => {
      setProposta(r);
      if (r.voci[0]) { setVoce(r.voci[0]); setNuovaVoce(null); if (r.voci[0].reparto === 'ortofrutta' && !fu.n) setFormato('sfuso'); }
      else { setVoce(null); setNuovaVoce(r.nuova); if (r.nuova?.reparto === 'ortofrutta' && !fu.n) setFormato('sfuso'); }
    }).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [v.nome, voceAuto]); // eslint-disable-line react-hooks/exhaustive-deps
  const scegliVoce = (x) => { setVoce(x); setNuovaVoce(null); setVoceAuto(false); setCambiaVoce(false); if (x.reparto === 'ortofrutta' && !iniziale.formato) setFormato('sfuso'); };
  // i controlli e i dati del prodotto (senza la voce), per il salvataggio e per «Sì, è questo»
  const corpoProdotto = () => {
    if (v.nome.trim().length < 2) throw new Error('Scrivi il nome del prodotto');
    const n = Number(String(pr.prezzo).replace(',', '.'));
    if (pr.prezzo.trim() && !(n > 0)) throw new Error('Il prezzo non è valido: scrivi per esempio 3,99');
    if (pr.prezzo.trim() && !pr.catena) throw new Error('Tocca il supermercato o il fornitore dove l\'hai comprato');
    if (pr.prezzo.trim() && pr.offerta && pr.dal && pr.al && pr.al < pr.dal) throw new Error('La fine dell\'offerta viene prima dell\'inizio: controlla le date');
    const daNome = formato !== 'sfuso' && !fu.n.trim() ? leggiNome(v.nome) : null;
    const f2 = daNome ? { ...fu, ...daNome } : fu;
    const formato2 = daNome ? 'confezione' : formato;
    if (formato2 === 'confezione' && f2.n.trim() && !numeroDa(f2.n)) throw new Error('Il formato non è valido: scrivi per esempio 3 e tocca «litri»');
    const df = formato2 === 'confezione' ? datiFormato(f2) : { quantita: null, formato_unita: undefined, pezzi: null };
    return { ...v, ...dett, sfuso: formato2 === 'sfuso', quantita: df.quantita, formato_unita: df.formato_unita, pezzi: df.pezzi, catena_id: v.tipo === 'supermercato' ? v.catena_id : null };
  };
  // il prezzo si salva solo se è scritto e (in modifica) se è diverso dall'ultimo
  const salvaPrezzo = async (id) => {
    if (!pr.prezzo.trim()) return;
    const nn = (x) => Number(String(x).replace(',', '.'));
    if (!ultimo || nn(pr.prezzo) !== nn(ultimo.prezzo) || pr.catena !== ultimo.catena || pr.offerta !== ultimo.offerta || (pr.offerta && (pr.dal !== ultimo.dal || pr.al !== ultimo.al))) {
      await api('/api/prezzi', { metodo: 'POST', corpo: { prodotto_id: id, catena_id: pr.catena, prezzo: pr.prezzo, offerta: pr.offerta, ...(pr.offerta ? { valido_dal: pr.dal || undefined, valido_al: pr.al || undefined } : {}), fonte: 'scaffale' } }); mem.scrivi('catena', pr.catena);
    }
  };
  // doppioni: prima di creare un prodotto nuovo, quelli che sembrano lo stesso
  const [doppioni, setDoppioni] = useState(null); const refDoppioni = useRef(null);
  useEffect(() => { if (doppioni?.length) refDoppioni.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [doppioni]);
  useEffect(() => { setDoppioni(null); }, [v.nome, pr.catena, v.ean, fu.n, fu.u, formato]);
  // dopo la lettura dell'etichetta (o arrivando dal codice a barre con il nome) si cercano subito
  const [cercaSimili, setCercaSimili] = useState(() => (!modifica && iniziale.ean && iniziale.nome ? 1 : 0));
  useEffect(() => {
    if (!cercaSimili || modifica) return undefined;
    const nome = v.nome.trim(); if (nome.length < 3) return undefined;
    let vivo = true;
    api(`/api/prodotti/simili?${new URLSearchParams({ nome, ean: v.ean || '', catena_id: pr.catena || '' })}`).then((r) => { if (vivo && r.length) setDoppioni(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [cercaSimili]); // eslint-disable-line react-hooks/exhaustive-deps
  const salva = async (comeNuovo = false) => {
    setErr(''); setAttesa(true);
    try {
      const corpo = corpoProdotto();
      if (!modifica && !comeNuovo) {
        const catena = pr.catena || (v.tipo === 'supermercato' ? v.catena_id : null);
        const qs = new URLSearchParams({ nome: v.nome.trim(), catena_id: catena || '', ean: v.ean || '', quantita: corpo.quantita ?? '', formato_unita: corpo.formato_unita || '', sfuso: corpo.sfuso ? '1' : '' });
        if (catena || (v.ean || '').length >= 8) {
          const simili = await api(`/api/prodotti/simili?${qs}`).catch(() => []);
          if (simili.length) { setDoppioni(simili); return; }
        }
      }
      // la voce: quella scelta, oppure si crea quella proposta
      let voceId = voce?.id;
      if (!voceId) {
        const nv = nuovaVoce || { nome: v.nome.trim().split(/\s+/).slice(0, 3).join(' '), reparto: 'dispensa', unita: 'pz' };
        if (!nv.nome.trim()) throw new Error('Scrivi che cos\'è (per esempio «Filetti di sgombro»)');
        const creata = await api('/api/voci', { metodo: 'POST', corpo: nv }); voceId = creata.id; voci?.ricarica?.();
      }
      const salvato = await api(modifica ? `/api/prodotti/${iniziale.id}` : '/api/prodotti', { metodo: modifica ? 'PUT' : 'POST', corpo: { ...corpo, voce_id: voceId } });
      await salvaPrezzo(salvato.id);
      onSalvato(salvato, { conPrezzo: !!pr.prezzo.trim() });
    } catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  // «Sì, è questo»: si completano i dati che mancano del prodotto che c'è già
  const integra = async (x) => {
    setErr(''); setAttesa(true);
    try {
      const r = await api(`/api/prodotti/${x.id}/integra`, { metodo: 'POST', corpo: corpoProdotto() });
      await salvaPrezzo(x.id);
      onSalvato(r.prodotto, { conPrezzo: !!pr.prezzo.trim(), integrato: r.campi });
    } catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  const nomeUnita = (u, pz) => (u === 'kg' ? 'al chilo' : u === 'l' ? 'al litro' : `al ${pz || 'pezzo'}`);
  return <div className="colonna modulo-prodotto">
    <div className="passo-modulo"><span className="numero-passo">1</span><div className="colonna">
      {!modifica && <LeggiEtichetta onLetta={daEtichetta} evidente={!iniziale.nome} />}
      {letto && <div className="ok-letta" role="status">Ho letto: {letto}. Controlla i campi qui sotto e salva.</div>}
      <ScattaFoto foto={dett.foto} onFoto={(f) => setDett((d) => ({ ...d, foto: f }))} />
      <label className="campo">Nome del prodotto, come sull'etichetta<input value={v.nome} onChange={(e) => cambia('nome', e.target.value)} onBlur={(e) => dalNome(e.target.value)} placeholder="Es. Filetti di sgombro Delicius 4 x 125 g" autoFocus={!modifica && !v.nome} /></label>
    </div></div>

    <div className="passo-modulo"><span className="numero-passo">2</span><div className="colonna">
      <span className="nome-gruppo">Che cos'è</span>
      {voce && !cambiaVoce && <div className="riga fra voce-scelta"><span><b>{voce.nome}</b> <span className="muto">· si confronta {nomeUnita(voce.unita, voce.pezzo)}</span>{voceAuto && <span className="muto piccolo"> · proposto dal nome</span>}</span><button type="button" className="link" onClick={() => setCambiaVoce(true)}>Cambia</button></div>}
      {!voce && nuovaVoce && !cambiaVoce && <div className="colonna voce-nuova">
        <span className="muto piccolo">Non c'è ancora una voce per questo prodotto: la creo. Correggi il nome se serve (è quello con cui si confrontano le marche diverse).</span>
        <div className="griglia2">
          <label className="campo">Voce<input value={nuovaVoce.nome} onChange={(e) => setNuovaVoce({ ...nuovaVoce, nome: e.target.value })} /></label>
          <label className="campo">Si confronta<select value={nuovaVoce.unita} onChange={(e) => setNuovaVoce({ ...nuovaVoce, unita: e.target.value })}><option value="kg">al chilo</option><option value="l">al litro</option><option value="pz">al pezzo</option></select></label>
        </div>
        <label className="campo">Reparto<select value={nuovaVoce.reparto} onChange={(e) => setNuovaVoce({ ...nuovaVoce, reparto: e.target.value })}>{REPARTI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        {proposta?.voci?.length > 0 && <button type="button" className="link" onClick={() => setCambiaVoce(true)}>Oppure scegli una voce che c'è già</button>}
      </div>}
      {!voce && !nuovaVoce && !cambiaVoce && <span className="muto piccolo">Scrivi il nome qui sopra: capisco da solo di che cosa si tratta.</span>}
      {cambiaVoce && <div className="colonna">
        {proposta?.voci?.length > 0 && <div className="scelte">{proposta.voci.map((x) => <button type="button" key={x.id} aria-pressed={voce?.id === x.id} onClick={() => scegliVoce(x)}>{x.nome}</button>)}</div>}
        <CercaVoce etichetta="Cerca o crea la voce giusta" voci={voci?.dati} ricaricaVoci={voci?.ricarica} onScelta={scegliVoce} />
        <button type="button" className="link" onClick={() => setCambiaVoce(false)}>Chiudi</button>
      </div>}
    </div></div>

    <div className="passo-modulo"><span className="numero-passo">3</span><div className="colonna formato-box">
      <span className="nome-gruppo">Formato</span>
      <div className="scelte">{[['confezione', 'In confezione'], ['sfuso', `Sfuso, a ${unitaVoce === 'pz' ? 'pezzo' : 'peso'}`], ['manca', 'Non lo so']].map(([k, t]) => <button type="button" key={k} aria-pressed={formato === k} onClick={() => setFormato(k)}>{t}</button>)}</div>
      {formato === 'confezione' && <FormatoConfezione f={fu} setF={setFu} pezzo={pezzoVoce} />}
    </div></div>

    <div className="passo-modulo"><span className="numero-passo">4</span><div className="colonna">
      <span className="nome-gruppo">Di che tipo è</span>
      <div className="scelte">{TIPI.map(([k, t]) => <button type="button" key={k} aria-pressed={v.tipo === k} onClick={() => cambia('tipo', k)}>{t}</button>)}</div>
      {v.tipo === 'marca' && <label className="campo">Marca<input value={v.marca} onChange={(e) => cambia('marca', e.target.value)} placeholder="Es. Nutella, Barilla, Delicius" /></label>}
      {v.tipo === 'supermercato' && <label className="campo">Di quale supermercato<select value={v.catena_id} onChange={(e) => cambia('catena_id', Number(e.target.value))}><option value="">Scegli</option>{catene?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>}
      <div className="riga fra" style={{ flexWrap: 'wrap' }}>
        <div className="scelte">{[['', 'Origine non indicata'], ['italia', 'Italiano'], ['estero', 'Estero']].map(([k, t]) => <button type="button" key={k} aria-pressed={v.origine === k} onClick={() => cambia('origine', k)}>{t}</button>)}</div>
        <div className="scelte"><button type="button" aria-pressed={v.bio} onClick={() => cambia('bio', !v.bio)}>{v.bio ? '✓ ' : ''}Biologico</button></div>
      </div>
      <span className="nome-gruppo">Confezione</span>
      <div className="scelte">{[['', 'Non so'], ['vetro', 'Vetro'], ['plastica', 'Plastica'], ['carta', 'Carta / cartone'], ['metallo', 'Latta / alluminio']].map(([k, t]) => <button type="button" key={k} aria-pressed={dett.imballaggio === k} onClick={() => setDett((d) => ({ ...d, imballaggio: k }))}>{t}</button>)}</div>
      {dett.imballaggio === 'vetro' && <span className="muto piccolo">Il vetro dà 5 punti in più nel voto.</span>}
    </div></div>

    {!senzaPrezzo && <div className="passo-modulo"><span className="numero-passo">5</span><div className="colonna prezzo-veloce">
      <h3>Prezzo e dove l'hai comprato</h3>
      <span className="muto piccolo">Se lo sai, scrivilo: aiuta tutti a confrontare. Se non lo sai, lascia vuoto.</span>
      <ScegliCatena valore={pr.catena} onScelta={(id) => setPr((x) => ({ ...x, catena: id }))} />
      <label className="campo">{formato === 'sfuso' ? `Prezzo ${nomeUnita(unitaVoce, pezzoVoce)}` : 'Prezzo della confezione'}<span className="euro-campo"><input inputMode="decimal" value={pr.prezzo} onChange={(e) => setPr({ ...pr, prezzo: e.target.value })} placeholder="0,00" /><b>€</b></span></label>
      <div className="scelte"><button type="button" aria-pressed={pr.offerta} onClick={() => setPr({ ...pr, offerta: !pr.offerta })}>{pr.offerta ? '✓ ' : ''}Era in offerta</button></div>
      {pr.offerta && <div className="periodo-offerta">
        <span className="nome-gruppo">Quando vale l'offerta</span>
        <div className="date-offerta">
          <label className="campo">Inizio offerta<input type="date" value={pr.dal} onChange={(e) => setPr({ ...pr, dal: e.target.value })} /></label>
          <label className="campo">Fine offerta<input type="date" value={pr.al} min={pr.dal || undefined} onChange={(e) => setPr({ ...pr, al: e.target.value })} /></label>
        </div>
        <span className="muto piccolo">La trovi sul cartellino o sul volantino. Se non sai quando finisce, lascia vuota la fine.</span>
      </div>}
    </div></div>}

    <div className="passo-modulo"><span className="numero-passo">{senzaPrezzo ? 5 : 6}</span><div className="colonna">
      <span className="nome-gruppo">Descrizione e altri dati <span className="muto piccolo">(se li hai)</span></span>
      <label className="campo">Descrizione<input value={dett.descrizione} onChange={(e) => setDett({ ...dett, descrizione: e.target.value })} placeholder="Es. mele Golden, calibro grande; pane cotto a legna" /></label>
      <div className="griglia2">
        <label className="campo">Produttore<input value={dett.produttore} onChange={(e) => setDett({ ...dett, produttore: e.target.value })} /></label>
        <label className="campo">Provenienza (regione, zona)<input value={dett.provenienza} onChange={(e) => setDett({ ...dett, provenienza: e.target.value })} placeholder="Es. Ferrara, Sicilia, Spagna" /></label>
      </div>
      <div className="griglia2">
        <label className="campo">Codice a barre<input inputMode="numeric" value={v.ean} onChange={(e) => cambia('ean', e.target.value)} /></label>
        <label className="campo">Com'è scritto sullo scontrino<input value={v.nome_scontrino} onChange={(e) => cambia('nome_scontrino', e.target.value)} /></label>
      </div>
      {!altro ? <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setAltro(true)}>Ingredienti, additivi, note…</button> : <>
        <label className="campo">Ingredienti<textarea rows={3} value={dett.ingredienti} onChange={(e) => setDett({ ...dett, ingredienti: e.target.value })} /></label>
        <label className="campo">Additivi (codici E come «E330, E250», oppure «nessuno»)<input value={dett.additivi} onChange={(e) => setDett({ ...dett, additivi: e.target.value })} placeholder="Se li lasci vuoti li cerco negli ingredienti" /></label>
        <label className="campo">Note<textarea rows={2} value={dett.note} onChange={(e) => setDett({ ...dett, note: e.target.value })} /></label>
      </>}
    </div></div>

    {err && <div className="errore">{err}</div>}
    {doppioni?.length > 0 && <div className="doppioni" ref={refDoppioni}>
      <h3>{doppioni.length === 1 ? 'Questo prodotto c\'è già?' : 'Uno di questi è lo stesso prodotto?'}</h3>
      <p>{doppioni.some((x) => x.stesso_codice) ? 'C\'è già un prodotto con lo stesso codice a barre.' : pr.catena ? 'Nello stesso supermercato c\'è già un prodotto con un nome simile.' : 'C\'è già un prodotto con un nome simile, per esempio arrivato da uno scontrino.'} Se è lo stesso, tocca <b>«Sì, è questo»</b>: aggiungo solo i dati che mancano{pr.prezzo.trim() ? ' e il prezzo' : ''}, senza creare un doppione.</p>
      {doppioni.map((x) => <div key={x.id} className="doppione">
        {x.foto ? <img src={x.foto} alt="" loading="lazy" /> : <span className="senza-foto"><Icona n="foto" d={26} /></span>}
        <div className="doppione-testo"><b>{x.nome}</b><span>{[x.sfuso ? 'sfuso' : x.quantita > 0 ? quanto(x.quantita, x.unita, false, x.pezzo) : 'formato non indicato', x.catena, x.prezzo == null ? '' : `${euro(x.prezzo)} il ${data(x.rilevato_il)}`].filter(Boolean).join(' · ')}</span>{x.descrizione && <span className="muto">{x.descrizione}</span>}</div>
        <button type="button" className="b pieno-verde" disabled={attesa} onClick={() => integra(x)}><Icona n="spunta" /> Sì, è questo</button>
      </div>)}
      <button type="button" className="b grande" disabled={attesa} onClick={() => { setDoppioni(null); salva(true); }}>No, è diverso: salvalo come nuovo</button>
    </div>}
    <div className="riga">{!doppioni?.length && <button type="button" className="b pieno grande" disabled={attesa} onClick={() => salva()}>{attesa ? 'Salvo…' : modifica ? 'Salva le modifiche' : 'Salva il prodotto'}</button>}{onAnnulla && <button type="button" className="b" onClick={onAnnulla}>Annulla</button>}</div>
  </div>;
}

// ---------- prezzi: confronto per voce ----------
function Prezzi({ stato, id }) {
  const voci = useDati('/api/voci');
  const [filtro, setFiltro] = useState('');
  if (id) return <Confronto id={id} stato={stato} />;
  const el = (voci.dati || []).filter((v) => v.nome.toLowerCase().includes(filtro.toLowerCase()));
  return <section className="carta">
    <h2>Prezzi rilevati</h2>
    <input className="in" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Cerca una voce" />
    {REPARTI.map(([k, t]) => { const qui = el.filter((v) => v.reparto === k); return qui.length ? <div key={k} className="colonna" style={{ gap: 4 }}><b className="muto piccolo">{t}</b>{qui.map((v) => <a key={v.id} href={`#prezzi/${v.id}`} className="b" style={{ justifyContent: 'space-between' }}><span>{v.nome}</span><span className="muto piccolo">{v.prodotti} prod.</span></a>)}</div> : null; })}
  </section>;
}
function Confronto({ id, stato }) {
  const c = useDati(`/api/confronto?voce_id=${id}`); const voci = useDati('/api/voci'); const catene = useDati('/api/catene');
  const [modifica, setModifica] = useState(null);
  if (c.errore) return <div className="errore">{c.errore}</div>;
  if (!c.dati) return <p className="muto">Carico…</p>;
  const { voce, prodotti } = c.dati;
  return <>
    <a href="#prezzi" className="b piccolo" style={{ alignSelf: 'flex-start' }}>← Tutte le voci</a>
    <section className="carta"><h2>{voce.nome}</h2><span className="muto piccolo">Confronto al {voce.unita === 'pz' ? (voce.pezzo || 'pezzo') : voce.unita} · oggi {data(stato.oggi)}</span>
      {voce.unita === 'pz' && <div className="gruppo"><span className="nome-gruppo">Si conta a</span>
        <div className="scelte">{[['', 'Pezzi'], ['lavaggio', 'Lavaggi'], ['rotolo', 'Rotoli'], ['capsula', 'Capsule'], ['foglio', 'Fogli'], ['salvietta', 'Salviette']].map(([k, t]) => <button type="button" key={k} aria-pressed={(voce.pezzo || '') === k} onClick={async () => { await api(`/api/voci/${voce.id}`, { metodo: 'PUT', corpo: { pezzo: k } }); c.ricarica(); }}>{t}</button>)}</div>
        <span className="muto piccolo">Per i prodotti per la casa: il confronto si fa al lavaggio, al rotolo… Il formato di ogni prodotto va scritto in quei pezzi (es. 40 lavaggi).</span></div>}
      {prodotti.map((p) => <div key={p.id} className="negozio-giro">
        {/* 0.72: il nome apre la scheda; sotto due pulsanti chiari. «Modifica» grigio in alto a destra apriva il modulo in fondo alla pagina e sembrava non fare niente */}
        <a href={`#prodotto/${p.id}`}><b>{p.nome}</b></a>
        <div className="riga" style={{ gap: 8, flexWrap: 'wrap' }}><Semaforo q={p.qualita} piccolo sempre /><Etichette p={{ ...p, confrontabile: !!p.sfuso || p.quantita > 0 }} />{p.origine === '' && <span className="muto piccolo">Origine da indicare</span>}</div>
        {p.prezzi.length ? <ul className="prezzi-scheda">{p.prezzi.map((x) => <RigaPrezzoTab key={`${x.id}-${x.prezzo}-${x.offerta}`} x={x} unita={voce.unita} onFatto={() => c.ricarica()} />)}</ul> : <span className="muto piccolo">Nessun prezzo rilevato.</span>}
        <div className="confronto-azioni">
          <a className="b piccolo contorno" href={`#prodotto/${p.id}/prezzo`}>Aggiungi un prezzo</a>
          <button type="button" className="b piccolo" onClick={() => setModifica(modifica?.id === p.id ? null : p)}>Modifica la scheda</button>
        </div>
        {modifica?.id === p.id && <section className="carta"><h2>Modifica la scheda</h2><FormProdotto iniziale={{ ...modifica, voce: voce.nome, unita: voce.unita, reparto: voce.reparto }} voci={voci} catene={catene.dati} onSalvato={() => { setModifica(null); c.ricarica(); }} onAnnulla={() => setModifica(null)} /></section>}
      </div>)}
    </section>
  </>;
}
// 0.72: una riga di prezzo da correggere sul posto: tocchi «Correggi», scrivi il prezzo, salvi (un solo prezzo per supermercato, quello giusto)
function RigaPrezzoTab({ x, unita, onFatto }) {
  const [apri, setApri] = useState(false); const [v, setV] = useState(String(x.prezzo).replace('.', ',')); const [off, setOff] = useState(!!x.offerta); const [err, setErr] = useState('');
  const salva = async () => { setErr(''); try { await api(`/api/prezzi/${x.id}`, { metodo: 'PUT', corpo: { prezzo: v, offerta: off, valido_dal: off ? x.valido_dal || '' : '', valido_al: off ? x.valido_al || '' : '' } }); setApri(false); onFatto(); } catch (e) { setErr(e.message); } };
  return <li className={apri ? 'aperto' : ''}>
    <div className="riga-prezzo">
      <div><b>{x.catena}</b><span>rilevato il {data(x.rilevato_il)}{x.valido_al ? `, offerta ${data(x.valido_dal)}–${data(x.valido_al)}` : ''}</span>
        <span className="etichette">{x.offerta ? <span className="pill offerta">offerta</span> : null}<StatoPrezzo s={x.stato} /></span>
      </div>
      <div className="dx"><Cartellino n={x.prezzo} /><span className="muto piccolo">= {euro(x.unitario)} al {unita}</span></div>
    </div>
    {!apri && <div className="confronto-azioni riga-tasti-prezzo"><button type="button" className="b piccolo contorno correggi-prezzo" onClick={() => { setV(String(x.prezzo).replace('.', ',')); setOff(!!x.offerta); setErr(''); setApri(true); }}>Correggi il prezzo</button>
      <button type="button" className="b rosso piccolo correggi-prezzo" aria-label="Cancella il prezzo" onClick={async () => { if (confirm('Cancello questo prezzo?')) { await api(`/api/prezzi/${x.id}`, { metodo: 'DELETE' }); onFatto(); } }}>✕</button></div>}
    {apri && <div className="correggi">
      <label className="campo">Prezzo da {x.catena}<span className="euro-campo"><input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus onFocus={(e) => e.target.select()} /><b>€</b></span></label>
      <div className="scelte"><button type="button" aria-pressed={off} onClick={() => setOff(!off)}>{off ? '✓ ' : ''}In offerta</button></div>
      {err && <div className="errore">{err}</div>}
      <div className="riga"><button type="button" className="b pieno" onClick={salva}>Salva</button><button type="button" className="b" onClick={() => setApri(false)}>Annulla</button></div>
    </div>}
  </li>;
}

// ---------- altro: negozi, scontrini, impostazioni, pubblicità ----------
function Negozi({ stato }) {
  const c = useDati('/api/catene'); const [nuova, setNuova] = useState({ nome: '', ambito: 'citta' }); const [err, setErr] = useState(''); const [q, setQ] = useState('');
  const fai = async (p) => { setErr(''); try { const d = await p; c.setDati(Array.isArray(d) ? d : d.lista); return true; } catch (e) { setErr(e.message); return false; } };
  const visibili = (c.dati || []).filter((k) => !q.trim() || k.nome.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => (b.prezzi > 0 || b.negozi.length > 0) - (a.prezzi > 0 || a.negozi.length > 0) || a.nome.localeCompare(b.nome));
  return <>
    <a href="#altro" className="b piccolo" style={{ alignSelf: 'flex-start' }}>← Altro</a>
    <label className="campo-cerca"><span aria-hidden="true">🔍</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca una catena" aria-label="Cerca una catena" /></label>
    <p className="muto piccolo">{c.dati?.length || 0} catene: prima quelle con prezzi o negozi. Le catene proposte dagli utenti hanno la zona «Solo città» finché non la cambi.</p>
    {err && <div className="errore">{err}</div>}
    {visibili.map((k) => <section key={k.id} className="carta">
      <h2>{k.nome}{k.proposta_da ? <span className="pill vecchio" style={{ marginLeft: 8 }}>proposta da un utente</span> : null}</h2>
      <span className="muto piccolo">I prezzi sono…</span>
      <div className="scelte">{[['nazionale', 'Uguali in tutta Italia'], ['centro-nord', 'Uguali nel Centro-Nord'], ['sud', 'Uguali al Sud'], ['citta', `Solo ${stato.impostazioni.citta}`]].map(([a, t]) => <button key={a} type="button" aria-pressed={k.ambito === a} onClick={() => fai(api(`/api/catene/${k.id}`, { metodo: 'PUT', corpo: { ambito: a } }))}>{t}</button>)}</div>
      {k.negozi.map((n) => <div key={n.id} className="negozio-gestione">
        <div className="riga" style={{ justifyContent: 'space-between' }}><span style={{ opacity: n.attivo ? 1 : 0.5 }}>{n.indirizzo || n.nome || 'senza indirizzo'}{n.lat == null ? <span className="pill vecchio" style={{ marginLeft: 6 }}>posizione non trovata</span> : null}</span>
          <button className="b piccolo" onClick={() => fai(api(`/api/negozi/${n.id}`, { metodo: 'PUT', corpo: { attivo: !n.attivo } }))}>{n.attivo ? 'Togli dal giro' : 'Rimetti'}</button></div>
        {n.attivo ? <PaginaOrari n={n} onFatto={() => c.ricarica()} /> : null}
      </div>)}
      <NuovoNegozio onAggiungi={(ind) => fai(api('/api/negozi', { metodo: 'POST', corpo: { catena_id: k.id, indirizzo: ind } }))} />
    </section>)}
    <section className="carta"><h2>Nuova catena</h2>
      <label className="campo">Nome<input value={nuova.nome} onChange={(e) => setNuova({ ...nuova, nome: e.target.value })} placeholder="Es. Lidl, Esselunga, Coop" /></label>
      <div className="scelte">{[['nazionale', 'Uguali in tutta Italia'], ['centro-nord', 'Uguali nel Centro-Nord'], ['sud', 'Uguali al Sud'], ['citta', `Solo ${stato.impostazioni.citta}`]].map(([a, t]) => <button key={a} type="button" aria-pressed={nuova.ambito === a} onClick={() => setNuova({ ...nuova, ambito: a })}>{t}</button>)}</div>
      <button className="b pieno" onClick={async () => { if (await fai(api('/api/catene', { metodo: 'POST', corpo: nuova }))) setNuova({ nome: '', ambito: 'citta' }); }}>Aggiungi la catena</button>
    </section>
  </>;
}
// la pagina ufficiale del negozio (sul sito della catena) da cui leggere gli orari, senza spendere crediti
function PaginaOrari({ n, onFatto }) {
  const [url, setUrl] = useState(n.orari_url || ''); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [attesa, setAttesa] = useState(false);
  const salva = async () => {
    setErr(''); setMsg(''); setAttesa(true);
    try { const r = await api(`/api/negozi/${n.id}/pagina-orari`, { metodo: 'PUT', corpo: { url: url.trim() } }); setMsg(!url.trim() ? 'Pagina tolta' : r.letti ? `Orari letti dalla pagina (${r.come}): ${r.negozio.orari}` : 'Pagina salvata, ma dentro non ho trovato gli orari: la riprovo ogni mese. Intanto puoi scriverli a mano dai tuoi supermercati.'); onFatto?.(); }
    catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  return <div className="pagina-orari">
    <div className="riga">
      <input className="in" style={{ flex: 1, minWidth: 200 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Pagina del negozio sul sito ufficiale (per gli orari)" inputMode="url" autoComplete="off" />
      <button type="button" className="b piccolo" disabled={attesa} onClick={salva}>{attesa ? 'Leggo…' : 'Leggi orari'}</button>
    </div>
    {n.orari && !msg ? <span className="muto piccolo">Orari attuali ({n.orari_fonte === 'sito' ? 'dal sito' : n.orari_fonte === 'web' ? 'da internet' : n.orari_fonte === 'mano' ? 'a mano' : 'dalla mappa'}): {n.orari}</span> : null}
    {msg && <div className="ok piccolo">{msg}</div>}{err && <div className="errore">{err}</div>}
  </div>;
}
function NuovoNegozio({ onAggiungi }) {
  const [ind, setInd] = useState('');
  return <div className="riga"><input className="in" style={{ flex: 1, minWidth: 200 }} value={ind} onChange={(e) => setInd(e.target.value)} placeholder="Indirizzo di un negozio (via, numero, città)" /><button className="b" onClick={() => { if (ind.trim()) { onAggiungi(ind.trim()); setInd(''); } }}>Aggiungi</button></div>;
}
function Scontrini() {
  const s = useDati('/api/scontrini');
  return <>
    <a href="#altro" className="b piccolo" style={{ alignSelf: 'flex-start' }}>← Altro</a>
    {s.dati?.map((x) => <section key={x.id} className="carta">
      <div className="riga" style={{ justifyContent: 'space-between' }}><h2>{x.catena}</h2><b>{euro(x.totale)}</b></div>
      <span className="muto piccolo">{x.indirizzo} · {data(x.data)}/{x.data.slice(0, 4)} {x.ora}</span>
      <table className="tab"><tbody>{x.righe.map((r, i) => <tr key={i}><td>{r.testo}</td><td className="muto">{r.unita === 'kg' ? `${num(r.quantita, 3)} kg × ${euro(r.prezzo_unita)}` : `${num(r.quantita, 0)} × ${euro(r.prezzo_unita)}`}</td><td style={{ textAlign: 'right' }}>{euro(r.importo)}</td></tr>)}</tbody></table>
    </section>)}
  </>;
}
function Impostazioni({ stato, ricarica }) {
  const i = stato.impostazioni;
  const [v, setV] = useState({ area: i.area, citta: i.citta, casa: i.casa?.indirizzo || '', euro_km: conVirgola(i.euro_km), soglia_negozio: conVirgola(i.soglia_negozio), sosta: i.sosta, max_negozi: i.max_negozi });
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const cambia = (k, x) => setV((s) => ({ ...s, [k]: x }));
  return <>
    <a href="#altro" className="b piccolo" style={{ alignSelf: 'flex-start' }}>← Altro</a>
    <section className="carta"><h2>Impostazioni</h2>
      <label className="campo">Indirizzo di casa (partenza e arrivo del giro)<input value={v.casa} onChange={(e) => cambia('casa', e.target.value)} placeholder="Via, numero, città" /></label>
      {i.casa?.indirizzo && i.casa.lat == null && <div className="avviso">Non trovo la posizione di questo indirizzo: prova a scriverlo per intero.</div>}
      <label className="campo">Città dei prezzi<input value={v.citta} onChange={(e) => cambia('citta', e.target.value)} /></label>
      <span className="campo">Zona d'Italia</span>
      <div className="scelte">{[['centro-nord', 'Centro-Nord'], ['sud', 'Sud e isole']].map(([k, x]) => <button type="button" key={k} aria-pressed={v.area === k} onClick={() => cambia('area', k)}>{x}</button>)}</div>
      <div className="griglia2">
        <label className="campo">Costo dell'auto al km €<input inputMode="decimal" value={v.euro_km} onChange={(e) => cambia('euro_km', e.target.value)} /></label>
        <label className="campo">Un negozio in più deve farmi risparmiare almeno €<input inputMode="decimal" value={v.soglia_negozio} onChange={(e) => cambia('soglia_negozio', e.target.value)} /></label>
        <label className="campo">Minuti in ogni negozio<input inputMode="numeric" value={v.sosta} onChange={(e) => cambia('sosta', e.target.value)} /></label>
        <label className="campo">Al massimo quanti negozi<select value={v.max_negozi} onChange={(e) => cambia('max_negozi', Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      {msg && <div className="ok">{msg}</div>}{err && <div className="errore">{err}</div>}
      <button className="b pieno grande" onClick={async () => { setErr(''); setMsg(''); try { await api('/api/impostazioni', { metodo: 'PUT', corpo: { ...v, casa: { indirizzo: v.casa } } }); await ricarica(); setMsg('Impostazioni salvate'); } catch (e) { setErr(e.message); } }}>Salva</button>
    </section>
  </>;
}
function Pubblicita() {
  const a = useDati('/api/annunci'); const t = useDati('/api/tariffe'); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [apri, setApri] = useState(null);
  const fai = async (p, ok) => { setErr(''); setMsg(''); try { const d = await p; if (Array.isArray(d)) a.setDati(d); if (ok) setMsg(ok); return true; } catch (e) { setErr(e.message); return false; } };
  const salva = (x) => fai(api(x.id ? `/api/annunci/${x.id}` : '/api/annunci', { metodo: x.id ? 'PUT' : 'POST', corpo: x }), 'Salvato');
  const lista = a.dati || []; const oggi = new Date().toISOString().slice(0, 10);
  const vuoto = { titolo: '', testo: '', whatsapp: '', messaggio: '', link: '', bottone: 'Scopri di più', nota: '', attivo: true, mio: false, inserzionista: '', zona: '', posizione: '', pagato_fino: '' };
  return <>
    <a href="#altro" className="b piccolo" style={{ alignSelf: 'flex-start' }}>← Altro</a>
    <div className="intesta"><h1>Pubblicità in home</h1><p>Tre posti, in ordine come su Google: il 1° si vede per primo e paga di più. Il tuo annuncio occupa un posto come gli altri, oppure lo lasci fuori.</p></div>
    {msg && <div className="ok">{msg}</div>}{err && <div className="errore">{err}</div>}
    <section className="carta posti">
      <h2>I 3 posti</h2>
      {[1, 2, 3].map((n) => {
        const x = lista.find((y) => y.posizione === n && y.attivo);
        const prezzoLibero = t.dati?.tutti?.home?.[n - 1];
        return <div key={n} className={`posto ${x ? (x.visibile ? 'pieno' : 'scaduto') : 'libero'}`}>
          <b className="numero-posto">{n}°</b>
          {x ? <div className="colonna" style={{ gap: 4 }}>
            <b>{x.mio ? 'La tua pubblicità' : x.inserzionista}</b><span className="muto piccolo">«{x.titolo}»</span>
            {x.mio ? <span className="piccolo">Gratis (è tua)</span> : <span className="piccolo">{x.prezzo_posto != null ? `${euro(x.prezzo_posto)} ogni 2 settimane` : ''} · {x.attivi === 1 ? '1 persona attiva' : `${x.attivi} persone attive`} {x.zona ? `entro ${x.raggio} km` : 'in tutta l\'app'}</span>}
            {!x.mio && <span className={`piccolo ${x.visibile ? '' : 'rosso-testo'}`}>{x.pagato_fino ? (x.visibile ? `Pagato fino al ${data(x.pagato_fino)}` : `Scaduto il ${data(x.pagato_fino)}: non si vede`) : 'Non ancora pagato: non si vede'}</span>}
            <div className="riga" style={{ gap: 8 }}>
              {!x.mio && <button type="button" className="b pieno piccolo" onClick={() => fai(api(`/api/annunci/${x.id}/rinnova`, { metodo: 'POST', corpo: {} }), `Rinnovato per 2 settimane: ${euro(x.prezzo_posto)}`)}>+2 settimane ({euro(x.prezzo_posto)})</button>}
              <button type="button" className="b piccolo" onClick={() => setApri(x.id)}>Modifica</button>
              <button type="button" className="b piccolo" onClick={() => fai(api(`/api/annunci/${x.id}`, { metodo: 'PUT', corpo: { posizione: null } }), 'Posto liberato')}>Libera il posto</button>
            </div>
          </div> : <div className="colonna" style={{ gap: 4 }}><b>Libero</b><span className="muto piccolo">{prezzoLibero != null ? `Da ${euro(prezzoLibero)} ogni 2 settimane (con le persone attive di oggi in tutta l'app)` : ''}</span></div>}
        </div>;
      })}
      <p className="muto piccolo">Un annuncio pagato si vede fino alla data «pagato fino al»; poi sparisce e il posto si può dare ad altri. Con una zona, lo vede solo chi abita entro {t.dati?.raggio_km || 20} km.</p>
    </section>
    <PrezzoZona />
    <section className="colonna">
      <h2>Gli annunci</h2>
      {lista.map((x) => <details key={x.id} className="altre" open={apri === x.id}><summary>{x.posizione ? `${x.posizione}° posto · ` : 'Senza posto · '}{x.mio ? 'La tua' : x.inserzionista}: {x.titolo}{x.attivo ? '' : ' (spento)'}</summary>
        <FormAnnuncio x={x} onSalva={salva} oggi={oggi} /></details>)}
      <details className="altre"><summary>➕ Nuovo annuncio</summary><FormAnnuncio x={vuoto} onSalva={salva} nuovo oggi={oggi} /></details>
    </section>
    <Tariffe t={t} />
    <p className="muto piccolo">Per il credito: niente tassi o rate senza l'esempio con il TAEG, e nella nota l'iscrizione OAM e la banca.</p>
  </>;
}
// quanto costa in una zona: persone attive, posti in home, canone di un produttore
function PrezzoZona() {
  const [z, setZ] = useState(''); const [r, setR] = useState(null); const [err, setErr] = useState('');
  return <section className="carta"><h2>Quanto costa in una zona</h2>
    <form className="riga" onSubmit={async (e) => { e.preventDefault(); setErr(''); setR(null); try { setR(await api(`/api/tariffe/zona?zona=${encodeURIComponent(z)}`)); } catch (x) { setErr(x.message); } }}>
      <input className="in" style={{ flex: 1, minWidth: 180 }} value={z} onChange={(e) => setZ(e.target.value)} placeholder="Città o via e città (es. Copparo)" /><button className="b pieno piccolo" disabled={z.trim().length < 3}>Calcola</button></form>
    {err && <div className="errore">{err}</div>}
    {r && <p><b>{r.attivi}</b> persone attive entro {r.raggio} km. Home ogni 2 settimane: 1° posto <b>{euro(r.home[0])}</b>, 2° <b>{euro(r.home[1])}</b>, 3° <b>{euro(r.home[2])}</b>. Produttore: <b>{r.produttore ? `${euro(r.produttore)} al mese` : 'gratis (lancio)'}</b>.</p>}
  </section>;
}
// le tariffe: scaglioni per persone attive, percentuali dei posti, raggio della zona
function Tariffe({ t }) {
  const [v, setV] = useState(null); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  if (!t.dati) return null;
  const d = v || t.dati;
  const cambia = (k, i, j, x) => setV({ ...d, [k]: d[k].map((r, n) => (n === i ? r.map((c, m) => (m === j ? x : c)) : r)) });
  const tabella = (k, titolo, per) => <div className="colonna" style={{ gap: 6 }}><b>{titolo}</b>
    <table className="tab tariffe"><thead><tr><th>Persone attive fino a</th><th>{per}</th></tr></thead><tbody>
      {d[k].map((r, i) => <tr key={i}><td>{i === d[k].length - 1 ? 'oltre' : <input inputMode="numeric" value={r[0] ?? ''} onChange={(e) => cambia(k, i, 0, e.target.value)} />}</td><td><input inputMode="decimal" value={String(r[1]).replace('.', ',')} onChange={(e) => cambia(k, i, 1, e.target.value)} /> €</td></tr>)}
    </tbody></table></div>;
  return <details className="altre"><summary>Tariffe (modificabili)</summary>
    <div className="colonna" style={{ padding: '8px 0 12px' }}>
      <p className="muto piccolo">Oggi: {t.dati.tutti.attivi} persone attive in tutta l'app (ultimi 30 giorni).</p>
      {tabella('produttori', 'Produttori nella lista', 'Canone al mese (0 = gratis)')}
      {tabella('home', 'Pubblicità in home, 1° posto', 'Ogni 2 settimane')}
      <div className="griglia2">
        <label className="campo">2° posto, % del 1°<input inputMode="numeric" value={Math.round((d.posizioni[1] || 0.9) * 100)} onChange={(e) => setV({ ...d, posizioni: [1, Number(e.target.value) / 100, d.posizioni[2]] })} /></label>
        <label className="campo">3° posto, % del 1°<input inputMode="numeric" value={Math.round((d.posizioni[2] || 0.8) * 100)} onChange={(e) => setV({ ...d, posizioni: [1, d.posizioni[1], Number(e.target.value) / 100] })} /></label>
      </div>
      <label className="campo">Zona: raggio in km<input inputMode="numeric" value={d.raggio_km} onChange={(e) => setV({ ...d, raggio_km: e.target.value })} /></label>
      {msg && <div className="ok">{msg}</div>}{err && <div className="errore">{err}</div>}
      <button type="button" className="b pieno" disabled={!v} onClick={async () => { setErr(''); setMsg(''); try { await api('/api/tariffe', { metodo: 'PUT', corpo: v }); await t.ricarica(); setV(null); setMsg('Tariffe salvate'); } catch (e) { setErr(e.message); } }}>Salva le tariffe</button>
    </div></details>;
}
function FormAnnuncio({ x, onSalva, nuovo }) {
  const [v, setV] = useState({ ...x, attivo: !!x.attivo, mio: !!x.mio, posizione: x.posizione || '' }); const cambia = (k, y) => setV((s) => ({ ...s, [k]: y }));
  return <div className="colonna" style={{ padding: '8px 0 12px' }}>
    <label className="riga"><input type="checkbox" checked={v.mio} onChange={(e) => cambia('mio', e.target.checked)} /> È la mia pubblicità (gratis)</label>
    {!v.mio && <div className="griglia2"><label className="campo">Inserzionista (chi paga)<input value={v.inserzionista || ''} onChange={(e) => cambia('inserzionista', e.target.value)} placeholder="Es. Forno Bianchi" /></label>
      <label className="campo">Zona (città o via e città)<input value={v.zona || ''} onChange={(e) => cambia('zona', e.target.value)} placeholder="Es. Copparo; vuoto = tutta l'app" /></label></div>}
    <span className="nome-gruppo">Posto in home</span>
    <div className="scelte">{[['', 'Nessuno'], [1, '1°'], [2, '2°'], [3, '3°']].map(([k, t]) => <button type="button" key={k} aria-pressed={String(v.posizione) === String(k)} onClick={() => cambia('posizione', k)}>{t}</button>)}</div>
    {!v.mio && !nuovo && <label className="campo">Pagato fino al<input type="date" value={v.pagato_fino || ''} onChange={(e) => cambia('pagato_fino', e.target.value)} /></label>}
    <label className="campo">Titolo<input value={v.titolo} onChange={(e) => cambia('titolo', e.target.value)} /></label>
    <label className="campo">Testo<textarea rows={3} value={v.testo} onChange={(e) => cambia('testo', e.target.value)} /></label>
    <h4 className="sottotitolo">Pulsante «Scrivimi su WhatsApp»</h4>
    <div className="griglia2"><label className="campo">Numero WhatsApp<input inputMode="tel" value={v.whatsapp || ''} onChange={(e) => cambia('whatsapp', e.target.value)} placeholder="392 508 6998" /></label>
      <label className="campo">Messaggio già scritto<input value={v.messaggio || ''} onChange={(e) => cambia('messaggio', e.target.value)} placeholder="Ciao, vorrei informazioni…" /></label></div>
    <h4 className="sottotitolo">Pulsante «Scopri di più»</h4>
    <div className="griglia2"><label className="campo">Link della pagina<input inputMode="url" value={v.link} onChange={(e) => cambia('link', e.target.value)} placeholder="https://…" /></label>
      <label className="campo">Testo del pulsante<input value={v.bottone} onChange={(e) => cambia('bottone', e.target.value)} placeholder="Scopri di più" /></label></div>
    <p className="muto piccolo">Lascia vuoto il numero o il link per non mostrare quel pulsante.</p>
    <label className="campo">Nota (chi fa la pubblicità)<input value={v.nota} onChange={(e) => cambia('nota', e.target.value)} /></label>
    <label className="riga"><input type="checkbox" checked={v.attivo} onChange={(e) => cambia('attivo', e.target.checked)} /> Attivo</label>
    <button className="b pieno" onClick={() => onSalva({ ...v, posizione: v.posizione || null })}>{nuovo ? 'Aggiungi' : 'Salva'}</button>
    {!v.mio && nuovo && <p className="muto piccolo">Dopo averlo aggiunto, nel suo posto tocca «+2 settimane» quando ha pagato: da lì si vede.</p>}
  </div>;
}

// ---------- ricerca in cima alla lista: per ogni voce economico, italiano, bio e il mio preferito ----------
// ---------- scheda prodotto ----------
// ---------- nuovo prodotto da un codice a barre (con i dati di Open Food Facts se ci sono) ----------
// Altro → Inserisci un nuovo prodotto: una pagina sola con tutto (foto, nome, cos'è, formato, tipo, descrizione, prezzo e supermercato)
function NuovoProdotto() {
  const voci = useDati('/api/voci'); const catene = useDati('/api/catene');
  const [iniziale] = useState(() => { const x = mem.leggi('nuovo-prodotto', null); mem.scrivi('nuovo-prodotto', null); return x || {}; });
  return <section className="carta">
    <h2>Nuovo prodotto</h2>
    <p className="muto piccolo">{iniziale.ean ? `Codice ${iniziale.ean}. ` : ''}Compila dall'alto in basso e salva una volta sola. Quello che non sai, lascialo vuoto.</p>
    <FormProdotto iniziale={{ ...iniziale, quantita: undefined }} dettagliAperti voci={voci} catene={catene.dati} onSalvato={(p) => { location.hash = `#prodotto/${p.id}`; }} onAnnulla={() => history.back()} />
  </section>;
}
function NuovoDaCodice({ s, voci, onFatto, onAnnulla }) {
  const catene = useDati('/api/catene');
  const p = s.proposta;
  return <section className="carta">
    <h2>Nuovo prodotto</h2>
    {p ? <div className="riga">{p.foto && <img src={p.foto} alt="" style={{ height: 72, objectFit: 'contain' }} />}<span className="muto piccolo">Dati da Open Food Facts: controlla e completa.</span></div>
      : <p className="muto piccolo">{s.avviso || `Codice ${s.ean}: non è ancora nell'app né su Open Food Facts (l'archivio libero dei prodotti; app come Yuka hanno archivi loro, chiusi). Fotografa l'etichetta qui sotto e compilo io la scheda: da quel momento lo trovano tutti.`}</p>}
    <FormProdotto iniziale={{ ...(p || {}), ean: s.ean, quantita: undefined }} voci={voci} catene={catene.dati} onSalvato={onFatto} onAnnulla={onAnnulla} />
  </section>;
}

// 0.82 (Nazario, 07/11): prodotto nuovo dal codice a barre in poche mosse. Foto del davanti (è anche la foto della scheda),
// foto degli ingredienti (si può saltare), l'app legge l'etichetta e compila tutto; tu controlli nome e formato,
// tocchi il supermercato, scrivi il prezzo e salvi. La voce («che cos'è») la sceglie l'app dal nome: la cambi solo se vuoi.
const formatoDaLettura = (x) => {
  const q = x.quantita; const u = x.unita; if (!(q > 0)) return FORMATO_VUOTO('g');
  const f = u === 'kg' ? (q < 1 ? { n: conVirgola(Math.round(q * 1000)), u: 'g' } : { n: conVirgola(q), u: 'kg' }) : u === 'l' ? (q < 1 ? { n: conVirgola(Math.round(q * 1000)), u: 'ml' } : { n: conVirgola(q), u: 'l' }) : { n: conVirgola(q), u: 'pz' };
  return { ...FORMATO_VUOTO('g'), ...f, pezzi: x.pezzi > 1 && u !== 'pz' ? String(x.pezzi) : '', modo: x.pezzi > 1 ? 'tutti' : 'uno' };
};
function NuovoVeloce({ ean, avviso, onFatto, onAnnulla }) {
  const [passo, setPasso] = useState('davanti'); const [davanti, setDavanti] = useState(''); const [letto, setLetto] = useState(null);
  const [nome, setNome] = useState(''); const [fu, setFu] = useState(FORMATO_VUOTO('g'));
  const [catena, setCatena] = useState(mem.leggi('catena', null)); const [prezzo, setPrezzo] = useState(''); const [offerta, setOfferta] = useState(false);
  const [voce, setVoce] = useState(null); const [cambiaVoce, setCambiaVoce] = useState(false); const voci = useDati(cambiaVoce ? '/api/voci' : null);
  const [simili, setSimili] = useState(null); const [err, setErr] = useState(''); const [attesa, setAttesa] = useState(false); const [prepara, setPrepara] = useState('');
  const camera = useRef(null); const galleria = useRef(null); const chi = useRef('davanti');
  const scatta = (q, daGalleria = false) => { chi.current = q; setErr(''); (daGalleria ? galleria : camera).current?.click(); };
  const leggi = async (a, b) => {
    setPasso('lettura'); setErr('');
    try { const x = await api('/api/etichetta', { metodo: 'POST', corpo: { foto: [a, b].filter(Boolean) } }); setLetto(x); setNome(x.nome || ''); setFu(formatoDaLettura(x)); }
    catch (e) { setErr(`${e.message}. Scrivi tu nome e formato qui sotto.`); }
    setPasso('dati');
  };
  const presa = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setPrepara('Preparo la foto…');
    try { const foto = await riduciFoto(f, 1400, 0.85); setPrepara(''); if (chi.current === 'davanti') { setDavanti(foto); setPasso('ingredienti'); } else leggi(davanti, foto); }
    catch (x) { setPrepara(''); setErr(x.message || 'Questa foto non si apre: riprova'); }
  };
  // la voce la propone l'app dal nome, in silenzio
  useEffect(() => {
    if (cambiaVoce || nome.trim().length < 3) return undefined;
    const t = setTimeout(() => api(`/api/voci/proposta?nome=${encodeURIComponent(nome.trim())}`).then((r) => setVoce(r.voci[0] ? { id: r.voci[0].id, nome: r.voci[0].nome } : r.nuova ? { nuova: r.nuova, nome: r.nuova.nome } : null)).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [nome, cambiaVoce]);
  const corpo = async (voceId) => {
    let foto = letto?.foto || '';
    if (!foto && davanti) foto = (await api('/api/foto', { metodo: 'POST', corpo: { dati: davanti } }).catch(() => ({ foto: '' }))).foto;
    const df = fu.n.trim() ? datiFormato(fu) : { quantita: null, formato_unita: undefined, pezzi: null };
    const l = letto || {};
    return { nome: nome.trim(), ean, ...(voceId ? { voce_id: voceId } : {}), foto, tipo: l.marca ? 'marca' : 'senza', marca: l.marca || '', origine: l.origine || '', bio: !!l.bio,
      quantita: df.quantita, formato_unita: df.formato_unita, pezzi: df.pezzi, ingredienti: l.ingredienti || '', valori: l.valori || '', nutriscore: l.nutriscore || '',
      additivi: Array.isArray(l.additivi) ? (l.additivi.length ? l.additivi.join(', ') : 'nessuno') : '', imballaggio: l.imballaggio || '', produttore: l.produttore || '', descrizione: l.descrizione || '' };
  };
  const controlla = () => {
    if (nome.trim().length < 2) throw new Error('Scrivi il nome del prodotto');
    if (prezzo.trim() && !(Number(prezzo.replace(',', '.')) > 0)) throw new Error('Il prezzo non è valido: scrivi per esempio 3,99');
    if (prezzo.trim() && !catena) throw new Error('Tocca il supermercato dove l\'hai comprato');
  };
  const mettiPrezzo = async (pid) => { if (!prezzo.trim()) return; mem.scrivi('catena', catena); await api('/api/prezzi', { metodo: 'POST', corpo: { prodotto_id: pid, catena_id: catena, prezzo, offerta, fonte: 'scaffale' } }); };
  const salva = async (anche = false) => {
    setErr(''); setAttesa(true);
    try {
      controlla();
      // c'è già lo stesso prodotto senza codice (da uno scontrino o un volantino)? Si chiede prima di farne un doppione
      if (!anche) { const sm = await api(`/api/prodotti/simili?${new URLSearchParams({ nome: nome.trim(), ean, catena_id: catena || '' })}`).catch(() => []); if (sm.length) { setSimili(sm); return; } }
      let voceId = voce?.id;
      if (!voceId) voceId = (await api('/api/voci', { metodo: 'POST', corpo: voce?.nuova || { nome: nome.trim().split(/\s+/).slice(0, 3).join(' '), reparto: 'dispensa', unita: 'pz' } })).id;
      const p = await api('/api/prodotti', { metodo: 'POST', corpo: await corpo(voceId) });
      await mettiPrezzo(p.id); onFatto(p, { conPrezzo: !!prezzo.trim() });
    } catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  const eQuesto = async (x) => {
    setErr(''); setAttesa(true);
    try { const r = await api(`/api/prodotti/${x.id}/integra`, { metodo: 'POST', corpo: await corpo(null) }); await mettiPrezzo(x.id); onFatto(r.prodotto, { conPrezzo: !!prezzo.trim() }); }
    catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  const input = <><input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={presa} /><input ref={galleria} type="file" accept="image/*" hidden onChange={presa} /></>;
  return <section className="carta nuovo-veloce">
    {input}
    <h2>Prodotto nuovo</h2>
    {passo === 'davanti' && <><p className="muto">{avviso || `Il codice ${ean} non lo conosce ancora nessuno.`} Bastano due foto: compilo io la scheda.</p>
      <div className="passo-etichetta"><DisegnoDavanti /><div className="colonna"><p className="frase-etichetta">1. Fotografa il <b>DAVANTI</b></p><p className="muto">nome, marca e peso: sarà anche la foto della scheda</p></div></div>
      <button type="button" className="b pieno grande" onClick={() => scatta('davanti')}><Icona n="foto" /> Fotografa il davanti</button>
      <button type="button" className="link" onClick={() => scatta('davanti', true)}>Prendila dalle foto</button></>}
    {passo === 'ingredienti' && <><div className="passo-etichetta"><img src={davanti} alt="Il davanti" className="miniatura" /><div className="colonna"><p className="frase-etichetta">2. Ora gli <b>INGREDIENTI</b></p><p className="muto">e i valori nutrizionali, da vicino: così arriva anche il voto</p></div></div>
      <button type="button" className="b pieno grande" onClick={() => scatta('retro')}><Icona n="foto" /> Fotografa gli ingredienti</button>
      <button type="button" className="b" onClick={() => leggi(davanti, '')}>Non ci sono: leggi solo il davanti</button></>}
    {passo === 'lettura' && <p className="ok" role="status">Leggo l'etichetta… un attimo.</p>}
    {prepara && <p className="muto">{prepara}</p>}
    {passo === 'dati' && <div className="colonna" style={{ gap: 14 }}>
      {!letto && err && <div className="errore">{err}</div>}
      {letto && <p className="ok-letta" role="status">Ho letto l'etichetta{letto.ingredienti ? ', ingredienti compresi' : ''}{letto.nutriscore ? ` (Nutri-Score ${letto.nutriscore.toUpperCase()})` : ''}. Controlla nome e formato, poi prezzo e supermercato.</p>}
      <div className="riga" style={{ alignItems: 'flex-start' }}>{davanti && <img src={davanti} alt="" className="miniatura" />}
        <label className="campo" style={{ flex: 1 }}>Nome del prodotto<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Filetti di sgombro Delicius" /></label></div>
      <div className="colonna"><span className="nome-gruppo">Formato</span>
        <div className="formato-semplice"><input inputMode="decimal" value={fu.n} onChange={(e) => setFu({ ...fu, n: e.target.value })} placeholder="500" aria-label="Quanto contiene" />
          <div className="scelte">{[['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'litri'], ['pz', 'pezzi']].map(([u, t]) => <button key={u} type="button" aria-pressed={fu.u === u} onClick={() => setFu({ ...fu, u })}>{t}</button>)}</div></div>
        {Number(fu.pezzi) > 1 && <span className="muto piccolo">Confezione da {fu.pezzi} pezzi, {fu.n} {fu.u} in tutto</span>}</div>
      {voce && !cambiaVoce && <p className="muto piccolo">Lo metto in: <b>{voce.nome}</b> · <button type="button" className="link" onClick={() => setCambiaVoce(true)}>cambia</button></p>}
      {cambiaVoce && <CercaVoce etichetta="Che cos'è?" voci={voci.dati} ricaricaVoci={voci.ricarica} onScelta={(x) => { setVoce({ id: x.id, nome: x.nome }); setCambiaVoce(false); }} />}
      <span className="nome-gruppo">Dove l'hai preso</span>
      <ScegliCatena valore={catena} onScelta={setCatena} />
      <label className="campo">Prezzo della confezione<span className="euro-campo"><input className="grosso" inputMode="decimal" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} placeholder="0,00" /><b>€</b></span></label>
      <div className="scelte"><button type="button" aria-pressed={offerta} onClick={() => setOfferta(!offerta)}>{offerta ? '✓ ' : ''}Era in offerta</button></div>
      {simili && <div className="avviso colonna"><b>C'è già un prodotto così, senza codice a barre. È questo?</b>
        {simili.map((x) => <button key={x.id} type="button" className="b" disabled={attesa} onClick={() => eQuesto(x)}>Sì, è «{x.nome}»</button>)}
        <button type="button" className="link" onClick={() => { setSimili(null); salva(true); }}>No, è un prodotto diverso</button></div>}
      {err && letto && <div className="errore">{err}</div>}
      {!simili && <button type="button" className="b pieno grande" disabled={attesa} onClick={() => salva(false)}>{attesa ? 'Salvo…' : 'Salva'}</button>}
    </div>}
    {passo !== 'dati' && err && <div className="errore">{err}</div>}
    {passo !== 'dati' && <button type="button" className="link" onClick={() => { setErr(''); setPasso('dati'); }}>Scrivo io i dati, senza foto</button>}
    <button type="button" className="link" onClick={onAnnulla}>Annulla</button>
  </section>;
}

export { CercaVoce, Rileva, Scanner, Prezzi, Negozi, Scontrini, Impostazioni, Pubblicita, NuovoDaCodice, NuovoVeloce, NuovoProdotto, FormProdotto, LeggiEtichetta };
