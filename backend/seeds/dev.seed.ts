import { db } from '../src/db/index.js';
import { users } from '../src/db/schema/users.schema.js';
import { AccountType } from '../src/common/constants/roles.js';
import { PasswordHasher } from '../src/common/utils/password.util.js';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.js';

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

  logger.log('Seed completed', adminUser[0]);
}
