import React, { useState } from 'react';
import { Printer, X, Mail, Loader2 } from 'lucide-react';
import { sendNotificationEmail } from '../catalogue/catalogueClient';

export const InvoiceModal = ({ invoice, onClose, scope, recipientEmail, triggerNotification }) => {
  const handlePrint = () => window.print();
  const [emailing, setEmailing] = useState(false);
  const canEmail = !!(scope?.accessToken && recipientEmail);

  const emailInvoice = async () => {
    setEmailing(true);
    const r = await sendNotificationEmail('invoice', recipientEmail, {
      number: invoice.invoiceNumber, clientName: invoice.clientName,
      lines: (invoice.items ?? []).map((it) => ({ name: it.name, sku: it.sku, qty: it.qty, unitPrice: it.unitPrice })),
      subtotal: invoice.subtotal, vat: invoice.vatAmount, total: invoice.totalAmount,
      currency: 'ZAR', dueDate: invoice.dueDate, poNumber: invoice.poNumber,
    }, scope);
    setEmailing(false);
    if (!triggerNotification) return;
    if (r?.sent) triggerNotification('Invoice emailed', `Sent to ${recipientEmail}.`, 'success');
    else if (r?.skipped) triggerNotification('Email not configured', 'Set the AGENTMAIL keys to email invoices automatically.', 'info');
    else triggerNotification('Email not sent', r?.error || 'Could not email the invoice.', 'warning');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-lg invoice-print" onClick={e => e.stopPropagation()}>
        <div className="modal-hd no-print">
          <span className="badge badge-success">Official B2B tax invoice</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {canEmail && <button className="btn btn-secondary btn-sm" onClick={emailInvoice} disabled={emailing}>{emailing ? <Loader2 size={15} className="spin" /> : <Mail size={15} />} Email to customer</button>}
            <button className="btn btn-primary btn-sm" onClick={handlePrint}><Printer size={15} /> Print / Save PDF</button>
            <button className="icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* Printable body — fixed light styling for print fidelity */}
        <div className="modal-bd" style={{ background: '#ffffff', color: '#1a1d23', padding: 30, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1a1d23', paddingBottom: 18 }}>
            <div>
              <img src="/sightlive-logo.svg" alt="SightLive" style={{ height: 44, display: 'block' }} />
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#ef5b0a', marginTop: 10 }}>{invoice.merchantTagline}</div>
              <div style={{ fontSize: 12, color: '#667085', marginTop: 4, lineHeight: 1.5 }}>
                {invoice.merchantName}<br />VAT Reg: <strong>{invoice.merchantVat}</strong>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>TAX INVOICE</div>
              <div style={{ fontSize: 12, color: '#667085', marginTop: 6, lineHeight: 1.6 }}>
                Invoice <strong style={{ color: '#1a1d23' }}>{invoice.invoiceNumber}</strong><br />
                Date {invoice.date} · Due {invoice.dueDate}<br />PO {invoice.poNumber}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 18 }}>
            <div style={{ background: '#f4f5f7', border: '1px solid #e4e7ec', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#98a2b3' }}>Billed to</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>{invoice.clientName}</div>
              <div style={{ fontSize: 12, color: '#667085' }}>VAT Reg: {invoice.vatNumber}</div>
            </div>
            <div style={{ background: '#f4f5f7', border: '1px solid #e4e7ec', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#98a2b3' }}>Payment details</div>
              <div style={{ fontSize: 12, color: '#1a1d23', marginTop: 4, lineHeight: 1.6 }}>
                Bank <strong>{invoice.merchantBank}</strong><br />
                Acc <strong>{invoice.accountNumber}</strong> · Branch <strong>{invoice.branchCode}</strong>
              </div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 18 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #1a1d23' }}>
                <th style={{ textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#667085', padding: '8px 10px' }}>SKU</th>
                <th style={{ textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#667085', padding: '8px 10px' }}>Description</th>
                <th style={{ textAlign: 'center', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#667085', padding: '8px 10px' }}>Qty</th>
                <th style={{ textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#667085', padding: '8px 10px' }}>Unit excl</th>
                <th style={{ textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#667085', padding: '8px 10px' }}>Total excl</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e4e7ec' }}>
                  <td style={{ padding: '10px', fontSize: 12.5, color: '#667085', fontVariantNumeric: 'tabular-nums' }}>{it.sku}</td>
                  <td style={{ padding: '10px', fontSize: 13, fontWeight: 500 }}>{it.name}</td>
                  <td style={{ padding: '10px', fontSize: 13, textAlign: 'center' }}>{it.qty}</td>
                  <td style={{ padding: '10px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>R {it.unitPrice.toFixed(2)}</td>
                  <td style={{ padding: '10px', fontSize: 13, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>R {(it.unitPrice * it.qty).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <div style={{ width: 260 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span style={{ color: '#667085' }}>Subtotal excl VAT</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>R {invoice.subtotal.toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: '#667085' }}><span>VAT 15%</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>R {invoice.vatAmount.toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '2px solid #1a1d23', marginTop: 6, paddingTop: 8 }}><span>Total due</span><span style={{ color: '#ec3013', fontVariantNumeric: 'tabular-nums' }}>R {invoice.totalAmount.toFixed(2)}</span></div>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 11, color: '#98a2b3', marginTop: 22, borderTop: '1px solid #e4e7ec', paddingTop: 14 }}>
            Thank you · Payment terms 30 days · Generated by the SightLive platform
          </div>
        </div>

        <div className="modal-ft no-print" style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Close preview</button>
        </div>
      </div>
    </div>
  );
};
