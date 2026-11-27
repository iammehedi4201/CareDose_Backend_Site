import { Module } from '@nestjs/common';
import { UsersBackupService } from './users-backup.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersBackupService],
  exports: [UsersService, UsersBackupService],
})
export class UsersModule {}
