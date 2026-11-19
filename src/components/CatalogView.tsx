import { useMemo, useState } from 'react';
import {
  Download,
  Edit3,
  FilePlus2,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { exportCatalogToCSV, exportCatalogToExcel } from '../lib/excel';
import {
  formatDatePT,
  formatNumberPT,
  formatUnitPricePT,
  getItemDisplayName,
  resolveCatalogPrice,
} from '../lib/pricing';
import { SHEET_META, type CatalogItem, type CatalogItemInput, type CatalogSheet } from '../types';
import { CatalogItemDrawer } from './CatalogItemDrawer';
import { ExcelImportModal } from './ExcelImportModal';

interface CatalogViewProps {
  items: CatalogItem[];
  loading: boolean;
  defaultMarginPercent: number;
  onUpdateDefaultMargin: (margin: number) => Promise<void>;
  onCreateItem: (input: CatalogItemInput) => Promise<void>;
  onUpdateItem: (itemId: string, input: CatalogItemInput) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onImportItems: (
    items: CatalogItemInput[],
    mode: 'upsert' | 'add_only'
  ) => Promise<{ created: number; updated: number; skipped: number }>;
  onAddItemToQuote: (item: CatalogItem) => void;
}

type SheetFilter = 'all' | CatalogSheet;

export function CatalogView({
  items,
  loading,
  defaultMarginPercent,
  onUpdateDefaultMargin,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onImportItems,
  onAddItemToQuote,
}: CatalogViewProps) {
  const [activeSheet, setActiveSheet] = useState<SheetFilter>('material');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [marginDraft, setMarginDraft] = useState<string>(String(defaultMarginPercent));
  const [savingMargin, setSavingMargin] = useState(false);

  // Sincronizar margem quando muda no perfil
  const [lastSyncedMargin, setLastSyncedMargin] = useState(defaultMarginPercent);
  if (defaultMarginPercent !== lastSyncedMargin) {
    setLastSyncedMargin(defaultMarginPercent);
    setMarginDraft(String(defaultMarginPercent));
  }

  const sheetCounts = useMemo(() => {
    const counts: Record<SheetFilter, number> = {
      all: items.length,
      material: 0,
      material_cons: 0,
      servicos: 0,
      outros: 0,
    };
    for (const it of items) {
      if (counts[it.sheet] !== undefined) counts[it.sheet]++;
    }
    return counts;
  }, [items]);

  const sheetScopedItems = useMemo(
    () => (activeSheet === 'all' ? items : items.filter((it) => it.sheet === activeSheet)),
    [items, activeSheet]
  );

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of sheetScopedItems) {
      if (it.category.trim()) set.add(it.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt'));
  }, [sheetScopedItems]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.category.trim()) set.add(it.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt'));
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sheetScopedItems
      .filter((it) => {
        if (categoryFilter !== 'all' && it.category !== categoryFilter) return false;
        if (!q) return true;
        const hay = `${it.category} ${it.description} ${it.unit} ${Object.keys(it.suppliers || {}).join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const cCmp = a.category.localeCompare(b.category, 'pt');
        if (cCmp !== 0) return cCmp;
        return a.description.localeCompare(b.description, 'pt');
      });
  }, [sheetScopedItems, categoryFilter, search]);

  const dynamicSuppliers = useMemo(() => {
    if (activeSheet !== 'material' && activeSheet !== 'material_cons') return [];
    const base = [...SHEET_META[activeSheet].suppliers];
    for (const it of filteredItems) {
      for (const sup of Object.keys(it.suppliers || {})) {
        if (!base.includes(sup)) base.push(sup);
      }
    }
    return base;
  }, [activeSheet, filteredItems]);

  const commitMargin = async () => {
    const parsed = Number(marginDraft.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) {
      setMarginDraft(String(defaultMarginPercent));
      return;
    }
    if (parsed === defaultMarginPercent) return;
    setSavingMargin(true);
    try {
      await onUpdateDefaultMargin(parsed);
    } finally {
      setSavingMargin(false);
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    setDrawerOpen(true);
  };

  const openEdit = (item: CatalogItem) => {
    setEditingItem(item);
    setDrawerOpen(true);
  };

  const handleSaveDrawer = async (input: CatalogItemInput, editingId?: string) => {
    if (editingId) {
      await onUpdateItem(editingId, input);
    } else {
      await onCreateItem(input);
    }
  };

  const tabItems: { id: SheetFilter; label: string }[] = [
    { id: 'material', label: 'Material' },
    { id: 'material_cons', label: 'Material - Cons.' },
    { id: 'servicos', label: 'Serviços' },
    { id: 'outros', label: 'Outros' },
    { id: 'all', label: 'Todos' },
  ];

  return (
    <div className="space-y-5">
      {/* Cabeçalho e Ações */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Catálogo de Preçários
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Compara automaticamente o preço mais baixo entre fornecedores e aplica a margem global ao PVP.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg">
            <label htmlFor="global-margin-input" className="text-xs font-medium text-slate-600 whitespace-nowrap">
              Margem global
            </label>
            <input
              id="global-margin-input"
              type="text"
              inputMode="decimal"
              value={marginDraft}
              onChange={(e) => setMarginDraft(e.target.value)}
              onBlur={commitMargin}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitMargin();
              }}
              className="w-14 px-2 py-0.5 text-sm font-mono tabular-nums text-right bg-slate-50 border border-slate-300 rounded focus:outline-none focus:border-orange-600"
            />
            <span className="text-xs font-mono text-slate-500">%{savingMargin ? ' ·' : ''}</span>
          </div>

          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-slate-500" />
            Importar Excel/CSV
          </button>

          <button
            type="button"
            onClick={() => exportCatalogToExcel(items, defaultMarginPercent)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            title="Exportar as 4 folhas para Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
            Exportar .xlsx
          </button>

          <button
            type="button"
            onClick={() => exportCatalogToCSV(items, defaultMarginPercent)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            title="Exportar catálogo em CSV"
          >
            <Download className="w-4 h-4 text-slate-500" />
            CSV
          </button>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Novo Artigo
          </button>
        </div>
      </div>

      {/* Barra de Folhas + Pesquisa + Filtro */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {tabItems.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveSheet(tab.id);
                  setCategoryFilter('all');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeSheet === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}{' '}
                <span className="font-mono tabular-nums text-slate-400 ml-1">
                  {sheetCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1 sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar categoria, medida, fornecedor..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filtrar por categoria"
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-orange-600"
            >
              <option value="all">Todas as categorias</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabela de Dados */}
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">
              Nenhum artigo encontrado nesta vista
            </p>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              Ajuste a pesquisa ou adicione manualmente um artigo à folha selecionada.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Adicionar primeiro artigo
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  {activeSheet === 'all' && <th className="py-3 px-4 whitespace-nowrap">Folha</th>}
                  <th className="py-3 px-4 whitespace-nowrap">Categoria</th>
                  <th className="py-3 px-4 whitespace-nowrap">Descrição</th>

                  {(activeSheet === 'material' || activeSheet === 'material_cons') &&
                    dynamicSuppliers.map((sup) => (
                      <th key={sup} className="py-3 px-3 text-right whitespace-nowrap">
                        {sup}
                      </th>
                    ))}

                  {(activeSheet === 'servicos' || activeSheet === 'outros') && (
                    <th className="py-3 px-4 text-right whitespace-nowrap">Preço/Mt (s/IVA)</th>
                  )}

                  {activeSheet === 'all' && (
                    <th className="py-3 px-4 whitespace-nowrap">Fornecedor / Referência</th>
                  )}

                  <th className="py-3 px-3 text-center whitespace-nowrap">Unid.</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap text-orange-700 bg-orange-50/50">
                    PVP (s/IVA)
                  </th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredItems.map((item) => {
                  const resolved = resolveCatalogPrice(item, defaultMarginPercent);
                  const isDeleting = confirmDeleteId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {activeSheet === 'all' && (
                        <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                          {SHEET_META[item.sheet].shortLabel}
                        </td>
                      )}

                      <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {item.category}
                      </td>

                      <td className="py-3 px-4 text-slate-700">
                        {item.description || <span className="text-slate-400">—</span>}
                      </td>

                      {/* Colunas dinâmicas de fornecedores para Material e Consumíveis */}
                      {(activeSheet === 'material' || activeSheet === 'material_cons') &&
                        dynamicSuppliers.map((sup) => {
                          const q = item.suppliers?.[sup];
                          const isBest = resolved.bestSupplierName === sup;
                          return (
                            <td
                              key={sup}
                              className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap"
                            >
                              {q && q.price !== null ? (
                                <div>
                                  <div
                                    className={
                                      isBest
                                        ? 'font-semibold text-emerald-700'
                                        : 'text-slate-700'
                                    }
                                  >
                                    {formatUnitPricePT(q.price)}
                                  </div>
                                  {q.updatedAt && (
                                    <div className="text-[11px] text-slate-400">
                                      {formatDatePT(q.updatedAt)}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}

                      {/* Coluna Preço/Mt para Serviços e Outros */}
                      {(activeSheet === 'servicos' || activeSheet === 'outros') && (
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {resolved.priceRangeHint ? (
                            <span>{resolved.priceRangeHint}</span>
                          ) : item.referencePriceMin !== null ? (
                            <span>{formatUnitPricePT(item.referencePriceMin)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )}

                      {/* Origem resumida na vista "Todos" */}
                      {activeSheet === 'all' && (
                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                          {resolved.bestSupplierName ? (
                            <span>
                              {resolved.bestSupplierName} ·{' '}
                              <span className="font-mono tabular-nums">
                                {formatUnitPricePT(resolved.bestSupplierPrice)}
                              </span>
                              {resolved.bestSupplierDate && (
                                <span className="text-slate-400">
                                  {' '}
                                  · {formatDatePT(resolved.bestSupplierDate)}
                                </span>
                              )}
                            </span>
                          ) : resolved.priceRangeHint ? (
                            <span className="font-mono tabular-nums">
                              Faixa {resolved.priceRangeHint}
                            </span>
                          ) : item.referencePriceMin !== null ? (
                            <span className="font-mono tabular-nums">
                              Ref. {formatUnitPricePT(item.referencePriceMin)}
                            </span>
                          ) : (
                            <span className="text-slate-400">Manual / sem custo</span>
                          )}
                        </td>
                      )}

                      <td className="py-3 px-3 text-center text-xs font-mono text-slate-600 whitespace-nowrap">
                        {item.unit || '—'}
                      </td>

                      {/* Preço/Venda ao Público calculado ou manual */}
                      <td className="py-3 px-4 text-right bg-orange-50/30 whitespace-nowrap">
                        <div className="font-mono tabular-nums font-semibold text-slate-900">
                          {formatUnitPricePT(resolved.salePrice)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {resolved.source === 'supplier_margin' && (
                            <>
                              {resolved.bestSupplierName} +{formatNumberPT(resolved.appliedMarginPercent ?? 0, 0)}%
                            </>
                          )}
                          {resolved.source === 'manual' && 'PVP fixo'}
                          {resolved.source === 'reference_range' && 'Média faixa'}
                          {resolved.source === 'reference_fixed' && 'Preço ref.'}
                          {resolved.source === 'none' && 'Sem preço'}
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isDeleting ? (
                          <div className="inline-flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteItem(item.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                            >
                              Remover
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-slate-600 hover:text-slate-900"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onAddItemToQuote(item)}
                              title={`Adicionar "${getItemDisplayName(item)}" ao orçamento ativo`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-orange-700 hover:text-orange-800 hover:bg-orange-50 rounded-md transition-colors"
                            >
                              <FilePlus2 className="w-3.5 h-3.5" />
                              Orçamentar
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              title="Editar artigo"
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              title="Eliminar artigo"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CatalogItemDrawer
        open={drawerOpen}
        editingItem={editingItem}
        defaultSheet={activeSheet === 'all' ? 'material' : activeSheet}
        defaultMarginPercent={defaultMarginPercent}
        existingCategories={allCategories}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaveDrawer}
      />

      <ExcelImportModal
        open={importOpen}
        defaultMarginPercent={defaultMarginPercent}
        onClose={() => setImportOpen(false)}
        onConfirmImport={onImportItems}
      />
    </div>
  );
}
