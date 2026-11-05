// Scheda prodotto pensata per chi legge: foto, semaforo, perché, prezzi sul cartellino, ingredienti in chiaro.
import { useRef, useState } from 'react';
import { api, mem, useDati, ScegliCatena, euro, num, data, Etichette, StatoPrezzo, Cartellino, Icona, giudizioDi, perUnita, plurale, FormatoConfezione, FORMATO_VUOTO, datiFormato, numeroDa, riduciFoto, suCima } from './base.jsx';
import { FormProdotto, LeggiEtichetta } from './gestione.jsx';

const NOVA = { 1: 'Non lavorato o quasi', 2: 'Ingrediente da cucina (olio, burro, zucchero…)', 3: 'Lavorato', 4: 'Ultra-lavorato' };
const LIVELLO = { rosso: 'Da evitare se puoi', giallo: 'Da limitare', verde: 'Nessun problema noto' };

export function Scheda({ id, chiedi }) {
  const s = useDati(`/api/prodotti/${id}`); const voci = useDati('/api/voci'); const catene = useDati('/api/catene');
  const [modifica, setModifica] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [prezzo, setPrezzo] = useState(!!chiedi);
  const [saltato, setSaltato] = useState(false);
  if (s.errore) return <div className="errore">{s.errore}</div>;
  if (!s.dati) return <p className="muto">Carico…</p>;
  const p = s.dati; const g = giudizioDi(p.qualita);
  const chiediPrezzo = prezzo || (!saltato && !p.ultimi.length);
  // Dopo l'unione resta una scheda sola: se è l'altra, ci si va
  const unito = (nuovoId, t) => { setMsg(t); if (nuovoId && nuovoId !== p.id) location.hash = `#prodotto/${nuovoId}`; else s.ricarica(); };
  const azione = async (f, ok) => { setErr(''); setMsg(''); try { await f(); await s.ricarica(); if (ok) setMsg(ok); } catch (e) { setErr(e.message); } };
  const misura = (q) => (p.unita === 'kg' && q < 1 ? `${Math.round(q * 1000)} g` : p.unita === 'l' && q < 1 ? `${Math.round(q * 1000)} ml` : `${num(q, 3)} ${p.unita === 'pz' ? (q === 1 ? (p.pezzo || 'pezzo') : plurale(p.pezzo || 'pezzo')) : p.unita}`);
  const formato = p.sfuso ? `sfuso, al ${perUnita(p.unita, p.pezzo)}` : p.quantita > 0 ? (p.pezzi > 1 ? `confezione da ${p.pezzi} × ${misura(p.quantita / p.pezzi)} (${misura(p.quantita)})` : `confezione da ${misura(p.quantita)}`) : 'formato da completare';
  const rossi = p.additivi?.filter((x) => x.livello === 'rosso').length || 0; const gialli = p.additivi?.filter((x) => x.livello === 'giallo').length || 0;
  if (modifica) return <section className="carta"><h2>Modifica la scheda</h2><FormProdotto iniziale={p} voci={voci} catene={catene.dati} onSalvato={() => { setModifica(false); s.ricarica(); }} onAnnulla={() => setModifica(false)} /></section>;
  return <>
    <a className="torna" href={`#prezzi/${p.voce_id}`}><Icona n="indietro" d={22} />{p.voce}</a>
    {chiediPrezzo && <PrezzoVeloce p={p} nuovo={chiedi === 'nuovo'} vuoto={!p.ultimi.length} onFatto={(t) => { setPrezzo(false); setMsg(t); s.ricarica(); history.replaceState(null, '', `#prodotto/${p.id}`); }} onSalta={() => { setPrezzo(false); setSaltato(true); history.replaceState(null, '', `#prodotto/${p.id}`); }} />}
    <Doppioni key={`${p.id}-${p.ultimi.map((x) => x.id).join('.')}`} p={p} onUnito={unito} />
    <section className="scheda">
      <div className="scheda-testa">
        {p.foto ? <img className="scheda-foto" src={p.foto} alt={p.nome} /> : <AggiungiFoto p={p} onFatto={(t) => { setMsg(t); s.ricarica(); }} />}
        <div className="colonna" style={{ gap: 6 }}>
          <h1 className="scheda-nome">{p.nome}</h1>
          <p className="muto">{p.voce}, {formato}</p>
          <Etichette p={p} />
          {(() => { // dove si trova: il prezzo più basso per supermercato, al massimo 4
            const dove = [];
            for (const x of [...(p.ultimi || [])].filter((x) => x.quiValido !== false).sort((a, b) => a.prezzo - b.prezzo)) if (!dove.some((y) => y.catena_id === x.catena_id)) dove.push(x);
            return dove.length ? <span className="dove-si-trova">{dove.slice(0, 4).map((x) => <span key={x.catena_id} className="pill super-lista">{x.catena} · {euro(x.prezzo)}{x.offerta ? ' in offerta' : ''}</span>)}</span> : <span className="muto piccolo">Ancora nessun supermercato: aggiungi un prezzo</span>;
          })()}
        </div>
      </div>

      {msg && <div className="ok" role="status">{msg}</div>}{err && <div className="errore">{err}</div>}
      <div className="riga">
        <button type="button" className="b pieno grande" onClick={() => azione(() => api('/api/lista', { metodo: 'POST', corpo: { voce_id: p.voce_id, prodotto_id: p.id, quantita: p.sfuso ? 1 : (p.quantita || 1) } }), 'Messo in lista proprio questo prodotto')}>Metti in lista questo</button>
        {!chiediPrezzo && <button type="button" className="b grande contorno viola" onClick={() => { setPrezzo(true); suCima(); }}>Aggiungi un prezzo</button>}
        <button type="button" className={`b grande ${p.preferito ? 'giallo' : ''}`} aria-pressed={p.preferito} onClick={() => azione(() => api('/api/preferiti', { metodo: 'POST', corpo: { voce_id: p.voce_id, prodotto_id: p.preferito ? null : p.id } }), p.preferito ? 'Tolto dai preferiti' : `Ora è il tuo preferito per «${p.voce}»`)}>{p.preferito ? '★ È il mio preferito' : '☆ Segna come preferito'}</button>
      </div>

    </section>

    {/* 0.72 (Nazario, 05/11): la cosa che si cambia più spesso è il prezzo, quindi i prezzi vengono subito dopo il nome */}
    <section className="carta">
      <h2>Prezzi nei supermercati</h2>
      {!p.sfuso && !(p.quantita > 0) && <FormatoMancante p={p} onFatto={(t) => { setMsg(t); s.ricarica(); }} />}
      {p.ultimi.length ? <ul className="prezzi-scheda">{p.ultimi.map((x) => <RigaPrezzo key={x.id} x={x} p={p} onFatto={() => s.ricarica()} />)}</ul> : <p className="muto">Nessun prezzo ancora.</p>}
      {p.storia.length > 0 && <details className="altre"><summary>Prezzi precedenti ({p.storia.length})</summary><ul className="prezzi-scheda">{p.storia.map((x) => <RigaPrezzo key={x.id} x={x} p={p} storia onFatto={() => s.ricarica()} />)}</ul></details>}
    </section>

    <section className="scheda">
      <div className={`giudizio ${g ? g.colore : 'ignoto'}`}>
        <span className="luce grande" aria-hidden="true" />
        <div><b>{g ? g.parola : p.non_alimentare ? 'Ancora nessun voto' : 'Ancora pochi dati'}</b>
          <span>{g ? `${p.qualita} su 100${p.non_alimentare ? ', dai voti di chi lo usa' : ''}` : p.non_alimentare ? 'Per casa e igiene il giudizio viene dai voti di chi lo usa: tocca le stelle qui sotto.' : 'Servono Nutri-Score, ingredienti o i voti di chi l\'ha comprato.'}{rossi ? `. Contiene ${rossi === 1 ? '1 additivo' : `${rossi} additivi`} da evitare` : gialli ? `. Contiene ${gialli === 1 ? '1 additivo' : `${gialli} additivi`} da limitare` : ''}</span></div>
      </div>
      {g && p.perche?.parti?.length > 0 && <details className="perche-voto"><summary>Perché {p.qualita} su 100</summary>
        <table className="valori-nutri"><tbody>
          {p.perche.parti.filter((x) => x.max > 0).map((x) => <tr key={x.cosa}><td>{x.cosa}<br /><span className="muto piccolo">{x.testo}</span></td><td>{String(x.punti).replace('.', ',')} su {x.max}</td></tr>)}
          {p.perche.bonus.map((x) => <tr key={x.cosa}><td>{x.cosa}</td><td>{x.punti > 0 ? '+' : '−'}{Math.abs(x.punti)}</td></tr>)}
        </tbody></table>
        {p.perche.parti.filter((x) => x.max === 0).map((x) => <p key={x.cosa} className="muto piccolo">{x.cosa}: {x.testo}.</p>)}
        <p className="muto piccolo">Il voto è la percentuale dei punti presi su quelli che si possono dare con i dati che conosciamo{p.perche.bonus.length ? ', più o meno i punti qui sopra' : ''}.</p>
      </details>}
      {p.puoUnire && <UnisciCerca key={p.id} p={p} onUnito={unito} />}
      <dl className="dati">
        {!p.non_alimentare && <><div><dt>Valori nutrizionali</dt><dd>{p.nutriscore ? <><span className={`nutri n${p.nutriscore}`}>{p.nutriscore.toUpperCase()}</span> Nutri-Score</> : <span className="muto">Non si sa</span>}</dd></div>
        {p.valori && (() => { // valori nutrizionali letti dall'etichetta, per 100 g o 100 ml
          let v = {}; try { v = JSON.parse(p.valori); } catch { /* niente */ }
          const righe = [['Energia', v.energia_kcal != null ? `${num(v.energia_kcal, 0)} kcal` : v.energia_kj != null ? `${num(v.energia_kj, 0)} kJ` : null], ['Grassi', v.grassi], ['di cui saturi', v.grassi_saturi], ['Carboidrati', v.carboidrati], ['di cui zuccheri', v.zuccheri], ['Fibre', v.fibre], ['Proteine', v.proteine], ['Sale', v.sale]]
            .filter(([, x]) => x != null).map(([k, x]) => [k, typeof x === 'number' ? `${num(x, 1)} g` : x]);
          return <div><dt>Per 100 {v.categoria === 'bevanda' ? 'ml' : 'g'}</dt><dd><table className="valori-nutri"><tbody>{righe.map(([k, x]) => <tr key={k}><td>{k}</td><td>{x}</td></tr>)}</tbody></table>
            <span className="muto piccolo">Letti dall'etichetta: il Nutri-Score si calcola da questi.</span></dd></div>;
        })()}
        <div><dt>Lavorazione</dt><dd>{p.nova ? NOVA[p.nova] : <span className="muto">Non si sa</span>}</dd></div>
        <div><dt>Additivi</dt><dd>{p.additivi == null ? <span className="muto">Non si sa</span> : !p.additivi.length ? 'Nessun additivo' : <ul className="additivi">
          {p.additivi.map((a) => <li key={a.codice} className={a.livello}><span className="luce" aria-hidden="true" /><div><b>{a.codice}{a.nome ? ` ${a.nome}` : ''}</b><span>{LIVELLO[a.livello]}{a.perche ? `. ${a.perche}` : ''}</span></div></li>)}
        </ul>}</dd></div></>}
        <div><dt>Confezione</dt><dd>{p.imballaggio ? { vetro: 'Vetro (+5 punti nel voto)', plastica: 'Plastica', carta: 'Carta o cartone', metallo: 'Metallo (latta, alluminio)' }[p.imballaggio] : <span className="muto">Non indicata</span>}</dd></div>
        <div><dt>Origine</dt><dd>{p.origine === 'italia' ? 'Italia' : p.origine === 'estero' ? 'Estero' : <span className="muto">Non indicata</span>}{p.provenienza ? `, ${p.provenienza}` : ''}{p.produttore ? <><br /><span className="muto">Prodotto da {p.produttore}</span></> : null}</dd></div>
        <div><dt>Voti</dt><dd>
          {p.voto ? <p>{num(p.voto.media, 1)} stelle su 5, {p.voto.n === 1 ? '1 voto' : `${p.voto.n} voti`}</p> : <p className="muto">Nessuno l'ha ancora votato</p>}
          <div className="stelle" role="group" aria-label="Il tuo voto">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={n <= p.mioVoto ? 'piena' : ''} aria-label={`${n} ${n === 1 ? 'stella' : 'stelle'}`} aria-pressed={n === p.mioVoto} onClick={() => azione(() => api('/api/valutazioni', { metodo: 'POST', corpo: { prodotto_id: p.id, stelle: n === p.mioVoto ? 0 : n } }), n === p.mioVoto ? 'Voto tolto' : 'Grazie del voto')}>★</button>)}</div>
          <span className="muto piccolo">Tocca le stelle per dare il tuo voto</span>
        </dd></div>
      </dl>

      {p.descrizione && <p>{p.descrizione}</p>}
      {p.ingredienti && <div className="ingredienti"><h2>{p.non_alimentare ? 'Composizione' : 'Ingredienti'}</h2><p>{p.ingredienti}</p></div>}
      {p.note && <p className="muto">{p.note}</p>}
      {/* mancano dati per il giudizio: si leggono dalle foto dell'etichetta */}
      {!p.non_alimentare && !p.sfuso && p.reparto !== 'ortofrutta' && (!p.nutriscore || p.additivi == null || !p.ingredienti) && <LeggiEtichetta evidente={!g} titolo={g ? 'Rendi il giudizio più preciso: fotografa l\'etichetta' : 'Dai un giudizio a questo prodotto: fotografa l\'etichetta'} testoFatto="Ho aggiunto alla scheda i dati che mancavano." onLetta={async (l) => {
        const r = await api(`/api/prodotti/${p.id}/integra`, { metodo: 'POST', corpo: { ingredienti: l.ingredienti, additivi: Array.isArray(l.additivi) ? l.additivi : undefined, nutriscore: l.nutriscore, valori: l.valori || undefined, imballaggio: l.imballaggio || undefined, produttore: l.produttore, descrizione: l.descrizione, origine: l.origine || undefined, bio: l.bio || undefined, foto: l.foto, ...(l.quantita > 0 ? { quantita: l.quantita, formato_unita: l.unita, pezzi: l.pezzi } : {}) } });
        setMsg(r.campi?.length ? `Ho aggiunto: ${r.campi.join(', ')}.` : 'La scheda aveva già questi dati.'); await s.ricarica();
      }} />}

    </section>

    <div className="colonna">
      <button type="button" className="b" onClick={() => { setModifica(true); suCima(); }}>Modifica la scheda</button>
      {p.ean && <button type="button" className="b" onClick={() => azione(() => api(`/api/prodotti/${p.id}/off`, { metodo: 'POST' }), 'Scheda completata con i dati di Open Food Facts')}>Completa con Open Food Facts</button>}
      {p.non_alimentare ? <p className="muto piccolo">Per i prodotti per la casa e l'igiene il giudizio viene dai voti di chi li usa: più voti ci sono, più è affidabile.</p> : <p className="muto piccolo">Il giudizio mette insieme Nutri-Score, additivi, lavorazione, bio, origine e i voti di chi l'ha comprato. Gli additivi sono valutati sui pareri pubblici dell'EFSA, della IARC e sulle regole UE dell'etichetta: è un'indicazione, non un parere medico.{p.ean ? ` Codice a barre ${p.ean}.` : ''}</p>}
    </div>
  </>;
}

