import { z } from 'zod';

export const UploadResponseDto = z.object({
  filename: z.string(),
  originalName: z.string(),
  mimetype: z.string(),
  size: z.number(),
  url: z.string(),
  cdnUrl: z.string().optional(),
  uploadedAt: z.string().optional(),
});

export type UploadResponse = z.infer<typeof UploadResponseDto>;
