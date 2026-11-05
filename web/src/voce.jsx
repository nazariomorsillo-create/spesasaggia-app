// Lista a voce: si tocca "Parla", si dice cosa serve, si controlla e si mette in lista.
// La trascrizione la fa il browser (dettatura in italiano); il server capisce quantità e prodotti.
// Tre stati, sempre scritti a schermo: «Accendo il microfono…», «Sto registrando» (con i secondi), «Microfono spento».
import { useCallback, useEffect, useRef, useState } from 'react';
import { quanto, nomeQualita, Icona } from './base.jsx';

const Riconoscimento = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const IPHONE = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

const SILENZIO_MS = 3000;      // dopo che hai parlato, 3 secondi di silenzio e mi fermo da solo
const NIENTE_MS = 10000;       // se in 10 secondi non sento niente, mi fermo e te lo dico
const AVVIO_MS = 6000;         // se il microfono non parte in 6 secondi, te lo dico
const MASSIMO_MS = 45000;      // una registrazione dura al massimo 45 secondi
const NON_SENTITO = IPHONE
  ? 'Non ho sentito niente. Tocca il microfono e parla subito. Se non funziona, scrivi qui sotto: tocca il riquadro e usa il microfono della tastiera.'
  : 'Non ho sentito niente. Tocca il microfono e parla subito, vicino al telefono.';

// i pezzi di testo che arrivano: alcuni telefoni ripetono la frase intera ogni volta («latte», «latte e pane»): si tiene solo l'ultima
function unisci(risultati) {
  const pezzi = [];
  for (let i = 0; i < risultati.length; i++) {
    const t = (risultati[i][0]?.transcript || '').trim(); if (!t) continue;
    const ult = pezzi[pezzi.length - 1];
    if (ult && t.toLowerCase().startsWith(ult.toLowerCase())) pezzi[pezzi.length - 1] = t;
    else if (!ult || !ult.toLowerCase().startsWith(t.toLowerCase())) pezzi.push(t);
  }
  return pezzi.join(' ');
}

