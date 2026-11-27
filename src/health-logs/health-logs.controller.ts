import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RequestWithAuth } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PatientOwnershipGuard } from '../common/guards/patient-ownership.guard';
import {
  CreateHealthReadingDto,
  ListHealthReadingsQueryDto,
} from './dto/health-reading.dto';
import {
  SerializedHealthReadingItem,
  SerializedHealthReadingsResponse,
} from './health-logs.serializers';
import { HealthLogsService } from './health-logs.service';

@UseGuards(JwtAuthGuard, PatientOwnershipGuard)
@Controller('patients/:patientId/health-readings')
export class HealthLogsController {
  constructor(private readonly healthLogsService: HealthLogsService) {}

  @Get()
  async list(
    @Param('patientId') patientId: string,
    @Query() query: ListHealthReadingsQueryDto,
    @Req() req: RequestWithAuth,
  ): Promise<SerializedHealthReadingsResponse> {
    const userId = req.user!.userId;
    const timeZone = req.patientProfile?.timezone ?? 'Asia/Dhaka';
    return this.healthLogsService.listForPatient(
      patientId,
      userId,
      timeZone,
      query,
    );
  }

  @Post()
  async create(
    @Param('patientId') patientId: string,
    @Body() dto: CreateHealthReadingDto,
    @Req() req: RequestWithAuth,
  ): Promise<SerializedHealthReadingItem> {
    const userId = req.user!.userId;
    const timeZone = req.patientProfile?.timezone ?? 'Asia/Dhaka';
    return this.healthLogsService.createForPatient(
      patientId,
      userId,
      timeZone,
      dto,
    );
  }

  @Delete(':readingId')
  async remove(
    @Param('patientId') patientId: string,
    @Param('readingId') readingId: string,
  ): Promise<{ deletedId: string }> {
    return this.healthLogsService.deleteForPatient(patientId, readingId);
  }
}
