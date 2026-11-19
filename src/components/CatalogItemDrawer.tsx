import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  SHEET_META,
  type CatalogItem,
  type CatalogItemInput,
  type CatalogSheet,
  type SupplierQuote,
} from '../types';
import { formatUnitPricePT, resolveCatalogPrice } from '../lib/pricing';

interface CatalogItemDrawerProps {
  open: boolean;
  editingItem: CatalogItem | null;
  defaultSheet: CatalogSheet;
  defaultMarginPercent: number;
  existingCategories: string[];
  onClose: () => void;
  onSave: (input: CatalogItemInput, editingId?: string) => Promise<void>;
}

const COMMON_UNITS = ['KG', 'MT', 'ML', 'M2', 'Hora', 'UN', 'CX', 'L', 'Conj.'];

export function CatalogItemDrawer({
  open,
  editingItem,
  defaultSheet,
  defaultMarginPercent,
  existingCategories,
  onClose,
  onSave,
}: CatalogItemDrawerProps) {
  const [sheet, setSheet] = useState<CatalogSheet>(defaultSheet);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [suppliers, setSuppliers] = useState<Record<string, { price: string; updatedAt: string }>>({});
  const [newSupplierName, setNewSupplierName] = useState('');
  const [refMin, setRefMin] = useState('');
  const [refMax, setRefMax] = useState('');
  const [manualSalePrice, setManualSalePrice] = useState('');
  const [customMargin, setCustomMargin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingItem) {
      setSheet(editingItem.sheet);
      setCategory(editingItem.category);
      setDescription(editingItem.description);
      setUnit(editingItem.unit);

      const meta = SHEET_META[editingItem.sheet];
      const map: Record<string, { price: string; updatedAt: string }> = {};
      for (const sup of meta.suppliers) {
        const existing = editingItem.suppliers?.[sup];
        map[sup] = {
          price: existing?.price !== null && existing?.price !== undefined ? String(existing.price) : '',
          updatedAt: existing?.updatedAt || '',
        };
      }
      for (const [sup, val] of Object.entries(editingItem.suppliers || {})) {
        if (!map[sup]) {
          map[sup] = {
            price: val?.price !== null && val?.price !== undefined ? String(val.price) : '',
            updatedAt: val?.updatedAt || '',
          };
        }
      }
      setSuppliers(map);
      setRefMin(editingItem.referencePriceMin !== null ? String(editingItem.referencePriceMin) : '');
      setRefMax(editingItem.referencePriceMax !== null ? String(editingItem.referencePriceMax) : '');
      setManualSalePrice(editingItem.manualSalePrice !== null ? String(editingItem.manualSalePrice) : '');
      setCustomMargin(
        editingItem.customMarginPercent !== null ? String(editingItem.customMarginPercent) : ''
      );
    } else {
      setSheet(defaultSheet);
      setCategory('');
      setDescription('');
      setUnit(defaultSheet === 'servicos' ? 'Hora' : defaultSheet === 'material' ? 'MT' : 'UN');
      const map: Record<string, { price: string; updatedAt: string }> = {};
      for (const sup of SHEET_META[defaultSheet].suppliers) {
        map[sup] = { price: '', updatedAt: '' };
      }
      setSuppliers(map);
      setRefMin('');
      setRefMax('');
      setManualSalePrice('');
      setCustomMargin('');
    }
    setNewSupplierName('');
  }, [open, editingItem, defaultSheet]);

  if (!open) return null;

  const handleSheetChange = (nextSheet: CatalogSheet) => {
    setSheet(nextSheet);
    setSuppliers((prev) => {
      const next: Record<string, { price: string; updatedAt: string }> = {};
      for (const sup of SHEET_META[nextSheet].suppliers) {
        next[sup] = prev[sup] || { price: '', updatedAt: '' };
      }
      // Preservar fornecedores com valores já preenchidos
      for (const [k, v] of Object.entries(prev)) {
        if (!next[k] && (v.price.trim() || v.updatedAt.trim())) {
          next[k] = v;
        }
      }
      return next;
    });
  };

  const parseNumField = (raw: string): number | null => {
    const cleaned = raw.replace(',', '.').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const buildInputPayload = (): CatalogItemInput => {
    const cleanSuppliers: Record<string, SupplierQuote> = {};
    for (const [name, val] of Object.entries(suppliers)) {
      const p = parseNumField(val.price);
      const dt = val.updatedAt.trim();
      if (p !== null || dt) {
        cleanSuppliers[name] = { price: p, updatedAt: dt };
      }
    }

    return {
      sheet,
      category: category.trim(),
      description: description.trim(),
      unit: unit.trim(),
      suppliers: cleanSuppliers,
      referencePriceMin: parseNumField(refMin),
      referencePriceMax: parseNumField(refMax),
      manualSalePrice: parseNumField(manualSalePrice),
      customMarginPercent: parseNumField(customMargin),
    };
  };

  const previewPayload = buildInputPayload();
  const previewResolved = resolveCatalogPrice(previewPayload, defaultMarginPercent);
  const sheetMeta = SHEET_META[sheet];

  const handleAddSupplier = () => {
    const name = newSupplierName.trim();
    if (!name) return;
    if (Object.keys(suppliers).length >= 12) {
      setError('Limite máximo de 12 fornecedores por artigo.');
      return;
    }
    setSuppliers((prev) => ({
      ...prev,
      [name]: prev[name] || { price: '', updatedAt: '' },
    }));
    setNewSupplierName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildInputPayload();
    if (!payload.category) {
      setError('Indique a categoria do artigo (ex.: Vigas, Tubo Galvanizado, Mão-de-obra).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(payload, editingItem?.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar artigo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]">
      <div className="w-full max-w-xl bg-white h-full border-l border-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {editingItem ? 'Editar artigo do catálogo' : 'Novo artigo no catálogo'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Campos alinhados com a estrutura das 4 folhas do preçário
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Fechar painel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Folha do Preçário */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">Folha do Preçário</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-lg">
              {(['material', 'material_cons', 'servicos', 'outros'] as CatalogSheet[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSheetChange(s)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    sheet === s
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {SHEET_META[s].shortLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Identificação */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Categoria *
              </label>
              <input
                type="text"
                list="catalog-categories-datalist"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex.: Vigas, Tubo Galvanizado"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
                required
              />
              <datalist id="catalog-categories-datalist">
                {existingCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Descrição</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: IPE 220, 140x80x3"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Unidade</label>
              <input
                type="text"
                list="catalog-units-datalist"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="MT"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
              />
              <datalist id="catalog-units-datalist">
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Preços de Fornecedores (Material e Material - Cons.) */}
          {(sheet === 'material' || sheet === 'material_cons') && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Preços por Fornecedor (€)</h3>
                <span className="text-xs text-slate-500">
                  O sistema seleciona automaticamente o mais baixo
                </span>
              </div>

              <div className="space-y-2.5">
                {Object.entries(suppliers).map(([supName, val]) => (
                  <div key={supName} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4 text-sm text-slate-700 truncate" title={supName}>
                      {supName}
                    </div>
                    <div className={sheetMeta.hasSupplierDates ? 'col-span-4' : 'col-span-7'}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={val.price}
                        onChange={(e) =>
                          setSuppliers((prev) => ({
                            ...prev,
                            [supName]: { ...prev[supName], price: e.target.value },
                          }))
                        }
                        placeholder="0,000"
                        className="w-full px-3 py-1.5 text-sm font-mono tabular-nums text-right bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
                      />
                    </div>
                    {sheetMeta.hasSupplierDates && (
                      <div className="col-span-3">
                        <input
                          type="date"
                          value={val.updatedAt}
                          onChange={(e) =>
                            setSuppliers((prev) => ({
                              ...prev,
                              [supName]: { ...prev[supName], updatedAt: e.target.value },
                            }))
                          }
                          className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
                        />
                      </div>
                    )}
                    <div className="col-span-1 flex justify-end">
                      {!sheetMeta.suppliers.includes(supName) && (
                        <button
                          type="button"
                          onClick={() =>
                            setSuppliers((prev) => {
                              const copy = { ...prev };
                              delete copy[supName];
                              return copy;
                            })
                          }
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                          aria-label={`Remover ${supName}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="Adicionar outro fornecedor..."
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
                />
                <button
                  type="button"
                  onClick={handleAddSupplier}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar
                </button>
              </div>
            </div>
          )}

          {/* Preço/Mt (s/IVA) para Serviços e Outros */}
          {sheetMeta.hasReferenceColumn && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Preço/Mt (s/IVA)</h3>
                <span className="text-xs text-slate-500">
                  Valor fixo ou intervalo (ex.: 60 – 90 €)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Valor ou Mínimo (€)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={refMin}
                    onChange={(e) => setRefMin(e.target.value)}
                    placeholder="Ex.: 60,00"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums text-right bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Máximo opcional (€)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={refMax}
                    onChange={(e) => setRefMax(e.target.value)}
                    placeholder="Ex.: 90,00"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums text-right bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Preço de Venda ao Público e Margem */}
          <div className="space-y-4 pt-2 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">
              Preço / Venda ao Público (s/IVA)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Margem específica (%)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={customMargin}
                  onChange={(e) => setCustomMargin(e.target.value)}
                  placeholder={`Global (${defaultMarginPercent}%)`}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums text-right bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Deixe vazio para usar a margem global ({defaultMarginPercent}%).
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  PVP manual opcional (€)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualSalePrice}
                  onChange={(e) => setManualSalePrice(e.target.value)}
                  placeholder="Automático"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums text-right bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Se preenchido, substitui o cálculo automático.
                </p>
              </div>
            </div>

            {/* Pré-visualização do cálculo */}
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
              <div className="text-xs text-slate-600 space-y-0.5">
                <div className="font-medium text-slate-900">PVP efetivo no orçamento</div>
                {previewResolved.source === 'supplier_margin' && (
                  <div>
                    Menor fornecedor: {previewResolved.bestSupplierName} (
                    {formatUnitPricePT(previewResolved.bestSupplierPrice)}) +{' '}
                    {previewResolved.appliedMarginPercent}%
                  </div>
                )}
                {previewResolved.source === 'manual' && <div>Preço manual definido</div>}
                {previewResolved.source === 'reference_range' && (
                  <div>Ponto médio da faixa ({previewResolved.priceRangeHint})</div>
                )}
                {previewResolved.source === 'reference_fixed' && (
                  <div>Baseado em Preço/Mt (s/IVA)</div>
                )}
                {previewResolved.source === 'none' && (
                  <div>Sem preço definido — poderá definir na linha do orçamento</div>
                )}
              </div>
              <div className="text-lg font-semibold font-mono tabular-nums text-orange-600 whitespace-nowrap">
                {formatUnitPricePT(previewResolved.salePrice)}
              </div>
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            {saving ? 'A guardar...' : editingItem ? 'Guardar alterações' : 'Adicionar artigo'}
          </button>
        </div>
      </div>
    </div>
  );
}
