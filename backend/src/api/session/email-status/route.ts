import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';

// Compatibility endpoint for older clients. Its response is deliberately
// identical for every input so it cannot reveal whether an account exists or
// whether that account has previously signed in.
export async function POST(_req: MedusaRequest, res: MedusaResponse): Promise<void> {
  res.json({ next: 'email_code' });
}
