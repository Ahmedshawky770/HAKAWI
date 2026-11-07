/// <reference types="@testing-library/jest-dom/vitest" />
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@tanstack/react-query', async (orig: () => Promise<unknown>) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useQueryClient: () => ({ clear: vi.fn() }) };
});
vi.mock('@/lib/api', () => ({ api: { submitProfessionalApplication: vi.fn() } }));
vi.mock('@/lib/constants/onboarding', () => ({
  ONBOARDING_VIDEO_CONSTRAINTS: { allowedTypes: ['video/mp4'], maxSizeBytes: 1e7, minSizeBytes: 1, maxAgeMs: 1e12 },
  PROFESSIONAL_BIO_MIN: 10, PROFESSIONAL_BIO_MAX: 500, PHONE_REGEX: /^\+?[0-9]{8,15}$/,
}));

import { renderWithProviders } from '@/test-utils/render';
import ProfessionalApplyPage from './page';

describe('professional apply page', () => {
  it('renders key fields and submit action', () => {
    renderWithProviders(<ProfessionalApplyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Professional application' })).toBeInTheDocument();
    expect(screen.getByLabelText('Birth date')).toBeInTheDocument();
    expect(screen.getByLabelText('Country')).toBeInTheDocument();
    expect(screen.getByLabelText('Bio')).toHaveAttribute('name', 'bio');
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    expect(screen.getByLabelText('Face verification video')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit application' })).toBeDisabled();
  });

  it('shows phone validation for invalid number', async () => {
    renderWithProviders(<ProfessionalApplyPage />);
    const phone = screen.getByLabelText('Phone number');
    phone.focus();
    await (await import('@testing-library/user-event')).default.setup().type(phone, 'abc');
    expect(screen.getByText('Invalid phone number')).toBeInTheDocument();
  });
});
