import { isOneOf } from './common.js';
import type { AuthTokens } from './common.js';

export const ACCOUNT_TYPES = ['reader', 'writer', 'rising_star', 'professional', 'publisher', 'admin'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const AccountType = {
  READER: 'reader',
  WRITER: 'writer',
  RISING_STAR: 'rising_star',
  PROFESSIONAL: 'professional',
  PUBLISHER: 'publisher',
  ADMIN: 'admin',
} as const satisfies Record<string, AccountType>;

export const ADMIN_ROLES = ['super_admin', 'content_moderator', 'financial_officer', 'verification_officer'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const AdminRole = {
  SUPER_ADMIN: 'super_admin',
  CONTENT_MODERATOR: 'content_moderator',
  FINANCIAL_OFFICER: 'financial_officer',
  VERIFICATION_OFFICER: 'verification_officer',
  MODERATOR: 'content_moderator',
  FINANCE: 'financial_officer',
} as const satisfies Record<string, AdminRole>;

export const DEFAULT_ACCOUNT_TYPE: AccountType = AccountType.READER;

export const LEGACY_ACCOUNT_TYPE_MAP: Readonly<Partial<Record<string, AccountType>>> = Object.freeze({
  author: AccountType.WRITER,
});

export const LEGACY_ADMIN_ROLE_MAP: Readonly<Partial<Record<string, AdminRole>>> = Object.freeze({
  moderator: AdminRole.CONTENT_MODERATOR,
  finance: AdminRole.FINANCIAL_OFFICER,
});

export const isAccountType = (value: string): value is AccountType => isOneOf(ACCOUNT_TYPES, value);

export const isAdminRole = (value: string): value is AdminRole => isOneOf(ADMIN_ROLES, value);

export const normalizeAccountType = (value: string): AccountType => {
  const candidate = value.trim().toLowerCase();
  const legacy = LEGACY_ACCOUNT_TYPE_MAP[candidate];
  if (legacy !== undefined) {
    return legacy;
  }
  return isAccountType(candidate) ? candidate : DEFAULT_ACCOUNT_TYPE;
};

export const normalizeAdminRole = (value: string): AdminRole | undefined => {
  const candidate = value.trim().toLowerCase();
  const legacy = LEGACY_ADMIN_ROLE_MAP[candidate];
  if (legacy !== undefined) {
    return legacy;
  }
  return isAdminRole(candidate) ? candidate : undefined;
};

export const ACCOUNT_TYPE_IMPLIES: Readonly<Record<AccountType, readonly AccountType[]>> = Object.freeze({
  [AccountType.READER]: [AccountType.READER],
  [AccountType.WRITER]: [AccountType.READER, AccountType.WRITER],
  [AccountType.RISING_STAR]: [AccountType.READER, AccountType.WRITER, AccountType.RISING_STAR],
  [AccountType.PROFESSIONAL]: [AccountType.READER, AccountType.WRITER, AccountType.PROFESSIONAL],
  [AccountType.PUBLISHER]: [AccountType.READER, AccountType.WRITER, AccountType.PUBLISHER],
  [AccountType.ADMIN]: ACCOUNT_TYPES,
});

export const ADMIN_ROLE_IMPLIES: Readonly<Record<AdminRole, readonly AdminRole[]>> = Object.freeze({
  [AdminRole.SUPER_ADMIN]: ADMIN_ROLES,
  [AdminRole.CONTENT_MODERATOR]: [AdminRole.CONTENT_MODERATOR],
  [AdminRole.FINANCIAL_OFFICER]: [AdminRole.FINANCIAL_OFFICER],
  [AdminRole.VERIFICATION_OFFICER]: [AdminRole.VERIFICATION_OFFICER],
});

export const accountTypeAtLeast = (accountType: AccountType, required: AccountType): boolean =>
  ACCOUNT_TYPE_IMPLIES[accountType].includes(required);

export const adminRoleAtLeast = (role: AdminRole, required: AdminRole): boolean => ADMIN_ROLE_IMPLIES[role].includes(required);

export const accountTypeSatisfies = (accountType: AccountType, required: readonly AccountType[]): boolean =>
  required.some((candidate) => accountTypeAtLeast(accountType, candidate));

export const isAdminAccount = (accountType: string | null | undefined): boolean =>
  typeof accountType === 'string' && normalizeAccountType(accountType) === AccountType.ADMIN;

export const isSuperAdmin = (
  accountType: string | null | undefined,
  adminRole: string | null | undefined,
): boolean => {
  if (!isAdminAccount(accountType) || typeof adminRole !== 'string') {
    return false;
  }
  return normalizeAdminRole(adminRole) === AdminRole.SUPER_ADMIN;
};

export type AuthUserSummary = {
  id: string;
  email: string;
  name: string;
  username: string;
  accountType: AccountType;
};

export type AuthResponse = {
  user: AuthUserSummary;
  tokens: AuthTokens;
};

export type SessionResponse = {
  user: AuthUserSummary;
  expiresAt: string;
};

export type PublicUserProfile = {
  id: string;
  username: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  accountType: AccountType;
  isVerified: boolean;
  createdAt: string;
};

export type UserProfileUpdate = {
  name?: string;
  bio?: string | null;
};

export type UserStats = {
  storiesCount: number;
  totalViews: number;
  totalReactions: number;
  followersCount: number;
  followingCount: number;
};
