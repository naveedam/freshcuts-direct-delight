import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabase-paginate';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Home, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlatAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  buildingName: string;
  onBuildingMatch?: (buildingName: string) => void;
  placeholder?: string;
  id?: string;
}

export function FlatAutocomplete({
  value,
  onChange,
  buildingName,
  onBuildingMatch,
  placeholder = 'e.g. A-402',
  id,
}: FlatAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: pairs = [] } = useQuery({
    queryKey: ['building-flat-pairs'],
    queryFn: async () => {
      const data = await fetchAllRows<{ building_name: string; flat_number: string }>(() =>
        supabase
          .from('orders')
          .select('building_name, flat_number')
          .not('flat_number', 'is', null)
      );
      const seen = new Set<string>();
      const list: { flat: string; building: string }[] = [];
      (data ?? []).forEach((r: any) => {
        const flat = (r.flat_number ?? '').trim();
        const building = (r.building_name ?? '').trim();
        if (!flat) return;
        const key = building + '||' + flat;
        if (seen.has(key)) return;
        seen.add(key);
        list.push({ flat, building });
      });
      return list.sort((a, b) => a.flat.localeCompare(b.flat));
    },
    staleTime: 5 * 60 * 1000,
  });

  const scoped = useMemo(() => {
    const bn = buildingName.trim().toLowerCase();
    return bn ? pairs.filter((p) => p.building.toLowerCase() === bn) : pairs;
  }, [pairs, buildingName]);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    const source = scoped;
    if (!q) return source.slice(0, 10);
    const starts: typeof source = [];
    const contains: typeof source = [];
    for (const p of source) {
      const lf = p.flat.toLowerCase();
      // Once a building is chosen the exact match is redundant. With no building yet it is kept:
      // the suggestion carries the building, which gets auto-filled on selection.
      if (lf === q && buildingName.trim()) continue;
      if (lf.startsWith(q)) starts.push(p);
      else if (lf.includes(q)) contains.push(p);
    }
    return [...starts, ...contains].slice(0, 10);
  }, [value, scoped, buildingName]);

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  const select = (p: { flat: string; building: string }) => {
    onChange(p.flat);
    if (!buildingName.trim() && p.building && onBuildingMatch) {
      onBuildingMatch(p.building);
    }
    setOpen(false);
    inputRef.current?.blur();
  };

  const highlightMatch = (text: string) => {
    const q = value.trim();
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <span className="font-semibold text-primary">{text.slice(i, i + q.length)}</span>
        {text.slice(i + q.length)}
      </>
    );
  };

  return (
    <Popover open={open && suggestions.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Home className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            id={id}
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            maxLength={20}
            className="pl-8"
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Flat typed in full and left: if exactly one building has this flat, fill it in.
              if (buildingName.trim() || !onBuildingMatch) return;
              const q = value.trim().toLowerCase();
              if (!q) return;
              const matches = new Set(
                pairs.filter((p) => p.flat.toLowerCase() === q && p.building).map((p) => p.building)
              );
              if (matches.size === 1) onBuildingMatch(Array.from(matches)[0]);
            }}
            onKeyDown={(e) => {
              if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                setOpen(true);
                return;
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter' && open && suggestions[highlight]) {
                e.preventDefault();
                select(suggestions[highlight]);
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="p-1 w-[--radix-popover-trigger-width] max-h-72 overflow-auto"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {suggestions.map((p, i) => (
          <button
            key={p.building + '-' + p.flat + '-' + i}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              select(p);
            }}
            onMouseEnter={() => setHighlight(i)}
            className={cn(
              'w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-2',
              i === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
            )}
          >
            <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate flex-1">{highlightMatch(p.flat)}</span>
            {!buildingName.trim() && p.building && (
              <span className="text-xs text-muted-foreground truncate max-w-[140px]">{p.building}</span>
            )}
            {value.trim().toLowerCase() === p.flat.toLowerCase() && (
              <Check className="h-3.5 w-3.5 text-primary" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
