import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { ImportsService } from './imports.service';

@Module({
  imports: [CatalogueModule],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
