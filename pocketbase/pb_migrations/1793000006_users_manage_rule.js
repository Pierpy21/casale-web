/// <reference path="../pb_data/types.d.ts" />
// users: l'account di servizio ha la manage rule. Senza, PocketBase (>= 0.23) non gli permette di
// cambiare la password di un altro utente senza la vecchia (reimposta password operatore) né di
// impostare `verified`/email. Idempotente. Il down toglie la manage rule.

const SVC = '@request.auth.collectionName = "app_services"';

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.manageRule = SVC;
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.manageRule = null;
  app.save(users);
});
