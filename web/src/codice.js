// 0.92 (Nazario, 07/11): lettore dei codici a barre ZXing in WebAssembly (il programma originale in C++, compilato per il
// browser). Legge codici piccoli o un po' sfocati che il vecchio lettore in JavaScript non prendeva. Si carica solo quando serve
// (circa 1 MB, una volta per sessione); il file .wasm sta nell'app, non si chiede niente ad altri siti.
// Se il WebAssembly non parte (browser vecchio), resta di riserva il vecchio lettore in JavaScript.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// solo i codici dei prodotti (EAN-13, EAN-8, UPC): si prova anche ruotato, al negativo e rimpicciolito
const OPZIONI = { formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 1 };
const cifre = (t) => (/^\d{8,14}$/.test(t || '') ? t : null);

async function conWasm() {
  const m = await import('zxing-wasm/reader');
  await m.prepareZXingModule({ overrides: { locateFile: (f, prefisso) => (f.endsWith('.wasm') ? wasmUrl : prefisso + f) }, fireImmediately: true });
  return { nome: 'wasm', leggi: async (tela) => {
    const r = await m.readBarcodes(tela.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, tela.width, tela.height), OPZIONI);
    return cifre(r.find((x) => x.isValid)?.text);
  } };
}
async function conJs() {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
  const l = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]], [DecodeHintType.TRY_HARDER, true]]));
  return { nome: 'js (riserva)', leggi: async (tela) => { try { return cifre(l.decodeFromCanvas(tela).getText()); } catch { return null; } } };
}
let pronto = null;
/** Il lettore: { nome, leggi(tela) → cifre del codice o null } */
export function lettoreCodici() {
  if (!pronto) pronto = conWasm().catch((e) => { console.warn('lettore wasm non parte, uso quello js:', e?.message || e); return conJs(); }).catch((e) => { pronto = null; throw e; });
  return pronto;
}
