"use client";

import { useState } from "react";
import { PiattoDettaglio } from "@/lib/notion";

interface CreateYourOwnMenuProps {
  piatti: Record<string, PiattoDettaglio[]>;
}

const WHATSAPP_NUMBER = "393401090100";

export function CreateYourOwnMenu({ piatti }: CreateYourOwnMenuProps) {
  // Trova l'antipasto fisso (assumendo che ce ne sia solo uno)
  const antipastoFisso = piatti["Antipasto"]?.[0];

  // Inizializza lo stato con l'antipasto già presente, se esiste
  const [selectedPiatti, setSelectedPiatti] = useState<PiattoDettaglio[]>(
    antipastoFisso ? [antipastoFisso] : []
  );
  const [menuName, setMenuName] = useState("");

  const togglePiatto = (piatto: PiattoDettaglio) => {
    // Impedisci la deselezione dell'antipasto
    if (piatto.Categoria === "Antipasto") return;

    setSelectedPiatti((prev) => {
      const isSelected = prev.some((p) => p.Id === piatto.Id);
      if (isSelected) {
        return prev.filter((p) => p.Id !== piatto.Id);
      } else {
        return [...prev, piatto];
      }
    });
  };

  const categories = Object.keys(piatti).filter((cat) => piatti[cat].length > 0);
  const categoryOrder = ["Antipasto", "Primo", "Secondo", "Contorno", "Dolce", "Bevande", "Extra"];
  const sortedCategories = categoryOrder.filter((cat) => categories.includes(cat));

  const getSelectedPiattiByCategory = () => {
    const grouped: Record<string, PiattoDettaglio[]> = {};
    
    categoryOrder.forEach(cat => {
      grouped[cat] = [];
    });

    selectedPiatti.forEach((piatto) => {
      if (!grouped[piatto.Categoria]) {
        grouped[piatto.Categoria] = [];
      }
      grouped[piatto.Categoria].push(piatto);
    });

    return Object.keys(grouped).reduce((acc, cat) => {
      if (grouped[cat].length > 0) {
        acc[cat] = grouped[cat];
      }
      return acc;
    }, {} as Record<string, PiattoDettaglio[]>);
  };

  // Validazione del menu
  const hasPrimo = selectedPiatti.some(p => p.Categoria === "Primo");
  const hasSecondo = selectedPiatti.some(p => p.Categoria === "Secondo");
  const isMenuValid = hasPrimo && hasSecondo;

  const generateWhatsAppMessage = () => {
    if (!isMenuValid) return "";

    const lines: string[] = [
      "Gentile Team,",
      "",
      "Desidero richiedere un preventivo per un menu personalizzato.",
      ""
    ];

    if (menuName) {
      lines.push(`NOME MENU: ${menuName.toUpperCase()}`);
      lines.push("");
    }

    lines.push("COMPOSIZIONE DEL MENU");
    lines.push("-----------------------------------");
    lines.push("");

    const grouped = getSelectedPiattiByCategory();

    Object.entries(grouped).forEach(([category, items]) => {
      lines.push(`*${category.toUpperCase()}*`);
      items.forEach((piatto) => {
        lines.push(`- ${piatto.Nome}`);
      });
      lines.push("");
    });

    lines.push("-----------------------------------");
    lines.push(`Numero totale di portate scelte: ${selectedPiatti.length}`);
    lines.push("");
    lines.push("Resto in attesa di una vostra proposta commerciale e della vostra disponibilità.");
    lines.push("");
    lines.push("Cordiali saluti.");

    const fullText = lines.join("\n");
    return encodeURIComponent(fullText);
  };

  const handleWhatsAppClick = () => {
    if (isMenuValid) {
      const message = generateWhatsAppMessage();
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, "_blank");
    }
  };

  const selectedGrouped = getSelectedPiattiByCategory();

  return (
    <section className="bg-gradient-to-br from-[#F7F7F4] to-[#EDEEDD] py-24">
      <div className="max-w-[1400px] mx-auto px-8">
        
        {/* Section header */}
        <div className="mb-16 text-center">
          <p className="font-sans text-[0.6875rem] tracking-[0.24em] uppercase text-[#8B6B4A] mb-4">
            Personalizza la tua esperienza
          </p>
          <h2 className="font-serif text-[2.5rem] text-[#1C2B2D] mb-4 font-medium">
            Componi il Tuo Menù
          </h2>
          <p className="font-sans text-base leading-relaxed text-[#5A6668] max-w-[600px] mx-auto">
            Scegli i piatti che preferisci dalle nostre categorie e crea un'esperienza culinaria su misura
          </p>

          <div className="w-12 h-[1px] bg-[#8B6B4A] mx-auto mt-10" />
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 items-start">
          
          {/* Left side: Dish selection by category */}
          <div>
            {sortedCategories.map((category) => (
              <div key={category} className="mb-12">
                <h3 className="font-serif text-xl font-medium text-[#1C2B2D] mb-5 pb-2 border-b-2 border-[#8B6B4A]">
                  {category}
                  {category === "Antipasto" && (
                    <span className="text-xs font-sans text-[#8B6B4A] ml-3 italic">
                      (Incluso di default)
                    </span>
                  )}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {piatti[category].map((piatto) => {
                    const isSelected = selectedPiatti.some((p) => p.Id === piatto.Id);
                    const isAntipasto = piatto.Categoria === "Antipasto";

                    return (
                      <button
                        key={piatto.Id}
                        onClick={() => togglePiatto(piatto)}
                        className={`p-3.5 px-4 rounded-none transition-all duration-300 text-left flex items-start gap-2.5 
                          ${isSelected ? "bg-[#355A63] border-2 border-[#355A63]" : "bg-[#F7F7F4] border border-[#3F5D63]/15"}
                          ${isAntipasto ? "cursor-default opacity-95" : "cursor-pointer hover:border-[#355A63] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(53,90,99,0.15)]"}
                        `}
                      >
                        <div
                          className={`w-4 h-4 rounded-none shrink-0 mt-0.5 flex items-center justify-center border-[1.5px] transition-colors ${
                            isSelected
                              ? "bg-[#EDEEDD] border-[#EDEEDD]"
                              : "bg-transparent border-[#8B6B4A]"
                          }`}
                        >
                          {isSelected && (
                            <div className="w-1.5 h-1.5 bg-[#355A63]" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p
                            className={`font-serif text-[0.9375rem] font-medium mb-1 leading-snug ${
                              isSelected ? "text-[#EDEEDD]" : "text-[#1C2B2D]"
                            }`}
                          >
                            {piatto.Nome}
                          </p>
                          {piatto.Descrizione && (
                            <p
                              className={`font-sans text-xs leading-[1.4] m-0 ${
                                isSelected ? "text-[#EDEEDD]/85" : "text-[#5A6668]"
                              }`}
                            >
                              {piatto.Descrizione}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Right side: Summary card - Sticky */}
          <div className="bg-white p-8 rounded-none border border-[#3F5D63]/10 shadow-[0_8px_32px_rgba(28,43,45,0.08)] h-fit sticky top-8">
            
            {/* Title */}
            <h3 className="font-serif text-[1.375rem] font-medium text-[#1C2B2D] m-0 pb-4 border-b border-[#8B6B4A]/15 mb-6">
              Il tuo Menu
            </h3>

            {/* Menu name input */}
            <div className="mb-6">
              <input
                type="text"
                value={menuName}
                onChange={(e) => setMenuName(e.target.value)}
                placeholder="Nome del menu"
                className="w-full p-3.5 font-sans text-[0.9375rem] border border-[#8B6B4A]/20 rounded-none bg-[#F7F7F4] text-[#1C2B2D] transition-colors duration-200 focus:border-[#355A63] focus:outline-none"
              />
            </div>

            {/* Selected dishes grouped by category */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <p className="font-sans text-xs tracking-[0.12em] uppercase text-[#8B6B4A] font-semibold m-0">
                  Riepilogo Scelte
                </p>
                <span className="font-serif text-xl font-medium text-[#355A63]">
                  {selectedPiatti.length} {selectedPiatti.length === 1 ? "portata" : "portate"}
                </span>
              </div>

              {selectedPiatti.length > 0 ? (
                <div className="max-h-[300px] overflow-y-auto pr-2">
                  {Object.entries(selectedGrouped).map(([category, items]) => (
                    <div key={category} className="mb-4">
                      <p className="font-sans text-[0.7rem] font-bold tracking-[0.05em] uppercase text-[#8B6B4A] m-0 mb-2 pb-1 border-b border-dashed border-[#8B6B4A]/20">
                        {category}
                      </p>
                      <ul className="list-none p-0 m-0">
                        {items.map((piatto) => (
                          <li
                            key={piatto.Id}
                            className="py-1.5 font-sans text-[0.85rem] text-[#1C2B2D] leading-snug"
                          >
                            - {piatto.Nome}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-sans text-[0.85rem] text-[#5A6668] italic m-0 p-4 bg-[#8B6B4A]/[0.04] rounded-none text-center">
                  Seleziona i piatti per comporre il tuo menu
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-3">
              {!isMenuValid && (
                <p className="font-sans text-[0.75rem] text-[#8B6B4A] text-center m-0 mb-1">
                  * Seleziona almeno un Primo e un Secondo
                </p>
              )}
              
              <button
                onClick={handleWhatsAppClick}
                disabled={!isMenuValid}
                className={`font-sans text-[0.8125rem] tracking-[0.12em] uppercase font-semibold border-none p-4 rounded-none transition-all duration-300 w-full flex items-center justify-center gap-2 ${
                  !isMenuValid
                    ? "text-[#B0B0B0] bg-[#D5D5B7] cursor-not-allowed opacity-70"
                    : "text-white bg-[#355A63] cursor-pointer hover:bg-[#243E44] hover:-translate-y-[1px] hover:shadow-[0_8px_16px_rgba(53,90,99,0.15)]"
                }`}
              >
                Invia su WhatsApp
              </button>
              
              <button
                onClick={() => {
                  setSelectedPiatti(antipastoFisso ? [antipastoFisso] : []);
                  setMenuName("");
                }}
                className="font-sans text-[0.8125rem] tracking-[0.12em] uppercase font-semibold text-[#5A6668] bg-transparent border-[1.5px] border-[#D5D5B7] p-3.5 rounded-none cursor-pointer transition-all duration-300 w-full hover:border-[#8B6B4A] hover:bg-[#8B6B4A]/5"
              >
                Azzera tutto
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </section>
  );
}