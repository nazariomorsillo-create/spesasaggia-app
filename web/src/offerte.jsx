// Le offerte: l'altro modo di fare la spesa. «Di oggi» (valide adesso) o «In arrivo» (dai volantini letti in anticipo),
// per categoria (Frutta, Carne, Formaggi…: solo quelle con almeno un'offerta). Si tocca «Metti in lista».
import { useState } from 'react';
import { api, useDati, euro, data, quanto, Icona, Etichette, Semaforo, Cartellino } from './base.jsx';

// I miei preferiti: i prodotti buoni a buon prezzo che la famiglia compra, divisi per il supermercato dove costano meno
const formatoDi = (f) => (f ? (f.sfuso ? 'sfuso' : f.quantita > 0 ? quanto(f.quantita, f.unita, false, f.pezzo) : '') : '');
const alUnita = (u, pezzo) => (u === 'kg' ? 'al kg' : u === 'l' ? 'al litro' : `al ${pezzo || 'pezzo'}`);
export function MieiPreferiti() {
  const p = useDati('/api/miei-preferiti');
  if (p.errore) return <div className="errore">{p.errore}</div>;
  if (!p.dati) return <p className="muto">Carico…</p>;
  const { catene, migliore } = p.dati;
  return <>
    <div className="intesta"><h1>I miei preferiti</h1><p>I prodotti buoni a buon prezzo che compri, divisi per il supermercato dove costano meno.</p></div>
    {!catene.length && <div className="vuota">
      <p>Ancora niente qui.</p>
      <p>Compaiono i prodotti che compri (spese chiuse, preferiti e scelte nella lista) con un voto almeno <b>buono</b> e un buon rapporto qualità-prezzo.</p>
      <a className="b pieno grande" href="#lista">Vai alla lista</a>
    </div>}
    {catene.length > 1 && migliore && (catene[0].prodotti.length > catene[1].prodotti.length || catene[0].media > catene[1].media) && <section className="carta preferiti-vince">
      <Icona n="negozio" d={30} />
      <div><b>Ti conviene di più {migliore}</b><span>{catene[0].prodotti.length === 1 ? '1 prodotto buono' : `${catene[0].prodotti.length} prodotti buoni`} a buon prezzo, voto medio {catene[0].media} su 100</span></div>
    </section>}
    {catene.map((c) => <section key={c.catena} className="carta preferiti-gruppo">
      <div className="preferiti-testa"><h2>{c.catena}</h2><span className="muto">{c.prodotti.length === 1 ? '1 prodotto' : `${c.prodotti.length} prodotti`} · voto medio {c.media}{c.mio ? '' : ' · non è tra i tuoi supermercati'}</span></div>
      <ul className="preferiti-lista">{c.prodotti.map((x) => <li key={x.id}>
        {x.foto ? <img src={x.foto} alt="" loading="lazy" /> : <span className="senza-foto" />}
        <a className="preferito-testo" href={`#prodotto/${x.id}`}>
          {x.saggia && <span className="bolla-consigliato piccola">✓ Scelta saggia</span>}
          <b>{x.nome}</b>
          <span className="muto piccolo">{[formatoDi(x.formato), `${euro(x.unitario)} ${alUnita(x.unita, x.pezzo)}`].filter(Boolean).join(' · ')}</span>
          <span className="etichette"><Semaforo q={x.qualita} piccolo sempre />{x.bio ? <span className="pill bio">Bio</span> : null}{x.italiano ? <span className="pill ita">Italiano</span> : null}{x.offerta ? <span className="pill offerta">offerta</span> : null}</span>
        </a>
        <span className="cartellino-col"><Cartellino n={x.prezzo} /><small>{x.formato?.sfuso ? alUnita(x.unita, x.pezzo) : 'la confezione'}</small></span>
      </li>)}</ul>
    </section>)}
    <p className="muto piccolo">Prezzi di oggi nei tuoi supermercati. Un prodotto compare se ha un voto almeno buono (55 su 100) e se, per quel che costa, è tra i migliori della stessa cosa.</p>
  </>;
}

