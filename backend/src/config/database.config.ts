import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('hakawi'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
});

export default registerAs('database', () => {
  const env = envSchema.parse(process.env);
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  };
});
