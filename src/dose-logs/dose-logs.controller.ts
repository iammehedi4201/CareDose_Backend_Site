import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
  type RequestWithAuth,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PatientOwnershipGuard } from '../common/guards/patient-ownership.guard';
import {
  DoseActionNoteDto,
  GetDailyDosesQueryDto,
  ListDoseHistoryQueryDto,
  RecordDoseEventDto,
} from './dto/dose-logs.dto';
import {
  SerializedDailyDosesResponse,
  SerializedDoseHistoryResponse,
  SerializedRecordDoseResult,
} from './dose-logs.serializers';
import { DoseLogsService } from './dose-logs.service';

@UseGuards(JwtAuthGuard, PatientOwnershipGuard)
@Controller('patients/:patientId')
export class PatientDoseLogsController {
  constructor(private readonly doseLogsService: DoseLogsService) {}

  @Get('doses')
  async getDailyDoses(
    @Param('patientId') patientId: string,
    @Query() query: GetDailyDosesQueryDto,
    @Req() req: RequestWithAuth,
  ): Promise<SerializedDailyDosesResponse> {
    const timeZone = req.patientProfile?.timezone ?? 'Asia/Dhaka';
    return this.doseLogsService.getDailyOrWeekDoses(patientId, timeZone, query);
  }

  @Post('dose-events/record')
  @HttpCode(HttpStatus.OK)
  async recordOccurrence(
    @Param('patientId') patientId: string,
    @Body() dto: RecordDoseEventDto,
  ): Promise<SerializedRecordDoseResult> {
    return this.doseLogsService.recordOccurrenceForPatient(patientId, dto);
  }

  @Get('dose-history')
  async listHistory(
    @Param('patientId') patientId: string,
    @Query() query: ListDoseHistoryQueryDto,
    @Req() req: RequestWithAuth,
  ): Promise<SerializedDoseHistoryResponse> {
    const timeZone = req.patientProfile?.timezone ?? 'Asia/Dhaka';
    return this.doseLogsService.listDoseHistory(patientId, timeZone, query);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('dose-events')
export class DoseEventActionsController {
  constructor(private readonly doseLogsService: DoseLogsService) {}

  @Post(':id/mark-taken')
  @HttpCode(HttpStatus.OK)
  async markTaken(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
    @Body() dto: DoseActionNoteDto,
  ): Promise<SerializedRecordDoseResult> {
    if (!user) throw new UnauthorizedException('Authentication is required');
    return this.doseLogsService.markExistingDoseEvent(user.userId, id, 'TAKEN', dto.note);
  }

  @Post(':id/mark-skipped')
  @HttpCode(HttpStatus.OK)
  async markSkipped(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
    @Body() dto: DoseActionNoteDto,
  ): Promise<SerializedRecordDoseResult> {
    if (!user) throw new UnauthorizedException('Authentication is required');
    return this.doseLogsService.markExistingDoseEvent(user.userId, id, 'SKIPPED', dto.note);
  }
}
