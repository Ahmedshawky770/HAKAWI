import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const REQUIRED_ADMIN_ROLE_KEY = 'requiredAdminRole';
export const RequireAdminRole = (role: string) => SetMetadata(REQUIRED_ADMIN_ROLE_KEY, role);
