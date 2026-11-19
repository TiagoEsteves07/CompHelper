import React, { useRef, useState } from 'react';
import { Check, FileSpreadsheet, Upload, X } from 'lucide-react';
import { parseCatalogFile, type ParsedImportRow } from '../lib/excel';
import { formatUnitPricePT, resolveCatalogPrice } from '../lib/pricing';
import { SHEET_META, type CatalogItemInput } from '../types';

interface ExcelImportModalProps {
  open: boolean;
  defaultMarginPercent: number;
  onClose: () => void;
  onConfirmImport: (
    items: CatalogItemInput[],
    mode: 'upsert' | 'add_only'
  ) => Promise<{ created: number; updated: number; skipped: number }>;
}

export function ExcelImportModal({
  open,
  defaultMarginPercent,
  onClose,
  onConfirmImport,
}: ExcelImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [mode, setMode] = useState<'upsert' | 'add_only'>('upsert');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleFile = async (file: File) => {
    setError(null);
    setParsing(true);
    setFileName(file.name);
    try {
      const parsed = await parseCatalogFile(file);
      if (parsed.length === 0) {
        setError(
          'Não foram encontradas linhas válidas. Verifique se existem colunas como Categoria, Descrição ou Unidade.'
        );
        setRows([]);
      } else {
        setRows(parsed);
      }
    } catch {
      setError('Não foi possível ler o ficheiro. Utilize um ficheiro .xlsx, .xls ou .csv válido.');
      setRows([]);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const selectedCount = rows.filter((r) => r.selected).length;

  const toggleAll = (checked: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: checked })));
  };

  const toggleRow = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleConfirm = async () => {
    const selectedItems = rows.filter((r) => r.selected).map((r) => r.item);
    if (selectedItems.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      await onConfirmImport(selectedItems, mode);
      setRows([]);
      setFileName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar artigos.');
    } finally {
      setImporting(false);
    }
  };

  const resetAndClose = () => {
    setRows([]);
    setFileName('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Importar catálogo de Excel ou CSV
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Suporta ficheiros .xlsx multi-folha (Material, Consumíveis, Serviços, Outros) e .csv
            </p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {rows.length === 0 ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                dragging
                  ? 'border-orange-500 bg-orange-50/40'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-4 text-slate-700">
                {parsing ? (
                  <FileSpreadsheet className="w-6 h-6 text-orange-600" />
                ) : (
                  <Upload className="w-6 h-6 text-slate-600" />
                )}
              </div>
              <p className="text-sm font-medium text-slate-900 mb-1">
                {parsing
                  ? 'A analisar folhas e colunas...'
                  : 'Arraste o seu ficheiro Excel (.xlsx) ou CSV para aqui'}
              </p>
              <p className="text-xs text-slate-500">
                ou clique para escolher a partir do computador · deteção automática de fornecedores e datas
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">{fileName}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="font-mono tabular-nums">{selectedCount}</span> de{' '}
                  <span className="font-mono tabular-nums">{rows.length}</span> linhas selecionadas
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setMode('upsert')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        mode === 'upsert'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Atualizar existentes + novos
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('add_only')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        mode === 'add_only'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Apenas novos
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRows([]);
                      setFileName('');
                    }}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
                  >
                    Trocar ficheiro
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                      <tr className="text-xs font-medium text-slate-600">
                        <th className="py-2.5 px-3 w-10">
                          <input
                            type="checkbox"
                            checked={selectedCount === rows.length && rows.length > 0}
                            onChange={(e) => toggleAll(e.target.checked)}
                            className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                          />
                        </th>
                        <th className="py-2.5 px-3">Folha</th>
                        <th className="py-2.5 px-3">Categoria</th>
                        <th className="py-2.5 px-3">Descrição</th>
                        <th className="py-2.5 px-3">Unid.</th>
                        <th className="py-2.5 px-3 text-right">Melhor Fornecedor</th>
                        <th className="py-2.5 px-3 text-right">PVP Estimado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {rows.map((r) => {
                        const resolved = resolveCatalogPrice(r.item, defaultMarginPercent);
                        return (
                          <tr
                            key={r.rowId}
                            className={`hover:bg-slate-50/80 ${!r.selected ? 'opacity-50' : ''}`}
                          >
                            <td className="py-2 px-3">
                              <input
                                type="checkbox"
                                checked={r.selected}
                                onChange={() => toggleRow(r.rowId)}
                                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">
                              {SHEET_META[r.item.sheet].shortLabel}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900">
                              {r.item.category}
                            </td>
                            <td className="py-2 px-3 text-slate-700">
                              {r.item.description || '—'}
                            </td>
                            <td className="py-2 px-3 text-xs font-mono text-slate-600">
                              {r.item.unit || '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-xs text-slate-600">
                              {resolved.bestSupplierName
                                ? `${resolved.bestSupplierName} · ${formatUnitPricePT(resolved.bestSupplierPrice)}`
                                : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                              {formatUnitPricePT(resolved.salePrice)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={resetAndClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={selectedCount === 0 || importing}
            onClick={handleConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Check className="w-4 h-4" />
            {importing
              ? 'A importar...'
              : `Confirmar importação (${selectedCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
