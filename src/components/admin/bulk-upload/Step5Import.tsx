import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertTriangle, RotateCcw, Download } from 'lucide-react';
import { writeExcelFile } from '@/lib/excel-utils';
import type { ImportState } from '@/types/bulk-upload';

interface Step5Props {
  importState: ImportState;
  onReset: () => void;
}

export function BulkUploadStep5({ importState, onReset }: Step5Props) {
  const { isImporting, importProgress, importLog } = importState;

  const downloadErrorReport = () => {
    if (!importLog?.errors.length) return;
    const ws = XLSX.utils.json_to_sheet(importLog.errors);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
    XLSX.writeFile(wb, 'import_errors.xlsx');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isImporting ? 'Importing...' : importLog ? 'Import Complete' : 'Processing'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isImporting && (
          <div className="space-y-2">
            <Progress value={importProgress} />
            <p className="text-sm text-center text-muted-foreground">
              Processing... {importProgress}%
            </p>
          </div>
        )}

        {importLog && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-center">
                <CheckCircle className="h-8 w-8 mx-auto text-emerald-600 mb-2" />
                <p className="text-3xl font-bold text-emerald-700">{importLog.successCount}</p>
                <p className="text-sm text-muted-foreground">Products created (Draft)</p>
              </div>
              {importLog.failedCount > 0 && (
                <div className="p-6 rounded-lg bg-destructive/10 text-center">
                  <AlertTriangle className="h-8 w-8 mx-auto text-destructive mb-2" />
                  <p className="text-3xl font-bold text-destructive">{importLog.failedCount}</p>
                  <p className="text-sm text-muted-foreground">Failed rows</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={onReset}>
                <RotateCcw className="h-4 w-4 mr-2" /> Import Another File
              </Button>
              {importLog.errors.length > 0 && (
                <Button variant="outline" onClick={downloadErrorReport}>
                  <Download className="h-4 w-4 mr-2" /> Download Error Report
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
