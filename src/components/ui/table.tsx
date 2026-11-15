import * as React from "react";

import { cn } from "@/lib/utils";

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  /** On phones each row becomes a labelled card. Set false for grid-like tables that must stay tables. */
  mobileCards?: boolean;
};

// Copies each column heading onto its cells (data-label) so the phone card layout in index.css can
// show "Heading: value" pairs. Re-runs when rows change.
function useColumnLabels(tableRef: React.RefObject<HTMLTableElement>, enabled: boolean) {
  React.useEffect(() => {
    const table = tableRef.current;
    if (!enabled || !table) return;
    const apply = () => {
      const headRows = table.tHead?.rows;
      if (!headRows || headRows.length === 0) return;
      const labels: string[] = [];
      Array.from(headRows[headRows.length - 1].cells).forEach((th) => {
        const span = th.colSpan || 1;
        for (let i = 0; i < span; i++) labels.push((th.textContent || '').trim());
      });
      Array.from(table.tBodies).forEach((tb) =>
        Array.from(tb.rows).forEach((tr) => {
          let col = 0;
          Array.from(tr.cells).forEach((td) => {
            const label = td.colSpan > 1 ? '' : labels[col] || '';
            if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
            col += td.colSpan || 1;
          });
        }),
      );
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(table, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [tableRef, enabled]);
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, mobileCards = true, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTableElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLTableElement);
    useColumnLabels(innerRef, mobileCards);
    return (
      <div className={cn("relative w-full overflow-auto", mobileCards && "rt-cards")}>
        <table ref={innerRef} className={cn("w-full caption-bottom text-sm", className)} {...props} />
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-10 px-3 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-3 py-2 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
