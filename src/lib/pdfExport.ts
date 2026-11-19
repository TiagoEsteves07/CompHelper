import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompanyProfile, QuoteDraftLine } from '../types';
import {
  calculateLineSubtotal,
  calculateQuoteTotals,
  formatCurrencyPT,
  formatDatePT,
  formatNumberPT,
  formatUnitPricePT,
} from './pricing';

export interface PdfQuoteInput {
  quoteNumber: string;
  title: string;
  clientName: string;
  clientNif: string;
  clientContact: string;
  issueDate: string;
  validUntil: string;
  notes: string;
  globalDiscountType: 'percent' | 'fixed';
  globalDiscountValue: number;
  applyVat: boolean;
  vatRate: number;
  lines: QuoteDraftLine[];
}

export function exportQuoteToPDF(quote: PdfQuoteInput, profile: CompanyProfile | null): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 16;

  // Cabeçalho da Empresa (Esquerda) + Identificação do Orçamento (Direita)
  let logoOffsetX = margin;
  if (profile?.logoDataUrl && profile.logoDataUrl.startsWith('data:image/')) {
    try {
      const format = profile.logoDataUrl.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(profile.logoDataUrl, format, margin, y - 2, 22, 22, undefined, 'FAST');
      logoOffsetX = margin + 26;
    } catch {
      logoOffsetX = margin;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(profile?.companyName || 'A Minha Empresa', logoOffsetX, y + 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  let companyY = y + 8.5;
  if (profile?.nif) {
    doc.text(`NIF: ${profile.nif}`, logoOffsetX, companyY);
    companyY += 4;
  }
  if (profile?.address) {
    const addrLines = doc.splitTextToSize(profile.address, 85);
    doc.text(addrLines, logoOffsetX, companyY);
    companyY += addrLines.length * 4;
  }
  const contactParts = [profile?.phone, profile?.email].filter(Boolean);
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  ·  '), logoOffsetX, companyY);
    companyY += 4;
  }

  // Bloco Direita: Título ORÇAMENTO + Número + Datas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(234, 88, 12); // Burnt orange accent
  doc.text('ORÇAMENTO', pageWidth - margin, y + 3, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(quote.quoteNumber || 'ORC-001', pageWidth - margin, y + 9, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Data: ${formatDatePT(quote.issueDate)}`, pageWidth - margin, y + 14, { align: 'right' });
  doc.text(`Validade: ${formatDatePT(quote.validUntil)}`, pageWidth - margin, y + 18.5, {
    align: 'right',
  });

  y = Math.max(companyY, y + 23) + 4;

  // Linha separadora
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  // Caixa de Cliente + Referência
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('CLIENTE', margin + 4, y + 5.5);
  doc.text('REFERÊNCIA / OBRA', pageWidth / 2 + 2, y + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(quote.clientName || 'Cliente não especificado', margin + 4, y + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const clientMeta = [quote.clientNif ? `NIF: ${quote.clientNif}` : '', quote.clientContact]
    .filter(Boolean)
    .join('  ·  ');
  if (clientMeta) {
    doc.text(clientMeta, margin + 4, y + 16.5);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(quote.title || 'Proposta comercial', pageWidth / 2 - margin - 6);
  doc.text(titleLines.slice(0, 2), pageWidth / 2 + 2, y + 11);

  y += 28;

  // Tabela de Linhas
  const tableRows = quote.lines.map((line, index) => {
    const subtotal = calculateLineSubtotal(line);
    const descParts = [line.category, line.description].filter((s) => s && s.trim());
    const fullDesc = descParts.join(' — ') || 'Artigo';
    const discLabel =
      line.discountValue > 0
        ? line.discountType === 'percent'
          ? `-${formatNumberPT(line.discountValue, 1)}%`
          : `-${formatCurrencyPT(line.discountValue, 2)}`
        : '—';

    return [
      String(index + 1),
      fullDesc,
      line.unit || 'UN',
      formatNumberPT(line.quantity, Number.isInteger(line.quantity) ? 0 : 2),
      formatUnitPricePT(line.unitPrice),
      discLabel,
      formatCurrencyPT(subtotal, 2),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Designação', 'Unid.', 'Qtd.', 'Preço Unit.', 'Desc.', 'Subtotal']],
    body: tableRows.length > 0 ? tableRows : [['—', 'Sem artigos adicionados', '', '', '', '', '0,00 €']],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
      cellPadding: 2.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
  });

  const finalTableY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 30;
  let summaryY = finalTableY + 8;

  // Garantir espaço para bloco de totais + notas
  if (summaryY > 235) {
    doc.addPage();
    summaryY = 20;
  }

  const totals = calculateQuoteTotals(
    quote.lines,
    quote.globalDiscountType,
    quote.globalDiscountValue,
    quote.applyVat,
    quote.vatRate
  );

  // Notas e Condições (Esquerda)
  const leftBlockWidth = 102;
  let leftY = summaryY;
  const paymentTerms = profile?.defaultPaymentTerms?.trim();
  const notesText = quote.notes?.trim() || profile?.defaultNotes?.trim();

  if (paymentTerms) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('CONDIÇÕES DE PAGAMENTO', margin, leftY);
    leftY += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(paymentTerms, leftBlockWidth);
    doc.text(lines, margin, leftY);
    leftY += lines.length * 4 + 4;
  }

  if (notesText) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('OBSERVAÇÕES', margin, leftY);
    leftY += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(notesText, leftBlockWidth);
    doc.text(lines, margin, leftY);
  }

  // Bloco Resumo Financeiro (Direita)
  const boxX = pageWidth - margin - 72;
  const boxW = 72;
  let rightY = summaryY;

  const drawSummaryRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(bold ? 15 : 71, bold ? 23 : 85, bold ? 42 : 105);
    doc.text(label, boxX, rightY);
    doc.text(value, boxX + boxW, rightY, { align: 'right' });
    rightY += 5.5;
  };

  drawSummaryRow('Subtotal', formatCurrencyPT(totals.subtotal, 2));

  if (totals.discountTotal > 0) {
    const discLabel =
      quote.globalDiscountType === 'percent'
        ? `Desconto (${formatNumberPT(quote.globalDiscountValue, 1)}%)`
        : 'Desconto Global';
    drawSummaryRow(discLabel, `-${formatCurrencyPT(totals.discountTotal, 2)}`);
  }

  if (quote.applyVat) {
    drawSummaryRow(`IVA (${formatNumberPT(quote.vatRate, 0)}%)`, formatCurrencyPT(totals.vatTotal, 2));
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Valor aproximado sem IVA incluído', boxX, rightY);
    rightY += 5;
  }

  rightY += 1.5;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(boxX - 3, rightY - 5, boxW + 6, 11, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL ESTIMADO', boxX, rightY + 2);
  doc.text(formatCurrencyPT(totals.grandTotal, 2), boxX + boxW, rightY + 2, { align: 'right' });

  // Rodapé com numeração de páginas
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${profile?.companyName || 'Orçamento'} · ${quote.quoteNumber}`,
      margin,
      pageHeight - 7.5
    );
    doc.text(`Página ${p} de ${pageCount}`, pageWidth - margin, pageHeight - 7.5, { align: 'right' });
  }

  const safeNumber = (quote.quoteNumber || 'orcamento').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${safeNumber}.pdf`);
}
