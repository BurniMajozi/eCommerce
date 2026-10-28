import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { randomUUID } from 'crypto';
import { assertAnyCapability, ScopeError } from '../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../middlewares/tenant-scope';
import { ESCALATE_CAPS } from '../../../approvals/caps';
import { toApiNote } from '../../lib';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const now = () => new Date().toISOString();

// GET /app/tickets/:id/notes — the ticket's notes thread, oldest first.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ESCALATE_CAPS);
    const db = pg(req);
    const ticket = await db('tickets').where({ id: req.params.id, tenant_id: scope.tenantId }).first();
    if (!ticket) throw new ScopeError(404, 'ticket_not_found', 'Ticket not found.');
    const notes = await db('ticket_notes').where({ ticket_id: ticket.id }).orderBy('created_at', 'asc');
    res.json({ notes: notes.map(toApiNote) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'notes_read_failed', message: (error as Error).message });
  }
}

// POST /app/tickets/:id/notes — add a note. Anyone in the tenant may comment.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ESCALATE_CAPS);
    const b = (req.body ?? {}) as Record<string, any>;
    const body = (b.body ?? '').toString().trim().slice(0, 4000);
    if (!body) throw new ScopeError(400, 'body_required', 'A note cannot be empty.');
    const db = pg(req);
    const ticket = await db('tickets').where({ id: req.params.id, tenant_id: scope.tenantId }).first();
    if (!ticket) throw new ScopeError(404, 'ticket_not_found', 'Ticket not found.');
    const id = randomUUID();
    await db('ticket_notes').insert({
      id, ticket_id: ticket.id, tenant_id: scope.tenantId, body,
      author_user_id: scope.userId ?? null, author_name: (b.authorName ?? '').toString().slice(0, 200) || null,
      created_at: now(), updated_at: now(),
    });
    await db('tickets').where({ id: ticket.id }).update({ updated_at: now() });
    const created = await db('ticket_notes').where({ id }).first();
    res.status(201).json({ note: toApiNote(created) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'note_create_failed', message: (error as Error).message });
  }
}
