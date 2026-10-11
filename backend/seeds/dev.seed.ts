import { db } from '../src/db/index.ts';
import { users } from '../src/db/schema/users.schema.ts';
import { AccountType } from '../src/common/constants/roles.ts';
import { PasswordHasher } from '../src/common/utils/password.util.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';

export async function run() {
  const passwordHasher = new PasswordHasher();
  const logger = new WinstonLoggerService();
  const passwordHash = await passwordHasher.hash('Admin@123456');

  const adminUser = await db.insert(users).values({
    email: 'admin@hakawi.com',
    username: 'admin',
    passwordHash,
    name: 'System Admin',
    accountType: AccountType.ADMIN,
    isVerified: true,
    onboardingCompleted: true,
    accessBlocked: false,
  }).returning();

  logger.log(`Seed completed: admin ${adminUser[0].email}`, 'DevSeed');
}
