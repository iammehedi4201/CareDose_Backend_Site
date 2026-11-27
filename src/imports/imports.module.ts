import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { ImportsService } from './imports.service';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [CatalogueModule],
  providers: [ImportsService, ReconciliationService],
  exports: [ImportsService, ReconciliationService],
})
export class ImportsModule {}