// Subito dopo il codice a barre: quanto l'hai pagato e dove (il supermercato si ricorda per la volta dopo)
function PrezzoVeloce({ p, nuovo, vuoto, onFatto, onSalta }) {
  const catene = useDati('/api/catene');
  const [catena, setCatena] = useState(() => mem.leggi('catena', null));
  const [prezzo, setPrezzo] = useState(''); const [offerta, setOfferta] = useState(false); const [err, setErr] = useState('');
  const [dal, setDal] = useState(''); const [al, setAl] = useState('');
  const sfuso = !!p.sfuso; const formato = !sfuso && p.quantita > 0;
  const etichetta = sfuso ? `Prezzo al ${perUnita(p.unita, p.pezzo)}` : p.unita === 'pz' && p.quantita === 1 ? 'Prezzo' : formato ? `Prezzo della confezione (${p.unita === 'kg' && p.quantita < 1 ? `${Math.round(p.quantita * 1000)} g` : p.unita === 'l' && p.quantita < 1 ? `${Math.round(p.quantita * 1000)} ml` : `${num(p.quantita, 3)} ${p.unita}`})` : 'Prezzo della confezione';
  // Nello stesso supermercato c'è già un prezzo (non un'offerta a tempo): prima di cambiarlo si chiede
  const [conferma, setConferma] = useState(null);
  const stessa = catena ? (p.ultimi || []).find((x) => x.catena_id === catena && !(x.offerta && x.valido_al)) : null;
  const salva = async (e, sicuro = false) => {
    e?.preventDefault?.(); setErr('');
    if (!catena) { setErr('Tocca il supermercato dove l\'hai comprato'); return; }
    const nuovoPrezzo = Number(String(prezzo).replace(',', '.'));
    if (!sicuro && stessa && !(offerta && al)) { setConferma({ vecchio: stessa, nuovo: nuovoPrezzo }); return; }
    setConferma(null);
    try {
      await api('/api/prezzi', { metodo: 'POST', corpo: { prodotto_id: p.id, catena_id: catena, prezzo, offerta, valido_dal: offerta ? dal : '', valido_al: offerta ? al : '', fonte: 'scaffale' } });
      mem.scrivi('catena', catena);
      onFatto(`Prezzo salvato: ${euro(Number(String(prezzo).replace(',', '.')))} da ${catene.dati?.find((c) => c.id === catena)?.nome || ''}. Grazie!`);
    } catch (x) { setErr(x.message); }
  };
  return <form className="prezzo-veloce" onSubmit={salva}>
    {nuovo && <p className="ok">Ho trovato il prodotto e ho compilato la scheda da solo.</p>}
    <h2>{vuoto && !nuovo ? 'Nessun prezzo ancora: quanto costa e dove?' : 'Quanto l\'hai pagato e dove?'}</h2>
    <span className="nome-gruppo">Supermercato</span>
    <ScegliCatena valore={catena} onScelta={setCatena} />
    <label className="campo">{etichetta}
      <span className="euro-campo"><input className="grosso" inputMode="decimal" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} placeholder="0,00" autoFocus={!nuovo} /><b>€</b></span></label>
    <div className="scelte"><button type="button" aria-pressed={offerta} onClick={() => setOfferta(!offerta)}>{offerta ? '✓ ' : ''}Era in offerta</button></div>
    {offerta && <DateOfferta dal={dal} al={al} setDal={setDal} setAl={setAl} />}
    {err && <div className="errore">{err}</div>}
    {conferma ? <div className="conferma-prezzo" role="alertdialog">
      <p>Da <b>{conferma.vecchio.catena}</b> il prezzo è <b>{euro(conferma.vecchio.prezzo)}</b> (rilevato il {data(conferma.vecchio.rilevato_il)}).</p>
      <p className="frase-conferma">Aggiorno il prezzo a <b>{euro(conferma.nuovo)}</b>?</p>
      <div className="riga" style={{ flexWrap: 'wrap' }}><button type="button" className="b pieno grande" onClick={() => salva(null, true)}>Sì, aggiorna il prezzo</button>
        <button type="button" className="b" onClick={() => setConferma(null)}>No, lascia {euro(conferma.vecchio.prezzo)}</button></div>
      <span className="muto piccolo">Il prezzo vecchio non si somma: resta solo nello storico. Se invece è un'offerta a tempo, tocca «Era in offerta» e scrivi le date.</span>
    </div> : <button className="b pieno grande" disabled={!prezzo.trim()}>Salva il prezzo</button>}
    <button type="button" className="link" onClick={onSalta}>Non ce l'ho, salta</button>
  </form>;
}

