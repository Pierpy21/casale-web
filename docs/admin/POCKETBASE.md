# Agenda Digitale su PocketBase: installazione e gestione

Infrastruttura: PocketBase 0.40.x in un container Docker (`pocketbase`) su VPS Hetzner, dietro Caddy con HTTPS. Il pannello admin (`/_/`) è raggiungibile solo dalla rete privata Tailscale. L'API pubblica è `https://pb.65-21-145-229.sslip.io`.

Modello di accesso:
- **Utenti dell'app** (admin, sala, cucina): collezione auth `users`, login con email e password dalla pagina `/admin/login`. Il token resta in un cookie httpOnly `pb_auth` di 3 giorni.
- **Account di servizio**: utente della collezione auth `app_services`. È l'unico account con cui il server Next legge e scrive i dati, dopo aver verificato lui stesso profilo e permesso dell'utente. Le sue credenziali stanno solo nelle variabili d'ambiente del server (`POCKETBASE_SERVICE_EMAIL` / `POCKETBASE_SERVICE_PASSWORD`). Non è un superuser.
- **Browser**: non parla mai con PocketBase. Le notifiche arrivano con **polling** (ogni 20 secondi a scheda visibile) dalla server action `pollNotifications`, che usa il cookie httpOnly. Il token non esce mai dal server. Il realtime non è usato.

Dall'esterno sono bloccati (404 dal proxy): `/_/`, `/api/collections/_superusers/*`, `/api/collections` (meta), `/api/settings*`, `/api/backups*`, `/api/logs*`. Quindi schema, regole, impostazioni e backup si gestiscono **dal pannello via Tailscale** o con le migrazioni, mai dal codice dell'app.

---

## 1. File di schema sul server

Le migrazioni sono in `pocketbase/pb_migrations/` del repository:

- `1793000000_casale_schema.js`: collezioni, campi, regole, account `app_services`, token di 3 giorni per `users`, Batch API e rate limit del login (10 tentativi / 60 s).
- `1793000001_casale_seed.js`: sale (ordine del cliente) e menù autunnali. Idempotente per nome.
- `1793000002_notifications_private.js`: la collezione `notifications` è leggibile solo dall'account di servizio (il browser non la legge più; le notifiche passano dal polling). Idempotente, con down.
- `1793000003_booking_kinds.js`: tipi di prenotazione (`bookings.kind` = evento | normale | appuntamento, `bookings.event_type`). Le prenotazioni esistenti diventano "evento". Rende `clients.last_name` facoltativo (clienti creati con un solo campo "Nome"). Idempotente.
- `1793000004_inventory.js`: giacenza (`inventory_products`, `inventory_reports`, `inventory_report_lines`) e campo `notifications.url`. Tutte riservate all'account di servizio. Idempotente, con down.
- `1793000005_dishes.js`: catalogo piatti (`dishes`) e relazione `menu_items.dish`, con import dei piatti già presenti nei menù. Idempotente, con down.
- `1793000006_users_manage_rule.js`: manage rule di `users` all'account di servizio (serve per reimpostare la password di un operatore). Idempotente, con down.
- `1793000007_inventory_catalog.js`: giacenza per fornitore e categoria. `inventory_products` riceve `supplier` (select: viagrande | amadori | vegagel | altro, default altro), `sort` e `unit`; `category` resta testo (valori fissi validati dall'app: ortofrutta, latticini, salumi, carne_uova, dispensa, surgelati, non_food, altro). `inventory_report_lines` riceve gli snapshot `supplier` e `category`. Seed del catalogo (liste del ristorante) per nome: su un prodotto già esistente scrive fornitore, categoria, ordine e unità solo se il fornitore è vuoto, quindi non sovrascrive le modifiche dell'admin. Backfill: prodotti e righe senza fornitore → altro. Idempotente, con down (rimuove i campi, non i dati dei report).

- `1793000008_quote_final_total.js`: prezzo finale del preventivo (`quotes.final_total`, facoltativo, 0 = nessun prezzo finale). Idempotente, con down (rimuove il campo).
- `1793000009_booking_status_rules.js`: stato delle prenotazioni. Prenotazioni normali in "opzione" → "confermato"; eventi in "opzione" con almeno un acconto → "confermato" (gli eventi senza acconti restano in "opzione"). Idempotente, down no-op.
- `1793000010_booking_notes.js`: note interne sulle prenotazioni (`booking_notes`: prenotazione, autore, nome autore, testo max 2000 caratteri), cancellate a cascata con la prenotazione. Riservata all'account di servizio. Idempotente, con down (elimina la collezione).
- `1793000011_hide_appointment_notifications.js`: le notifiche delle prenotazioni di tipo appuntamento (`kind` = appuntamento) restano solo agli admin: elimina quelle destinate ad altri utenti. Idempotente, down no-op.
- `1793000012_applied_mutations.js`: modalità offline (sezione 10). Crea `applied_mutations` (modifiche applicate o in corso, per l'idempotenza dei reinvii, con `status` `pending`/`done`) e aggiunge `rooms.updated` (data di ultima modifica delle sale, per il controllo di conflitto). Riservata all'account di servizio. Idempotente, con down (elimina la collezione e il campo).
- `1793000013_booking_table_number.js`: tavolo delle prenotazioni normali (`bookings.table_number`, numero intero 0-9999, facoltativo, 0 = nessun tavolo). Idempotente, con down (rimuove il campo).

Le migrazioni già applicate non si modificano: `1793000000` può essere già in produzione, quindi le modifiche vanno in file nuovi.

Procedura sul server (con l'admin, via SSH). Copia solo le migrazioni nuove o non ancora applicate:

```bash
# Dal proprio computer, nella cartella del repo
scp pocketbase/pb_migrations/179300000*.js <utente>@<host-hetzner>:/tmp/

# Sul server (copia solo quelle non ancora applicate: di norma l'ultima, es. 1793000006)
sudo cp /tmp/1793000006_users_manage_rule.js /opt/pocketbase/pb_migrations/
sudo docker restart pocketbase
sudo docker logs --tail 80 pocketbase      # verifica: nessun errore di migrazione
```

Regole per le migrazioni (già rispettate):
- Le migrazioni già applicate non si modificano né si cancellano. Ogni cambio di schema è una **nuova** migrazione con timestamp più alto.
- Automigrate è attivo: le modifiche fatte dal pannello generano da sole un file in `pb_migrations/`.
- Il file `users` esistente viene **esteso**: i campi già presenti (es. `name`, `avatar`) restano; vengono aggiunti solo `full_name`, `role`, `is_chef`, `active` se mancanti.

Hook (se servono): `/opt/pocketbase/pb_hooks/` (sola lettura per il container). Nessun hook è richiesto da questo progetto.

## 2. Account di servizio (manuale, dal pannello)

1. Apri il pannello via Tailscale: `https://supabase-hel1.tail3c3dad.ts.net:8443/_/`.
2. Collezione **app_services** → **New record**: inserisci `email` (es. `servizio@casaledelnotaio.it`), `password` (lunga e casuale, almeno 16 caratteri) e salva.
3. Non creare altri record in `app_services` e non assegnare altri ruoli: l'account ha accesso completo ai dati dell'app.
4. Conserva la password nel gestore di password e nelle variabili d'ambiente del server Next (vedi sezione 3), mai nel repository.

Nota: la collezione `app_services` non ha OAuth, OTP o MFA, e non ha registrazione pubblica.

## 3. Variabili d'ambiente dell'app (server Next)

Nelle variabili di deploy dell'app (o in `.env.local` per lo sviluppo). Vedi `.env.example`.

| Variabile | Uso | Note |
|---|---|---|
| `POCKETBASE_URL` | server + script | `https://pb.65-21-145-229.sslip.io` |
| `NEXT_PUBLIC_POCKETBASE_URL` | URL assoluti delle foto del menù pubblico | stesso URL; **obbligatoria in produzione** (il codice non ripiega sull'URL interno). Il browser non usa PocketBase per le notifiche |
| `POCKETBASE_SERVICE_EMAIL` | server + script | email dell'account `app_services` |
| `POCKETBASE_SERVICE_PASSWORD` | server + script | password dell'account di servizio. **Solo server.** |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | solo setup | amministratore dell'app |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | push | `npx web-push generate-vapid-keys` |
| `CRON_SECRET` | promemoria | token del crontab (sezione 7) |
| `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `NOTION_PIATTI_DATABASE_ID` | solo import | per `scripts/import-notion.mjs` |

Le variabili `POCKETBASE_SUPERUSER_*` e `SUPABASE_*` non servono più e vanno rimosse.

## 4. Verifiche dopo il deploy

```bash
curl -s https://pb.65-21-145-229.sslip.io/api/health      # deve rispondere con code 200
```

Poi dal pannello (Tailscale) controlla **Settings → Application → Batch** (abilitata) e **Settings → Rate limits** (regola `*:authWithPassword`). Queste impostazioni non sono leggibili dall'API pubblica, quindi la verifica è manuale.

## 5. Setup e amministratore

Dalla cartella del progetto, con le variabili sopra impostate:

```bash
npm install
npm run setup
```

`setup` verifica la raggiungibilità di PocketBase, il login dell'account di servizio, la lettura delle collezioni, poi crea (o promuove) `ADMIN_EMAIL`. È idempotente. Dopo il setup puoi accedere a `/admin/login`.

Altri comandi:
- `node scripts/create-admin.mjs <email> <password> "<Nome Cognome>"`: crea o promuove un admin.
- `node scripts/transfer-admin.mjs <nuova-email> "<Nome Cognome>"`: passa il ruolo di admin (il vecchio diventa operatore di sala disattivato).

Il sistema consente **un solo amministratore**. Gli operatori (sala/cucina) si creano dalla pagina "Operatori".

## 6. Import dei menù da Notion (una tantum)

```bash
node scripts/import-notion.mjs
```

Crea i menù mancanti (salta quelli già presenti con lo stesso nome, quindi è sicuro rilanciarlo), le voci per portata, e scarica e carica le foto (gli URL Notion scadono). Verifica poi i menù in `/admin/catalogo`. La cache del menù pubblico si aggiorna da sola ogni ora o a ogni modifica dal catalogo.

## 7. Promemoria giornalieri (crontab del VPS)

Il promemoria "giorno prima" è `GET /api/cron/reminders` con header `Authorization: Bearer <CRON_SECRET>`. Sul VPS si usa il crontab:

```bash
sudo timedatectl set-timezone Europe/Rome
crontab -e
```

```cron
# Ogni giorno alle 16:00 ora di Roma
0 16 * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://<dominio-app>/api/cron/reminders >/dev/null 2>>/var/log/casale-reminders.log
```

Sostituisci `<CRON_SECRET>` e `<dominio-app>`. Il crontab contiene un segreto: proteggi il file (utente dedicato, `crontab -l` visibile solo a chi lo possiede).

## 8. Backup

I dati sono nel volume Docker montato come `/opt/pocketbase/pb_data` (SQLite `data.db`, file allegati in `storage/`, ricevute incluse).

- **Backup dal pannello** (via Tailscale): Settings → Backups, con backup automatici giornalieri e retention. Scarica una copia ogni tanto e conservala fuori dal VPS.
- **Backup da riga di comando** (le API di backup sono bloccate dall'esterno):

```bash
sudo docker stop pocketbase
sudo tar -C /opt/pocketbase -czf /var/backups/casale-pb-$(date +%F).tar.gz pb_data
sudo docker start pocketbase
```

Copia i backup fuori dal server (storage cifrato) e prova periodicamente il ripristino.

## 9. Note operative e limiti

- **Email**: SMTP non configurato. Verifica email e reset password non funzionano: non usarli nei flussi dell'app. La creazione degli utenti è fatta dall'app (account di servizio), con email già considerata verificata.
- **Token utente**: 3 giorni. Il middleware rinnova il token quando scade entro 24 ore. Un operatore disattivato perde l'accesso al prossimo controllo (`authRule active = true`). Il login alle pagine (`lib/auth.ts`) rimanda a `/admin/login` solo per sessione non valida (401/403/404 di PocketBase, utente inattivo). Errori di rete o 5xx di PocketBase danno una pagina di errore, senza disconnettere l'utente.
- **Rate limit**: 10 tentativi di login ogni 60 secondi (regola `*:authWithPassword`).
- **SDK**: il progetto usa il client `pocketbase` 0.28 contro un server 0.40. Il REST di records, auth e batch è compatibile, ma conviene allineare il pacchetto (`npm install pocketbase@^0.40`) dopo un test.
- **Ricevute**: file protetti. Passano sempre dall'app (`/api/receipts/[id]`), che controlla la sessione admin e scarica il file con il token dell'account di servizio.
- **Foto menù**: pubbliche per design, max 10 per menù, 5 MB l'una.
- **Permessi**: admin crea eventi, normali e appuntamenti, modifica tutto, gestisce preventivi, pagamenti, rubrica e operatori. La sala vede tutto, modifica solo i coperti e crea solo prenotazioni normali (il cliente si inserisce come nuovo cliente). La cucina non modifica prenotazioni (il flag chef non dà più permessi) e usa la giacenza: report di presenza e da ordinare, PDF da `/api/inventory/[id]/pdf`.
- **Giacenza**: l'invio di un report notifica gli admin (push se configurato) con il riepilogo "Da ordinare: Viagrande 5, Amadori 3". Il report resta nello storico e l'admin lo segna come visto. Il PDF raggruppa per fornitore; `/api/inventory/[id]/pdf?supplier=viagrande` esporta la lista d'ordine di un solo fornitore. Il fornitore dei prodotti lo modifica solo l'admin. Le righe dei report conservano lo snapshot di fornitore e categoria al momento dell'invio.
- **Notifiche (polling)**: nessuna connessione realtime. Ogni 20 secondi, a scheda visibile, la campanella chiede le novità al server (`pollNotifications`). Con la scheda nascosta il polling è sospeso; al ritorno o al focus parte subito una richiesta. Dopo errori ripetuti l'intervallo cresce fino a 5 minuti. Se la sessione scade, l'app torna al login. Il carico è di una richiesta per utente ogni 20 secondi: per i numeri di questo progetto è trascurabile.

---

## 10. Modifiche offline: idempotenza e conflitti

Nell'admin le modifiche fatte senza rete finiscono in una coda sul dispositivo e vengono reinviate alle stesse server action (contratto in `lib/offline/contract.ts`). Il server le rende sicure in due modi, implementati in `lib/mutations.ts`:

- **Idempotenza** (`applied_mutations`, migrazione 1793000012): ogni modifica porta un `mutationId` (UUID v4). Il server prenota l'id prima di eseguire l'azione: inserisce una riga con `status: "pending"`, `claimed_at` (ISO) e `actor`. Se la riga esiste già, il comportamento dipende dal suo stato (tabella sotto). A successo la riga diventa `status: "done"` con `result` (`{ ok, data }`). Se l'azione restituisce `ok: false` (validazione, permessi, conflitto: nessuna scrittura) la riga si elimina, così la coda può correggere e reinviare. Se l'azione lancia un'eccezione, la riga resta con `result: { ok: false, uncertain: true, error }`: l'esito è incerto e non si riesegue mai. L'indice unico su `mutation_id` impedisce che due richieste con lo stesso id eseguano entrambe.
- **Nessuna ripresa automatica**: una modifica il cui esito non è certo (riga pending vecchia, o eccezione) non viene mai rieseguita. Il server risponde "Esito incerto" e la coda la segna in errore: l'utente controlla i dati e, se serve, la scarta.
- **Reinvii** (`replay: true`): solo la coda offline li imposta. Se la collezione manca, un reinvio NON viene eseguito e riceve `code: "in_progress"` con il messaggio "Sincronizzazione non disponibile: aggiornamento del server in corso. Riprova più tardi." (fail-closed). Una prima chiamata dal form, invece, esegue senza idempotenza e scrive un avviso nei log una sola volta.
- **Conflitti**: la modifica di un record esistente porta `expectedUpdated` (il `updated` letto dall'utente). Se sul server il record è cambiato, l'azione non scrive e risponde `code: "conflict"` con `conflict.currentUpdated` e `conflict.updatedByName`. Per i coperti, i piatti, le allergie e le note il confronto è con la prenotazione genitore. Con `force` il controllo è saltato ("Sovrascrivi").
- **Eliminazione di un record già eliminato**: risponde ok solo nei reinvii (`replay: true`). Dal form resta il messaggio "non trovato" di prima.
- **Sessione**: se manca la sessione, `authorize` risponde `code: "unauthenticated"`: la coda si ferma finché l'utente non rientra.

Tabella decisionale di `withMutation` (`lib/mutations.ts`). `run` è l'azione vera e propria.

| Situazione | Risposta | `run` |
|---|---|---|
| `mutationId` non valido | `ok: false` (nessun code) | no |
| Riga `done` | risultato salvato | no |
| Riga `pending` con `uncertain` (eccezione precedente) | `ok: false`, "Esito incerto…" (nessun code) | no |
| Riga `pending`, `claimed_at` meno di 2 minuti fa | `ok: false`, `code: "in_progress"` | no |
| Riga `pending`, `claimed_at` 2 minuti o più fa (o illeggibile) | `ok: false`, "Esito incerto…" (nessun code) | no |
| Errore del database in lettura o creazione della riga | `ok: false`, `code: "in_progress"` | no |
| Riga sparita tra il tentativo di creazione e la rilettura | `ok: false`, `code: "in_progress"` | no |
| Collezione `applied_mutations` assente, reinvio (`replay: true`) | `ok: false`, `code: "in_progress"` (messaggio "Sincronizzazione non disponibile…") | no |
| Collezione assente, prima chiamata dal form | esecuzione senza idempotenza (avviso nei log) | sì |
| Riga nuova, `run` → `ok: true` | riga `done` con il risultato; se la registrazione fallisce si ritenta, la risposta resta `ok: true` | sì |
| Riga nuova, `run` → `ok: false` | riga eliminata (sblocco), risposta di `run` | sì |
| Riga nuova, `run` lancia un'eccezione | riga marcata `uncertain`, risposta "Esito incerto…" (nessun code) | sì |

Il `code: "in_progress"` non è un errore definitivo: la coda riprova con attesa crescente. L'"Esito incerto" non si riprova: la coda segna la modifica in errore e l'utente decide.

**Scritture della riga.** Dopo `run`, la registrazione (`done`, sblocco o marcatura incerta) si ritenta tre volte in circa 5 secondi. Se fallisce ancora, si programmano altri tentativi in background con `after()` (10 s, 30 s, 90 s). In quel caso la risposta resta quella di `run`. Se nemmeno i tentativi in background riescono, la riga resta `pending` e dopo 2 minuti i reinvii ricevono "Esito incerto…": nessuna modifica viene riapplicata.

**Limite noto.** Un'azione che impiega più di 2 minuti (riga ancora `pending`) viene trattata come incerta anche se poi va a buon fine: il reinvio risponde "Esito incerto…" e l'utente deve verificare il dato. Il caso è raro, perché le azioni sono brevi.

**Pulizia.** Le righe più vecchie di 30 giorni (campo `created`) si eliminano in background, al massimo una volta all'ora per istanza del server, fino a 2000 righe per esecuzione. È best-effort: un errore va nei log e non blocca né fa fallire l'azione. Non serve nessun cron. L'indice su `created` rende il filtro leggero.

Le chiamate senza opzioni (uso online) non cambiano comportamento.
