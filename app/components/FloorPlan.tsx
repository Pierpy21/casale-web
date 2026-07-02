"use client";

import { useState } from "react";
import { ROOMS, type RoomData, RoomGallery } from "./RoomGallery";

const VIEW_BOX = "0 0 800 600";

function FloorStructure() {
  return (
    <g>

      
      {/* Corridoio / ingresso */}
      <line x1={227} y1={178} x2={365} y2={178} stroke="#1C2B2D" strokeWidth={1.5} />

      <line x1={365} y1={178} x2={365} y2={119} stroke="#1C2B2D" strokeWidth={1.5} />

      <line x1={365} y1={119} x2={422} y2={119} stroke="#1C2B2D" strokeWidth={1.5} />


      {/* Rosa dei venti geometrica minimale integrata in alto a destra */}
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
  const { x, y, w, h } = room.svgRect;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const fill = isSelected
    ? "#355A63"
    : isHovered
    ? "#3F5D63"
    : "#D5D5B7";

  const labelColor = isSelected || isHovered ? "fill-[#D5D5B7]/75" : "fill-[#8B6B4A]";

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
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2}
        fill={fill}
        stroke={isSelected ? "#355A63" : "#1C2B2D"}
        strokeWidth={isSelected ? 0 : 2}
        className="transition-all duration-250"
      />
      
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

// Qui ho rimosso il box esterno e aggiunto i tratteggi del tuo schizzo


export function FloorPlan() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const selectedRoom = ROOMS.find((r) => r.id === selectedId) ?? null;

  const handleSelect = (room: RoomData) => {
    setSelectedId((prev) => (prev === room.id ? null : room.id));
  };

  return (
    <section id="spaces" className="bg-[#F7F7F4] py-32 border-t border-[#3F5D63]/10">
      <div className="max-w-[1280px] mx-auto px-8">
        
        {/* Header di Sezione */}
        <div className="mb-16">
          <p className="font-sans text-[0.6875rem] tracking-[0.24em] uppercase text-[#8B6B4A] mb-4">
            Explore the Estate
          </p>
          <div className="flex flex-row items-end justify-between flex-wrap gap-6">
            <h2 className="font-serif text-3xl md:text-5xl text-[#1C2B2D] max-w-[520px]">
              Location &amp; Spazi
            </h2>
            <p className="font-sans text-[0.9375rem] leading-relaxed text-[#5A6668] max-w-[400px]">
              Seleziona una stanza sulla piantina per scoprire la sua atmosfera, capacità e possibilità di evento.
            </p>
          </div>
          <div className="w-12 h-[1px] bg-[#8B6B4A] mt-10" />
        </div>

        {/* Box Planimetria SVG */}
        <div className="bg-[#EDEEDD] border border-[#3F5D63]/12 rounded-[3px] p-6 flex justify-center">
          <svg
            viewBox={VIEW_BOX}
            className="w-full max-w-[900px] block select-none h-auto drop-shadow-sm"
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
        <div className="flex flex-wrap items-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 bg-[#D5D5B7] border border-[#1C2B2D] rounded-[1px]" />
            <span className="font-sans text-xs text-[#6B6955] tracking-wide">Disponibile</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 bg-[#355A63] rounded-[1px]" />
            <span className="font-sans text-xs text-[#6B6955] tracking-wide">Selezionata</span>
          </div>
          <span className="font-sans text-xs text-[#8B6B4A] ml-auto">
            Seleziona una stanza per esplorarla.
          </span>
        </div>

        {/* Pannello Dettagli */}
        {selectedRoom && (
          <div className="mt-14 border-t border-[#3F5D63]/15 pt-14 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <RoomGallery room={selectedRoom} />
          </div>
        )}
      </div>
    </section>
  );
}