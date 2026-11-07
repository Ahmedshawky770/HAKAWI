/// <reference types="@testing-library/jest-dom/vitest" />
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => '/admin/financial' }));
vi.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: { href?: string; children?: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a> }));
vi.mock('@/lib/queries', () => ({
  useAdminPayments: vi.fn(),
  useAdminPaymentStats: vi.fn(),
  isFailedLoad: (q: { href?: string; children?: React.ReactNode; [k: string]: unknown }) => Boolean(q?.isError),
  useInvalidation: () => ({ admin: vi.fn() }),
}));
vi.mock('@/lib/auth-home-route', () => ({ getAuthenticatedHomeRoute: () => '/admin/financial' }));
vi.mock('@/components/providers/ToastProvider', async (orig) => { const actual = await orig<typeof import('@/components/providers/ToastProvider')>(); return { ...actual, useToast: () => ({ notify: vi.fn() }) }; });
vi.mock('@/lib/money', () => ({ formatPrice: (v: number) => `${v}` }));

import { renderWithProviders } from '@/test-utils/render';
import { stubAdminSession } from '@/test-utils/admin';
import * as queries from '@/lib/queries';
import FinancialAdminPage from './page';

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const failed = () => ({ data: undefined, isLoading: false, isError: true, error: new Error('x'), refetch: vi.fn() });

describe('financial admin page', () => {
  beforeEach(() => {
    stubAdminSession({ adminRole: 'financial_officer' });
    vi.mocked(queries.useAdminPayments).mockReturnValue(ok({ payments: [] }) as never);
    vi.mocked(queries.useAdminPaymentStats).mockReturnValue(ok({ total: 4, byStatus: { pending: 1, completed: 2, failed: 1 } }) as never);
  });

  it('shows loading state while payments load', () => {
    vi.mocked(queries.useAdminPayments).mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() } as never);
    renderWithProviders(<FinancialAdminPage />);
    expect(screen.getByRole('heading', { level: 1, name: /المالية/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ التحميل');
  });

  it('renders tabs and empty payments state', async () => {
    renderWithProviders(<FinancialAdminPage />);
    expect(await screen.findByRole('heading', { level: 1, name: /المالية/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'المدفوعات' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /الاستردادات|المستردات/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /التحويلات|المدفوعات للناشرين/ })).toBeInTheDocument();
    expect(screen.getByText(/لا توجد مدفوعات/)).toBeInTheDocument();
  });

  it('switches tabs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancialAdminPage />);
    await screen.findByRole('heading', { level: 1, name: /المالية/ });
    await user.click(screen.getByRole('button', { name: /الاستردادات|المستردات/ }));
    expect(screen.getByText(/لا توجد (مستردات|استردادات)/)).toBeInTheDocument();
  });

  it('shows failure state', async () => {
    vi.mocked(queries.useAdminPayments).mockReturnValue(failed() as never);
    renderWithProviders(<FinancialAdminPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('فشل تحميل البيانات');
  });
});
