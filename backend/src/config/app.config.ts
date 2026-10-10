import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  // Comma-separated so one deployment can serve more than one frontend origin: a staging
  // host alongside production, or a preview deployment on its own domain. A single value
  // here silently blocked every other origin at the browser's preflight, which surfaces to
  // the user as "Failed to fetch" rather than as anything that names CORS.
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export default registerAs('app', () => {
  const env = envSchema.parse(process.env);
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    corsOrigins: env.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  };
});
