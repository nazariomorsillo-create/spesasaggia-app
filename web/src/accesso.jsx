// Entrata: numero di cellulare → codice su WhatsApp → (se nuovo) il nome. Niente password.
import { useEffect, useRef, useState } from 'react';
import { api, mem, Icona } from './base.jsx';

export const invitoSalvato = () => mem.leggi('invito', null);
export function Accesso({ onFatto, titolare }) {
  const [passo, setPasso] = useState('numero');
  const [tel, setTel] = useState(''); const [codice, setCodice] = useState(''); const [nome, setNome] = useState('');
  const [err, setErr] = useState(''); const [attesa, setAttesa] = useState(false); const [ancora, setAncora] = useState(0);
  const rifCodice = useRef(null);
  const invito = invitoSalvato();
  useEffect(() => { if (ancora <= 0) return undefined; const t = setTimeout(() => setAncora(ancora - 1), 1000); return () => clearTimeout(t); }, [ancora]);
  useEffect(() => { if (passo === 'codice') rifCodice.current?.focus(); }, [passo]);
  const fai = async (f) => { setErr(''); setAttesa(true); try { await f(); } catch (e) { setErr(e.message); } finally { setAttesa(false); } };
  const chiedi = () => fai(async () => { await api('/api/accesso/codice', { metodo: 'POST', corpo: { telefono: tel } }); setPasso('codice'); setCodice(''); setAncora(45); });
  const entra = (cod = codice, n = '') => fai(async () => {
    const r = await api('/api/accesso/entra', { metodo: 'POST', corpo: { telefono: tel, codice: cod, nome: n || undefined, invito } });
    if (r.serveNome) { setPasso('nome'); return; }
    mem.scrivi('invito', null); onFatto();
  });
  return <main className="ingresso">
    <div className="ingresso-testa">
      <img className="logo grande" src="/icona.svg?v=3" alt="" width="88" height="88" />
      <h1>Spesa Saggia</h1>
      <p>La lista della spesa che ti dice dove costa meno e cosa conviene comprare.</p>
      {invito && <p className="ok">Ti hanno invitato a fare la spesa insieme: entra e avrete la stessa lista.</p>}
    </div>

    {passo === 'numero' && <form className="carta" onSubmit={(e) => { e.preventDefault(); chiedi(); }}>
      <label className="campo">Il tuo numero di cellulare
        <input className="grosso" type="tel" inputMode="tel" autoComplete="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="333 123 4567" autoFocus /></label>
      <p className="muto">Ti mando un messaggio WhatsApp con un codice di 6 cifre. Niente password da ricordare.</p>
      {err && <div className="errore">{err}</div>}
      <button className="b pieno grande" disabled={attesa || !tel.trim()}>{attesa ? 'Invio…' : 'Mandami il codice'}</button>
    </form>}

    {passo === 'codice' && <form className="carta" onSubmit={(e) => { e.preventDefault(); entra(); }}>
      <label className="campo">Scrivi il codice arrivato su WhatsApp
        <input ref={rifCodice} className="grosso codice" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codice}
          onChange={(e) => { const c = e.target.value.replace(/\D/g, '').slice(0, 6); setCodice(c); if (c.length === 6) entra(c); }} placeholder="••••••" /></label>
      <p className="muto">L'ho mandato al {tel}.</p>
      {err && <div className="errore">{err}</div>}
      <button className="b pieno grande" disabled={attesa || codice.length !== 6}>{attesa ? 'Controllo…' : 'Entra'}</button>
      <div className="riga fra">
        <button type="button" className="b" onClick={() => { setPasso('numero'); setErr(''); }}>Cambia numero</button>
        <button type="button" className="b" disabled={ancora > 0 || attesa} onClick={chiedi}>{ancora > 0 ? `Rimanda fra ${ancora} s` : 'Mandalo di nuovo'}</button>
      </div>
    </form>}

    {passo === 'nome' && <form className="carta" onSubmit={(e) => { e.preventDefault(); entra(codice, nome); }}>
      <label className="campo">Come ti chiami?
        <input className="grosso" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="given-name" placeholder="Il tuo nome" autoFocus /></label>
      <p className="muto">Serve solo per farti riconoscere da chi fa la spesa con te.</p>
      {err && <div className="errore">{err}</div>}
      <button className="b pieno grande" disabled={attesa || !nome.trim()}>Entra</button>
    </form>}

    <p className="muto piccolo centrato">Entrando accetti l'<a href="#privacy">informativa sulla privacy</a>. Usiamo il tuo numero solo per farti entrare{titolare ? `; titolare dei dati: ${titolare}` : ''}.</p>
  </main>;
}

export function Privacy({ titolare }) {
  return <main><section className="carta">
    <a className="torna" href="#" onClick={(e) => { e.preventDefault(); history.back(); }}><Icona n="indietro" d={22} />Indietro</a>
    <h1>Privacy</h1>
    <p><b>Chi tratta i dati.</b> {titolare || 'Il gestore del sito spesasaggia.it'}.</p>
    <p><b>Quali dati.</b> Il numero di cellulare e il nome che scrivi; la lista della spesa, le scelte (italiano, bio, marca), i preferiti e i voti; i supermercati che scegli e lo storico delle tue spese (cosa, dove, a quanto); l'indirizzo di casa se lo scrivi, per trovare i supermercati vicini e calcolare il giro; le foto e i prezzi che inserisci.</p>
    <p><b>Perché.</b> Per farti entrare (il codice su WhatsApp), per far funzionare la lista e il confronto dei prezzi. Prezzi, prodotti, foto e voti sono condivisi con la community, senza il tuo nome.</p>
    <p><b>Cosa non facciamo.</b> Non vendiamo i dati e non usiamo quello che compri per mandarti pubblicità mirata. Gli annunci nell'app sono uguali per tutti.</p>
    <p><b>Quanto li teniamo.</b> Finché usi l'app. Puoi chiedere in ogni momento di vedere, correggere o cancellare i tuoi dati scrivendo al titolare; puoi anche rivolgerti al Garante per la protezione dei dati personali.</p>
    <p className="muto piccolo">Il codice di accesso viaggia su WhatsApp (Meta). I dati stanno su un server in Europa.</p>
  </section></main>;
}
