/*
 * Stampa del preventivo dal browser: un foglio A4 al 100%, senza margini di pagina (il foglio ha i suoi),
 * senza pannello di modifica né intestazione della pagina. Montato solo nella route del preventivo.
 * Nella stampa restano visibili solo il foglio (.quote-sheet-frame) e i suoi antenati, che vengono
 * resi statici così il foglio non è condizionato dal layout della pagina.
 */
const PRINT_CSS = `
@media print {
  @page {
    size: A4;
    margin: 0;
  }

  html,
  body {
    margin: 0 !important;
    background: #ffffff !important;
  }

  body *:not(:has(.quote-sheet-frame)):not(.quote-sheet-frame):not(.quote-sheet-frame *) {
    display: none !important;
  }

  body *:has(.quote-sheet-frame) {
    position: static !important;
  }

  .quote-sheet-frame {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 210mm !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .quote-sheet {
    box-shadow: none !important;
  }
}
`;

export function QuotePrintStyles() {
  return <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />;
}
