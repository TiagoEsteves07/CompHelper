import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Building2,
  Calculator,
  Clock,
  Layers,
  LogOut,
  Menu,
  Plus,
  X,
} from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { CatalogView } from './components/CatalogView';
import { CompanySettingsView } from './components/CompanySettingsView';
import { QuoteBuilderView, type ActiveQuoteDraft } from './components/QuoteBuilderView';
import { QuoteHistoryView } from './components/QuoteHistoryView';
import { QuotePreviewModal } from './components/QuotePreviewModal';
import { auth, signOutUser } from './lib/firebase';
import {
  batchImportCatalogItems,
  createCatalogItem,
  deleteCatalogItem,
  deleteQuoteWithLines,
  duplicateQuote,
  ensureCompanyProfileAndSeed,
  fetchQuoteLines,
  generateSafeId,
  saveQuoteWithLines,
  subscribeCatalogItems,
  subscribeCompanyProfile,
  subscribeQuotes,
  updateCatalogItem,
  updateCompanyProfile,
  updateQuoteStatus,
} from './lib/firestoreService';
import { exportQuoteToPDF, type PdfQuoteInput } from './lib/pdfExport';
import { addDaysISO, getItemDisplayName, resolveCatalogPrice, todayISO } from './lib/pricing';
import type {
  AppView,
  CatalogItem,
  CatalogItemInput,
  CompanyProfile,
  Quote,
  QuoteStatus,
} from './types';

function formatQuoteNumber(seq: number): string {
  const year = new Date().getFullYear();
  return `ORC-${year}-${String(Math.max(1, seq)).padStart(3, '0')}`;
}

function createEmptyDraft(profile: CompanyProfile | null): ActiveQuoteDraft {
  const issue = todayISO();
  const validityDays = profile?.defaultValidityDays ?? 30;
  return {
    quoteNumber: formatQuoteNumber(profile?.nextQuoteSeq ?? 1),
    title: '',
    clientName: '',
    clientNif: '',
    clientContact: '',
    issueDate: issue,
    validUntil: addDaysISO(issue, validityDays),
    status: 'rascunho',
    notes: profile?.defaultNotes ?? '',
    globalDiscountType: 'percent',
    globalDiscountValue: 0,
    applyVat: true,
    vatRate: profile?.defaultVatRate ?? 23,
    lines: [],
  };
}

interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [activeView, setActiveView] = useState<AppView>('builder');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [draft, setDraft] = useState<ActiveQuoteDraft>(() => createEmptyDraft(null));
  const [draftInitializedForProfile, setDraftInitializedForProfile] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);

  const [previewQuote, setPreviewQuote] = useState<PdfQuoteInput | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  if (fatalError) {
    throw fatalError;
  }

  const showToast = useCallback(
    (message: string, actionLabel?: string, onAction?: () => void) => {
      const id = Date.now();
      setToast({ id, message, actionLabel, onAction });
      window.setTimeout(() => {
        setToast((curr) => (curr && curr.id === id ? null : curr));
      }, 4500);
    },
    []
  );

  // 1. Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (!u) {
        setProfile(null);
        setCatalogItems([]);
        setQuotes([]);
        setDraftInitializedForProfile(false);
        setDataLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // 2. Bootstrap profile + seed Excel catalog + attach real-time listeners
  useEffect(() => {
    if (!user) return;
    let active = true;
    setDataLoading(true);

    let unsubProfile: (() => void) | undefined;
    let unsubCatalog: (() => void) | undefined;
    let unsubQuotes: (() => void) | undefined;

    (async () => {
      try {
        const bootstrapped = await ensureCompanyProfileAndSeed(
          user.uid,
          user.email || '',
          user.displayName || ''
        );
        if (!active) return;

        setProfile(bootstrapped);

        unsubProfile = subscribeCompanyProfile(
          user.uid,
          (p) => {
            if (p) setProfile(p);
          },
          (err) => setFatalError(err)
        );

        unsubCatalog = subscribeCatalogItems(
          user.uid,
          (items) => {
            setCatalogItems(items);
            setDataLoading(false);
          },
          (err) => setFatalError(err)
        );

        unsubQuotes = subscribeQuotes(
          user.uid,
          (qs) => setQuotes(qs),
          (err) => setFatalError(err)
        );
      } catch (err) {
        if (active) {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return () => {
      active = false;
      unsubProfile?.();
      unsubCatalog?.();
      unsubQuotes?.();
    };
  }, [user]);

  // Inicializar o primeiro rascunho assim que o perfil carregar (com nº sequencial, IVA e notas padrão)
  useEffect(() => {
    if (profile && !draftInitializedForProfile) {
      setDraft(createEmptyDraft(profile));
      setDirty(false);
      setDraftInitializedForProfile(true);
    }
  }, [profile, draftInitializedForProfile]);

  const handleChangeDraft = useCallback(
    (updater: (prev: ActiveQuoteDraft) => ActiveQuoteDraft) => {
      setDraft((prev) => updater(prev));
      setDirty(true);
    },
    []
  );

  const handleStartNewQuote = useCallback(() => {
    setDraft(createEmptyDraft(profile));
    setDirty(false);
    setActiveView('builder');
    setMobileMenuOpen(false);
  }, [profile]);

  const handleAddCatalogItemToQuote = useCallback(
    (item: CatalogItem, switchToBuilder = false) => {
      const isCurrentLocked = Boolean(
        draft.id && (draft.status === 'aprovado' || draft.status === 'recusado')
      );
      const baseMargin = profile?.defaultMarginPercent ?? 30;
      const resolved = resolveCatalogPrice(item, baseMargin);
      const unitPrice = resolved.salePrice ?? 0;

      const newLine = {
        localId: generateSafeId('draft'),
        catalogItemId: item.id,
        isCustom: false,
        sheet: item.sheet,
        category: item.category,
        description: getItemDisplayName(item),
        unit: item.unit || 'UN',
        quantity: 1,
        unitPrice,
        catalogUnitPrice: resolved.salePrice,
        priceRangeHint: resolved.priceRangeHint,
        sourceSupplier: resolved.bestSupplierName || '',
        discountType: 'percent' as const,
        discountValue: 0,
      };

      if (isCurrentLocked) {
        const fresh = createEmptyDraft(profile);
        setDraft({ ...fresh, lines: [newLine] });
      } else {
        setDraft((prev) => ({ ...prev, lines: [...prev.lines, newLine] }));
      }
      setDirty(true);

      if (switchToBuilder) {
        setActiveView('builder');
      } else {
        showToast(
          `Adicionado "${getItemDisplayName(item)}" ao orçamento.`,
          'Ver orçamento',
          () => setActiveView('builder')
        );
      }
    },
    [draft.id, draft.status, profile, showToast]
  );

  const handleAddCustomLine = useCallback(() => {
    handleChangeDraft((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          localId: generateSafeId('draft'),
          catalogItemId: '',
          isCustom: true,
          sheet: 'avulso',
          category: 'Item Avulso',
          description: '',
          unit: 'UN',
          quantity: 1,
          unitPrice: 0,
          catalogUnitPrice: null,
          priceRangeHint: '',
          sourceSupplier: '',
          discountType: 'percent',
          discountValue: 0,
        },
      ],
    }));
  }, [handleChangeDraft]);

  const handleSaveQuote = useCallback(async () => {
    if (!user) return;
    setSavingQuote(true);
    try {
      const isNew = !draft.id;
      const nextSeq = (profile?.nextQuoteSeq ?? 1) + 1;
      const savedId = await saveQuoteWithLines(user.uid, {
        existingQuoteId: draft.id,
        quoteNumber: draft.quoteNumber,
        title: draft.title,
        clientName: draft.clientName,
        clientNif: draft.clientNif,
        clientContact: draft.clientContact,
        issueDate: draft.issueDate,
        validUntil: draft.validUntil,
        status: draft.status,
        notes: draft.notes,
        globalDiscountType: draft.globalDiscountType,
        globalDiscountValue: draft.globalDiscountValue,
        applyVat: draft.applyVat,
        vatRate: draft.vatRate,
        lines: draft.lines,
        nextQuoteSeqToIncrement: isNew ? nextSeq : undefined,
      });

      setDraft((prev) => ({ ...prev, id: savedId }));
      setDirty(false);
      showToast(isNew ? 'Orçamento guardado com sucesso.' : 'Alterações guardadas.');
    } finally {
      setSavingQuote(false);
    }
  }, [user, draft, profile, showToast]);

  const handleOpenQuote = useCallback(
    async (quote: Quote) => {
      if (!user) return;
      const lines = await fetchQuoteLines(user.uid, quote.id);
      setDraft({
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        title: quote.title,
        clientName: quote.clientName,
        clientNif: quote.clientNif,
        clientContact: quote.clientContact,
        issueDate: quote.issueDate,
        validUntil: quote.validUntil,
        status: quote.status,
        notes: quote.notes,
        globalDiscountType: quote.globalDiscountType,
        globalDiscountValue: quote.globalDiscountValue,
        applyVat: quote.applyVat,
        vatRate: quote.vatRate,
        lines: lines.map((l) => ({
          localId: l.id,
          catalogItemId: l.catalogItemId,
          isCustom: l.isCustom,
          sheet: l.sheet,
          category: l.category,
          description: l.description,
          unit: l.unit,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          catalogUnitPrice: l.catalogUnitPrice,
          priceRangeHint: l.priceRangeHint,
          sourceSupplier: l.sourceSupplier,
          discountType: l.discountType,
          discountValue: l.discountValue,
        })),
      });
      setDirty(false);
      setActiveView('builder');
    },
    [user]
  );

  const handlePreviewQuoteFromHistory = useCallback(
    async (quote: Quote) => {
      if (!user) return;
      const lines = await fetchQuoteLines(user.uid, quote.id);
      setPreviewQuote({
        quoteNumber: quote.quoteNumber,
        title: quote.title,
        clientName: quote.clientName,
        clientNif: quote.clientNif,
        clientContact: quote.clientContact,
        issueDate: quote.issueDate,
        validUntil: quote.validUntil,
        notes: quote.notes,
        globalDiscountType: quote.globalDiscountType,
        globalDiscountValue: quote.globalDiscountValue,
        applyVat: quote.applyVat,
        vatRate: quote.vatRate,
        lines: lines.map((l) => ({
          localId: l.id,
          catalogItemId: l.catalogItemId,
          isCustom: l.isCustom,
          sheet: l.sheet,
          category: l.category,
          description: l.description,
          unit: l.unit,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          catalogUnitPrice: l.catalogUnitPrice,
          priceRangeHint: l.priceRangeHint,
          sourceSupplier: l.sourceSupplier,
          discountType: l.discountType,
          discountValue: l.discountValue,
        })),
      });
    },
    [user]
  );

  const handleDuplicateQuote = useCallback(
    async (sourceQuote: Quote) => {
      if (!user) return;
      const seq = profile?.nextQuoteSeq ?? quotes.length + 1;
      const newNumber = formatQuoteNumber(seq);
      const { quoteId, lines } = await duplicateQuote(user.uid, sourceQuote, newNumber, seq + 1);
      setDraft({
        id: quoteId,
        quoteNumber: newNumber,
        title: sourceQuote.title ? `${sourceQuote.title} (Cópia)` : 'Cópia de Orçamento',
        clientName: sourceQuote.clientName,
        clientNif: sourceQuote.clientNif,
        clientContact: sourceQuote.clientContact,
        issueDate: sourceQuote.issueDate,
        validUntil: sourceQuote.validUntil,
        status: 'rascunho',
        notes: sourceQuote.notes,
        globalDiscountType: sourceQuote.globalDiscountType,
        globalDiscountValue: sourceQuote.globalDiscountValue,
        applyVat: sourceQuote.applyVat,
        vatRate: sourceQuote.vatRate,
        lines,
      });
      setDirty(false);
      setActiveView('builder');
      showToast(`Orçamento duplicado como ${newNumber}.`);
    },
    [user, profile, quotes.length, showToast]
  );

  const handleDuplicateActive = useCallback(async () => {
    if (!draft.id) return;
    const match = quotes.find((q) => q.id === draft.id);
    if (match) {
      await handleDuplicateQuote(match);
    }
  }, [draft.id, quotes, handleDuplicateQuote]);

  const handleUpdateQuoteStatus = useCallback(
    async (quoteId: string, status: QuoteStatus) => {
      await updateQuoteStatus(quoteId, status);
      if (draft.id === quoteId) {
        setDraft((prev) => ({ ...prev, status }));
      }
      showToast('Estado do orçamento atualizado.');
    },
    [draft.id, showToast]
  );

  const handleDeleteQuote = useCallback(
    async (quoteId: string) => {
      if (!user) return;
      await deleteQuoteWithLines(user.uid, quoteId);
      if (draft.id === quoteId) {
        setDraft(createEmptyDraft(profile));
        setDirty(false);
      }
      showToast('Orçamento eliminado.');
    },
    [user, draft.id, profile, showToast]
  );

  // Catalog handlers
  const handleUpdateDefaultMargin = useCallback(
    async (margin: number) => {
      if (!user) return;
      await updateCompanyProfile(user.uid, { defaultMarginPercent: margin });
      showToast(`Margem global atualizada para ${margin}%.`);
    },
    [user, showToast]
  );

  const handleCreateCatalogItem = useCallback(
    async (input: CatalogItemInput) => {
      if (!user) return;
      await createCatalogItem(user.uid, input);
      showToast('Artigo adicionado ao catálogo.');
    },
    [user, showToast]
  );

  const handleUpdateCatalogItem = useCallback(
    async (itemId: string, input: CatalogItemInput) => {
      await updateCatalogItem(itemId, input);
      showToast('Artigo atualizado.');
    },
    [showToast]
  );

  const handleDeleteCatalogItem = useCallback(
    async (itemId: string) => {
      await deleteCatalogItem(itemId);
      showToast('Artigo removido do catálogo.');
    },
    [showToast]
  );

  const handleImportCatalogItems = useCallback(
    async (incoming: CatalogItemInput[], mode: 'upsert' | 'add_only') => {
      if (!user) return { created: 0, updated: 0, skipped: 0 };
      const res = await batchImportCatalogItems(user.uid, incoming, catalogItems, mode);
      showToast(
        `Importação concluída: ${res.created} criados, ${res.updated} atualizados${
          res.skipped > 0 ? `, ${res.skipped} ignorados` : ''
        }.`
      );
      return res;
    },
    [user, catalogItems, showToast]
  );

  const handleSaveCompanyProfile = useCallback(
    async (
      patch: Partial<
        Pick<
          CompanyProfile,
          | 'companyName'
          | 'nif'
          | 'address'
          | 'phone'
          | 'email'
          | 'logoDataUrl'
          | 'defaultMarginPercent'
          | 'defaultVatRate'
          | 'defaultValidityDays'
          | 'defaultPaymentTerms'
          | 'defaultNotes'
        >
      >
    ) => {
      if (!user) return;
      await updateCompanyProfile(user.uid, patch);
      showToast('Definições da empresa guardadas.');
    },
    [user, showToast]
  );

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">A iniciar CompHelper...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  const navItems: { id: AppView; label: string; icon: typeof Calculator; count?: number }[] = [
    { id: 'builder', label: 'Criador de Orçamentos', icon: Calculator },
    { id: 'catalog', label: 'Catálogo', icon: Layers, count: catalogItems.length },
    { id: 'history', label: 'Histórico', icon: Clock, count: quotes.length },
    { id: 'settings', label: 'Dados da Empresa', icon: Building2 },
  ];

  const activeNavMeta = navItems.find((n) => n.id === activeView) || navItems[0];

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
        <span className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap">
          CompHelper
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
          aria-label="Fechar menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveView(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-orange-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.count === 'number' && (
                <span
                  className={`text-xs font-mono tabular-nums ${
                    isActive ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-900 truncate">
            {user.displayName || 'Utilizador'}
          </div>
          <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
        </div>
        <button
          type="button"
          onClick={() => signOutUser()}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Terminar sessão
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="no-print hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        {SidebarContent}
      </aside>

      {/* Drawer Mobile */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[82vw] bg-white h-full border-r border-slate-200 z-10">
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Área Principal */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb à esquerda + 1 CTA primário à direita */}
        <header className="no-print sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="text-slate-400 hidden sm:inline">CompHelper</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 truncate">{activeNavMeta.label}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStartNewQuote}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo Orçamento
          </button>
        </header>

        {/* Viewport Principal */}
        <main className="no-print flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          {activeView === 'builder' && (
            <QuoteBuilderView
              draft={draft}
              catalogItems={catalogItems}
              profile={profile}
              saving={savingQuote}
              dirty={dirty}
              onChangeDraft={handleChangeDraft}
              onAddCatalogItem={(item) => handleAddCatalogItemToQuote(item, false)}
              onAddCustomLine={handleAddCustomLine}
              onSaveQuote={handleSaveQuote}
              onNewQuote={handleStartNewQuote}
              onDuplicateActive={handleDuplicateActive}
              onOpenPreview={() => setPreviewQuote(draft)}
              onDownloadPdf={() => exportQuoteToPDF(draft, profile)}
            />
          )}

          {activeView === 'catalog' && (
            <CatalogView
              items={catalogItems}
              loading={dataLoading}
              defaultMarginPercent={profile?.defaultMarginPercent ?? 30}
              onUpdateDefaultMargin={handleUpdateDefaultMargin}
              onCreateItem={handleCreateCatalogItem}
              onUpdateItem={handleUpdateCatalogItem}
              onDeleteItem={handleDeleteCatalogItem}
              onImportItems={handleImportCatalogItems}
              onAddItemToQuote={(item) => handleAddCatalogItemToQuote(item, false)}
            />
          )}

          {activeView === 'history' && (
            <QuoteHistoryView
              quotes={quotes}
              loading={dataLoading}
              onNewQuote={handleStartNewQuote}
              onOpenQuote={handleOpenQuote}
              onPreviewQuote={handlePreviewQuoteFromHistory}
              onDuplicateQuote={handleDuplicateQuote}
              onUpdateStatus={handleUpdateQuoteStatus}
              onDeleteQuote={handleDeleteQuote}
            />
          )}

          {activeView === 'settings' && (
            <CompanySettingsView
              profile={profile}
              onSaveProfile={handleSaveCompanyProfile}
            />
          )}
        </main>
      </div>

      {/* Modal de Pré-visualização A4 & PDF */}
      <QuotePreviewModal
        open={Boolean(previewQuote)}
        quote={previewQuote}
        profile={profile}
        onClose={() => setPreviewQuote(null)}
      />

      {/* Toast Discreto */}
      {toast && (
        <div className="no-print fixed bottom-5 right-5 z-50 max-w-md bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm">
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.();
                setToast(null);
              }}
              className="text-orange-400 hover:text-orange-300 font-semibold whitespace-nowrap"
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
