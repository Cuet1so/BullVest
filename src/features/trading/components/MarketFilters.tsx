import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MARKET_FILTERS } from '../utils/market';
import type { MarketFilter } from '../utils/market';

export function MarketFilters({ value, searching, onChange }: {
  value: MarketFilter;
  searching: boolean;
  onChange: (filter: MarketFilter) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  function scroll(direction: number) {
    list.current?.scrollBy({ left: direction * 280, behavior: 'smooth' });
  }
  return (
    <div className="flex min-w-0 items-stretch border-y border-zinc-800">
      <button type="button" onClick={() => scroll(-1)} aria-label="Ver filtros anteriores" className="shrink-0 px-1 text-zinc-400 hover:bg-zinc-800 hover:text-white sm:px-2"><ChevronLeft className="size-4" /></button>
      <div ref={list} role="tablist" aria-label="Filtros de mercado" className="flex min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
        {MARKET_FILTERS.map((filter, index) => (
          <button key={filter.id} id={`market-tab-${filter.id}`} role="tab" type="button"
            aria-selected={filter.id === value} aria-controls="market-results" tabIndex={filter.id === value ? 0 : -1}
            onClick={() => onChange(filter.id)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === 'ArrowRight') next = (index + 1) % MARKET_FILTERS.length;
              else if (event.key === 'ArrowLeft') next = (index - 1 + MARKET_FILTERS.length) % MARKET_FILTERS.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = MARKET_FILTERS.length - 1;
              else return;
              event.preventDefault();
              onChange(MARKET_FILTERS[next].id);
              const target = list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
              target?.focus({ preventScroll: true });
              target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-4 text-xs font-semibold transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400 ${filter.id === value && !searching ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100'}`}>
            {filter.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => scroll(1)} aria-label="Ver más filtros" className="shrink-0 px-1 text-zinc-400 hover:bg-zinc-800 hover:text-white sm:px-2"><ChevronRight className="size-4" /></button>
    </div>
  );
}
