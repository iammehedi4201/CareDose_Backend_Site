import { Module } from '@nestjs/common';
import { CatalogueCacheService } from './catalogue-cache';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';

@Module({
  controllers: [CatalogueController],
  providers: [CatalogueCacheService, CatalogueService],
  exports: [CatalogueCacheService, CatalogueService],
})
export class CatalogueModule {}