// Quanto dura l'offerta: dal… al… (si può lasciare vuoto)
function DateOfferta({ dal, al, setDal, setAl }) {
  return <div className="date-offerta">
    <span className="muto piccolo">Fino a quando vale l'offerta? Lo trovi sul volantino o sul cartellino.</span>
    <div className="griglia2">
      <label className="campo">Dal<input type="date" value={dal} onChange={(e) => setDal(e.target.value)} /></label>
      <label className="campo">Al<input type="date" value={al} onChange={(e) => setAl(e.target.value)} /></label>
    </div>
  </div>;
}
// Un prezzo, con la correzione per chi l'ha inserito o per chi gestisce (scontrino letto male, cifra sbagliata)
function RigaPrezzo({ x, p, storia = false, onFatto }) {
  const [apri, setApri] = useState(false); const [v, setV] = useState(String(x.prezzo).replace('.', ',')); const [off, setOff] = useState(!!x.offerta); const [err, setErr] = useState('');
  const [dal, setDal] = useState(x.valido_dal || ''); const [al, setAl] = useState(x.valido_al || '');
  const per = perUnita(p.unita, p.pezzo);
  const conf = !p.sfuso && p.quantita > 0 ? (p.unita === 'kg' && p.quantita < 1 ? `${Math.round(p.quantita * 1000)} g` : p.unita === 'l' && p.quantita < 1 ? `${Math.round(p.quantita * 1000)} ml` : `${num(p.quantita, 3)} ${p.unita === 'pz' ? (p.quantita === 1 ? (p.pezzo || 'pezzo') : plurale(p.pezzo || 'pezzo')) : p.unita}`) : '';
  const fai = async (f) => { setErr(''); try { await f(); setApri(false); onFatto(); } catch (e) { setErr(e.message); } };
  // 0.72: si apre sempre con il prezzo di adesso (anche se intanto è stato cambiato da «Modifica la scheda»)
  const apriCorreggi = () => { setV(String(x.prezzo).replace('.', ',')); setOff(!!x.offerta); setDal(x.valido_dal || ''); setAl(x.valido_al || ''); setErr(''); setApri(true); };
  return <li className={apri ? 'aperto' : ''}>
    <div className="riga-prezzo">
      <div><b>{x.catena}</b><span>{storia ? `${data(x.rilevato_il)}/${x.rilevato_il.slice(2, 4)}` : `rilevato il ${data(x.rilevato_il)}`}{!storia && !x.quiValido ? ', non vale nella tua zona' : ''}</span>
        {!storia && <span className="etichette">{x.offerta ? <span className="pill offerta">offerta</span> : null}<StatoPrezzo s={x.stato} al={x.valido_al} /></span>}
        {x.modificabile && !apri && <button type="button" className="b piccolo contorno correggi-prezzo" onClick={apriCorreggi}>Correggi il prezzo</button>}</div>
      <div className="dx"><Cartellino n={x.prezzo} />{conf ? <span className="muto piccolo">la confezione da {conf}<br />= {euro(x.unitario)} al {per}</span> : p.sfuso ? <span className="muto piccolo">al {per}</span> : null}</div>
    </div>
    {apri && <div className="correggi">
      <label className="campo">{conf ? `Prezzo della confezione da ${conf}` : p.sfuso ? `Prezzo al ${per}` : 'Prezzo'}<span className="euro-campo"><input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus onFocus={(e) => e.target.select()} /><b>€</b></span></label>
      <div className="scelte"><button type="button" aria-pressed={off} onClick={() => setOff(!off)}>{off ? '✓ ' : ''}In offerta</button></div>
      {off && <DateOfferta dal={dal} al={al} setDal={setDal} setAl={setAl} />}
      {err && <div className="errore">{err}</div>}
      <div className="riga"><button type="button" className="b pieno" onClick={() => fai(() => api(`/api/prezzi/${x.id}`, { metodo: 'PUT', corpo: { prezzo: v, offerta: off, valido_dal: off ? dal : '', valido_al: off ? al : '' } }))}>Salva</button>
        <button type="button" className="b" onClick={() => setApri(false)}>Annulla</button>
        <button type="button" className="b rosso" onClick={() => fai(() => api(`/api/prezzi/${x.id}`, { metodo: 'DELETE' }))}>Cancella questo prezzo</button></div>
    </div>}
  </li>;
}
// Schede che sembrano lo stesso prodotto (scontrino e codice a barre): si uniscono o si segnano come diverse
function Doppioni({ p, onUnito }) {
  const d = useDati(`/api/prodotti/${p.id}/doppioni`);
  const [conferma, setConferma] = useState(null); const [err, setErr] = useState(''); const [diversi, setDiversi] = useState([]);
  const lista = (d.dati || []).filter((x) => !diversi.includes(x.id));
  if (!lista.length) return null;
  const unisci = async (x) => { setErr(''); try { const r = await api(`/api/prodotti/${p.id}/unisci`, { metodo: 'POST', corpo: { altro: x.id } }); setConferma(null); onUnito(r.id, 'Fatto: ora è una scheda sola, con tutti i prezzi e i dati'); } catch (e) { setErr(e.message); } };
  const diverso = async (x) => { setErr(''); try { await api(`/api/prodotti/${p.id}/diversi`, { metodo: 'POST', corpo: { altro: x.id } }); setDiversi([...diversi, x.id]); } catch (e) { setErr(e.message); } };
  const sup = lista[0].supermercato;
  return <section className="doppioni">
    <h3>{lista.length === 1 ? (sup ? `Hai già questo prodotto da ${sup}?` : 'Hai già questo prodotto?') : 'È lo stesso prodotto di una di queste schede?'}</h3>
    <p className="muto">Sembra lo stesso prodotto entrato due volte (per esempio dallo scontrino e dal codice a barre). Se è così, uniscile: resta una scheda sola con tutti i prezzi, i dati e il voto.</p>
    {lista.map((x) => <div key={x.id} className="doppione">
      {x.foto ? <img src={x.foto} alt="" loading="lazy" /> : <span className="senza-foto"><Icona n="foto" d={26} /></span>}
      <div className="doppione-testo"><a href={`#prodotto/${x.id}`}><b>{x.nome}</b></a>
        <span className="etichette">{x.catena ? <span className="pill super-lista">{x.catena}{x.prezzo != null ? ` · ${euro(x.prezzo)}` : ''}</span> : null}{x.nome_scontrino ? <span className="muto piccolo">sullo scontrino «{x.nome_scontrino}»</span> : null}</span>
        {x.motivi?.length ? <span className="motivi">{x.motivi.map((m) => <span key={m}>{m}</span>)}</span> : null}</div>
      {conferma === x.id ? <div className="colonna"><button type="button" className="b pieno-verde" onClick={() => unisci(x)}>Sì, uniscile</button><button type="button" className="b" onClick={() => setConferma(null)}>Annulla</button></div>
        : <div className="colonna"><button type="button" className="b pieno-verde" onClick={() => setConferma(x.id)}>Sì, è lo stesso</button><button type="button" className="b" onClick={() => diverso(x)}>No, sono diversi</button></div>}
    </div>)}
    {err && <div className="errore">{err}</div>}
  </section>;
}
// Unire a mano: si cerca l'altra scheda per nome (anche scritto diverso) e si conferma
function UnisciCerca({ p, onUnito }) {
  const [q, setQ] = useState(''); const [trovati, setTrovati] = useState(null); const [apri, setApri] = useState(false); const [conferma, setConferma] = useState(null); const [err, setErr] = useState('');
  const unisci = async (x) => { setErr(''); try { const r = await api(`/api/prodotti/${p.id}/unisci`, { metodo: 'POST', corpo: { altro: x.id } }); setConferma(null); setTrovati(null); setQ(''); setApri(false); onUnito(r.id, `Unito: «${x.nome}» e questa ora sono una scheda sola`); } catch (e) { setErr(e.message); } };
  const cerca = async (e) => {
    e?.preventDefault(); setErr('');
    const t = q.trim(); if (t.length < 2) return;
    try { const r = await api(`/api/prodotti?q=${encodeURIComponent(t)}`); setTrovati(r.filter((x) => x.id !== p.id).slice(0, 15)); } catch (x) { setErr(x.message); }
  };
  return <section className="doppioni piano unisci-cerca">
    {apri ? <form onSubmit={cerca} className="colonna">
      <label className="muto">Cerca la scheda da unire a questa (anche con un nome diverso, per esempio in inglese)</label>
      <div className="riga-cerca"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="es. peanuts, arachidi…" autoFocus /><button className="b pieno-verde">Cerca</button></div>
      {trovati && !trovati.length && <p className="muto">Nessuna scheda trovata con «{q}».</p>}
      {trovati?.map((x) => <div key={x.id} className="doppione">
        {x.foto ? <img src={x.foto} alt="" loading="lazy" /> : <span className="senza-foto"><Icona n="foto" d={26} /></span>}
        <div className="doppione-testo"><a href={`#prodotto/${x.id}`}><b>{x.nome}</b></a>
          <span className="etichette">{x.catena ? <span className="pill super-lista">{x.catena}</span> : null}{x.ean ? <span className="muto piccolo">codice {x.ean}</span> : <span className="muto piccolo">senza codice a barre</span>}</span></div>
        {conferma === x.id ? <div className="colonna"><button type="button" className="b pieno-verde" onClick={() => unisci(x)}>Sì, uniscile</button><button type="button" className="b" onClick={() => setConferma(null)}>Annulla</button></div>
          : <button type="button" className="b" onClick={() => setConferma(x.id)}>È lo stesso</button>}
      </div>)}
      <button type="button" className="b" onClick={() => { setApri(false); setTrovati(null); setQ(''); }}>Chiudi</button>
    </form> : <button type="button" className="b" onClick={() => setApri(true)}>Unisci con un altro prodotto…</button>}
    {err && <div className="errore">{err}</div>}
  </section>;
}
// Senza foto: il riquadro è un pulsante «Aggiungi foto»; si sceglie se farla con la fotocamera o prenderla dalla galleria
function AggiungiFoto({ p, onFatto }) {
  const [apri, setApri] = useState(false); const [stato, setStato] = useState(''); const camera = useRef(null); const galleria = useRef(null);
  const scelta = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setStato('Carico la foto…');
    try { const r = await api('/api/foto', { metodo: 'POST', corpo: { dati: await riduciFoto(f) } }); await api(`/api/prodotti/${p.id}`, { metodo: 'PUT', corpo: { foto: r.foto } }); setApri(false); setStato(''); onFatto('Foto aggiunta'); }
    catch (x) { setStato(x.message || 'Non sono riuscito a caricare la foto: riprova'); }
  };
  return <div className="aggiungi-foto">
    <button type="button" className="scheda-foto vuota apribile" aria-expanded={apri} onClick={() => setApri(!apri)}><Icona n="foto" d={36} /><span>Aggiungi foto</span></button>
    {apri && <div className="foto-scelte">
      <button type="button" className="b piccolo" onClick={() => camera.current?.click()}><Icona n="foto" d={20} /> Fotocamera</button>
      <button type="button" className="b piccolo" onClick={() => galleria.current?.click()}><Icona n="galleria" d={20} /> Galleria</button>
      {stato && <span className="muto piccolo" role="status">{stato}</span>}
    </div>}
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={scelta} />
    <input ref={galleria} type="file" accept="image/*" hidden onChange={scelta} />
  </div>;
}

