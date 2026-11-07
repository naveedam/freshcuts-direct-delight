import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  unitBased?: boolean;
  className?: string;
}

// Lets you type freely ("", "0", "0.", "0.5") without the box being rewritten mid-typing.
// The order total follows each valid number as you type; an invalid or empty box goes
// back to the last valid quantity when you leave it.
export function QuantityInput({ value, onChange, unitBased = false, className }: QuantityInputProps) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const parse = (raw: string): number | null => {
    if (unitBased) {
      if (!/^\d+$/.test(raw.trim())) return null;
      const n = parseInt(raw, 10);
      return n >= 1 ? n : null;
    }
    const n = Number(raw.trim());
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 10000) / 10000;
  };

  return (
    <Input
      type="text"
      inputMode={unitBased ? 'numeric' : 'decimal'}
      value={text}
      className={className}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.');
        if (!/^\d*\.?\d*$/.test(raw)) return; // digits and one dot only
        setText(raw);
        const n = parse(raw);
        if (n != null) onChange(n);
      }}
      onBlur={() => {
        setFocused(false);
        const n = parse(text);
        setText(String(n ?? value));
      }}
    />
  );
}
