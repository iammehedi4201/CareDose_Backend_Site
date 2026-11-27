import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PatientOwnershipGuard } from '../common/guards/patient-ownership.guard';
import { GetExpensesSummaryQueryDto } from './dto/expenses.dto';
import { SerializedExpensesSummaryResponse } from './expenses.serializers';
import { ExpensesService } from './expenses.service';

@UseGuards(JwtAuthGuard, PatientOwnershipGuard)
@Controller('patients/:patientId/expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  async getSummary(
    @Param('patientId') patientId: string,
    @Query() query: GetExpensesSummaryQueryDto,
  ): Promise<SerializedExpensesSummaryResponse> {
    return this.expensesService.getSummaryForPatient(patientId, query);
  }
}
