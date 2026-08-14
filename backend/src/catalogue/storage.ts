// Uploads catalogue images to a public Supabase Storage bucket via the Storage
// REST API. Kept deliberately provider-thin (plain fetch, no SDK) so the
// backend has no new heavy dependency. The bucket must exist and be PUBLIC —
// created once by the platform operator. Images are stored under a
// tenant-prefixed path so one tenant can never read or overwrite another's.
//
// Required env on the backend service:
//   SUPABASE_URL                 e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    server-side key (never exposed to the browser)
//   CATALOGUE_BUCKET             optional, defaults to "catalogue"

export class StorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageConfigurationError';
  }
}

export class StorageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageUploadError';
  }
}

type StorageConfig = { url: string; serviceKey: string; bucket: string };

export function storageConfig(): StorageConfig {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.CATALOGUE_BUCKET?.trim() || 'catalogue';
  if (!url || !serviceKey) {
    throw new StorageConfigurationError(
      'Image storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend and create a public "catalogue" bucket.',
    );
  }
  return { url, serviceKey, bucket };
}

export function isStorageConfigured(): boolean {
  try {
    storageConfig();
    return true;
  } catch {
    return false;
  }
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function safeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

export function publicUrl(cfg: StorageConfig, objectPath: string): string {
  return `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${objectPath}`;
}

// Uploads bytes and returns the public URL. `key` is a stable identifier
// (usually the SKU) used to build the object path; re-uploading the same key
// upserts, so a product's photo can be replaced without orphaning files.
export async function uploadCatalogueImage(params: {
  tenantId: string;
  key: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<string> {
  const cfg = storageConfig();
  const ext = EXT_BY_TYPE[params.contentType.toLowerCase()];
  if (!ext) {
    throw new StorageUploadError(`Unsupported image type "${params.contentType}". Use JPEG, PNG, WebP or GIF.`);
  }
  const objectPath = `${safeSegment(params.tenantId)}/${safeSegment(params.key)}.${ext}`;
  const endpoint = `${cfg.url}/storage/v1/object/${cfg.bucket}/${objectPath}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.serviceKey}`,
      apikey: cfg.serviceKey,
      'Content-Type': params.contentType,
      'x-upsert': 'true',
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: params.bytes,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new StorageUploadError(`Storage upload failed (${response.status}). ${detail}`.trim());
  }

  return publicUrl(cfg, objectPath);
}

// Decodes a data URL or bare base64 string into bytes + detected content type.
export function decodeImagePayload(input: {
  dataBase64?: string;
  contentType?: string;
}): { bytes: Uint8Array; contentType: string } {
  const raw = input.dataBase64?.trim();
  if (!raw) throw new StorageUploadError('No image data was provided.');

  let base64 = raw;
  let contentType = input.contentType?.trim() || '';
  const match = /^data:([^;]+);base64,(.*)$/i.exec(raw);
  if (match) {
    contentType = contentType || match[1];
    base64 = match[2];
  }
  if (!contentType) contentType = 'image/png';

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  } catch {
    throw new StorageUploadError('Image data was not valid base64.');
  }
  if (!bytes.length) throw new StorageUploadError('Decoded image was empty.');
  // Guard against oversized uploads (~6MB of raw bytes).
  if (bytes.length > 6 * 1024 * 1024) {
    throw new StorageUploadError('Image is too large. Please use an image under 6MB.');
  }
  return { bytes, contentType };
}
