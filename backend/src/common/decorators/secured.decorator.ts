import { applyDecorators, UseGuards } from '@nestjs/common';

import type { AccountType } from '../constants/roles.ts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.ts';
import { PermissionsGuard } from '../guards/permissions.guard.ts';
import { RolesGuard } from '../guards/roles.guard.ts';

import { RequireRoles } from './roles.decorator.ts';

export const SECURED_GUARDS = [JwtAuthGuard, RolesGuard, PermissionsGuard] as const;

export const Secured = (...accountTypes: AccountType[]) =>
  applyDecorators(UseGuards(...SECURED_GUARDS), ...(accountTypes.length > 0 ? [RequireRoles(...accountTypes)] : []));
