"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NotificationBadge, NotificationList } from "@/components/notifications/NotificationBell";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { useOnline } from "@/components/offline/useOnline";
import { clearOfflineUserData } from "@/components/pwa/offline-sw-client";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { CasaleSilhouette } from "./CasaleSilhouette";

export interface MobileUserMenuProps {
  /** Nome completo dell'utente (letto lato server: niente profilo intero nel client). */
  fullName: string;
  /** Etichetta del ruolo (ROLE_LABELS). */
  roleLabel: string;
  /** Server action di uscita (signOut), passata dal server component. */
  signOut: (formData: FormData) => void | Promise<void>;
}

/**
 * Nome e avatar dell'header mobile. L'avatar porta il conteggio delle notifiche non lette e apre un unico pannello
 * chiaro, ancorato sotto l'header a destra: in alto le notifiche (elenco a scorrimento), in fondo ruolo, installazione
 * dell'app e uscita. Si chiude con tocco fuori, Esc, nuovo tocco sul trigger o cambio pagina.
 * Il pannello è in un portale su <body> (fixed, z-60): sta sopra header, barra di navigazione e pulsante +.
 */
export function MobileUserMenu({ fullName, roleLabel, signOut }: MobileUserMenuProps) {
  const pathname = usePathname();
  const panelId = useId();
  const titleId = useId();
  const { unreadCount } = useNotifications();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Stato legato alla pagina: un cambio di percorso (anche con il tasto indietro) chiude il menu
  // senza bisogno di un effect, e tornando sulla stessa pagina il menu non riappare.
  const [menu, setMenu] = useState({ open: false, pathname });
  if (menu.pathname !== pathname) setMenu({ open: false, pathname });
  const open = menu.open && menu.pathname === pathname;

  const setOpen = (next: boolean) => setMenu({ open: next, pathname });

  useEffect(() => {
    if (!open) return;
    // Focus nel pannello all'apertura (il titolo "Attività" viene annunciato); torna al trigger alla chiusura da tastiera.
    panelRef.current?.focus({ preventScroll: true });

    const dismiss = (restoreFocus: boolean) => {
      setMenu({ open: false, pathname });
      if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || wrapperRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      // Le istruzioni di installazione sono un <dialog> nel portale: toccarle non chiude il menu
      // (chiudere il menu smonterebbe il dialog).
      if (target instanceof Element && target.closest("dialog")) return;
      dismiss(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Con un dialog aperto, Esc chiude solo quello.
      if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      dismiss(true);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, pathname]);

  // Uscita senza form: su iOS Safari il secondo invio con requestSubmit() di SignOutForm non partiva.
  // Prima si svuotano le cache offline dell'utente (attesa breve), poi si chiama direttamente l'action;
  // se il redirect dell'action non porta al login entro qualche secondo, si naviga a mano.
  const online = useOnline();
  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = async () => {
    if (signingOut || !online) return;
    setSigningOut(true);
    window.setTimeout(() => window.location.assign("/admin/login"), 4000);
    await clearOfflineUserData();
    try {
      // Il redirect dell'action lo esegue il router di Next.
      await signOut(new FormData());
    } catch {
      window.location.assign("/admin/login");
    }
  };

  // Tocco su una notifica (naviga) o su Chiudi: il pannello si chiude e il focus torna al trigger.
  const closeFromList = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const label =
    unreadCount > 0
      ? `Menu utente: ${fullName}, ${unreadCount} notifiche non lette`
      : `Menu utente: ${fullName}`;

  return (
    <div ref={wrapperRef} className="min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        onClick={() => setOpen(!open)}
        // Nome a sinistra dell'avatar; il nome si accorcia sui telefoni stretti, l'avatar no.
        className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-full py-0.5 pl-1 pr-0.5 text-logo-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand"
      >
        <span aria-hidden="true" className="max-w-[9rem] truncate font-serif text-lg leading-tight text-logo-cream">
          {fullName}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "relative grid size-10 shrink-0 place-items-center rounded-full border border-sand/30 bg-sand/10 transition-colors duration-200",
            open && "border-sand/70 bg-sand/20",
          )}
        >
          <CasaleSilhouette className="size-6.5" />
          <NotificationBadge />
        </span>
      </button>

      {open &&
        // Portale su <body>, fixed sotto l'header: dentro l'header (fixed + transform) iOS Safari non consegna i tocchi
        // alle parti del pannello che sporgono fuori dalla barra ("Esci" non rispondeva).
        // Altezza limitata: "Esci" deve stare lontano dal bordo inferiore, dove su iPhone il tocco apre la barra di Safari.
        createPortal(
        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="no-print fixed right-4 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[60] flex max-h-[min(34rem,calc(100dvh_-_env(safe-area-inset-top)_-_11rem))] w-[min(24rem,calc(100vw_-_2rem))] flex-col overflow-hidden rounded-[2px] border border-sand bg-paper text-ink shadow-2xl shadow-ink/30 outline-none optouch:right-[max(2rem,calc((100%_-_56rem)/2_+_2rem))]"
        >
          {/* Solo l'elenco scorre: intestazione e attivazione push restano visibili. */}
          <NotificationList titleId={titleId} onClose={closeFromList} className="flex-1" />

          <div className="shrink-0 border-t border-sand px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="bronze">{roleLabel}</Badge>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <InstallAppButton variant="menu" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 w-full"
                disabled={signingOut || !online}
                aria-busy={signingOut || undefined}
                title={online ? undefined : "Per uscire serve la connessione"}
                onClick={handleSignOut}
              >
                {signingOut ? "Uscita…" : "Esci"}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
