export const AccountType = {
  READER: 'reader',
  WRITER: 'writer',
  RISING_STAR: 'rising_star',
  PROFESSIONAL: 'professional',
  PUBLISHER: 'publisher',
  ADMIN: 'admin',
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const AdminRole = {
  SUPER_ADMIN: 'super_admin',
  MODERATOR: 'moderator',
  SUPPORT: 'support',
} as const;

export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];
