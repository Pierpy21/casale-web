"use client";

import React, { useState } from "react";
import Image from "next/image";

interface GalleryItem {
  id: number;
  title: string;
  category: string;
  images: { src: string; alt: string }[];
  objectPosition?: string;
}

const GALLERY_ITEMS: GalleryItem[] = [
  // --- FOTO VISIBILI NELLA GRIGLIA PRINCIPALE ---
  {
    id: 1,
    title: "Decorazione Tavoli",
    category: "Eventi & Banchetti",
    images: [
      { src: "/images/allestimento-tavoli/first.webp", alt: "Tavolate Imperiali" },
      { src: "/images/allestimento-tavoli/second.webp", alt: "Centrotavola" },
      { src: "/images/allestimento-tavoli/third.webp", alt: "Buffet" },
      { src: "/images/allestimento-tavoli/fourth.webp", alt: "Decorazione" },
      { src: "/images/allestimento-tavoli/fifth.webp", alt: "Decorazione" },
      { src: "/images/allestimento-tavoli/sixth.webp", alt: "Decorazione" },
    ]
  },
  {
    id: 2,
    title: "La cura del dettaglio",
    category: "Mise en place",
    images: [
      { src: "/images/mise-en-place/first.webp", alt: "La cura del dettaglio" },
      { src: "/images/mise-en-place/second.webp", alt: "Decorazione" },
      { src: "/images/mise-en-place/third.webp", alt: "Decorazione" },
      { src: "/images/mise-en-place/fourth.webp", alt: "Decorazione" },
      { src: "/images/mise-en-place/fifth.webp", alt: "Decorazione" },
      { src: "/images/mise-en-place/sixth.webp", alt: "Decorazione" },
    ]
  },
  {
    id: 3,
    title: "Atmosfere all'aperto",
    category: "Terrazza & Esterni",
    images: [
      { src: "/images/allestimento-esterni/first.webp", alt: "Atmosfere all'aperto" },
      { src: "/images/allestimento-esterni/second.webp", alt: "Decorazione" },
      { src: "/images/allestimento-esterni/fourth.webp", alt: "Decorazione" },
      { src: "/images/allestimento-esterni/fifth.webp", alt: "Decorazione" },
      { src: "/images/allestimento-esterni/sixth.webp", alt: "Decorazione" },
      { src: "/images/allestimento-esterni/seventh.webp", alt: "Decorazione" },
    ]
  },
  {
    id: 4,
    title: "Angolo Torta e Foto",
    category: "Eventi & Banchetti",
    images: [
      { src: "/images/tavoli-torte/first.webp", alt: "Angolo Torta e Foto" },
      { src: "/images/tavoli-torte/second.webp", alt: "Decorazione" },
      { src: "/images/tavoli-torte/third.webp", alt: "Decorazione" },
      { src: "/images/tavoli-torte/fourth.webp", alt: "Decorazione" },
      { src: "/images/tavoli-torte/fifth.webp", alt: "Decorazione" },
      { src: "/images/tavoli-torte/sixth.webp", alt: "Decorazione" },
      { src: "/images/tavoli-torte/seventh.webp", alt: "Decorazione" },
      { src: "/images/tavoli-torte/foto1.webp", alt: "Decorazione" },
      { src: "/images/tavoli-torte/foto2.webp", alt: "Decorazione" },
      { src: "/images/tavoli-torte/foto3.webp", alt: "Decorazione" },
      { src: "/images/tavoli-torte/foto6.webp", alt: "Decorazione" },
    ]
  },
];

