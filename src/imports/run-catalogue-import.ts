import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { resolve } from 'node:path';
import { AppModule } from '../app.module';
import { ImportsService } from './imports.service';

async function runImport(): Promise<void> {
  process.env.REQUIRE_DB_ON_STARTUP = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const fileArg = process.argv.find((arg) => arg.startsWith('--file='));
    const datasetPath = fileArg
      ? resolve(fileArg.slice('--file='.length))
      : resolve(__dirname, '..', '..', '..', 'Bangladeshi-Medicine-API', 'dataset', 'medex_app_dataset_enriched.json');

    const importsService = app.get(ImportsService);
    const result = await importsService.importFromFile(datasetPath, {
      notes: 'Imported via CareDose backend CLI runner',
    });

    Logger.log(JSON.stringify(result, null, 2), 'CatalogueImportCLI');
  } finally {
    await app.close();
  }
}

runImport().catch((err) => {
  Logger.error(err instanceof Error ? err.message : String(err), undefined, 'CatalogueImportCLI');
  process.exit(1);
});
