"use client";
import { X } from "lucide-react";
import { useEffect } from "react";
import type { MenuCategoria } from "@/lib/menus-types";

interface MenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  cat: MenuCategoria | null;
}

export function MenuModal({ isOpen, onClose, cat }: MenuModalProps) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "unset";
    return () => { document.body.style.overflow = "unset"; };
  }, [isOpen]);

  if (!isOpen || !cat) return null;

  const piattiRaggruppati = cat.Piatti.reduce((acc: any, piatto: any) => {
    const nomeCategoria = piatto.Categoria || 'Altro'; 
    if (!acc[nomeCategoria]) acc[nomeCategoria] = [];
    acc[nomeCategoria].push(piatto);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Overlay scuro */}
      <div className="absolute inset-0 bg-[#1C2B2D]/90 backdrop-blur-md" onClick={onClose} />
      
      {/* Contenuto Modale */}
      <div className="relative bg-[#F7F7F4] w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[3px] shadow-2xl animate-in fade-in zoom-in duration-300">
        
        {/* Header Modale */}
        <div className="sticky top-0 bg-[#F7F7F4] z-10 flex justify-between items-center px-8 py-6 border-b border-[#3F5D63]/10">
          <div>
            <h2 className="font-serif text-3xl text-[#1C2B2D]">{cat.Nome}</h2>
            <p className="font-sans text-[0.7rem] tracking-widest uppercase text-[#8B6B4A]">Selezione Stagionale</p>
          </div>
          <button onClick={onClose} className="text-[#1C2B2D] hover:rotate-90 transition-transform duration-300">
            <X size={28} />
          </button>
        </div>

        {/* Lista Piatti */}
        <div className="p-8 sm:p-12 space-y-12">
          {Object.entries(piattiRaggruppati).map(([nomeCategoria, piatti]: any) => (
            <div key={nomeCategoria} className="space-y-6">
              <h3 className="font-sans text-[0.8rem] font-semibold text-[#8B6B4A] uppercase tracking-[0.2em] border-b border-[#3F5D63]/10 pb-2">
                {nomeCategoria}
              </h3>
              <div className="grid gap-8">
                {piatti.map((piatto: any) => (
                  <div key={piatto.Id} className="group">
                    <div className="flex justify-between items-baseline gap-4">
                      <h4 className="font-serif text-lg text-[#1C2B2D]">{piatto.Nome}</h4>
                      <div className="hidden sm:block flex-1 border-b border-dotted border-[#1C2B2D]/20" />
                    </div>
                    {piatto.Descrizione && (
                      <p className="font-sans text-sm text-[#5A6668] mt-1 max-w-xl">{piatto.Descrizione}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Modale */}
        <div className="p-8 bg-[#EDEEDD] text-center">
          <p className="font-serif italic text-[#1C2B2D]">Prezzo: {cat.Prezzo}€ per persona</p>
          <p className="font-sans text-[0.65rem] uppercase tracking-widest text-[#8B6B4A] mt-2">Escluse bevande extra</p>

        </div>
      </div>
    </div>
  );
}