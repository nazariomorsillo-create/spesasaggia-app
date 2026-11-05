import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import App from './App.jsx';
import './stile.css';

// Se una pagina si rompe, al posto dello schermo bianco: un messaggio e un pulsante per ripartire.
// L'errore viene mandato al server (solo il testo tecnico, niente dati personali) per poterlo correggere.
class Paracadute extends Component {
  constructor(p) { super(p); this.state = { errore: null }; }
  static getDerivedStateFromError(errore) { return { errore }; }
  componentDidCatch(errore, info) {
    try { fetch('/api/errore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messaggio: String(errore?.message || errore).slice(0, 300), dove: location.hash.slice(0, 80), pila: String(info?.componentStack || '').slice(0, 800) }) }); } catch { /* niente */ }
  }
  render() {
    if (!this.state.errore) return this.props.children;
    return <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1>Qualcosa non è andato</h1>
      <p>Questa pagina si è bloccata. Tocca il pulsante per ripartire dalla lista: quello che avevi già salvato è al sicuro.</p>
      <button type="button" className="b pieno grande" onClick={() => { location.hash = '#lista'; location.reload(); }}>Ricarica l'app</button>
    </main>;
  }
}
// App aperta dall'icona sull'iPhone con il gettone (?ponte=…): prima si entra con quello, poi si disegna l'app.
// Il gettone si toglie subito dall'indirizzo; se non va, si entra come al solito.
async function entraConPonte() {
  const ponte = new URLSearchParams(location.search).get('ponte');
  if (!ponte) return;
  try { history.replaceState(null, '', `/${location.hash}`); } catch { /* niente */ }
  try { await fetch('/api/accesso/ponte', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ponte }) }); } catch { /* niente */ }
}
entraConPonte().finally(() => createRoot(document.getElementById('app')).render(<Paracadute><App /></Paracadute>));
