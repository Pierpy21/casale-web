"use client";

import Link from "next/link";
import { ConfirmAction } from "@/components/bookings/ConfirmAction";
import { Alert, Badge, Button, EmptyState, type BadgeTone } from "@/components/ui";
import { isTempId, type QueuedMutation, type QueuedStatus } from "@/lib/offline/contract";
import type { ActionResult } from "@/lib/types";
import { useOfflineQueue } from "./OfflineProvider";

const STATUS_BADGE: Record<QueuedStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "In attesa", tone: "neutral" },
  sending: { label: "In invio", tone: "petrol" },
  conflict: { label: "Conflitto", tone: "warning" },
  error: { label: "Errore", tone: "danger" },
};

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Elenco delle modifiche in coda con le azioni per stato (riprova, sovrascrivi, scarta). */
export function SyncQueueList() {
  const { items, online, paused, retry, overwrite, discard } = useOfflineQueue();

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nessuna modifica in attesa"
        description="Le modifiche fatte senza rete compaiono qui e vengono inviate appena torna la connessione."
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {paused && (
        <Alert tone="danger">
          Accedi di nuovo per inviare le modifiche.{" "}
          <Link href="/admin/login" className="font-medium text-petrol underline-offset-4 hover:underline">
            Vai al login
          </Link>
        </Alert>
      )}
      {!online && (
        <Alert tone="info">Sei offline: le modifiche restano su questo dispositivo finché non torna la rete.</Alert>
      )}

      <ul className="flex min-w-0 flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <QueueItemCard
              item={item}
              onRetry={() => void retry(item.id)}
              onOverwrite={() => void overwrite(item.id)}
              onDiscard={async (): Promise<ActionResult<void>> => {
                await discard(item.id);
                return { ok: true, data: undefined };
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface QueueItemCardProps {
  item: QueuedMutation;
  onRetry: () => void;
  onOverwrite: () => void;
  onDiscard: () => Promise<ActionResult<void>>;
}

function QueueItemCard({ item, onRetry, onOverwrite, onDiscard }: QueueItemCardProps) {
  const status = STATUS_BADGE[item.status];
  const bookingLink =
    item.entity?.type === "booking" && !isTempId(item.entity.id) ? `/admin/prenotazioni/${item.entity.id}` : null;
  const conflictWho = item.conflict?.updatedByName ?? "un altro utente";

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-[2px] border border-sand border-t-[3px] border-t-petrol bg-paper p-5 shadow-sm shadow-ink/5">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="wrap-anywhere font-serif text-xl leading-tight">{item.label}</h2>
          <p className="text-[13px] text-slate">
            Salvata il {formatWhen(item.createdAt)}
            {item.attempts > 0 && ` · tentativi ${item.attempts}`}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>

      {item.status === "conflict" && (
        <p className="text-[14px] leading-relaxed text-ink">
          {`Il record è stato modificato da ${conflictWho} nel frattempo. Puoi sovrascrivere con la tua modifica o scartarla.`}
        </p>
      )}
      {item.status !== "conflict" && item.lastError && (
        <p className="text-[14px] leading-relaxed text-danger">{item.lastError}</p>
      )}

      <footer className="flex min-w-0 flex-wrap items-center gap-3">
        {item.status === "conflict" && (
          <Button variant="primary" size="sm" onClick={onOverwrite}>
            Sovrascrivi
          </Button>
        )}
        {(item.status === "error" || item.status === "pending") && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Riprova
          </Button>
        )}
        <ConfirmAction
          label={item.status === "conflict" ? "Scarta la mia modifica" : "Scarta"}
          title="Scartare questa modifica?"
          description="La modifica non verrà inviata al gestionale e non potrà essere recuperata."
          confirmLabel="Scarta"
          pendingLabel="Scarto…"
          variant="outline"
          size="sm"
          run={onDiscard}
          onSuccess={() => undefined}
        />
        {bookingLink && (
          <Link href={bookingLink} className="ml-auto text-[13px] font-medium text-petrol underline-offset-4 hover:underline">
            Apri la prenotazione
          </Link>
        )}
      </footer>
    </article>
  );
}
