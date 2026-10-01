import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_TYPES,
  AccountType,
  ADMIN_ROLES,
  AdminRole,
  DEFAULT_ACCOUNT_TYPE,
  LEGACY_ACCOUNT_TYPE_MAP,
  LEGACY_ADMIN_ROLE_MAP,
  isAccountType,
  isAdminRole,
  normalizeAccountType,
  normalizeAdminRole,
  ACCOUNT_TYPE_IMPLIES,
  ADMIN_ROLE_IMPLIES,
  accountTypeAtLeast,
  adminRoleAtLeast,
  accountTypeSatisfies,
  isAdminAccount,
  isSuperAdmin,
} from '../constants/roles.ts';
import {
  ACCOUNT_TYPES as SHARED_ACCOUNT_TYPES,
  AccountType as SharedAccountType,
  ADMIN_ROLES as SHARED_ADMIN_ROLES,
  AdminRole as SharedAdminRole,
  DEFAULT_ACCOUNT_TYPE as SHARED_DEFAULT_ACCOUNT_TYPE,
  LEGACY_ACCOUNT_TYPE_MAP as SHARED_LEGACY_ACCOUNT_TYPE_MAP,
  LEGACY_ADMIN_ROLE_MAP as SHARED_LEGACY_ADMIN_ROLE_MAP,
  normalizeAccountType as sharedNormalizeAccountType,
  normalizeAdminRole as sharedNormalizeAdminRole,
  accountTypeAtLeast as sharedAccountTypeAtLeast,
  adminRoleAtLeast as sharedAdminRoleAtLeast,
  accountTypeSatisfies as sharedAccountTypeSatisfies,
  isAdminAccount as sharedIsAdminAccount,
  isSuperAdmin as sharedIsSuperAdmin,
  isAccountType as sharedIsAccountType,
  isAdminRole as sharedIsAdminRole,
  ACCOUNT_TYPE_IMPLIES as SHARED_ACCOUNT_TYPE_IMPLIES,
  ADMIN_ROLE_IMPLIES as SHARED_ADMIN_ROLE_IMPLIES,
} from '@hakawi/shared-types';

describe('constants/roles barrel', () => {
  it('re-exports the shared account type vocabulary by identity', () => {
    expect(ACCOUNT_TYPES).toBe(SHARED_ACCOUNT_TYPES);
    expect(AccountType).toBe(SharedAccountType);
    expect(ADMIN_ROLES).toBe(SHARED_ADMIN_ROLES);
    expect(AdminRole).toBe(SharedAdminRole);
    expect(DEFAULT_ACCOUNT_TYPE).toBe(SHARED_DEFAULT_ACCOUNT_TYPE);
    expect(LEGACY_ACCOUNT_TYPE_MAP).toBe(SHARED_LEGACY_ACCOUNT_TYPE_MAP);
    expect(LEGACY_ADMIN_ROLE_MAP).toBe(SHARED_LEGACY_ADMIN_ROLE_MAP);
    expect(ACCOUNT_TYPE_IMPLIES).toBe(SHARED_ACCOUNT_TYPE_IMPLIES);
    expect(ADMIN_ROLE_IMPLIES).toBe(SHARED_ADMIN_ROLE_IMPLIES);
  });

  it('re-exports the shared predicates and comparators by identity', () => {
    expect(isAccountType).toBe(sharedIsAccountType);
    expect(isAdminRole).toBe(sharedIsAdminRole);
    expect(normalizeAccountType).toBe(sharedNormalizeAccountType);
    expect(normalizeAdminRole).toBe(sharedNormalizeAdminRole);
    expect(accountTypeAtLeast).toBe(sharedAccountTypeAtLeast);
    expect(adminRoleAtLeast).toBe(sharedAdminRoleAtLeast);
    expect(accountTypeSatisfies).toBe(sharedAccountTypeSatisfies);
    expect(isAdminAccount).toBe(sharedIsAdminAccount);
    expect(isSuperAdmin).toBe(sharedIsSuperAdmin);
  });

  it('publishes exactly the six shared account types', () => {
    expect(ACCOUNT_TYPES).toEqual(['reader', 'writer', 'rising_star', 'professional', 'publisher', 'admin']);
  });
});

describe('legacy database rows still normalize through the shared contract', () => {
  it('maps the legacy author account type stored in the users table to writer', () => {
    expect(LEGACY_ACCOUNT_TYPE_MAP.author).toBe(AccountType.WRITER);
    expect(normalizeAccountType('author')).toBe(AccountType.WRITER);
  });

  it('maps the legacy author account type regardless of casing or padding', () => {
    expect(normalizeAccountType('AUTHOR')).toBe(AccountType.WRITER);
    expect(normalizeAccountType('  Author  ')).toBe(AccountType.WRITER);
  });

  it('refuses to admit author as a first class account type', () => {
    expect(isAccountType('author')).toBe(false);
    expect(ACCOUNT_TYPES).not.toContain('author');
  });

  it('keeps a legacy author inside the reader-writer implication chain', () => {
    expect(accountTypeAtLeast(normalizeAccountType('author'), AccountType.READER)).toBe(true);
    expect(accountTypeAtLeast(normalizeAccountType('author'), AccountType.WRITER)).toBe(true);
    expect(accountTypeAtLeast(normalizeAccountType('author'), AccountType.ADMIN)).toBe(false);
    expect(accountTypeSatisfies(normalizeAccountType('author'), [AccountType.ADMIN])).toBe(false);
  });

  it('does not let a legacy author row pass an admin-only check', () => {
    expect(isAdminAccount('author')).toBe(false);
    expect(isAdminAccount(normalizeAccountType('author'))).toBe(false);
    expect(isSuperAdmin('author', AdminRole.SUPER_ADMIN)).toBe(false);
  });

  it('maps the legacy admin role aliases stored on users rows', () => {
    expect(normalizeAdminRole('moderator')).toBe(AdminRole.CONTENT_MODERATOR);
    expect(normalizeAdminRole('finance')).toBe(AdminRole.FINANCIAL_OFFICER);
    expect(adminRoleAtLeast(normalizeAdminRole('moderator') as AdminRole, AdminRole.CONTENT_MODERATOR)).toBe(true);
  });

  it('falls back to the shared default for an unknown account type', () => {
    expect(normalizeAccountType('wizard')).toBe(DEFAULT_ACCOUNT_TYPE);
    expect(normalizeAdminRole('wizard')).toBeUndefined();
  });
});
