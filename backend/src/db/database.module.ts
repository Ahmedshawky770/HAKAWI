import { Module } from '@nestjs/common';
import { db } from './index.ts';
import { users } from './schema/users.schema.ts';

@Module({
  providers: [
    { provide: 'DATABASE', useValue: db },
    { provide: 'USERS_SCHEMA', useValue: users },
  ],
  exports: [
    'DATABASE',
    'USERS_SCHEMA',
  ],
})
export class DatabaseModule {}
