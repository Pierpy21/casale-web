/**
 * Script inline caricato nel <body> prima dell'idratazione React (vedi app/layout.tsx).
 * Cattura `beforeinstallprompt` appena il browser lo emette, così l'evento non va perso
 * anche se il bundle client arriva dopo. Il modulo install-store.ts lo legge da window.
 * File senza "use client": deve restare una stringa importabile dal server component.
 */
export const INSTALL_CAPTURE_SCRIPT = `(function(){
  window.addEventListener("beforeinstallprompt", function(e){
    e.preventDefault();
    window.__agendaDeferredPrompt = e;
  });
  window.addEventListener("appinstalled", function(){
    window.__agendaDeferredPrompt = null;
    window.__agendaAppInstalled = true;
  });
})();`;
