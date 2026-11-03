export const ONBOARDING_VIDEO_CONSTRAINTS = {
  maxSizeBytes: 15 * 1024 * 1024,
  minSizeBytes: 500 * 1024,
  allowedTypes: ["video/mp4", "video/webm", "video/quicktime"] as const,
  allowedExtensions: [".mp4", ".webm", ".mov"] as const,
  maxAgeMs: 24 * 60 * 60 * 1000,
  targetDurationSeconds: 10,
  leftMoveSeconds: 3,
  rightMoveSeconds: 3,
  centerHoldSeconds: 4,
} as const;

export const PROFESSIONAL_BIO_MIN = 10;
export const PROFESSIONAL_BIO_MAX = 500;
export const PHONE_REGEX = /^\+?[0-9]{10,15}$/;
