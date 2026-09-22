import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module.ts';
import { UsersModule } from './modules/users/users.module.ts';
import { DatabaseModule } from './db/database.module.ts';
import { CommonModule } from './common/common.module.ts';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
