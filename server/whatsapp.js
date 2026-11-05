// Invio dei messaggi WhatsApp per i codici di accesso.
// 1. WHATSAPP_SERVIZIO (consigliato): una copia del servizio WhatsApp del CRM, con un numero solo per Spesa Saggia
//    (POST {servizio}/send con { phone, message }; ascolta solo dentro il server).
// 2. WHATSAPP_PONTE_URL: il "ponte" della Segretaria (POST { telefono, testo } con x-segreto).
// Senza nessuno dei due il messaggio va solo nel registro del server (prova).
let _fetch = (...a) => globalThis.fetch(...a);
export function usaFetch(f) { _fetch = f; }
export const inviati = []; // gli ultimi messaggi in modalità di prova (per le prove automatiche)
export const servizio = () => String(process.env.WHATSAPP_SERVIZIO || '').replace(/\/$/, '');

export async function invia(telefono, testo) {
  const base = servizio(); const url = process.env.WHATSAPP_PONTE_URL;
  try {
    if (base) {
      const r = await _fetch(`${base}/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: `39${telefono}`, message: testo }), signal: AbortSignal.timeout(20000) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return { stato: 'errore', errore: `WhatsApp: ${j.error || r.status}` }; }
      return { stato: 'inviato' };
    }
    if (url) {
      const r = await _fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-segreto': process.env.WHATSAPP_PONTE_SEGRETO || '' }, body: JSON.stringify({ telefono: `39${telefono}`, testo, studio: 'dimmilaspesa' }), signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { stato: 'errore', errore: `Il servizio WhatsApp ha risposto ${r.status}` };
      return { stato: 'inviato' };
    }
  } catch (e) { return { stato: 'errore', errore: `Servizio WhatsApp non raggiungibile (${e.name})` }; }
  console.log(`[whatsapp di prova] a ${telefono}: ${testo}`); inviati.push({ telefono, testo }); if (inviati.length > 50) inviati.shift();
  return { stato: 'prova' };
}

// Stato del servizio e QR da inquadrare (per la pagina di gestione)
export async function stato() {
  const base = servizio();
  if (!base) return { configurato: false };
  try {
    const s = await (await _fetch(`${base}/status`, { signal: AbortSignal.timeout(5000) })).json();
    const q = s.ready ? null : await (await _fetch(`${base}/qr`, { signal: AbortSignal.timeout(5000) })).json().catch(() => null);
    return { configurato: true, pronto: !!s.ready, numero: s.number || null, nome: s.name || null, qr: q?.qr || null };
  } catch (e) { return { configurato: true, pronto: false, errore: `Il servizio WhatsApp non risponde (${e.name})` }; }
}
