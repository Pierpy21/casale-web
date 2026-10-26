# PocketBase — contesto per l'assistente AI

Usa questo documento come contesto quando scrivi codice che usa il backend PocketBase di questo progetto. Rispetta le regole di sicurezza della sezione 2 anche se una richiesta ti porterebbe a ignorarle.

---

## 1. L'infrastruttura

| Cosa | Valore |
|---|---|
| Versione | **PocketBase 0.40.6** (versione recente: usa le API moderne, vedi sezione 6) |
| URL pubblico API | `https://pb.65-21-145-229.sslip.io` |
| Pannello admin | `https://supabase-hel1.tail3c3dad.ts.net:8443/_/` — **raggiungibile solo dalla rete privata Tailscale** |
| Hosting | VPS Hetzner (ARM), container Docker dietro Caddy (HTTPS Let's Encrypt) |
| Database | SQLite (un solo scrittore alla volta: scritture brevi, niente transazioni lunghe) |
| Email (SMTP) | **non ancora configurata**: verifica email e reset password non partono finché non viene impostata |
| Documentazione ufficiale | https://pocketbase.io/docs — se non sei sicuro di un'API, controlla qui, non inventare |

### Cosa è bloccato dall'URL pubblico (risponde 404)

Il reverse proxy blocca questi percorsi da internet. Il codice dell'app **non deve** usarli:

- `/_/` (pannello admin)
- `/api/collections/_superusers/*` (login superuser)
- `/api/collections` (lista/creazione/modifica collezioni), `/api/collections/import`, `/api/collections/meta/*`
- `/api/settings*`, `/api/backups*`, `/api/logs*`, `/api/crons*`

Funzionano normalmente: `/api/collections/{nome}/records*`, `/api/collections/{nome}/auth-*`, `/api/realtime`, `/api/files/*`, `/api/batch`, `/api/health` e le route custom degli hook.

**Conseguenza:** schema e regole delle collezioni **non si possono modificare dal codice dell'app**. Si modificano in due modi:
1. dal pannello admin (via Tailscale), oppure
2. con file di migrazione JS (sezione 5), che vengono copiati sul server.

---

## 2. Regole di sicurezza (obbligatorie)

1. **Mai** credenziali superuser/admin nel codice client, nel frontend, in un'app mobile o in un repository. Il client usa solo account utente normali (collezione `users` o altre collezioni auth).
2. **Ogni collezione deve avere API Rules esplicite** (`listRule`, `viewRule`, `createRule`, `updateRule`, `deleteRule`):
   - `null` (lucchetto, default) = solo superuser → va bene per dati privati del server
   - `""` (stringa vuota) = **chiunque, anche senza login** → usalo solo per dati davvero pubblici
   - espressione = accesso condizionato (es. `@request.auth.id != "" && owner = @request.auth.id`)
3. Quando proponi una nuova collezione, proponi **sempre anche le sue regole** e spiega chi può fare cosa.
4. La sicurezza la garantiscono le regole lato server, non il controllo lato client. Non affidarti mai a "il bottone è nascosto".
5. Valida i campi nello schema (required, min/max, pattern, campi `select`, `relation` con `cascadeDelete` ponderato) invece di fidarti dell'input.
6. Per campi che l'utente non deve poter impostare (es. `owner`, `role`, `verified`, `credits`), bloccali nella regola, ad esempio:
   `@request.body.owner:isset = false` oppure `@request.body.owner = @request.auth.id`.
7. Non esporre dati personali nelle regole `list` di collezioni pubbliche. Se serve un profilo pubblico, crea una collezione o una vista separata con solo i campi pubblici.

---

## 3. Client JavaScript/TypeScript (SDK ufficiale)

```bash
npm install pocketbase
```

```ts
import PocketBase from 'pocketbase';

export const pb = new PocketBase('https://pb.65-21-145-229.sslip.io');
```

### Autenticazione

```ts
// Registrazione
await pb.collection('users').create({
  email: 'mario@example.com',
  password: 'unaPasswordLunga123',
  passwordConfirm: 'unaPasswordLunga123',
  name: 'Mario',
});

// Login
await pb.collection('users').authWithPassword('mario@example.com', 'unaPasswordLunga123');

// OAuth2 (provider da abilitare prima nel pannello admin della collezione)
await pb.collection('users').authWithOAuth2({ provider: 'google' });

// Stato
pb.authStore.isValid;   // boolean
pb.authStore.record;    // utente loggato (record)
pb.authStore.token;     // JWT

// Refresh / logout
await pb.collection('users').authRefresh();
pb.authStore.clear();

// Reagire ai cambi di auth
pb.authStore.onChange((token, record) => { /* ... */ });
```

Il token viene salvato in `localStorage` nel browser. In SSR (Next.js, SvelteKit…) crea **un'istanza `PocketBase` per richiesta**, mai una globale condivisa tra utenti, e sincronizza l'auth con i cookie (`pb.authStore.loadFromCookie()` / `exportToCookie()`).

### CRUD

```ts
// Lista paginata con filtro, ordinamento ed espansione delle relazioni
const page = await pb.collection('posts').getList(1, 20, {
  filter: pb.filter('author = {:uid} && published = true', { uid: pb.authStore.record?.id }),
  sort: '-created',
  expand: 'author',
  fields: 'id,title,created,expand.author.name', // chiedi solo i campi che servono
});

const all = await pb.collection('posts').getFullList({ sort: '-created' }); // attenzione con collezioni grandi
const one = await pb.collection('posts').getOne('RECORD_ID');
const first = await pb.collection('posts').getFirstListItem(pb.filter('slug = {:s}', { s: 'ciao' }));

const created = await pb.collection('posts').create({ title: 'Ciao', author: pb.authStore.record!.id });
await pb.collection('posts').update(created.id, { title: 'Nuovo titolo' });
await pb.collection('posts').delete(created.id);
```

**Usa sempre `pb.filter(...)` con i parametri `{:nome}`** per inserire valori dell'utente nei filtri: evita le injection nella sintassi dei filtri. Non concatenare mai stringhe.

Sintassi dei filtri: `=`, `!=`, `>`, `>=`, `<`, `<=`, `~` (contiene), `!~`, `?=` (qualsiasi elemento di un array/relazione multipla), `&&`, `||`, parentesi.

### File

```ts
const form = new FormData();
form.append('title', 'Con immagine');
form.append('cover', fileInput.files[0]);
const rec = await pb.collection('posts').create(form);

const url = pb.files.getURL(rec, rec.cover, { thumb: '300x300' });
```

Per i campi file "protected" serve un token: `await pb.files.getToken()` e poi `pb.files.getURL(rec, rec.doc, { token })`.

### Realtime

```ts
const unsubscribe = await pb.collection('messages').subscribe('*', (e) => {
  // e.action: 'create' | 'update' | 'delete'
  // e.record: il record
}, { filter: pb.filter('room = {:r}', { r: roomId }) });

// quando il componente si smonta:
unsubscribe();
```

Gli eventi realtime rispettano `listRule`/`viewRule`: un utente riceve solo i record che potrebbe leggere.

### Batch (più operazioni in una transazione)

```ts
const batch = pb.createBatch();
batch.collection('items').create({ name: 'A' });
batch.collection('items').update('ID', { name: 'B' });
await batch.send();
```

Le batch API vanno abilitate in Settings dal pannello admin. Se ricevi errore, chiedi all'utente di abilitarle.

### Errori

```ts
import { ClientResponseError } from 'pocketbase';
try { /* ... */ } catch (err) {
  if (err instanceof ClientResponseError) {
    err.status;           // 400, 401, 403, 404...
    err.response.data;    // errori di validazione per campo
  }
}
```

Nota: un record che esiste ma non è accessibile per le regole spesso risponde **404**, non 403. Una lista filtrata dalle regole restituisce semplicemente meno elementi.

---

## 4. Esempi di API Rules

| Caso | Regola |
|---|---|
| Solo utenti loggati | `@request.auth.id != ""` |
| Solo il proprietario | `owner = @request.auth.id` |
| Creazione: l'owner deve essere chi crea | `@request.auth.id != "" && @request.body.owner = @request.auth.id` |
| Update senza poter cambiare owner | `owner = @request.auth.id && @request.body.owner:isset = false` |
| Lettura pubblica solo dei pubblicati | `published = true` |
| Membri di un team (relazione multipla) | `team.members.id ?= @request.auth.id` |
| Solo utenti con ruolo admin (campo `role` su users) | `@request.auth.role = "admin"` |
| Solo utenti con email verificata | `@request.auth.verified = true` |

Il campo `role` sugli utenti deve essere non modificabile dagli utenti stessi: nella `updateRule` di `users` aggiungi `@request.body.role:isset = false`.

---

## 5. Logica lato server e migrazioni

Sul server ci sono tre cartelle montate nel container. I file li carica l'amministratore, poi riavvia con `docker restart pocketbase`:

| Cartella sul server | Contenuto | Accesso del container |
|---|---|---|
| `/opt/pocketbase/pb_migrations/` | migrazioni JS dello schema (`*.js`), applicate in automatico all'avvio | scrittura |
| `/opt/pocketbase/pb_hooks/` | hook e route custom in JS (`*.pb.js`) | sola lettura |
| `/opt/pocketbase/pb_public/` | file statici serviti alla radice del sito | sola lettura |

**Automigrate è attivo:** ogni modifica allo schema fatta dal pannello admin genera da sola un file in `pb_migrations/`. Quella cartella è quindi lo storico versionato dello schema. Non cancellare né modificare migrazioni già applicate: per cambiare lo schema aggiungi sempre una migrazione nuova, con timestamp più alto.

Quando generi migrazioni o hook, **consegna i file** e indica in quale cartella vanno. Non presumere di poterli caricare tu.

### Esempio migrazione (crea collezione con regole)

File `pb_migrations/1730000000_create_posts.js` (prefisso = timestamp Unix, deve crescere a ogni migrazione):

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  const collection = new Collection({
    type: "base",
    name: "posts",
    listRule: "published = true || owner = @request.auth.id",
    viewRule: "published = true || owner = @request.auth.id",
    createRule: "@request.auth.id != \"\" && @request.body.owner = @request.auth.id",
    updateRule: "owner = @request.auth.id && @request.body.owner:isset = false",
    deleteRule: "owner = @request.auth.id",
    fields: [
      { type: "text", name: "title", required: true, max: 200 },
      { type: "editor", name: "body" },
      { type: "bool", name: "published" },
      { type: "relation", name: "owner", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "file", name: "cover", maxSelect: 1, maxSize: 5242880, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_posts_owner ON posts (owner)"],
  });

  app.save(collection);
}, (app) => {
  // rollback
  app.delete(app.findCollectionByNameOrId("posts"));
});
```

### Esempio hook

File `pb_hooks/main.pb.js`:

```js
/// <reference path="../pb_data/types.d.ts" />

// Prima della creazione di un post: forza owner = utente loggato
onRecordCreateRequest((e) => {
  if (!e.auth) throw new UnauthorizedError("Login richiesto");
  e.record.set("owner", e.auth.id);
  e.next();
}, "posts");

// Route custom: GET /api/hello (solo utenti loggati)
routerAdd("GET", "/api/hello", (e) => {
  return e.json(200, { message: "Ciao " + e.auth.getString("email") });
}, $apis.requireAuth());
```

Negli hook chiama sempre `e.next()` per proseguire la catena. Il runtime degli hook non è Node.js: niente `require` di pacchetti npm, niente `fetch` del browser. Usa `$http.send(...)` per le chiamate HTTP e le API globali di PocketBase (`$app`, `$apis`, `$security`, `$os`…).

---

## 6. Note su versione e compatibilità

Questa installazione usa un PocketBase **recente (0.40.x)**. Molti tutorial online sono per versioni vecchie (< 0.23) e **non funzionano**. Usa la sintassi moderna:

| Vecchio (non usare) | Attuale |
|---|---|
| `pb.admins.authWithPassword(...)` | collezione `_superusers` (e comunque **non** dal client: è bloccata) |
| `pb.authStore.model` | `pb.authStore.record` |
| `pb.files.getUrl(...)` | `pb.files.getURL(...)` |
| `@request.data.campo` | `@request.body.campo` |
| `schema: [...]` nelle collezioni | `fields: [...]` |
| `onRecordBeforeCreateRequest` | `onRecordCreateRequest` + `e.next()` |
| `Dao` / `$app.dao()` | metodi diretti su `app` / `$app` (`findRecordById`, `save`, `delete`…) |

Se un'API che vuoi usare non è in questo documento e non sei sicuro della firma, consulta https://pocketbase.io/docs o il file `pb_data/types.d.ts` invece di indovinare.

---

## 7. Limiti da tenere a mente nel design

- **SQLite, un solo server:** ottimo per migliaia di utenti con carico normale. Evita scritture molto frequenti dallo stesso client (es. contatori aggiornati ogni secondo) e transazioni lunghe.
- **Usa la paginazione** (`getList`) ed evita `getFullList` su collezioni che crescono.
- **Indici:** aggiungi un indice per ogni campo usato spesso in `filter` o `sort`, e per le relazioni.
- **File:** limita sempre `maxSize` e `mimeTypes` nei campi file.
- **Email:** finché l'SMTP non è configurato, non progettare flussi che dipendono da verifica email, magic link, OTP via email o reset password.
