import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { QrCode, ScanLine, PackageOpen, ShieldCheck, CheckCircle2, Signature } from 'lucide-react';

export const StorekeeperPortal = () => {
  const { requests, issueStockAndDeduct } = useApp();
  const [otp, setOtp] = useState('');
  const [scanned, setScanned] = useState(null);
  const [oldReturned, setOldReturned] = useState(true);

  const approved = requests.filter(r => r.status === 'APPROVED');

  const verify = (e) => {
    e.preventDefault();
    const found = approved.find(r => r.otp === otp.trim() || r.id.toLowerCase() === otp.trim().toLowerCase());
    if (found) { setScanned(found); setOldReturned(!found.isEarlyReplacement); }
    else alert('Invalid OTP or ticket ref. No approved pickup found.');
  };
  const dispense = () => {
    if (!scanned) return;
    if (scanned.isEarlyReplacement && !oldReturned) { alert('Anti-theft protocol: confirm the old damaged item was handed back before issuing.'); return; }
    issueStockAndDeduct(scanned.id);
    setScanned(null); setOtp('');
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2>Store counter · Store 2</h2>
          <p>Scan a worker badge or QR pass, verify the approval, then issue and print the slip.</p>
        </div>
        <span className="badge badge-success">{approved.length} approved · queue</span>
      </div>

      <div className="cols" style={{ gridTemplateColumns: 'minmax(260px, 340px) 1fr' }}>
        {/* Scan + queue */}
        <div className="card">
          <div className="card-bd">
            <form onSubmit={verify}>
              <div className="thumb" style={{ padding: '22px 12px', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
                <ScanLine size={30} />
                <span style={{ fontSize: 13 }}>Scan worker badge or QR</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input className="input" style={{ letterSpacing: '.12em' }} placeholder="8492 or REQ-9014" value={otp} onChange={e => setOtp(e.target.value)} required />
                <button className="btn btn-primary" type="submit">Verify</button>
              </div>
            </form>

            <div className="eyebrow" style={{ margin: '18px 0 10px' }}>Queue · {approved.length}</div>
            {approved.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No approved tickets waiting.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {approved.map(req => {
                const active = scanned && scanned.id === req.id;
                return (
                  <button key={req.id} onClick={() => { setOtp(req.otp); setScanned(req); setOldReturned(!req.isEarlyReplacement); }}
                    className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'space-between' }}>
                    <span>{req.employeeName.split(' ').slice(-1)[0]} · {req.itemName.split(' ').slice(0, 2).join(' ')}</span>
                    <span style={{ fontSize: 11, opacity: .8 }}>{req.otp}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Console */}
        <div className="card">
          {scanned ? (
            <>
              <div className="card-hd">
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{scanned.employeeName}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{scanned.employeeId} · {scanned.department} · {scanned.plant}</div>
                </div>
                <span className="badge badge-success"><CheckCircle2 size={13} /> Verified · OTP {scanned.otp}</span>
              </div>
              <div className="card-bd">
                <div className="table-wrap card" style={{ boxShadow: 'none' }}>
                  <table className="table">
                    <thead><tr><th>Item</th><th>SKU</th><th className="center">Qty</th><th className="center">Scan</th></tr></thead>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 500 }}>{scanned.itemName}</td>
                        <td className="muted">{scanned.sku}</td>
                        <td className="center">1</td>
                        <td className="center"><span className="badge badge-primary">scan…</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 16 }}>
                  {scanned.isEarlyReplacement ? (
                    <label className="card" style={{ padding: 13, display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', boxShadow: 'none', borderColor: oldReturned ? 'var(--border)' : 'var(--primary)', background: oldReturned ? 'var(--surface)' : 'var(--danger-weak)' }}>
                      <input type="checkbox" checked={oldReturned} onChange={e => setOldReturned(e.target.checked)} />
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 500 }}>
                        <ShieldCheck size={15} style={{ color: 'var(--primary)' }} /> Mandatory: old damaged item handed back &amp; scrapped
                      </span>
                    </label>
                  ) : (
                    <div className="badge badge-success" style={{ padding: '8px 12px' }}><CheckCircle2 size={14} /> Routine issue within quota — no return required</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Signature size={14} /> Worker signature</div>
                    <div className="thumb" style={{ height: 58 }} />
                  </div>
                  <button className="btn btn-primary btn-lg" onClick={dispense}><PackageOpen size={17} /> Issue &amp; print slip</button>
                </div>
              </div>
            </>
          ) : (
            <div className="card-bd" style={{ textAlign: 'center', padding: '56px 20px' }}>
              <QrCode size={44} style={{ color: 'var(--text-subtle)' }} />
              <h3 style={{ marginTop: 12 }}>Ready for counter verification</h3>
              <p className="muted" style={{ marginTop: 6, fontSize: 13.5 }}>Scan a worker QR or enter a ticket OTP to load the handover checklist.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