export function useMicrofono(onTesto) {
  const [fase, setFase] = useState('spento'); // spento | avvio | ascolto
  const [parziale, setParziale] = useState('');
  const [errore, setErrore] = useState('');
  const [secondi, setSecondi] = useState(0);
  const sess = useRef(null); const cb = useRef(onTesto); cb.current = onTesto;

  // chiude la registrazione; con consegna=true il testo sentito va a capire cosa mettere in lista
  const chiudi = useCallback((consegna = true) => {
    const s = sess.current; if (!s || s.chiusa) return;
    s.chiusa = true; clearInterval(s.orologio);
    try { s.r?.abort(); } catch { /* già fermo */ }
    sess.current = null; setFase('spento'); setParziale(''); setSecondi(0);
    if (!consegna) return;
    const t = s.testo();
    if (t) cb.current?.(t); else if (!s.errore) setErrore(NON_SENTITO);
  }, []);

  const parti = useCallback((s) => {
    const r = new Riconoscimento(); s.r = r;
    r.lang = 'it-IT'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    const pronto = () => { if (s.chiusa) return; if (!s.partito) { s.partito = true; s.ascoltoDal = Date.now(); } setFase('ascolto'); };
    r.onstart = pronto; r.onaudiostart = pronto; r.onspeechstart = () => { pronto(); s.ultimo = Date.now(); };
    r.onresult = (e) => {
      if (s.chiusa) return;
      s.corrente = unisci(e.results); s.ultimo = Date.now(); pronto();
      setParziale(s.testo());
    };
    r.onerror = (e) => {
      if (s.chiusa) return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        s.errore = true; setErrore(IPHONE ? 'Il telefono non mi lascia usare il microfono. Su iPhone controlla: Impostazioni → Generali → Tastiera → Dettatura attiva, e Impostazioni → Safari → Microfono → Consenti. Intanto puoi scrivere qui sotto.' : 'Il telefono non mi lascia usare il microfono: consentilo nelle impostazioni del browser per questo sito, oppure scrivi qui sotto.');
      } else if (e.error === 'network') {
        s.errore = true; setErrore('Per capire la voce serve internet, e adesso non arriva. Riprova tra poco, oppure scrivi qui sotto.');
      } else if (e.error === 'audio-capture') {
        s.errore = true; setErrore('Il microfono è occupato da un\'altra app (una chiamata, un vocale?). Chiudila e riprova, oppure scrivi qui sotto.');
      }
      // no-speech e aborted: ci pensa onend (si riparte, oppure ci si ferma)
    };
    r.onend = () => {
      if (s.chiusa || sess.current !== s) return;
      // il telefono si è fermato da solo: il testo sentito fin qui resta
      if (s.corrente) { s.pezzi.push(s.corrente); s.corrente = ''; }
      if (s.errore) { chiudi(true); return; }
      const t = s.testo(); const ora = Date.now();
      // si riparte da soli: su iPhone solo la prima volta (quando compare la richiesta del microfono), sugli altri finché c'è tempo
      const riparti = IPHONE ? (!t && s.riavvii < 1 && ora - s.inizio < 2500)
        : (s.riavvii < 8 && ora - s.inizio < MASSIMO_MS && !(t && ora - s.ultimo > SILENZIO_MS));
      if (!riparti) { chiudi(true); return; }
      s.riavvii += 1;
      setTimeout(() => { if (s.chiusa) return; try { parti(s); } catch { chiudi(true); } }, 200);
    };
    r.start();
  }, [chiudi]);

  // va chiamata dentro il tocco del pulsante: i telefoni chiedono il permesso del microfono solo così
  const avvia = useCallback(() => {
    setErrore(''); setParziale('');
    if (!Riconoscimento) return false;
    if (sess.current) chiudi(false);
    const s = { pezzi: [], corrente: '', inizio: Date.now(), ascoltoDal: 0, ultimo: 0, riavvii: 0, partito: false, chiusa: false, errore: false };
    s.testo = () => [...s.pezzi, s.corrente].join(' ').replace(/\s+/g, ' ').trim();
    sess.current = s; setFase('avvio'); setSecondi(0);
    // l'orologio: mostra i secondi e si ferma da solo nei casi in cui il telefono resterebbe "appeso"
    s.orologio = setInterval(() => {
      if (s.chiusa) return;
      const ora = Date.now();
      if (s.partito) setSecondi(Math.floor((ora - s.ascoltoDal) / 1000));
      if (!s.partito && ora - s.inizio > AVVIO_MS) { s.errore = true; setErrore('Il microfono non è partito. Tocca di nuovo il microfono, oppure scrivi qui sotto.'); chiudi(true); return; }
      const t = s.testo();
      if (t && s.ultimo && ora - s.ultimo > SILENZIO_MS) { chiudi(true); return; }
      if (!t && s.partito && ora - s.ascoltoDal > NIENTE_MS) { chiudi(true); return; }
      if (ora - s.inizio > MASSIMO_MS) chiudi(true);
    }, 250);
    try { parti(s); return true; } catch { s.errore = true; setErrore('Il microfono non è partito. Tocca di nuovo il microfono, oppure scrivi qui sotto.'); chiudi(false); return false; }
  }, [chiudi, parti]);

  const ferma = useCallback(() => chiudi(true), [chiudi]);   // «Ho finito»: si usa subito quello che ho sentito
  const annulla = useCallback(() => chiudi(false), [chiudi]); // chiudo la finestra: non si usa niente
  useEffect(() => () => annulla(), [annulla]);
  return { fase, ascolta: fase !== 'spento', parziale, errore, setErrore, secondi, avvia, ferma, annulla, disponibile: !!Riconoscimento };
}

