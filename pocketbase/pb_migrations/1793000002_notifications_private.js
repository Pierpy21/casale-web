/// <reference path="../pb_data/types.d.ts" />
// Le notifiche non sono piu' lette dal browser (niente realtime): il polling passa dalla server action
// pollNotifications con l'account di servizio. Quindi list/view tornano riservate al servizio.
// Idempotente. Il down ripristina le regole precedenti (destinatario = utente loggato).

const SVC = '@request.auth.collectionName = "app_services"';
const OWNER_OR_SVC = `user = @request.auth.id || ${SVC}`;

migrate((app) => {
  const notifications = app.findCollectionByNameOrId("notifications");
  notifications.listRule = SVC;
  notifications.viewRule = SVC;
  app.save(notifications);
}, (app) => {
  const notifications = app.findCollectionByNameOrId("notifications");
  notifications.listRule = OWNER_OR_SVC;
  notifications.viewRule = OWNER_OR_SVC;
  app.save(notifications);
});
