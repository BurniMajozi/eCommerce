import { createWorkflow, createStep, StepResponse, WorkflowResponse } from '@medusajs/framework/workflows-sdk';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';

// A real, durable, compensatable Medusa workflow modelling the PPE stock-issue
// saga: validate → reserve → audit. Each mutating step declares a compensation
// so a downstream failure rolls the whole thing back in reverse. It performs no
// destructive writes (it logs its effects), which makes it safe to execute live
// from the admin UI to demonstrate the engine — including the rollback path.

export type PpeIssueInput = { quantity: number; sku?: string; fail?: boolean };

const validateStep = createStep('ppe-validate', async (input: PpeIssueInput, { container }) => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  if (!input.quantity || input.quantity <= 0) throw new Error('quantity must be greater than 0');
  logger.info(`[ppe-saga] validate: ${input.quantity} × ${input.sku ?? 'item'} ok`);
  return new StepResponse({ validated: true });
});

const reserveStep = createStep(
  'ppe-reserve',
  async (input: PpeIssueInput, { container }) => {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    logger.info(`[ppe-saga] reserve: holding ${input.quantity} unit(s)`);
    // Return value + the payload the compensation needs to undo it.
    return new StepResponse({ reserved: input.quantity }, { quantity: input.quantity });
  },
  async (comp: { quantity: number } | undefined, { container }) => {
    if (!comp) return;
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    logger.info(`[ppe-saga] COMPENSATE reserve: releasing ${comp.quantity} unit(s)`);
  },
);

const auditStep = createStep(
  'ppe-audit',
  async (input: PpeIssueInput, { container }) => {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    if (input.fail) throw new Error('simulated downstream failure at audit step');
    logger.info('[ppe-saga] audit: issue recorded');
    return new StepResponse({ audited: true }, { audited: true });
  },
  async (comp: { audited: boolean } | undefined, { container }) => {
    if (!comp) return;
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    logger.info('[ppe-saga] COMPENSATE audit: voiding audit entry');
  },
);

export const ppeIssueSagaWorkflow = createWorkflow(
  // store:true persists a workflow_execution row so the run shows up in the
  // live engine view; retentionTime keeps it around for a while.
  { name: 'ppe-issue-saga', store: true, retentionTime: 86400 },
  (input: PpeIssueInput) => {
    validateStep(input);
    reserveStep(input);
    auditStep(input);
    return new WorkflowResponse({ issued: true });
  },
);

export default ppeIssueSagaWorkflow;
