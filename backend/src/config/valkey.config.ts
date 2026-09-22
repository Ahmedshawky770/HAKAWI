import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  VALKEY_HOST: z.string().default('localhost'),
  VALKEY_PORT: z.coerce.number().default(6379),
  VALKEY_PASSWORD: z.string().optional(),
});

export default registerAs('valkey', () => {
  const env = envSchema.parse(process.env);
  return {
    host: env.VALKEY_HOST,
    port: env.VALKEY_PORT,
    password: env.VALKEY_PASSWORD || undefined,
  };
});
