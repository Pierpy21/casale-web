"use client";

import { useState, useRef } from "react";
import { ROOMS, type RoomData, RoomGallery } from "./RoomGallery";

const VIEW_BOX = "0 0 800 600";

function FloorStructure() {
  return (
    <g>
      {/* Corridoio / ingresso */}
      <line x1={227} y1={178} x2={365} y2={178} stroke="#1C2B2D" strokeWidth={1.5} />
      <line x1={365} y1={178} x2={365} y2={119} stroke="#1C2B2D" strokeWidth={1.5} />
      <line x1={365} y1={119} x2={422} y2={119} stroke="#1C2B2D" strokeWidth={1.5} />

      {/* Rosa dei venti  */}
      <g transform="translate(740, 40)">
        <line x1={0} y1={-12} x2={0} y2={12} stroke="rgba(63,93,99,0.3)" strokeWidth={1} />
        <line x1={-12} y1={0} x2={12} y2={0} stroke="rgba(63,93,99,0.3)" strokeWidth={1} />
        <text x={0} y={-16} textAnchor="middle" className="font-sans text-[9px] fill-[#3F5D63]/40 font-medium">N</text>
      </g>
    </g>
  );
}

function RoomShape({
  room,
  isSelected,
  isHovered,
  onClick,
  onHover,
  onLeave,
}: {
  room: RoomData;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  const fill = isSelected ? "#355A63" : isHovered ? "#3F5D63" : "#D5D5B7";
  const strokeColor = isSelected ? "#355A63" : "#1C2B2D";
  const labelColor = isSelected || isHovered ? "fill-[#D5D5B7]/75" : "fill-[#8B6B4A]";

  let cx = 0;
  let cy = 0;

  if (room.svgRect) {
    cx = room.svgRect.x + room.svgRect.w / 2;
    cy = room.svgRect.y + room.svgRect.h / 2;
  } else if (room.svgPolygon) {
    const points = room.svgPolygon.trim().split(/\s+/);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    points.forEach((pt) => {
      const [px, py] = pt.split(",").map(Number);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    });
    
    cx = minX + (maxX - minX) / 2;
    cy = minY + (maxY - minY) / 2;
  }
  if (room.id === "pozzo") {
    cy += 25;
  }

  return (
    <g
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="cursor-pointer select-none"
      role="button"
      aria-pressed={isSelected}
      aria-label={`Select ${room.name}`}
    >
      {room.svgPolygon ? (
        <polygon
          points={room.svgPolygon}
          fill={fill}
          stroke={strokeColor}
          strokeWidth={isSelected ? 0 : 2}
          className="transition-all duration-250"
        />
      ) : room.svgRect ? (
        <rect
          x={room.svgRect.x}
          y={room.svgRect.y}
          width={room.svgRect.w}
          height={room.svgRect.h}
          rx={2}
          fill={fill}
          stroke={strokeColor}
          strokeWidth={isSelected ? 0 : 2}
          className="transition-all duration-250"
        />
      ) : null}
      
      {/* Nome della sala */}
      <text
        x={cx}
        y={cy - (room.type === "large" ? 10 : 6)}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fill: isSelected || isHovered ? "#F7F7F4" : "#1C2B2D" }}
        className={`font-serif tracking-wide transition-colors duration-250 pointer-events-none font-medium ${
          room.type === "large" ? "text-[15px]" : "text-[12px]"
        }`}
      >
        {room.name}
      </text>

      {/* Capienza massima (pax) */}
      <text
        x={cx}
        y={cy + (room.type === "large" ? 12 : 9)}
        textAnchor="middle"
        dominantBaseline="middle"
        className={`font-sans text-[10px] tracking-wider transition-colors duration-250 pointer-events-none ${labelColor}`}
      >
        {room.capacity.replace("Up to ", "").replace("guests", "pax")}
      </text>
    </g>
  );
}

