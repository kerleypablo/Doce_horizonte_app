import { formatDateBr } from '../shared/date.ts';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { CompanySettings, OrderItem } from './order-types.ts';

const currency = (value: number) => `R$ ${value.toFixed(2)}`;
const escapeHtml = (value?: string) => (value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const note = (value?: string) => value?.trim() || '-';

export const buildOrderPdfHtml = (order: OrderItem, settings?: CompanySettings) => {
  const customer = order.customerSnapshot;
  const deliveryAddress = order.deliveryAddress ?? customer?.deliveryAddress ?? '';
  const companyName = settings?.companyName ?? 'Controle Precificacao';
  const companyPhone = settings?.companyPhone ?? '';
  const companyEmail = settings?.companyEmail ?? '';
  const pixKey = settings?.pixKey ?? '';
  const logoDataUrl = settings?.logoDataUrl ?? '';
  const productsTotal = order.products.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const additionsTotal = order.additions.reduce(
    (sum, item) => sum + (item.mode === 'FIXED' ? item.value : productsTotal * item.value / 100),
    0
  );
  const discountTotal = order.discountMode === 'FIXED'
    ? order.discountValue
    : (productsTotal + additionsTotal) * order.discountValue / 100;
  const total = productsTotal + additionsTotal - discountTotal + order.shippingValue;
  const productsHtml = order.products.map((item, index) =>
    `<tr><td>${index + 1}</td><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${currency(item.unitPrice)}</td><td>${currency(item.unitPrice * item.quantity)}</td></tr>`
  ).join('');
  const additionsHtml = order.additions.map((item) => {
    const value = item.mode === 'FIXED' ? item.value : productsTotal * item.value / 100;
    const suffix = item.mode === 'PERCENT' ? ` (${item.value}%)` : '';
    return `<div class="summary-line"><span>${escapeHtml(item.label)}${suffix}</span><strong>${currency(value)}</strong></div>`;
  }).join('');
  const deliveryTitle = order.deliveryType === 'ENTREGA' ? 'Endereco de entrega' : 'Retirada';
  const deliveryContent = order.deliveryType === 'ENTREGA' ? note(deliveryAddress) : note(order.notesDelivery);
  const imagesHtml = order.images.length ? `<div class="wrap page-break"><h2>Fotos referencia</h2><div class="photo-grid">${order.images.map((image) =>
    `<div class="photo"><img src="${image.dataUrl}" alt="Foto de referencia"/><span>${escapeHtml(image.name || 'Imagem')}</span></div>`
  ).join('')}</div></div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${order.type} ${escapeHtml(order.number)}</title>
  <style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box;-webkit-text-size-adjust:100%}body{font-family:Manrope,Arial,sans-serif;margin:0;padding:10px;color:#1f2328;background:#e8edf3;overflow:auto}.sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 10px 32px rgba(17,24,39,.12);padding:20px}.wrap{max-width:100%;margin:0 auto}.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}h1{font-family:"Space Grotesk",Arial,sans-serif;font-size:54px;line-height:1;margin:0 0 8px}.subtitle{font-size:22px;color:#4c5158}.logo{width:130px;height:90px;object-fit:contain}.order-meta{margin-top:8px;font-size:18px;font-weight:700;display:flex;gap:18px;flex-wrap:wrap}.cards{display:grid;grid-template-columns:minmax(220px,320px);gap:12px;margin-top:20px}.card{border:1px solid #1f2328;padding:12px;position:relative;background:#f8f9fb;min-height:86px}.card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:9px;background:#1f2328}.card span{display:block;font-size:13px;color:#5a6068;margin-left:10px}.card strong{display:block;font-size:30px;line-height:1.1;margin-left:10px}.meta{margin-top:12px;font-size:14px}table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#1f2328;color:#fff;padding:10px 8px;text-align:left;font-size:13px}th:nth-child(4),th:nth-child(5),td:nth-child(4),td:nth-child(5){text-align:right}td{padding:10px 8px;border-bottom:1px solid #dde1e6;font-size:14px}td:nth-child(1),td:nth-child(3){text-align:center}.summary{margin-top:14px;display:grid;gap:6px;justify-items:end}.summary-line{display:flex;justify-content:space-between;gap:14px;width:320px;font-size:14px}.total-row{margin-top:8px;display:flex;width:320px}.total-row .label{background:#1f2328;color:#fff;padding:12px 16px;font-weight:700}.total-row .value{border:1px solid #1f2328;border-left:0;padding:12px 16px;font-weight:800;font-size:24px;flex:1;text-align:right}.section-grid{margin-top:24px;display:grid;gap:12px}.box-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{border:1px solid #d7dce2;padding:12px;min-height:110px}.box h4{margin:0 0 8px;font-size:14px;color:#5a6068;text-transform:uppercase}.box p{margin:0;font-size:15px;line-height:1.45;white-space:pre-wrap}.contact-line{font-size:13px;margin:0 0 6px}.pix{font-weight:800;margin-top:8px}.page-break{break-before:page;page-break-before:always}.photo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.photo{border:1px solid #d7dce2;border-radius:10px;padding:8px}.photo img{width:100%;height:280px;object-fit:contain}.photo span{display:block;margin-top:6px;font-size:12px;color:#5a6068;word-break:break-word}@media print{body{padding:0;background:#fff;overflow:visible}.sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none;border-radius:0}}
  </style></head><body><div class="sheet"><div class="wrap">
    <div class="top"><div><h1>${order.type === 'ORCAMENTO' ? 'Orcamento' : 'Pedido'}</h1><div class="subtitle">${escapeHtml(companyName)}</div><div class="order-meta"><span>${order.type === 'ORCAMENTO' ? 'Orcamento' : 'Pedido'}: #${escapeHtml(order.number)}</span><span>Data: ${formatDateBr(order.orderDateTime)}</span></div></div>${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Logo"/>` : ''}</div>
    <div class="cards"><div class="card"><span>Entrega:</span><strong>${order.deliveryDate ? formatDateBr(order.deliveryDate) : '-'}</strong></div></div>
    <div class="meta"><strong>Cliente:</strong> ${escapeHtml(customer?.name ?? '-')} | <strong>Telefone:</strong> ${escapeHtml(customer?.phone ?? '-')} | <strong>Tipo:</strong> ${order.deliveryType}</div>
    <table><thead><tr><th>Nº</th><th>Descricao do Produto</th><th>Qt.</th><th>Preco</th><th>Total</th></tr></thead><tbody>${productsHtml || '<tr><td colspan="5" style="text-align:center">Sem produtos</td></tr>'}</tbody></table>
    <div class="summary">${additionsHtml}<div class="summary-line"><span>Desconto${order.discountMode === 'PERCENT' ? ` (${order.discountValue}%)` : ''}</span><strong>- ${currency(discountTotal)}</strong></div><div class="summary-line"><span>Frete</span><strong>${currency(order.shippingValue)}</strong></div><div class="total-row"><div class="label">TOTAL</div><div class="value">${currency(total)}</div></div></div>
    <div class="section-grid"><div class="box"><h4>Observacoes gerais</h4><p>${escapeHtml(note(order.notesGeneral))}</p></div><div class="box-row"><div class="box"><h4>Pagamento</h4><p>${escapeHtml(note(order.notesPayment))}</p><p class="pix">PIX: ${escapeHtml(pixKey || order.pix || '-')}</p></div><div class="box"><h4>${deliveryTitle}</h4><p>${escapeHtml(deliveryContent)}</p></div></div>${order.terms?.trim() ? `<div class="box"><h4>Termos</h4><p>${escapeHtml(order.terms)}</p></div>` : ''}<div class="box"><h4>Contato</h4><p class="contact-line">☎ ${escapeHtml(companyPhone || '-')}</p><p class="contact-line">✉ ${escapeHtml(companyEmail || '-')}</p></div></div>
  </div>${imagesHtml}</div></body></html>`;
};

export const buildOrderPdfBlob = (order: OrderItem, settings?: CompanySettings) => {
  const document = new jsPDF({ unit: 'mm', format: 'a4' });
  const companyName = settings?.companyName || 'Controle Precificacao';
  const customer = order.customerSnapshot;
  const productsTotal = order.products.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const additionsTotal = order.additions.reduce((sum, item) => sum + (item.mode === 'FIXED' ? item.value : productsTotal * item.value / 100), 0);
  const discountTotal = order.discountMode === 'FIXED' ? order.discountValue : (productsTotal + additionsTotal) * order.discountValue / 100;
  const total = productsTotal + additionsTotal - discountTotal + order.shippingValue;
  const margin = 15;
  const pageWidth = 210;
  const bottom = 280;
  let y = 18;

  const nextPage = (height = 7) => {
    if (y + height <= bottom) return;
    document.addPage();
    y = 18;
  };
  const addLine = (text: string, options: { bold?: boolean; size?: number; indent?: number } = {}) => {
    const size = options.size ?? 10;
    const x = margin + (options.indent ?? 0);
    const lines = document.splitTextToSize(text, pageWidth - margin - x);
    nextPage(lines.length * (size * 0.45) + 4);
    document.setFont('helvetica', options.bold ? 'bold' : 'normal');
    document.setFontSize(size);
    document.text(lines, x, y);
    y += lines.length * (size * 0.45) + 3;
  };
  const separator = () => {
    nextPage(5);
    document.setDrawColor(210, 214, 220);
    document.line(margin, y, pageWidth - margin, y);
    y += 5;
  };

  document.setFillColor(31, 35, 40);
  document.rect(0, 0, pageWidth, 11, 'F');
  document.setTextColor(255, 255, 255);
  document.setFont('helvetica', 'bold');
  document.setFontSize(17);
  document.text(order.type === 'ORCAMENTO' ? 'ORCAMENTO' : 'PEDIDO', margin, 8);
  document.setTextColor(31, 35, 40);
  y = 20;
  addLine(companyName, { bold: true, size: 15 });
  addLine(`${order.type === 'ORCAMENTO' ? 'Orcamento' : 'Pedido'} #${order.number} · Data: ${formatDateBr(order.orderDateTime)}`, { size: 10 });
  separator();
  addLine(`Cliente: ${customer?.name || '-'}`, { bold: true, size: 11 });
  addLine(`Telefone: ${customer?.phone || '-'} · ${order.deliveryType === 'ENTREGA' ? 'Entrega' : 'Retirada'}`);
  addLine(`Data de entrega: ${order.deliveryDate ? formatDateBr(order.deliveryDate) : '-'}`);
  if (order.deliveryType === 'ENTREGA') addLine(`Endereco: ${order.deliveryAddress || customer?.deliveryAddress || '-'}`);
  separator();
  addLine('PRODUTOS', { bold: true, size: 12 });
  order.products.forEach((item, index) => addLine(`${index + 1}. ${item.name} — ${item.quantity} x ${currency(item.unitPrice)} = ${currency(item.unitPrice * item.quantity)}`));
  separator();
  if (order.additions.length) {
    order.additions.forEach((item) => {
      const value = item.mode === 'FIXED' ? item.value : productsTotal * item.value / 100;
      addLine(`${item.label}${item.mode === 'PERCENT' ? ` (${item.value}%)` : ''}: ${currency(value)}`);
    });
  }
  addLine(`Desconto: - ${currency(discountTotal)}`);
  addLine(`Frete: ${currency(order.shippingValue)}`);
  addLine(`TOTAL: ${currency(total)}`, { bold: true, size: 14 });
  separator();
  addLine(`Observacoes gerais: ${note(order.notesGeneral)}`);
  addLine(`Pagamento: ${note(order.notesPayment)}`);
  addLine(`PIX: ${settings?.pixKey || order.pix || '-'}`);
  if (order.notesDelivery?.trim()) addLine(`Orientacoes de entrega: ${order.notesDelivery}`);
  if (order.terms?.trim()) addLine(`Termos: ${order.terms}`);
  if (settings?.companyPhone || settings?.companyEmail) {
    separator();
    addLine('CONTATO', { bold: true, size: 11 });
    if (settings.companyPhone) addLine(settings.companyPhone);
    if (settings.companyEmail) addLine(settings.companyEmail);
  }

  return document.output('blob');
};

export const buildOrderPdfBlobFromPreview = async (preview: HTMLElement) => {
  const previewCanvas = await html2canvas(preview, {
    backgroundColor: '#ffffff',
    logging: false,
    scale: 2,
    useCORS: true
  });
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const pageHeightInPixels = Math.floor(previewCanvas.width * pageHeight / pageWidth);
  let sourceY = 0;
  let pageNumber = 0;

  while (sourceY < previewCanvas.height) {
    const sliceHeight = Math.min(pageHeightInPixels, previewCanvas.height - sourceY);
    const pageCanvas = globalThis.document.createElement('canvas');
    pageCanvas.width = previewCanvas.width;
    pageCanvas.height = sliceHeight;
    const context = pageCanvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a página do PDF.');
    context.drawImage(
      previewCanvas,
      0,
      sourceY,
      previewCanvas.width,
      sliceHeight,
      0,
      0,
      pageCanvas.width,
      pageCanvas.height
    );
    if (pageNumber > 0) pdf.addPage();
    pdf.addImage(pageCanvas, 'PNG', 0, 0, pageWidth, sliceHeight * pageWidth / pageCanvas.width, undefined, 'FAST');
    sourceY += sliceHeight;
    pageNumber += 1;
  }

  return pdf.output('blob');
};
