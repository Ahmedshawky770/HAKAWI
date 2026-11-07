/// <reference types="@testing-library/jest-dom/vitest" />
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => '/admin/verification' }));
vi.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: { href?: string; children?: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a> }));
vi.mock('@/lib/queries', () => ({
  useAdminPublisherApplications: vi.fn(),
  useAdminPublisherStats: vi.fn(),
  isFailedLoad: (q: { href?: string; children?: React.ReactNode; [k: string]: unknown }) => Boolean(q?.isError),
  useInvalidation: () => ({ admin: vi.fn() }),
}));
vi.mock('@/lib/auth-home-route', () => ({ getAuthenticatedHomeRoute: () => '/admin/verification' }));
vi.mock('@/components/providers/ToastProvider', async (orig) => { const actual = await orig<typeof import('@/components/providers/ToastProvider')>(); return { ...actual, useToast: () => ({ notify: vi.fn() }) }; });
vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof import('@/lib/api')>();
  return {
    ...actual,
    getAuthToken: () => 't',
    getStoredUser: () => {
      try {
        return JSON.parse(window.localStorage.getItem('hakawi_user') ?? 'null');
      } catch {
        return null;
      }
    },
    api: { reviewPublisherApplication: vi.fn() },
  };
});

import { renderWithProviders } from '@/test-utils/render';
import { stubAdminSession } from '@/test-utils/admin';
import * as queries from '@/lib/queries';
import VerificationAdminPage from './page';

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const loading = () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
const failed = () => ({ data: undefined, isLoading: false, isError: true, error: new Error('x'), refetch: vi.fn() });

describe('verification admin page', () => {
  beforeEach(() => {
    stubAdminSession({ adminRole: 'verification_officer' });
    vi.mocked(queries.useAdminPublisherApplications).mockReturnValue(ok({ applications: [] }) as never);
    vi.mocked(queries.useAdminPublisherStats).mockReturnValue(ok({ pendingApplications: 1, approvedApplications: 2, rejectedApplications: 3 }) as never);
  });

  it('shows loading state', () => {
    vi.mocked(queries.useAdminPublisherApplications).mockReturnValue(loading() as never);
    renderWithProviders(<VerificationAdminPage />);
    expect(screen.getByRole('heading', { level: 1, name: /التحقق/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ التحميل');
  });

  it('renders tabs and empty state', async () => {
    renderWithProviders(<VerificationAdminPage />);
    await screen.findByRole('heading', { level: 1, name: /التحقق/ });
    const buttons = screen.getAllByRole('button').map((b) => b.textContent ?? '').join('|');
    expect(buttons).toMatch(/انتظار|قيد|Pending/i);
    expect(buttons).toMatch(/معتمد|Approved/i);
    expect(buttons).toMatch(/مرفوض|Rejected/i);
    expect(screen.getByText('لا توجد طلبات تحقق بعد.')).toBeInTheDocument();
  });

  it('shows failure state', async () => {
    vi.mocked(queries.useAdminPublisherApplications).mockReturnValue(failed() as never);
    renderWithProviders(<VerificationAdminPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('فشل تحميل البيانات');
  });
});
