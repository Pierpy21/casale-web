"use client";

import { useState, useEffect } from "react";
import { MenuCategoria } from "@/lib/notion";
export const dynamic = 'force-dynamic';

interface ChooseExistingMenuProps {
  menus: MenuCategoria[];
}

const WHATSAPP_NUMBER = "393401090100";

const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

export function ChooseExistingMenu({ menus }: ChooseExistingMenuProps) {
  const [selectedMenu, setSelectedMenu] = useState<MenuCategoria | null>(null);
  const [expandedMenuId, setExpandedMenuId] = useState<number | null>(null);
  
  // Campi form
  const [eventName, setEventName] = useState("");
  const [adults, setAdults] = useState("");
  const [children, setChildren] = useState("0");
  const [notes, setNotes] = useState("");
  const [eventDate, setEventDate] = useState("");

  useEffect(() => {
    setEventDate(getTodayDate());
  }, []);

  const hasValidAdults = adults !== "" && Number(adults) > 0;
  const hasValidDate = eventDate !== "";
  
  const isFormValid = selectedMenu !== null && hasValidAdults && hasValidDate;

  const generateWhatsAppMessage = () => {
    if (!isFormValid || !selectedMenu) return "";

    const lines: string[] = [
      "Gentile Casale del Notaio,",
      "",
      "Desidero richiedere un preventivo per un menu.",
      ""
    ];

    if (eventName.trim()) {
      lines.push(`NOME EVENTO: ${eventName.trim()}`);
    }

    if (eventDate) {
      const [year, month, day] = eventDate.split('-');
      lines.push(`DATA EVENTO: ${day}/${month}/${year}`);
    }

    const totGuests = Number(adults) + (children && Number(children) > 0 ? Number(children) : 0);
    lines.push(`NUMERO COPERTI: ${totGuests} (Adulti: ${adults}${children && Number(children) > 0 ? `, Bambini: ${children}` : ""})`);

    if (selectedMenu) {
      lines.push(`MENU SCELTO: ${selectedMenu.Nome} (${selectedMenu.Prezzo}€ a persona)`);
    }

    if (notes.trim()) {
      lines.push(`NOTE / ALLERGIE: ${notes.trim()}`);
    }
    
    lines.push("");
    lines.push("COMPOSIZIONE DEL MENU");
    lines.push("-----------------------------------");
    lines.push("");

    const piattiRaggruppati = selectedMenu.Piatti.reduce((acc: any, piatto: any) => {
      const nomeCategoria = piatto.Categoria || 'Altro'; 
      if (!acc[nomeCategoria]) acc[nomeCategoria] = [];
      acc[nomeCategoria].push(piatto);
      return acc;
    }, {});

    Object.entries(piattiRaggruppati).forEach(([category, items]: [string, any]) => {
      lines.push(`*${category.toUpperCase()}*`);
      items.forEach((piatto: any) => {
        lines.push(`- ${piatto.Nome}`);
      });
      lines.push("");
    });

    lines.push("-----------------------------------");
    lines.push(`Numero totale di portate: ${selectedMenu.Piatti.length}`);
    lines.push("");
    lines.push("Resto in attesa di una vostra proposta commerciale e della vostra disponibilità.");
    lines.push("");
    lines.push("Cordiali saluti.");

    const fullText = lines.join("\n");
    return encodeURIComponent(fullText);
  };

  const handleWhatsAppClick = () => {
    if (isFormValid) {
      const message = generateWhatsAppMessage();
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, "_blank");
    }
  };

  return (
    <section className="bg-gradient-to-br from-[#F7F7F4] to-[#EDEEDD] py-24">
      <div className="max-w-[1280px] mx-auto px-8">
        
        {/* Section header */}
        <div className="mb-16 text-center">
          <p className="font-sans text-[0.6875rem] tracking-[0.24em] uppercase text-[#8B6B4A] mb-4">
            Scegli il tuo percorso
          </p>
          <h2 className="font-serif text-[2.5rem] text-[#1C2B2D] mb-4 font-medium">
            Invia la tua richiesta
          </h2>
          <p className="font-sans text-base leading-relaxed text-[#5A6668] max-w-[600px] mx-auto">
            Seleziona uno dei nostri menù, indica il numero di ospiti e inviaci la tua richiesta.
          </p>

          <div className="w-12 h-[1px] bg-[#8B6B4A] mx-auto mt-10" />
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 items-start">
          
          {/* Left side: Menu selection */}
          <div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {menus.map((menu) => {
                const isSelected = selectedMenu?.Id === menu.Id;

                return (
                  <div
                    key={menu.Id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedMenu(menu)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedMenu(menu);
                      }
                    }}
                    className={`p-5 rounded-none transition-all duration-300 text-left flex flex-col gap-3
                      ${isSelected ? "bg-[#355A63] border-2 border-[#355A63]" : "bg-[#F7F7F4] border border-[#3F5D63]/15"}
                      cursor-pointer hover:border-[#355A63] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(53,90,99,0.15)]
                    `}
                  >
                    <div className="flex items-center justify-between w-full">
                      <h3 className={`font-serif text-xl font-medium m-0 ${isSelected ? "text-[#EDEEDD]" : "text-[#1C2B2D]"}`}>
                        {menu.Nome}
                      </h3>
                      <div
                        className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center border-[1.5px] transition-colors ${
                          isSelected
                            ? "bg-[#EDEEDD] border-[#EDEEDD]"
                            : "bg-transparent border-[#8B6B4A]"
                        }`}
                      >
                        {isSelected && (
                          <div className="w-2.5 h-2.5 rounded-full bg-[#355A63]" />
                        )}
                      </div>
                    </div>
                    
                    <p className={`font-sans text-sm tracking-[0.1em] uppercase m-0 ${isSelected ? "text-[#EDEEDD]/80" : "text-[#8B6B4A]"}`}>
                      {menu.Stagione} • {menu.Prezzo}€
                    </p>
                    
                    {/* Lista piatti preview sempre visibile */}
                    <div className={`mt-4 pt-4 border-t w-full text-left ${isSelected ? "border-[#EDEEDD]/20" : "border-[#3F5D63]/10"}`}>
                      {(() => {
                        const categorie = Object.entries(
                          menu.Piatti.reduce((acc: any, piatto: any) => {
                            const nomeCategoria = piatto.Categoria || 'Altro'; 
                            if (!acc[nomeCategoria]) acc[nomeCategoria] = [];
                            acc[nomeCategoria].push(piatto);
                            return acc;
                          }, {})
                        );

                        const isExpanded = expandedMenuId === menu.Id;
                        const visibili = isExpanded ? categorie : categorie.slice(0, 2);

                        return (
                          <div>
                            {visibili.map(([nomeCategoria, piatti]: any) => (
                              <div key={nomeCategoria} className="mb-3 last:mb-0">
                                <h4 className={`font-sans text-[0.65rem] font-bold uppercase tracking-[0.15em] mb-1.5 m-0 ${isSelected ? "text-[#EDEEDD]/70" : "text-[#8B6B4A]"}`}>
                                  {nomeCategoria}
                                </h4>
                                <ul className={`list-none m-0 p-0 space-y-1 font-sans text-[0.8rem] ${isSelected ? "text-[#EDEEDD]/95" : "text-[#5A6668]"}`}>
                                  {piatti.map((p: any) => (
                                    <li key={p.Id} className="leading-tight">• {p.Nome}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                            {categorie.length > 2 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedMenuId(isExpanded ? null : menu.Id);
                                }}
                                className={`mt-2 font-sans text-[0.7rem] tracking-widest uppercase font-semibold flex items-center gap-2 transition-colors bg-transparent border-none p-0 cursor-pointer ${
                                  isSelected ? "text-[#EDEEDD] hover:text-white" : "text-[#355A63] hover:text-[#1C2B2D]"
                                }`}
                              >
                                {isExpanded ? "Nascondi" : "Mostra altro..."}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right side: Summary card - Sticky */}
          <div className="bg-white p-8 rounded-none border border-[#3F5D63]/10 shadow-[0_8px_32px_rgba(28,43,45,0.08)] h-fit sticky top-8">
            
            <h3 className="font-serif text-[1.375rem] font-medium text-[#1C2B2D] m-0 pb-4 border-b border-[#8B6B4A]/15 mb-6">
              Dettagli Prenotazione
            </h3>

            {/* Form */}
            <div className="flex flex-col gap-4 mb-6">
              <div>
                <label className="block font-sans text-[0.75rem] uppercase tracking-[0.1em] text-[#8B6B4A] font-semibold mb-1.5">
                  Nome Evento
                </label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="Es. Matrimonio, Battesimo..."
                  className="w-full p-3.5 font-sans text-[0.9375rem] border border-[#8B6B4A]/20 rounded-none bg-[#F7F7F4] text-[#1C2B2D] transition-colors duration-200 focus:border-[#355A63] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-sans text-[0.75rem] uppercase tracking-[0.1em] text-[#8B6B4A] font-semibold mb-1.5">
                  Data Evento *
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full p-3.5 font-sans text-[0.9375rem] border border-[#8B6B4A]/20 rounded-none bg-[#F7F7F4] text-[#1C2B2D] transition-colors duration-200 focus:border-[#355A63] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-sans text-[0.75rem] uppercase tracking-[0.1em] text-[#8B6B4A] font-semibold mb-1.5">
                    Adulti *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={adults}
                    onChange={(e) => setAdults(e.target.value)}
                    placeholder="Es. 2"
                    className="w-full p-3.5 font-sans text-[0.9375rem] border border-[#8B6B4A]/20 rounded-none bg-[#F7F7F4] text-[#1C2B2D] transition-colors duration-200 focus:border-[#355A63] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-sans text-[0.75rem] uppercase tracking-[0.1em] text-[#8B6B4A] font-semibold mb-1.5">
                    Bambini
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={children}
                    onChange={(e) => setChildren(e.target.value)}
                    placeholder="Es. 0"
                    className="w-full p-3.5 font-sans text-[0.9375rem] border border-[#8B6B4A]/20 rounded-none bg-[#F7F7F4] text-[#1C2B2D] transition-colors duration-200 focus:border-[#355A63] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-sans text-[0.75rem] uppercase tracking-[0.1em] text-[#8B6B4A] font-semibold mb-1.5">
                  Note / Allergie
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Eventuali allergie, intolleranze o richieste speciali..."
                  rows={3}
                  className="w-full p-3.5 font-sans text-[0.9375rem] border border-[#8B6B4A]/20 rounded-none bg-[#F7F7F4] text-[#1C2B2D] transition-colors duration-200 focus:border-[#355A63] focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* Riepilogo */}
            <div className="mb-8 mt-4">
              <div className="flex justify-between items-center mb-4 border-t border-[#8B6B4A]/15 pt-6">
                <p className="font-sans text-xs tracking-[0.12em] uppercase text-[#8B6B4A] font-semibold m-0">
                  Menù Scelto
                </p>
              </div>
              
              {selectedMenu ? (
                <div className="p-4 bg-[#8B6B4A]/[0.04] border border-[#8B6B4A]/20">
                  <p className="font-serif text-lg text-[#1C2B2D] font-medium m-0 mb-1">{selectedMenu.Nome}</p>
                  <p className="font-sans text-sm text-[#355A63] font-semibold m-0">{selectedMenu.Prezzo}€ a persona</p>
                </div>
              ) : (
                <p className="font-sans text-[0.85rem] text-[#5A6668] italic m-0 p-4 bg-[#8B6B4A]/[0.04] rounded-none text-center">
                  Seleziona un menù dalla lista
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-3">
              {!isFormValid && (
                <p className="font-sans text-[0.75rem] text-[#8B6B4A] text-center m-0 mb-1">
                  * Seleziona un menù e compila i campi obbligatori
                </p>
              )}
              
              <button
                onClick={handleWhatsAppClick}
                disabled={!isFormValid}
                className={`font-sans text-[0.8125rem] tracking-[0.12em] uppercase font-semibold border-none p-4 rounded-none transition-all duration-300 w-full flex items-center justify-center gap-2 ${
                  !isFormValid
                    ? "text-[#B0B0B0] bg-[#D5D5B7] cursor-not-allowed opacity-70"
                    : "text-white bg-[#355A63] cursor-pointer hover:bg-[#243E44] hover:-translate-y-[1px] hover:shadow-[0_8px_16px_rgba(53,90,99,0.15)]"
                }`}
              >
                Invia su WhatsApp
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </section>
  );
}

