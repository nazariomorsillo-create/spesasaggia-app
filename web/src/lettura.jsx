// Lettura di uno scontrino fotografato (chi gestisce): OCR, controllo riga per riga, abbinamento, caricamento dei prezzi.
import { useEffect, useState } from 'react';
import { api, useDati, euro, num, data as fData, ScegliCatena, Icona } from './base.jsx';
import { CercaVoce } from './gestione.jsx';

export function LetturaScontrino({ foto, onFatto, onChiudi }) {
  const [l, setL] = useState(foto.lettura ? JSON.parse(foto.lettura) : null);
  const [righe, setRighe] = useState([]); const [catena, setCatena] = useState(null); const [data, setData] = useState('');
  const [attesa, setAttesa] = useState(!foto.lettura); const [err, setErr] = useState(''); const [esito, setEsito] = useState(null);
  const voci = useDati('/api/voci');
  const leggi = async () => {
    setAttesa(true); setErr('');
    try { const r = await api(`/api/scontrini/foto/${foto.id}/leggi`, { metodo: 'POST', corpo: {} }); setL(r); } catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  useEffect(() => { if (!l) leggi(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (l) { setRighe(l.righe.map((r) => ({ ...r, usa: !!r.prodotto_id && !r.caricata }))); setCatena(l.catena_id); setData(l.data || ''); } }, [l]);
  const [doppio, setDoppio] = useState(false); // il server dice che lo scontrino è già stato caricato
  const cambia = (i, x) => setRighe((rs) => rs.map((r, k) => (k === i ? { ...r, ...x } : r)));
  const carica = async (ancheSeDoppio = false) => {
    setErr(''); setAttesa(true); setDoppio(false);
    try {
      const r = await api(`/api/scontrini/foto/${foto.id}/carica`, { metodo: 'POST', corpo: { catena_id: catena, data, numero: l.numero, totale: l.totale, anche_se_doppio: ancheSeDoppio || undefined, righe: righe.filter((x) => x.usa && x.prodotto_id && !x.caricata) } });
      setEsito(r.prezzi); onFatto?.();
    } catch (e) { setErr(e.message); if (/già stato caricato/.test(e.message)) setDoppio(true); } finally { setAttesa(false); }
  };
  const daCaricare = righe.filter((x) => x.usa && x.prodotto_id && !x.caricata).length;
  const giaEntrate = righe.filter((x) => x.caricata).length; // righe già caricate da sole (lettura automatica)
  return <section className="carta lettura">
    <div className="riga fra"><h2>Lettura dello scontrino</h2><button type="button" className="b tondo" onClick={onChiudi} aria-label="Chiudi"><Icona n="chiudi" /></button></div>
    <a href={foto.foto} target="_blank" rel="noopener"><img className="foto-lettura" src={foto.foto} alt="Scontrino" /></a>
    {attesa && !l && <p className="muto">Leggo la foto… ci vuole qualche secondo.</p>}
    {err && <div className="errore">{err}</div>}
    {esito != null ? <div className="ok">Fatto: {esito} prezzi caricati. Chi ha mandato lo scontrino riceve un grazie.</div> : l && <>
      <div className="griglia2">
        <div className="gruppo"><span className="nome-gruppo">Supermercato</span><ScegliCatena valore={catena} onScelta={setCatena} /></div>
        <label className="campo">Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
      </div>
      <p className="muto piccolo">{l.totale != null ? `Totale letto: ${euro(l.totale)}. ` : ''}{l.numero ? `Documento ${l.numero}. ` : ''}Controlla le righe: spunta quelle da caricare, abbina quelle che non riconosco.</p>
      <ul className="righe-lettura">{righe.map((r, i) => <li key={i} className={r.usa ? '' : 'spenta'}>
        <label className="riga-lettura"><input type="checkbox" checked={r.usa || !!r.caricata} disabled={!r.prodotto_id || r.caricata} onChange={(e) => cambia(i, { usa: e.target.checked })} />
          <div className="colonna" style={{ gap: 4, minWidth: 0 }}>
            <b>{r.testo}</b>
            <span className="muto piccolo">{r.unita === 'pz' ? `${r.quantita} × ${euro(r.prezzo_unita)}` : `${num(r.quantita, 3)} ${r.unita} × ${euro(r.prezzo_unita)} al ${r.unita}`} = {euro(r.importo)}{r.offerta ? ' (sconto)' : ''}</span>
            {r.caricata ? <span className="pill bio">✓ già caricato: {r.prodotto}</span> : r.prodotto_id ? <span className={`pill ${r.sicuro ? 'bio' : 'vecchio'}`}>{r.sicuro ? '✓' : '?'} {r.prodotto}{r.voce ? ` (${r.voce})` : ''}</span> : <span className="pill scaduto">non riconosciuto</span>}
            {!r.caricata && <Abbina r={r} voci={voci} onScelto={(p) => cambia(i, { prodotto_id: p.id, prodotto: p.nome, voce: p.voce || r.voce, sicuro: true, usa: true })} />}
          </div></label>
      </li>)}</ul>
      {giaEntrate > 0 && <p className="ok">{giaEntrate === 1 ? '1 riga è già entrata' : `${giaEntrate} righe sono già entrate`} da sola (prodotti riconosciuti con sicurezza). Qui restano le altre.</p>}
      {doppio && <button type="button" className="b" disabled={attesa} onClick={() => carica(true)}>È uno scontrino diverso: caricalo lo stesso</button>}
      <div className="riga"><button type="button" className="b pieno grande" disabled={attesa || !catena || !daCaricare} onClick={() => carica()}>Carica {daCaricare} {daCaricare === 1 ? 'prezzo' : 'prezzi'}</button>
        <button type="button" className="b" disabled={attesa} onClick={leggi}>Rileggi la foto</button></div>
    </>}
  </section>;
}

// Abbinare una riga a un prodotto: cerca tra quelli esistenti, oppure ne crea uno nuovo sotto una voce
function Abbina({ r, voci, onScelto }) {
  const [apri, setApri] = useState(false); const [q, setQ] = useState(''); const [ris, setRis] = useState([]); const [nuovo, setNuovo] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (!apri || q.trim().length < 2) { setRis([]); return undefined; } const t = setTimeout(() => api(`/api/prodotti?q=${encodeURIComponent(q.trim())}`).then((x) => setRis(x.slice(0, 8))).catch(() => {}), 250); return () => clearTimeout(t); }, [q, apri]);
  if (!apri) return <button type="button" className="link" onClick={() => { setApri(true); setQ(r.testo.toLowerCase().split(' ')[0]); }}>{r.prodotto_id ? 'Cambia prodotto' : 'Abbina a un prodotto'}</button>;
  const nome = r.testo.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return <div className="abbina">
    {!nuovo ? <>
      <input className="in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca il prodotto" autoFocus />
      {ris.length > 0 && <div className="suggerimenti">{ris.map((p) => <button type="button" key={p.id} onClick={() => { onScelto(p); setApri(false); }}>{p.nome} <span className="muto piccolo">({p.voce})</span></button>)}</div>}
      <div className="riga"><button type="button" className="link" onClick={() => setNuovo(true)}>È un prodotto nuovo</button><button type="button" className="link" onClick={() => setApri(false)}>Annulla</button></div>
    </> : <>
      <span className="nome-gruppo">Nuovo prodotto «{nome}»: di che cosa si tratta?</span>
      <CercaVoce etichetta="La voce (es. Biscotti, Zucchine)" voci={voci.dati} ricaricaVoci={voci.ricarica} onScelta={async (v) => {
        try { const p = await api('/api/prodotti', { metodo: 'POST', corpo: { voce_id: v.id, nome, tipo: 'senza', sfuso: r.unita !== 'pz', quantita: r.unita !== 'pz' ? null : (v.unita === 'pz' ? 1 : null), nome_scontrino: r.testo } }); onScelto({ ...p, voce: v.nome }); setApri(false); setNuovo(false); } catch (e) { setErr(e.message); }
      }} />
      <p className="muto piccolo">Se è una confezione, il formato (quanto contiene) si completa poi dalla scheda.</p>
      {err && <div className="errore">{err}</div>}
      <button type="button" className="link" onClick={() => setNuovo(false)}>Indietro</button>
    </>}
  </div>;
}
