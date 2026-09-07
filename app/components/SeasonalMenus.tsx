"use client";
export const dynamic = 'force-dynamic';

import { useState } from "react";
import { MenuCard } from "./MenuCard";
import { MenuModal } from "./ModalMenu";
import { MenuCategoria } from "@/lib/notion";

export function SeasonalMenus({ menus }: { menus: MenuCategoria[] }) {
  const [selectedMenu, setSelectedMenu] = useState<MenuCategoria | null>(null);

  return (
    <section id="menus" className="bg-[#EDEEDD] py-16 md:py-16 overflow-hidden">
      <div className="max-w-[1280px] mx-auto px-8">
        
        {/* Section header */}
        <div className="mb-12 md:mb-16">
          <p className="font-sans text-[0.6875rem] tracking-[0.24em] uppercase text-[#8B6B4A] mb-4">
            Un tavolo per ogni occasione
          </p>
          
          <div className="flex flex-row flex-wrap items-end justify-between gap-6">
            <h2 className="font-serif text-3xl md:text-5xl text-[#1C2B2D] max-w-[520px] m-0">
              I nostri menù
            </h2>
            <p className="font-sans text-[0.9375rem] leading-[1.7] text-[#5A6668] max-w-[360px] m-0">
              La nostra cucina segue il ritmo della natura. Ogni menu viene ricreato con il mutare delle stagioni — utilizzando i prodotti della tenuta e di fornitori locali.
            </p>
          </div>

          <div className="w-12 h-px bg-[#8B6B4A] mt-10" />
        </div>

        {/* Menu cards grid (Desktop) / Slider (Mobile) */}
        <div className="flex md:grid md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 md:gap-6 overflow-x-auto md:overflow-x-visible snap-x snap-mandatory hide-scrollbar pb-8 -mx-8 px-8 md:mx-0 md:px-0 md:pb-0">
          {Array.isArray(menus) && menus.map((menu) => (
            <div 
              key={menu.Id} 
              className="shrink-0 w-[85vw] sm:w-[320px] md:w-auto snap-center md:snap-align-none"
            >
              <MenuCard 
                menu={menu} 
                onOpenModal={() => setSelectedMenu(menu)} 
              />
            </div>
          ))}
        </div>

        {/* Nota Menù Bambini */}
        <div className="mt-10 md:mt-12 bg-[#F7F7F4] border border-[#8B6B4A]/25 p-6 md:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-2xl">
            <span className="font-sans text-[0.6875rem] tracking-[0.2em] uppercase text-[#8B6B4A] font-semibold block mb-1.5">
              Per i più piccoli
            </span>
            <p className="font-sans text-[0.9375rem] text-[#4A5558] leading-relaxed m-0">
              Il nostro menù bambini prevede: <strong className="text-[#1C2B2D] font-medium">Un primo, Pasta (al pomodoro, al pesto o al pistacchio)</strong> ed <strong className="text-[#1C2B2D] font-medium">un secondo, Cotoletta con patatine fritte</strong>.
            </p>
          </div>
          <div className="shrink-0 sm:text-right sm:border-l sm:border-[#8B6B4A]/20 sm:pl-6">
            <span className="font-serif text-2xl font-medium text-[#355A63] block">20€</span>
            <span className="font-sans text-[0.7rem] uppercase tracking-wider text-[#8B6B4A]">a bambino</span>
          </div>
        </div>
      </div>

      {/* Modal renderization */}
      {selectedMenu && (
        <MenuModal 
          isOpen={selectedMenu !== null} 
          onClose={() => setSelectedMenu(null)} 
          cat={selectedMenu}
        />
      )}

      {/* Nasconde la scrollbar del browser mantenendo la funzionalità */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </section>
  );
}