import { getMenuCompleto } from '@/lib/menus';

export default async function MenuPage() {
  const menu = await getMenuCompleto();

  // Invertiamo l'ordine dei menù principali (creando una copia dell'array)
  const menuInvertito = [...menu].reverse();

  return (
    <div className="w-full bg-white text-gray-900 min-h-screen unified-light-mode">
      <div className="max-w-2xl mx-auto p-4">
        {/* Usiamo menuInvertito al posto di menu */}
        {menuInvertito.map((cat) => {
          
          // Raggruppiamo i piatti per categoria
          const piattiRaggruppati = cat.Piatti.reduce((acc, piatto) => {
            const nomeCategoria = piatto.Categoria || 'Altro'; 
            if (!acc[nomeCategoria]) {
              acc[nomeCategoria] = [];
            }
            acc[nomeCategoria].push(piatto);
            return acc;
          }, {} as Record<string, typeof cat.Piatti>);

          return (
            <div key={cat.id} className="mb-12">
              
              {/* Intestazione del Menù (es: Menù di Pesce) */}
              <div className="flex justify-between items-center border-b-2 border-gray-300 pb-2 mb-6">
                <h2 className="text-3xl font-bold text-gray-800">{cat.Nome}</h2>
                {cat.Prezzo ? (
                  <span className="text-xl font-semibold text-gray-900">{cat.Prezzo}€</span>
                ) : null}
              </div>

              {/* Iteriamo sulle categorie dei piatti */}
              <div className="space-y-8">
                {Object.entries(piattiRaggruppati).map(([nomeCategoria, piatti]) => (
                  <div key={nomeCategoria}>
                    
                    {/* Nome della categoria (es: ANTIPASTI) */}
                    <h3 className="text-lg font-semibold text-gray-500 uppercase tracking-wider mb-4  pb-1">
                      {nomeCategoria}
                    </h3>
                    
                    {/* Lista dei piatti */}
                    <div className="space-y-4">
                      {piatti.map((piatto) => (
                        <div key={piatto.Id} className="pl-2">
                          <h4 className="text-lg font-medium text-gray-900">{piatto.Nome}</h4>
                          {piatto.Descrizione ? (
                            <p className="text-gray-600 text-sm mt-0.5">{piatto.Descrizione}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>

                  </div>
                ))}
              </div>
              
            </div>
          );
        })}
      </div>
    </div>
  );
}