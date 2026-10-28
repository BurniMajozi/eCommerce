import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertAnyCapability, ScopeError } from '../../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../../middlewares/tenant-scope';
import { ESCALATE_CAPS } from '../../../../approvals/caps';
import { toApiNote } from '../../../lib';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const now = () => new Date().toISOString();
// The author may edit/delete their own note; an approver / platform owner may
// moderate any note.
const MODERATE_CAPS = ['ppe.approve.tier1', 'ppe.approve.tier2', 'platform.manage', 'tenant.config.manage'];

async function loadOwn(req: TenantScopedRequest, tenantId: string) {
  const db = pg(req);
  const note = await db('ticket_notes').where({ id: req.params.noteId, ticket_id: req.params.id, tenant_id: tenantId }).first();
  return { db, note };
}
const canModify = (scope: any, note: any) =>
  (note.author_user_id && note.author_user_id === scope.userId) || MODERATE_CAPS.some((c: string) => scope.capabilities.includes(c));

// PATCH /app/tickets/:id/notes/:noteId — edit a note's body.
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ESCALATE_CAPS);
    const { db, note } = await loadOwn(req, scope.tenantId);
    if (!note) throw new ScopeError(404, 'note_not_found', 'Note not found.');
    if (!canModify(scope, note)) throw new ScopeError(403, 'not_note_owner', 'You can only edit your own notes.');
    const body = ((req.body as any)?.body ?? '').toString().trim().slice(0, 4000);
    if (!body) throw new ScopeError(400, 'body_required', 'A note cannot be empty.');
    await db('ticket_notes').where({ id: note.id }).update({ body, updated_at: now() });
    const updated = await db('ticket_notes').where({ id: note.id }).first();
    res.json({ note: toApiNote(updated) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'note_update_failed', message: (error as Error).message });
  }
}

// DELETE /app/tickets/:id/notes/:noteId — remove a note.
export async function DELETE(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ESCALATE_CAPS);
    const { db, note } = await loadOwn(req, scope.tenantId);
    if (!note) throw new ScopeError(404, 'note_not_found', 'Note not found.');
    if (!canModify(scope, note)) throw new ScopeError(403, 'not_note_owner', 'You can only delete your own notes.');
    await db('ticket_notes').where({ id: note.id }).del();
    res.json({ id: note.id, deleted: true });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'note_delete_failed', message: (error as Error).message });
  }
}
