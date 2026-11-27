import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  DeleteAccountDto,
  RestoreAccountBackupDto,
} from './dto/account-backup.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { SerializedUser } from './user-select';
import {
  AccountBackupDocument,
  DeleteAccountResult,
  RestoreAccountResult,
  UsersBackupService,
} from './users-backup.service';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersBackupService: UsersBackupService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<SerializedUser> {
    return this.usersService.getById(user.userId);
  }

  @Patch('me/settings')
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserSettingsDto,
  ): Promise<SerializedUser> {
    return this.usersService.updateSettings(user.userId, dto);
  }

  @Get('me/export')
  async exportData(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AccountBackupDocument> {
    return this.usersBackupService.exportAccountData(user.userId);
  }

  @Post('me/restore')
  @HttpCode(HttpStatus.OK)
  async restoreData(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RestoreAccountBackupDto,
  ): Promise<RestoreAccountResult> {
    return this.usersBackupService.restoreAccountData(user.userId, dto);
  }

  @Delete('me')
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto?: DeleteAccountDto,
    @Query('confirmation') confirmationQuery?: string,
  ): Promise<DeleteAccountResult> {
    return this.usersBackupService.deleteAccount(
      user.userId,
      dto?.confirmation ?? confirmationQuery,
    );
  }
}
