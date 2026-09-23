import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').default('dev-jwt-secret-key-change-in-production-1234567890'),
  JWT_EXPIRY: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters').default('dev-refresh-secret-key-change-in-production-1234567890'),
  REFRESH_TOKEN_EXPIRY: z.string().default('7d'),
});

export default registerAs('jwt', () => {
  const env = envSchema.parse(process.env);
  return {
    secret: env.JWT_SECRET,
    expiry: env.JWT_EXPIRY,
    refreshSecret: env.REFRESH_TOKEN_SECRET,
    refreshExpiry: env.REFRESH_TOKEN_EXPIRY,
  };
});
