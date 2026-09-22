import { SetMetadata } from '@nestjs/common';
import { AccountType, AdminRole } from '../constants/roles.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const REQUIRED_ADMIN_ROLE_KEY = 'requiredAdminRole';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: AccountType[]) => SetMetadata(ROLES_KEY, roles);

export const RequireAdminRole = (role: AdminRole) =>
  SetMetadata(REQUIRED_ADMIN_ROLE_KEY, role);