export function SetupsGallery() {
  const [activeGallery, setActiveGallery] = useState<GalleryItem | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);

  const openModal = (item: GalleryItem) => {
    setActiveGallery(item);
    setActivePhotoIndex(0);
  };

  const closeModal = () => {
    setActiveGallery(null);
  };

  return (
    <>
      <section id="setup" className="bg-[#1C2B2D] flex flex-col h-[100dvh] min-h-[650px] max-h-[900px] py-12 md:py-16">
        
        {/* Intestazione */}
        <div className="max-w-[1280px] mx-auto px-8 w-full shrink-0 mb-8 md:mb-12">
          <p className="font-sans text-[0.6875rem] tracking-[0.24em] uppercase text-[#8B6B4A] mb-3">
            Atmosfere su misura
          </p>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <h2 className="font-serif text-3xl md:text-4xl text-[#F7F7F4] m-0 max-w-[500px]">
              Allestimenti &amp; Dettagli
            </h2>
            <p className="font-sans text-sm leading-[1.7] text-[#D5D5B7] max-w-[380px] m-0 opacity-80 hidden md:block">
              Scorri per scoprire come i nostri spazi si trasformano per adattarsi all'abito del tuo evento.
            </p>
          </div>
        </div>

        {/* Griglia asimmetrica orizzontale */}
        <div className="flex-1 w-full overflow-x-auto snap-x snap-mandatory flex gap-4 md:gap-6 px-8 pb-4 hide-scrollbar">
          
          {/* Colonna 1 */}
          <div 
            onClick={() => openModal(GALLERY_ITEMS[0])}
            className="shrink-0 w-[85vw] md:w-[45vw] h-full relative rounded-[2px] overflow-hidden snap-center bg-[#152022] cursor-pointer group"
          >
            <Image
              src={GALLERY_ITEMS[0].images[0].src}
              alt={GALLERY_ITEMS[0].images[0].alt}
              fill
              sizes="(max-width: 768px) 85vw, 45vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1C2B2D]/80 via-transparent to-transparent transition-opacity group-hover:opacity-90 z-10" />
            <div className="absolute bottom-6 left-6 md:bottom-8 md:left-8 z-20">
              <span className="font-sans text-[0.625rem] tracking-[0.2em] uppercase text-[#D5D5B7] block mb-1">
                {GALLERY_ITEMS[0].category}
              </span>
              <h3 className="font-serif text-xl md:text-2xl font-medium text-[#F7F7F4] m-0">
                {GALLERY_ITEMS[0].title}
              </h3>
            </div>
          </div>

          {/* Colonna 2 */}
          <div className="shrink-0 w-[75vw] md:w-[35vw] h-full flex flex-col gap-4 md:gap-6 snap-center">
            {/* Foto superiore */}
            <div 
              onClick={() => openModal(GALLERY_ITEMS[1])}
              className="relative flex-1 rounded-[2px] overflow-hidden bg-[#152022] cursor-pointer group"
            >
              <Image
                src={GALLERY_ITEMS[1].images[0].src}
                alt={GALLERY_ITEMS[1].images[0].alt}
                fill
                sizes="(max-width: 768px) 75vw, 35vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1C2B2D]/80 via-transparent to-transparent transition-opacity group-hover:opacity-90 z-10" />
              <div className="absolute bottom-5 left-5 md:bottom-6 md:left-6 z-20">
                <span className="font-sans text-[0.625rem] tracking-[0.2em] uppercase text-[#D5D5B7] block mb-1">
                  {GALLERY_ITEMS[1].category}
                </span>
                <h3 className="font-serif text-lg md:text-xl font-medium text-[#F7F7F4] m-0">
                  {GALLERY_ITEMS[1].title}
                </h3>
              </div>
            </div>

            {/* Foto inferiore */}
            <div 
              onClick={() => openModal(GALLERY_ITEMS[2])}
              className="relative flex-1 rounded-[2px] overflow-hidden bg-[#152022] cursor-pointer group"
            >
              <Image
                src={GALLERY_ITEMS[2].images[0].src}
                alt={GALLERY_ITEMS[2].images[0].alt}
                fill
                sizes="(max-width: 768px) 75vw, 35vw"
                className={`object-cover transition-transform duration-700 group-hover:scale-105 ${GALLERY_ITEMS[2].objectPosition || ''}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1C2B2D]/80 via-transparent to-transparent transition-opacity group-hover:opacity-90 z-10" />
              <div className="absolute bottom-5 left-5 md:bottom-6 md:left-6 z-20">
                <span className="font-sans text-[0.625rem] tracking-[0.2em] uppercase text-[#D5D5B7] block mb-1">
                  {GALLERY_ITEMS[2].category}
                </span>
                <h3 className="font-serif text-lg md:text-xl font-medium text-[#F7F7F4] m-0">
                  {GALLERY_ITEMS[2].title}
                </h3>
              </div>
            </div>
          </div>

          {/* Colonna 3 */}
          <div 
            onClick={() => openModal(GALLERY_ITEMS[3])}
            className="shrink-0 w-[85vw] md:w-[50vw] h-full relative rounded-[2px] overflow-hidden snap-center bg-[#152022] cursor-pointer group"
          >
            <Image
              src={GALLERY_ITEMS[3].images[0].src}
              alt={GALLERY_ITEMS[3].images[0].alt}
              fill
              sizes="(max-width: 768px) 85vw, 50vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1C2B2D]/80 via-transparent to-transparent transition-opacity group-hover:opacity-90 z-10" />
            <div className="absolute bottom-6 left-6 md:bottom-8 md:left-8 z-20">
              <span className="font-sans text-[0.625rem] tracking-[0.2em] uppercase text-[#D5D5B7] block mb-1">
                {GALLERY_ITEMS[3].category}
              </span>
              <h3 className="font-serif text-xl md:text-2xl font-medium text-[#F7F7F4] m-0">
                {GALLERY_ITEMS[3].title}
              </h3>
            </div>
          </div>
        </div>

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

      {/* --- MODALE GALLERIA  --- */}
      {activeGallery && (
        <div 
          className="fixed inset-0 z-50 flex flex-col bg-[#0d1415]/98 animate-in fade-in duration-300"
          onClick={closeModal} 
        >
          {/* Header Modale: Titolo e Bottone Chiudi */}
          <div className="flex justify-between items-center w-full px-6 py-6 md:px-12 md:py-8 shrink-0">
            <span className="font-sans text-xs tracking-[0.2em] uppercase text-[#D5D5B7]">
              {activeGallery.title}
            </span>
            <button 
              className="text-[#D5D5B7] hover:text-white transition-colors p-2"
              onClick={closeModal}
              aria-label="Chiudi galleria"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* Immagine Principale */}
          <div 
            className="flex-1 flex flex-col justify-center items-center w-full px-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()} 
          >
            <div className="relative w-full max-w-5xl h-[55vh] md:h-[65vh] flex justify-center items-center">
              <Image 
                src={activeGallery.images[activePhotoIndex].src} 
                alt={activeGallery.images[activePhotoIndex].alt} 
                fill
                className="object-contain rounded-[2px]" 
                sizes="100vw"
              />
            </div>
            
            <h3 className="font-serif text-xl md:text-2xl text-white mt-6 md:mt-8 font-light tracking-wide text-center">
              {activeGallery.images[activePhotoIndex].alt}
            </h3>
          </div>

          {/* Galleria Inferiore */}
<div 
  className="w-full px-6 py-8 md:py-12 shrink-0 bg-gradient-to-t from-black/40 to-transparent"
  onClick={(e) => e.stopPropagation()}
>
  <div className="flex gap-3 md:gap-4 overflow-x-auto hide-scrollbar justify-start md:justify-center max-w-7xl mx-auto">
    {activeGallery.images.map((photo, index) => (
      <button
        key={photo.src} 
        onClick={() => setActivePhotoIndex(index)}
        className="relative shrink-0 flex flex-col items-center group outline-none"
      >
        <div className={`relative w-24 h-16 md:w-32 md:h-20 rounded-[2px] overflow-hidden transition-all duration-300 ${
            activePhotoIndex === index 
              ? 'opacity-100 ring-1 ring-[#8B6B4A]' 
              : 'opacity-40 group-hover:opacity-80'
          }`}
        >
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(max-width: 768px) 96px, 128px"
            className="object-cover"
          />
        </div>
        {/* Indicatore sotto la miniatura attiva */}
        <div className={`h-[2px] mt-2 bg-[#8B6B4A] transition-all duration-300 ${activePhotoIndex === index ? 'w-full' : 'w-0'}`} />
      </button>
    ))}
  </div>
</div>
        </div>
      )}
    </>
  );
}