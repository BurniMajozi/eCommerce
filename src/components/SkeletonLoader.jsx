import React from 'react';

export const SkeletonBox = ({ width = '100%', height = 20, borderRadius = 6, style = {} }) => (
  <div
    className="skeleton-shimmer"
    style={{
      width,
      height,
      borderRadius,
      background: 'var(--surface-3, #f0f0ef)',
      position: 'relative',
      overflow: 'hidden',
      ...style,
    }}
  />
);

export const SkeletonTable = ({ rows = 5, cols = 6 }) => (
  <div className="card" style={{ boxShadow: 'none' }}>
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}><SkeletonBox height={14} width={`${50 + (i % 3) * 20}%`} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}><SkeletonBox height={16} width={`${40 + ((r + c) % 4) * 15}%`} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const SkeletonKpis = ({ count = 4 }) => (
  <div className="cols cols-4" style={{ gap: 14 }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card">
        <div className="card-bd" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonBox height={12} width="40%" />
          <SkeletonBox height={24} width="70%" borderRadius={4} />
          <SkeletonBox height={11} width="50%" />
        </div>
      </div>
    ))}
  </div>
);

export const SkeletonPage = () => (
  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonBox height={24} width={240} />
        <SkeletonBox height={14} width={380} />
      </div>
      <SkeletonBox height={36} width={130} borderRadius={6} />
    </div>
    <SkeletonKpis count={4} />
    <SkeletonTable rows={6} cols={6} />
  </div>
);
