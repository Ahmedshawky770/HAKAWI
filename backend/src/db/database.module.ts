import { Module } from '@nestjs/common';
import { db } from './index.js';
import { users } from './schema/users.schema.js';

@Module({
  providers: [
    {
      provide: 'DATABASE',
      useValue: db,
    },
    {
      provide: 'USERS_SCHEMA',
      useValue: users,
    },
  ],
  exports: ['DATABASE', 'USERS_SCHEMA'],
})
export class DatabaseModule {}
