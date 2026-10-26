-- Ordine delle sale richiesto dal cliente in tutte le liste (desktop e mobile):
-- Sala Grande, Palmento, Sala 1, Sala 2, Sala 3, Pozzo, Terrazza.
update public.rooms as r
set sort = o.sort
from (values
  ('Sala Grande', 1),
  ('Palmento', 2),
  ('Sala 1', 3),
  ('Sala 2', 4),
  ('Sala 3', 5),
  ('Pozzo', 6),
  ('Terrazza', 7)
) as o(name, sort)
where r.name = o.name;
