import { db } from '../src/db/index.ts';
import { users } from '../src/db/schema/users.schema.ts';
import { AccountType } from '../src/common/constants/roles.ts';
import { PasswordHasher } from '../src/common/utils/password.util.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';

export async function run() {
  const passwordHasher = new PasswordHasher();
  const logger = new WinstonLoggerService();
  const passwordHash = await passwordHasher.hash('Test@123456');

  const testUsers = await db.insert(users).values([
    {
      email: 'reader@test.com',
      username: 'testreader',
      passwordHash,
      name: 'Test Reader',
      accountType: AccountType.READER,
      isVerified: true,
      onboardingCompleted: true,
    },
    {
      email: 'writer@test.com',
      username: 'testwriter',
      passwordHash,
      name: 'Test Writer',
      accountType: AccountType.WRITER,
      isVerified: true,
      onboardingCompleted: true,
    },
  ]).returning();

  logger.log(`Test seed completed: ${testUsers.length} users`, 'TestSeed');
}