export function FloorPlan() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  
  const galleryRef = useRef<HTMLDivElement>(null);

  const selectedRoom = ROOMS.find((r) => r.id === selectedId) ?? null;

  const handleSelect = (room: RoomData) => {
    const isDeselecting = selectedId === room.id;
    setSelectedId(isDeselecting ? null : room.id);

    if (!isDeselecting) {
      setTimeout(() => {
        galleryRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  };

  return (
    <section id="spaces" className="bg-[#F7F7F4] py-12 md:py-16 border-t border-[#3F5D63]/10">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
        
        {/* Header di Sezione */}
        <div className="mb-10 md:mb-16">
          <p className="font-sans text-[0.6875rem] tracking-[0.24em] uppercase text-[#8B6B4A] mb-3 md:mb-4">
            Esplora il casale
          </p>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
            <h2 className="font-serif text-3xl md:text-5xl text-[#1C2B2D] max-w-[520px] m-0">
              Location &amp; Spazi
            </h2>
            <p className="font-sans text-[0.9375rem] leading-relaxed text-[#5A6668] max-w-[400px] m-0">
              Seleziona una stanza sulla piantina per scoprire la sua atmosfera, capacità e possibilità di evento.
            </p>
          </div>
          
          <div className="w-12 h-[1px] bg-[#8B6B4A] mt-8 md:mt-10" />
          <p className="font-sans text-[0.875rem] md:text-[0.9375rem] leading-relaxed text-[#5A6668] mt-4">
            Cerchiamo sempre di riservare ogni sala ad un singolo evento, tenendo conto del numero di commensali e delle dimensioni di ogni sala in proporzione. 
            L’esclusività della sala è un servizio che includiamo nella banchettistica come anche la preparazione del tavolo della torta ed eventuali decorazioni sul tavolo dei commensali, previe disposizioni discusse tra il cliente ed il responsabile di sala.
          </p>
        </div>

        {/* Box Planimetria SVG */}
<div className="bg-[#EDEEDD] border border-[#3F5D63]/12 rounded-[3px] p-1.5 sm:p-6 flex justify-start md:justify-center overflow-x-scroll scroll-smooth [scrollbar-width:auto] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-[#D5D5B7]/40 [&::-webkit-scrollbar-thumb]:bg-[#355A63] [&::-webkit-scrollbar-thumb]:rounded-full">
  <svg
    viewBox={VIEW_BOX}
    className="w-full max-w-[1200px] min-w-[700px] md:min-w-[800px] block select-none h-auto drop-shadow-sm"
    aria-label="Casale del Notaio floor plan"
    role="img"
  >
    <FloorStructure />
    {ROOMS.map((room) => (
      <RoomShape
        key={room.id}
        room={room}
        isSelected={selectedId === room.id}
        isHovered={hoveredId === room.id}
        onClick={() => handleSelect(room)}
        onHover={() => setHoveredId(room.id)}
        onLeave={() => setHoveredId(null)}
      />
    ))}
  </svg>
</div>

        {/* Legenda inferiore */}
        <div className="flex flex-wrap items-center justify-between gap-3 md:gap-6 mt-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 bg-[#D5D5B7] border border-[#1C2B2D] rounded-[1px]" />
              <span className="font-sans text-xs text-[#6B6955] tracking-wide">Disponibile</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 bg-[#355A63] rounded-[1px]" />
              <span className="font-sans text-xs text-[#6B6955] tracking-wide">Selezionata</span>
            </div>
          </div>
          <span className="font-sans text-xs text-[#8B6B4A] w-full sm:w-auto text-left sm:text-right">
            Seleziona una stanza per esplorarla.
          </span>
        </div>

        {/* Pannello Dettagli con l'ancora ref */}
        {selectedRoom && (
          <div 
            ref={galleryRef} 
            className="mt-10 md:mt-14 border-t border-[#3F5D63]/15 pt-10 md:pt-14 scroll-mt-10 animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <RoomGallery room={selectedRoom} />
          </div>
        )}
      </div>
    </section>
  );
}