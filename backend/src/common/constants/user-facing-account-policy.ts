import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { AccountType, normalizeAccountType } from './roles.ts';

export function isHiddenAdminAccount(accountType: string | null | undefined): boolean {
  return normalizeAccountType(accountType ?? '') === AccountType.ADMIN;
}

export function assertCanInteractAsUser(accountType: string | null | undefined): void {
  if (isHiddenAdminAccount(accountType)) {
    throw new ForbiddenException('Admin accounts cannot interact with user-facing content');
  }
}

export function assertUserFacingProfileVisible(accountType: string | null | undefined): void {
  if (isHiddenAdminAccount(accountType)) {
    throw new NotFoundException('User not found');
  }
}
