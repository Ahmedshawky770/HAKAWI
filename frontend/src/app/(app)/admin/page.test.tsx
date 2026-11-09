/// <reference types="@testing-library/jest-dom/vitest" />
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => '/admin' }));
vi.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: { href?: string; children?: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a> }));
vi.mock('@/lib/queries', () => ({
  useAdminModerationStats: vi.fn(),
  useAdminRoleAssignments: vi.fn(),
  useAdminPaymentStats: vi.fn(),
  useAdminPublisherStats: vi.fn(),
  isFailedLoad: (q: { href?: string; children?: React.ReactNode; [k: string]: unknown }) => Boolean(q?.isError),
  useInvalidation: () => ({ admin: vi.fn() }),
}));
vi.mock('@/lib/auth-home-route', () => ({ getAuthenticatedHomeRoute: () => '/admin' }));

import { renderWithProviders } from '@/test-utils/render';
import { stubAdminSession } from '@/test-utils/admin';
import * as queries from '@/lib/queries';
import AdminHubPage from './page';

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const failed = () => ({ data: undefined, isLoading: false, isError: true, error: new Error('x'), refetch: vi.fn() });

describe('admin hub', () => {
  beforeEach(() => {
    stubAdminSession({ adminRole: 'super_admin' });
    vi.mocked(queries.useAdminModerationStats).mockReturnValue(ok({ totalReports: 7 }) as never);
    vi.mocked(queries.useAdminRoleAssignments).mockReturnValue(ok({ total: 3, assignments: [] }) as never);
    vi.mocked(queries.useAdminPaymentStats).mockReturnValue(ok({ total: 9 }) as never);
    vi.mocked(queries.useAdminPublisherStats).mockReturnValue(ok({ pendingApplications: 1, approvedApplications: 2, rejectedApplications: 3 }) as never);
  });

  it('renders hub surfaces for super_admin', async () => {
    renderWithProviders(<AdminHubPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'لوحة المسؤول' })).toBeInTheDocument();
    expect(screen.getAllByText('مراجعة المحتوى').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /المالية/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /التحقق من الهوية/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /إدارة الأدوار/ })).toBeInTheDocument();
  });

  it('shows failure state when a query fails', async () => {
    vi.mocked(queries.useAdminPaymentStats).mockReturnValue(failed() as never);
    vi.mocked(queries.useAdminPublisherStats).mockReturnValue(failed() as never);
    renderWithProviders(<AdminHubPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/فشل تحميل|تعذّر تحميل|تحميل جزئي|MFA/i);
  });
});
