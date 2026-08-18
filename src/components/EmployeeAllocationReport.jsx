import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DateRangePicker } from './DateRangePicker';
import {
  User, ShieldCheck, Printer, Download, Search, CheckCircle2, AlertCircle, FileSpreadsheet,
  Building2, Hash, HardHat, CalendarRange, Camera, Image
} from 'lucide-react';

export const EmployeeAllocationReport = ({ embedded = false }) => {
  const { employeeAllocations } = useApp();
  const [selectedEmpId, setSelectedEmpId] = useState('ALL'); // default: all employees
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [dateRange, setDateRange] = useState({
    preset: 30,
    startDate: '2026-07-17',
    endDate: '2026-08-16',
    label: 'Last 30 days',
  });

  const list = employeeAllocations || [];
  const isAll = selectedEmpId === 'ALL';
  const employee = useMemo(() => {
    if (isAll) return { employeeId: 'ALL', employeeName: 'All employees', department: 'All departments', role: `${list.length} staff`, quotaUtilization: null, allocations: [] };
    return list.find((e) => e.employeeId === selectedEmpId) || list[0] || { employeeId: selectedEmpId, employeeName: 'Staff Member', allocations: [] };
  }, [list, selectedEmpId, isAll]);

  // In "all" mode, flatten every employee's allocations and tag each row with
  // who it belongs to so the table can show an Employee column.
  const filteredAllocations = useMemo(() => {
    const source = isAll
      ? list.flatMap((e) => (e.allocations || []).map((a) => ({ ...a, _empName: e.employeeName, _empId: e.employeeId, _empDept: e.department })))
      : (employee?.allocations || []);
    return source
      .filter((a) => {
        if (dateRange.startDate && a.issueDate < dateRange.startDate) return false;
        if (dateRange.endDate && a.issueDate > dateRange.endDate) return false;
        return true;
      })
      .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
  }, [isAll, list, employee, dateRange]);

  const totalValue = filteredAllocations.reduce((sum, a) => sum + (a.totalValue || 0), 0);
  const totalItems = filteredAllocations.reduce((sum, a) => sum + (a.qty || 0), 0);

  const exportCsv = () => {
    const headers = ['Allocation ID', 'Employee ID', 'Employee Name', 'Department', 'SKU', 'Item Name', 'Category', 'Qty', 'Unit Price (RP)', 'Total Value (RP)', 'Issue Date', 'Issued By', 'Serial #', 'Status', 'Signed By', 'Approval Ref'];
    const rows = filteredAllocations.map((a) => [
      a.id,
      a._empId || employee.employeeId,
      a._empName || employee.employeeName,
      a._empDept || employee.department,
      a.sku,
      `"${a.name.replace(/"/g, '""')}"`,
      a.category,
      a.qty,
      a.unitPrice.toFixed(2),
      a.totalValue.toFixed(2),
      a.issueDate,
      `"${a.issuedBy}"`,
      a.serialNumber || '',
      a.status,
      a.signedBy,
      `"${a.approvalRef}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Allocation_${employee.employeeName.replace(/\s+/g, '_')}_${dateRange.startDate}_to_${dateRange.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="card" style={{ boxShadow: embedded ? 'none' : undefined }}>
      <div className="card-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HardHat size={19} style={{ color: 'var(--primary)' }} />
          <div>
            <h3 style={{ fontSize: 16, margin: 0 }}>Stock allocation by employee</h3>
            <span className="muted" style={{ fontSize: 12 }}>Mine PPE issue history, serial verification &amp; signature tracking</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <DateRangePicker range={dateRange} onChange={setDateRange} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv} title="Export CSV">
            <Download size={14} /> CSV
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint} title="Print Allocation Sheet">
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </div>

      <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Employee Selector Bar & Summary Card */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-2)', padding: 14, borderRadius: 8 }}>
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <label className="field-label" style={{ fontSize: 11, marginBottom: 4 }}>Select employee</label>
            <select
              className="select"
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              style={{ fontWeight: 600 }}
            >
              <option value="ALL">All employees ({list.length})</option>
              {list.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.employeeName} ({e.employeeId}) · {e.department}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: '2 1 400px', alignItems: 'center', borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
            <div>
              <div className="eyebrow" style={{ fontSize: 10.5 }}>Department</div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{employee.department}</div>
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: 10.5 }}>Designation</div>
              <div style={{ fontWeight: 500, fontSize: 13.5 }}>{employee.role}</div>
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: 10.5 }}>{isAll ? 'Allocations' : 'Entitlement quota'}</div>
              {isAll ? (
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{filteredAllocations.length} in range</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`badge ${employee.quotaUtilization > 100 ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: 11 }}>
                    {employee.quotaUtilization}%
                  </span>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {employee.quotaUtilization > 100 ? 'Exceeded' : 'Normal'}
                  </span>
                </div>
              )}
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: 10.5 }}>Period value (@ RP)</div>
              <div style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums', color: 'var(--primary)' }}>
                R {totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* Allocations Table */}
        {filteredAllocations.length === 0 ? (
          <div className="muted" style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13.5 }}>
            No stock allocations found for <strong>{employee.employeeName}</strong> within the selected date range ({dateRange.label}).
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {isAll && <th>Employee</th>}
                  <th>Allocation ID</th>
                  <th>Item description</th>
                  <th>Category</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price (RP)</th>
                  <th className="num">Total value (RP)</th>
                  <th>Issue date</th>
                  <th>Audit Photos</th>
                  <th>Serial / Tag</th>
                  <th className="center">Status</th>
                  <th>Signed by</th>
                </tr>
              </thead>
              <tbody>
                {filteredAllocations.map((a) => (
                  <tr key={`${a._empId || employee.employeeId}-${a.id}`}>
                    {isAll && (
                      <td><div style={{ fontWeight: 600, fontSize: 12.5 }}>{a._empName}</div><div className="muted" style={{ fontSize: 10.5 }}>{a._empId} · {a._empDept}</div></td>
                    )}
                    <td style={{ fontWeight: 600, fontSize: 12.5 }} className="muted">{a.id}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.name}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>SKU: {a.sku} · Issued by: {a.issuedBy}</div>
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{a.category}</td>
                    <td className="num tabular" style={{ fontWeight: 600 }}>{a.qty}</td>
                    <td className="num tabular">R {a.unitPrice.toFixed(2)}</td>
                    <td className="num tabular" style={{ fontWeight: 700 }}>R {a.totalValue.toFixed(2)}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{a.issueDate}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {a.staffCardPhotoUrl && (
                          <button type="button" className="badge badge-info" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 6px' }} onClick={() => setPreviewPhoto({ title: `Staff Card Photo — ${employee.employeeName}`, url: a.staffCardPhotoUrl })}>
                            <Camera size={11} /> Card
                          </button>
                        )}
                        {a.handoverPhotoUrl && (
                          <button type="button" className="badge badge-success" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 6px' }} onClick={() => setPreviewPhoto({ title: `Handover Photo — ${a.name}`, url: a.handoverPhotoUrl })}>
                            <Image size={11} /> Handover
                          </button>
                        )}
                        {!a.staffCardPhotoUrl && !a.handoverPhotoUrl && <span className="muted" style={{ fontSize: 11 }}>Badge scan</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}><span className="badge badge-neutral">{a.serialNumber || '—'}</span></td>
                    <td className="center">
                      <span className="badge badge-success" style={{ fontSize: 11 }}>{a.status}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={13} style={{ color: 'var(--success)' }} />
                        {a.signedBy}
                      </div>
                      <div className="muted" style={{ fontSize: 10.5 }}>{a.approvalRef}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                  <td colSpan={isAll ? 4 : 3} style={{ textAlign: 'right' }}>Total allocated in range:</td>
                  <td className="num tabular">{totalItems}</td>
                  <td></td>
                  <td className="num tabular" style={{ color: 'var(--primary)' }}>
                    R {totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {previewPhoto && (
        <div className="overlay" onClick={() => setPreviewPhoto(null)}>
          <div className="modal modal-sm" style={{ maxHeight: 'min(82vh, 520px)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15 }}>{previewPhoto.title}</h3>
              <button type="button" className="icon-btn" onClick={() => setPreviewPhoto(null)}><CheckCircle2 size={16} /></button>
            </div>
            <div className="modal-bd" style={{ textAlign: 'center', padding: 14 }}>
              <img src={previewPhoto.url} alt={previewPhoto.title} style={{ maxWidth: '100%', maxHeight: 340, objectFit: 'contain', borderRadius: 6 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
