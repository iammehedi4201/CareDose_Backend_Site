import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CatalogueService } from './catalogue.service';
import {
  GenericBrandsQueryDto,
  SearchAlternativesDto,
  SearchCatalogueDto,
  SearchGenericsDto,
} from './dto/search-catalogue.dto';

@Public()
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Get('summary')
  async getSummary() {
    return this.catalogueService.getSummary();
  }

  @Get('search')
  async searchBrands(@Query() query: SearchCatalogueDto) {
    return this.catalogueService.searchBrands(query);
  }

  @Get('brands/:brandId')
  async getBrand(@Param('brandId') brandId: string) {
    return this.catalogueService.getBrandById(brandId);
  }

  @Get('brands/:brandId/alternatives')
  async getBrandAlternatives(@Param('brandId') brandId: string) {
    return this.catalogueService.getBrandAlternatives(brandId);
  }

  @Get('generics')
  async searchGenerics(@Query() query: SearchGenericsDto) {
    return this.catalogueService.searchGenerics(query);
  }

  @Get('generics/:genericId')
  async getGeneric(
    @Param('genericId') genericId: string,
    @Query() query: GenericBrandsQueryDto,
  ) {
    return this.catalogueService.getGenericById(genericId, query);
  }

  @Get('alternatives')
  async searchAlternativeGroups(@Query() query: SearchAlternativesDto) {
    return this.catalogueService.searchAlternativeGroups(query);
  }
}