// Confezione senza formato: senza "quanto contiene" non si può confrontare il prezzo al kg o al litro.
// Si chiede quanti pezzi ha la confezione e quanto contiene un pezzo (o tutta la confezione).
function FormatoMancante({ p, onFatto }) {
  const [f, setF] = useState(() => FORMATO_VUOTO(p.unita === 'l' ? 'ml' : p.unita === 'pz' ? 'pz' : 'g')); const [err, setErr] = useState('');
  const d = datiFormato(f);
  return <div className="avviso colonna">
    <b>Che confezione è?</b>
    <span>Senza questo dato il prezzo non si può confrontare {p.unita === 'pz' ? 'al pezzo' : `al ${p.unita}`} con gli altri prodotti.</span>
    <FormatoConfezione f={f} setF={setF} pezzo={p.pezzo} />
    {err && <div className="errore">{err}</div>}
    <button type="button" className="b pieno" disabled={!d.quantita} onClick={async () => { setErr(''); try { await api(`/api/prodotti/${p.id}`, { metodo: 'PUT', corpo: { quantita: d.quantita, formato_unita: d.formato_unita, pezzi: d.pezzi, sfuso: false } }); onFatto('Formato salvato: ora il prezzo si confronta'); } catch (e) { setErr(e.message); } }}>Salva il formato</button>
  </div>;
}
