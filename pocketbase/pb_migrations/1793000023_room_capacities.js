/// <reference path="../pb_data/types.d.ts" />
// Capienze delle sale (rooms.capacity), cercate per nome. Le sale che non esistono vengono saltate (non si creano).
// Idempotente: salva solo se la capienza è diversa. Down: ripristina i valori del seed (1793000001).

const CAPACITIES = {
  "Sala 1": 45,
  "Sala 2": 25,
  "Sala 3": 40,
  "Sala Grande": 90,
  "Palmento": 110,
};

const PREVIOUS = {
  "Sala 1": 40,
  "Sala 2": 20,
  "Sala 3": 35,
  "Sala Grande": 80,
  "Palmento": 120,
};

function applyCapacities(app, values) {
  for (const name of Object.keys(values)) {
    let room;
    try {
      room = app.findFirstRecordByData("rooms", "name", name);
    } catch (_) {
      continue;
    }
    if (Number(room.get("capacity")) === values[name]) continue;
    room.set("capacity", values[name]);
    app.save(room);
  }
}

migrate((app) => applyCapacities(app, CAPACITIES), (app) => applyCapacities(app, PREVIOUS));