export function Offerte({ stato }) {
  const o = useDati('/api/offerte');
  const [quando, setQuando] = useState('oggi'); // oggi | arrivo
  const [cat, setCat] = useState('tutte');
  const [messe, setMesse] = useState({}); const [err, setErr] = useState(''); const [attesa, setAttesa] = useState(null);
  if (o.errore) return <div className="errore">{o.errore}</div>;
  if (!o.dati) return <p className="muto">Cerco le offerte…</p>;
  const d = o.dati;
  const elenco = quando === 'arrivo' ? d.inArrivo || [] : d.offerte;
  const categorie = quando === 'arrivo' ? d.categorieInArrivo || [] : d.categorie || [];
  const visibili = elenco.filter((x) => cat === 'tutte' || x.categoria === cat);
  const cambiaQuando = (q) => { setQuando(q); setCat('tutte'); };
  const metti = async (x) => {
    setErr(''); setAttesa(x.prodotto_id);
    try { await api('/api/lista', { metodo: 'POST', corpo: { voce_id: x.voce_id, prodotto_id: x.prodotto_id, quantita: x.daMettere, scelto: true } }); setMesse({ ...messe, [x.prodotto_id]: true }); }
    catch (e) { setErr(e.message); } finally { setAttesa(null); }
  };
  const inLista = (x) => x.inLista || messe[x.prodotto_id];
  const quante = Object.keys(messe).length;
  const nArrivo = (d.inArrivo || []).length;
  return <>
    <div className="intesta"><h1>Le offerte</h1>
      <p>{d.offerte.length ? `${d.offerte.length === 1 ? '1 prodotto in offerta oggi' : `${d.offerte.length} prodotti in offerta oggi`} ${d.zona.ovunque ? 'nei supermercati che conosco' : 'nei tuoi supermercati e vicino a casa'}${nArrivo ? `, ${nArrivo} in arrivo` : ''}. Tocca «Metti in lista» e poi avvia il giro.` : 'Parti dalle offerte: scegli una categoria, metti in lista quello che ti serve e poi avvia il giro.'}</p></div>
    {err && <div className="errore">{err}</div>}
    {quante > 0 && <div className="ok riga fra"><span>{quante === 1 ? '1 offerta messa in lista' : `${quante} offerte messe in lista`}</span><a className="b pieno piccolo" href="#lista">Vai alla lista</a></div>}
    <div className="scelte grandi quando" role="tablist" aria-label="Quando">
      <button type="button" role="tab" aria-pressed={quando === 'oggi'} onClick={() => cambiaQuando('oggi')}>Di oggi ({d.offerte.length})</button>
      <button type="button" role="tab" aria-pressed={quando === 'arrivo'} onClick={() => cambiaQuando('arrivo')}>In arrivo ({nArrivo})</button>
    </div>
    {categorie.length > 1 && <div className="scelte reparti" role="tablist" aria-label="Categoria">
      <button type="button" role="tab" aria-pressed={cat === 'tutte'} onClick={() => setCat('tutte')}>Tutte ({elenco.length})</button>
      {categorie.map((c) => <button type="button" role="tab" key={c.categoria} aria-pressed={cat === c.categoria} onClick={() => setCat(c.categoria)}>{c.nome} ({c.n})</button>)}
    </div>}
    {!elenco.length && quando === 'oggi' && <div className="vuota">
      <p>Oggi non conosco offerte {d.zona.ovunque ? '' : 'nei tuoi supermercati'}.</p>
      <p>Le offerte arrivano dai volantini e dai prezzi segnati come «in offerta». Fotografa il volantino del tuo supermercato e le trovi qui.</p>
      <a className="b pieno grande" href="#volantino"><Icona n="galleria" /> Fotografa un volantino</a>
    </div>}
    {!elenco.length && quando === 'arrivo' && <div className="vuota"><p>Nessuna offerta in arrivo.</p><p>Qui compaiono le offerte dei volantini che cominciano nei prossimi giorni: le vedi prima che partano e le metti già in lista.</p></div>}
    {visibili.length > 0 && <ul className="offerte" aria-label="Prodotti in offerta">
      {visibili.map((x) => <li key={`${x.prodotto_id}-${x.catena_id}-${x.valido_dal || ''}`} className={`carta offerta-carta${inLista(x) ? ' in-lista' : ''}`}>
        <div className="offerta-testa">
          <span className="pill super">{x.catena}{x.mio ? ' ★' : ''}</span>
          {x.risparmio ? <span className="pill sconto">−{x.risparmio}%</span> : <span className="pill offerta">offerta</span>}
        </div>
        <div className="offerta-corpo">
          <div className="offerta-nome">
            <b>{x.nome}</b>
            <span className="muto">{x.voce}{x.sfuso ? ` · al ${x.unita === 'kg' ? 'chilo' : x.unita === 'l' ? 'litro' : 'pezzo'}` : x.quantita > 0 ? ` · ${quanto(x.quantita, x.unita, false, x.pezzo)}` : ''}</span>
            <span className="etichette"><Etichette p={x} />{x.solito && <span className="pill solito">Lo compri di solito</span>}</span>
            <Semaforo q={x.qualita} piccolo sempre />
          </div>
          <div className="offerta-prezzo">
            <span className="cartellino grande">{euro(x.prezzo).replace(/\s?€/, '')}<small> €</small></span>
            {x.normale && <s className="muto">{euro(x.normale)}</s>}
          </div>
        </div>
        <div className="offerta-piede">
          <span className="muto piccolo">{quando === 'arrivo' ? `Dal ${data(x.valido_dal)}${x.valido_al ? ` al ${data(x.valido_al)}` : ''}` : x.valido_al ? `Fino al ${data(x.valido_al)}` : 'Finché dura'}</span>
          {inLista(x) ? <span className="in-lista-ok"><Icona n="spunta" d={22} /> Nella lista</span>
            : <button type="button" className="b pieno" disabled={attesa === x.prodotto_id} onClick={() => metti(x)}>{attesa === x.prodotto_id ? 'Metto…' : 'Metti in lista'}</button>}
        </div>
      </li>)}
    </ul>}
    {elenco.length > 0 && !visibili.length && <p className="muto">In questa categoria non ci sono offerte.</p>}
  </>;
}
