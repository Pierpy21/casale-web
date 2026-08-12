"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { MenuCategoria } from "@/lib/notion";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=420&fit=crop&auto=format";

export function MenuCard({ menu, onOpenModal }: { menu: MenuCategoria; onOpenModal: () => void }) {
  const images = menu.Foto && menu.Foto.length > 0 ? menu.Foto : [FALLBACK_IMAGE];
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [images.length]); // Ottimizzato: tolto currentIndex dalle dipendenze

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  return (
    <article className="bg-[#F7F7F4] border border-[#3F5D63]/10 rounded-[3px] overflow-hidden flex flex-col h-full min-h-[460px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(28,43,45,0.12)]">
      
      {/* Contenitore Carosello */}
      <div className="relative h-[220px] bg-[#D5D5B7] overflow-hidden group shrink-0">
        
        {/* Contenitore interno animato */}
        <div
          className="flex h-full transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {images.map((imgSrc, index) => (
            <div key={index} className="relative flex-[0_0_100%] h-full">
              <Image
                src={imgSrc}
                alt={`Menu ${menu.Nome} - Foto ${index + 1}`}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        {/* Controlli manuali (frecce) */}
        {images.length > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute top-1/2 left-2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white/60 hover:bg-white/90 text-black font-bold text-xl rounded-none border-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out"
              aria-label="Immagine precedente"
            >
              &#8249;
            </button>
            <button
              onClick={nextImage}
              className="absolute top-1/2 right-2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white/60 hover:bg-white/90 text-black font-bold text-xl rounded-none border-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out"
              aria-label="Immagine successiva"
            >
              &#8250;
            </button>

            {/* Indicatori (Puntini in basso) */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
              {images.map((_, idx) => (
                <div
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                  className={`w-1.5 h-1.5 rounded-full cursor-pointer transition-colors duration-300 ${
                    currentIndex === idx ? "bg-[#F7F7F4]" : "bg-[#F7F7F4]/40"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="p-7 flex-1 flex flex-col">
        <p className="font-sans text-[0.6875rem] tracking-[0.2em] uppercase text-[#8B6B4A] mb-2">
    {menu.Stagione}
  </p>
        <h3 className="font-serif text-2xl font-medium text-[#1C2B2D] mb-3.5 leading-[1.2]">
          {menu.Nome}
        </h3>

        {/* Highlights */}
        <ul className="mb-6 list-none p-0">
          {menu.Piatti?.slice(0, 3).map((piatto) => (
            <li
              key={piatto.Id}
              className="flex items-center gap-2 font-sans text-[0.8125rem] text-[#5A6668] mb-1.5"
            >
              <span className="w-1 h-1 rounded-full bg-[#8B6B4A] shrink-0" />
              {piatto.Nome}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <button
          onClick={onOpenModal}
          className="mt-auto font-sans text-xs tracking-[0.14em] uppercase font-medium text-[#355A63] bg-transparent border border-[#355A63] py-3 px-6 rounded-[2px] w-full transition-all duration-250 hover:bg-[#355A63] hover:text-[#F7F7F4] cursor-pointer"
        >
          Vedi {menu.Nome}
        </button>
      </div>
    </article>
  );
}