const tempo = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function Parla({ mic, proposte, setProposte, attesa, onTesto, onChiudi, onFatto }) {
  const [scritto, setScritto] = useState('');
  const [err, setErr] = useState('');
  const chiudi = () => { mic.annulla(); onChiudi(); };
  useEffect(() => { const f = (e) => e.key === 'Escape' && chiudi(); addEventListener('keydown', f); return () => removeEventListener('keydown', f); });
  const metti = async () => { setErr(''); try { await onFatto(proposte); } catch (e) { setErr(e.message); } };
  const ci = proposte.length > 0;
  const avvio = mic.fase === 'avvio'; const registra = mic.fase === 'ascolto';
  const titolo = avvio ? 'Accendo il microfono…' : registra ? 'Sto registrando' : attesa ? 'Un attimo…' : ci ? 'Ho capito così' : 'Lista a voce';
  return <div className="velo" role="dialog" aria-modal="true" aria-labelledby="parla-titolo">
    <div className="pannello-voce">
      <div className="testa-voce">
        <h2 id="parla-titolo">{titolo}</h2>
        <button type="button" className="b tondo" onClick={chiudi} aria-label="Chiudi"><Icona n="chiudi" /></button>
      </div>

      {mic.ascolta && <>
        <div className={`stato-mic ${registra ? 'acceso' : 'avvio'}`} role="status" aria-live="polite">
          <span className="pallino" aria-hidden="true" />
          {registra ? <><b>Registrazione in corso</b><span className="secondi">{tempo(mic.secondi)}</span></> : <b>Aspetta, tra un attimo puoi parlare</b>}
        </div>
        <button type="button" className={`microfono grande${registra ? ' ascolta' : ' avvio'}`} onClick={mic.ferma} aria-label="Ho finito di parlare"><Icona n="microfono" d={56} /></button>
        <p className={`dettato${mic.parziale ? '' : ' muto'}`}>{mic.parziale || (registra ? 'Parla adesso. Di\' le cose una dopo l\'altra: «due chili di patate, il latte e la pasta».' : '')}</p>
        <button type="button" className="b pieno grande" onClick={mic.ferma} disabled={avvio}><Icona n="spunta" /> Ho finito di parlare</button>
        {registra && <p className="muto centrato piccolo">Se smetti di parlare per 3 secondi mi fermo da solo: non serve toccare altro.</p>}
      </>}

      {!mic.ascolta && attesa && <div className="stato-mic capisco" role="status"><span className="pallino" aria-hidden="true" /><b>Sto capendo cosa hai detto…</b></div>}

      {!mic.ascolta && ci && <>
        <ul className="capito">{proposte.map((c, k) => <li key={`${c.nome}-${k}`}>
          <div><b>{c.nome}</b><span>{quanto(c.quantita, c.unita, c.circa)}{c.qualita !== 'qualsiasi' ? `, ${nomeQualita(c.qualita).toLowerCase()}` : ''}{c.marca.startsWith('brand:') ? `, ${c.marca.slice(6)}` : ''}{c.nuova ? ', nuovo in elenco' : ''}</span></div>
          <button type="button" className="b tondo rosso" aria-label={`Togli ${c.nome}`} onClick={() => setProposte(proposte.filter((_, i) => i !== k))}><Icona n="chiudi" d={22} /></button>
        </li>)}</ul>
        {mic.errore && <div className="avviso">{mic.errore}</div>}
        {err && <div className="errore">{err}</div>}
        <button type="button" className="b pieno grande" onClick={metti}><Icona n="spunta" /> Metti in lista {proposte.length === 1 ? '1 cosa' : `${proposte.length} cose`}</button>
        {mic.disponibile && <button type="button" className="b grande" onClick={() => mic.avvia()}><Icona n="microfono" /> Aggiungi altro a voce</button>}
      </>}

      {!mic.ascolta && !ci && !attesa && <>
        {mic.errore && <div className="avviso">{mic.errore}</div>}
        {mic.disponibile && <>
          <div className="stato-mic spento" role="status"><span className="pallino" aria-hidden="true" /><b>Microfono spento</b></div>
          <button type="button" className="microfono grande" onClick={() => mic.avvia()} aria-label="Tocca e parla"><Icona n="microfono" d={56} /></button>
          <p className="centrato"><b>Tocca il microfono</b>, aspetta la scritta rossa «Registrazione in corso» e parla.</p>
        </>}
        {IPHONE && <details className="aiuto"><summary>Il telefono chiede il permesso del microfono ogni volta?</summary>
          <p>Su iPhone, in Safari: tocca <b>aA</b> a sinistra dell'indirizzo, poi <b>Impostazioni sito web → Microfono → Consenti</b>. Oppure, per tutti i siti: <b>Impostazioni → App → Safari → Microfono → Consenti</b> (sugli iPhone meno recenti: Impostazioni → Safari → Microfono).</p>
          <p className="muto">Se usi l'app dalla schermata Home, iPhone lo chiede di nuovo ogni volta che la riapri: è una regola di Apple. Da Safari invece basta la prima volta.</p>
        </details>}
        <form className="colonna" onSubmit={(e) => { e.preventDefault(); if (scritto.trim()) { onTesto(scritto); setScritto(''); } }}>
          <label className="campo">{mic.disponibile ? 'Oppure scrivi qui (anche con il microfono della tastiera)' : 'Scrivi le cose da comprare (puoi usare il microfono della tastiera)'}
            <textarea rows="3" value={scritto} onChange={(e) => setScritto(e.target.value)} placeholder="2 chili di patate, latte, pasta" /></label>
          <button className="b pieno grande" disabled={!scritto.trim()}>Continua</button>
        </form>
      </>}
    </div>
  </div>;
}
