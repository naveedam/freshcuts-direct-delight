import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MapPin, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuildingAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}

export function BuildingAutocomplete({
  value,
  onChange,
  placeholder = 'Start typing apartment name...',
  id,
}: BuildingAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: buildings = [] } = useQuery({
    queryKey: ['distinct-building-names'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('building_name')
        .not('building_name', 'is', null)
        .order('building_name', { ascending: true })
        .limit(2000);
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => {
        const v = (r.building_name ?? '').trim();
        if (v) set.add(v);
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    },
    staleTime: 5 * 60 * 1000,
  });

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return buildings.slice(0, 10);
    const starts: string[] = [];
    const contains: string[] = [];
    for (const b of buildings) {
      const lb = b.toLowerCase();
      if (lb === q) continue;
      if (lb.startsWith(q)) starts.push(b);
      else if (lb.includes(q)) contains.push(b);
    }
    return [...starts, ...contains].slice(0, 10);
  }, [value, buildings]);

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  const select = (v: string) => {
    onChange(v);
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
          <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            id={id}
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            maxLength={100}
            className="pl-8"
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
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
        {suggestions.map((s, i) => (
          <button
            key={s}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              select(s);
            }}
            onMouseEnter={() => setHighlight(i)}
            className={cn(
              'w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-2',
              i === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
            )}
          >
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate flex-1">{highlightMatch(s)}</span>
            {value.trim().toLowerCase() === s.toLowerCase() && (
              <Check className="h-3.5 w-3.5 text-primary" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}