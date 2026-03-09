import { useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, Download } from 'lucide-react';
import { toast } from 'sonner';
import { readExcelFile, writeExcelFile } from '@/lib/excel-utils';
import { SYSTEM_FIELDS } from '@/types/bulk-upload';

interface Step1Props {
  onFileLoaded: (fileName: string, headers: string[], data: Record<string, unknown>[]) => void;
}

export function BulkUploadStep1({ onFileLoaded }: Step1Props) {
  const [isDragging, setIsDragging] = useState(false);

  const processFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|csv)$/i)) {
      toast.error('Please upload an .xlsx or .csv file');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const { headers, rows } = await readExcelFile(buffer);

        if (rows.length === 0) {
          toast.error('The file appears to be empty');
          return;
        }

        onFileLoaded(file.name, headers, rows);
        toast.success(`Loaded ${rows.length} rows with ${headers.length} columns`);
      } catch {
        toast.error('Failed to parse file');
      }
    };
    reader.readAsArrayBuffer(file);
  }, [onFileLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const downloadTemplate = () => {
    const templateRow = SYSTEM_FIELDS.reduce((acc, f) => ({ ...acc, [f.label]: '' }), {});
    writeExcelFile('FreshCutsDaily_Product_Template.xlsx', [
      { name: 'Products', data: [templateRow] }
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Upload Product File
        </CardTitle>
        <CardDescription>Upload an Excel (.xlsx) or CSV file containing product data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer
            ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.xlsx,.csv';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) processFile(file);
            };
            input.click();
          }}
        >
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop your file here or click to browse</p>
          <p className="text-sm text-muted-foreground mt-1">Supports .xlsx and .csv • Extra columns will be handled in mapping</p>
        </div>

        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Download Template
        </Button>
      </CardContent>
    </Card>
  );
}
