import type { ExecArgs } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { ppeIssueSagaWorkflow } from '../workflows/ppe-issue-saga';

// Proves the workflow engine executes real Medusa flows live: runs the
// ppe-issue-saga once to completion and once with a forced failure so the saga
// compensates in reverse. Prints the real transaction ids + terminal states.
// Run in-container: npm run run:saga
export default async function runSaga({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const exec = async (label: string, input: { quantity: number; sku: string; fail: boolean }) => {
    const { result, transaction, errors } = await ppeIssueSagaWorkflow(container).run({ input, throwOnError: false });
    const tx = transaction as { transactionId?: string; getFlow?: () => { state?: string } };
    const state = tx?.getFlow?.().state ?? (errors && errors.length ? 'reverted' : 'done');
    logger.info(`[run-saga] ${label}: state=${state} txn=${tx?.transactionId ?? '—'} result=${JSON.stringify(result ?? null)} errors=${(errors ?? []).length}`);
  };

  logger.info('[run-saga] ===== executing ppe-issue-saga live =====');
  await exec('happy path', { quantity: 5, sku: 'DROMEX-BOOT', fail: false });
  await exec('failure path (expect compensation → reverted)', { quantity: 5, sku: 'DROMEX-BOOT', fail: true });
  logger.info('[run-saga] done.');
}
