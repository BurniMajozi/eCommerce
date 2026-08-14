import React, { useState } from 'react';
import { Boxes } from 'lucide-react';
import { catalogueImage } from '../data/catalogueImages';

// Renders a product's real catalogue photo (extracted from the merchant's
// picture sheet, keyed by SKU) with a graceful icon fallback when no image is
// mapped or the file fails to load. `size` is the box height in px.
export const ProductThumb = ({ sku, name, size = 66, className = '', style = {} }) => {
  const src = catalogueImage(sku);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`thumb ${className}`} style={{ height: size, ...style }}>
        <Boxes size={Math.max(14, Math.round(size * 0.34))} />
      </div>
    );
  }

  return (
    <div
      className={`thumb ${className}`}
      style={{ height: size, padding: 0, overflow: 'hidden', background: '#fff', ...style }}
    >
      <img
        src={src}
        alt={name || sku}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
};
