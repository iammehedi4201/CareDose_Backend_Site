import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { resolve } from 'node:path';
import { AppModule } from '../app.module';
import {
  ReconciliationService,
  ReconciliationSourceOption,
} from './reconciliation.service';

function readArgValue(prefix: string): string | undefined {
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function runReconciliationCli(): Promise<void> {
  process.env.REQUIRE_DB_ON_STARTUP = 'true';

  const hasDryRunFlag = process.argv.includes('--dry-run');
  const hasExecuteFlag = process.argv.includes('--execute');
  const dryRun = hasDryRunFlag || !hasExecuteFlag;

  const rawSource = (readArgValue('--source=') ?? 'all').toLowerCase();
  const validSources: ReconciliationSourceOption[] = ['medex', 'kaggle', 'dims', 'all'];
  const source: ReconciliationSourceOption = validSources.includes(
    rawSource as ReconciliationSourceOption,
  )
    ? (rawSource as ReconciliationSourceOption)
    : 'all';

  const batchSizeRaw = Number(readArgValue('--batch-size=') ?? '500');
  const batchSize = Number.isInteger(batchSizeRaw) && batchSizeRaw > 0 ? batchSizeRaw : 500;

  const includeHerbal = process.argv.includes('--include-herbal');
  const outDirArg = readArgValue('--out-dir=');
  const outDir = outDirArg ? resolve(outDirArg) : undefined;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const service = app.get(ReconciliationService);
    const result = await service.runReconciliation({
      dryRun,
      source,
      batchSize,
      includeHerbal,
      outDir,
    });
    Logger.log(JSON.stringify(result.summary, null, 2), 'ReconciliationCLI');
  } finally {
    await app.close();
  }
}

runReconciliationCli().catch((err) => {
  Logger.error(err instanceof Error ? err.message : String(err), undefined, 'ReconciliationCLI');
  process.exit(1);
});
