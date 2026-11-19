import { FileDown, Printer, X } from 'lucide-react';
import { exportQuoteToPDF, type PdfQuoteInput } from '../lib/pdfExport';
import {
  calculateLineSubtotal,
  calculateQuoteTotals,
  formatCurrencyPT,
  formatDatePT,
  formatNumberPT,
  formatUnitPricePT,
} from '../lib/pricing';
import type { CompanyProfile } from '../types';

interface QuotePreviewModalProps {
  open: boolean;
  quote: PdfQuoteInput | null;
  profile: CompanyProfile | null;
  onClose: () => void;
}

export function QuotePreviewModal({
  open,
  quote,
  profile,
  onClose,
}: QuotePreviewModalProps) {
  if (!open || !quote) return null;

  const totals = calculateQuoteTotals(
    quote.lines,
    quote.globalDiscountType,
    quote.globalDiscountValue,
    quote.applyVat,
    quote.vatRate
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] overflow-y-auto">
      {/* Barra superior (oculta na impressão) */}
      <div className="no-print sticky top-0 z-10 bg-slate-900 text-white px-6 py-3 flex items-center justify-between gap-4">
        <div className="text-sm font-medium truncate">
          Pré-visualização do Orçamento ·{' '}
          <span className="font-mono text-slate-300">{quote.quoteNumber}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>
          <button
            type="button"
            onClick={() => exportQuoteToPDF(quote, profile)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <FileDown className="w-3.5 h-3.5" />
            Descarregar PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Fechar pré-visualização"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Folha A4 */}
      <div className="py-8 px-4 flex justify-center">
        <article className="print-sheet bg-white border border-slate-200 shadow-lg w-full max-w-[210mm] min-h-[270mm] p-8 sm:p-12 flex flex-col justify-between text-slate-900">
          <div className="space-y-8">
            {/* Cabeçalho da Empresa e Título */}
            <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-200">
              <div className="flex items-start gap-4">
                {profile?.logoDataUrl && (
                  <img
                    src={profile.logoDataUrl}
                    alt={profile.companyName || 'Logótipo da empresa'}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 object-contain rounded-md border border-slate-100 shrink-0"
                  />
                )}
                <div className="space-y-1">
                  <h1 className="text-xl font-bold text-slate-900">
                    {profile?.companyName || 'A Minha Serralharia, Lda.'}
                  </h1>
                  <div className="text-xs text-slate-600 space-y-0.5 leading-relaxed">
                    {profile?.nif && <p className="font-mono">NIF: {profile.nif}</p>}
                    {profile?.address && <p>{profile.address}</p>}
                    {(profile?.phone || profile?.email) && (
                      <p>
                        {[profile.phone, profile.email].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="sm:text-right space-y-1">
                <div className="text-2xl font-bold tracking-tight text-orange-600 font-display">
                  ORÇAMENTO
                </div>
                <div className="text-sm font-mono font-semibold text-slate-900">
                  {quote.quoteNumber}
                </div>
                <div className="text-xs text-slate-600 space-y-0.5">
                  <div>
                    Emissão:{' '}
                    <span className="font-mono tabular-nums text-slate-800">
                      {formatDatePT(quote.issueDate)}
                    </span>
                  </div>
                  <div>
                    Validade:{' '}
                    <span className="font-mono tabular-nums text-slate-800">
                      {formatDatePT(quote.validUntil)}
                    </span>
                  </div>
                </div>
              </div>
            </header>

            {/* Bloco Cliente e Referência */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-5 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1">Cliente</div>
                <div className="text-sm font-semibold text-slate-900">
                  {quote.clientName || 'Cliente não especificado'}
                </div>
                <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                  {quote.clientNif && <div className="font-mono">NIF: {quote.clientNif}</div>}
                  {quote.clientContact && <div>{quote.clientContact}</div>}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1">Referência / Obra</div>
                <div className="text-sm font-semibold text-slate-900">
                  {quote.title || 'Proposta comercial'}
                </div>
              </div>
            </div>

            {/* Tabela de Itens */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-semibold">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">Designação</th>
                    <th className="py-2.5 px-2 w-16 text-center">Unid.</th>
                    <th className="py-2.5 px-3 w-20 text-right">Qtd.</th>
                    <th className="py-2.5 px-3 w-28 text-right">Preço Unit.</th>
                    <th className="py-2.5 px-2 w-20 text-right">Desc.</th>
                    <th className="py-2.5 px-3 w-28 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
                  {quote.lines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">
                        Sem artigos incluídos neste orçamento.
                      </td>
                    </tr>
                  ) : (
                    quote.lines.map((line, index) => {
                      const sub = calculateLineSubtotal(line);
                      const discText =
                        line.discountValue > 0
                          ? line.discountType === 'percent'
                            ? `-${formatNumberPT(line.discountValue, 1)}%`
                            : `-${formatCurrencyPT(line.discountValue, 2)}`
                          : '—';
                      return (
                        <tr key={line.localId} className={index % 2 === 1 ? 'bg-slate-50/70' : ''}>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                            {index + 1}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-900">
                              {[line.category, line.description]
                                .filter((s) => s && s.trim())
                                .join(' — ')}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono text-slate-600">
                            {line.unit || 'UN'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                            {formatNumberPT(line.quantity, Number.isInteger(line.quantity) ? 0 : 2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                            {formatUnitPricePT(line.unitPrice)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">
                            {discText}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatCurrencyPT(sub, 2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Condições + Totais */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-8 pt-2">
              <div className="sm:col-span-7 space-y-4 text-xs text-slate-600 leading-relaxed">
                {profile?.defaultPaymentTerms && (
                  <div>
                    <div className="font-semibold text-slate-800 mb-1">Condições de Pagamento</div>
                    <p className="whitespace-pre-line">{profile.defaultPaymentTerms}</p>
                  </div>
                )}
                {(quote.notes || profile?.defaultNotes) && (
                  <div>
                    <div className="font-semibold text-slate-800 mb-1">Observações</div>
                    <p className="whitespace-pre-line">
                      {quote.notes || profile?.defaultNotes}
                    </p>
                  </div>
                )}
              </div>

              <div className="sm:col-span-5 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatCurrencyPT(totals.subtotal, 2)}
                  </span>
                </div>
                {totals.discountTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      Desconto{' '}
                      {quote.globalDiscountType === 'percent'
                        ? `(${formatNumberPT(quote.globalDiscountValue, 1)}%)`
                        : 'Global'}
                    </span>
                    <span className="font-mono tabular-nums text-emerald-700">
                      -{formatCurrencyPT(totals.discountTotal, 2)}
                    </span>
                  </div>
                )}
                {quote.applyVat ? (
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      IVA ({formatNumberPT(quote.vatRate, 0)}%)
                    </span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {formatCurrencyPT(totals.vatTotal, 2)}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs italic text-slate-500">
                    Valor aproximado sem IVA incluído
                  </div>
                )}

                <div className="mt-3 p-3.5 rounded-lg bg-slate-900 text-white flex items-baseline justify-between">
                  <span className="text-xs font-semibold tracking-wide">TOTAL ESTIMADO</span>
                  <span className="text-xl font-bold font-mono tabular-nums">
                    {formatCurrencyPT(totals.grandTotal, 2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <footer className="mt-12 pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
            <span>{profile?.companyName || 'Orçamento'}</span>
            <span className="font-mono">{quote.quoteNumber}</span>
          </footer>
        </article>
      </div>
    </div>
  );
}
