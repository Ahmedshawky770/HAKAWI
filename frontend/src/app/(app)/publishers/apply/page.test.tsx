/// <reference types="@testing-library/jest-dom/vitest" />
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@tanstack/react-query', async (orig: () => Promise<unknown>) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useQueryClient: () => ({ clear: vi.fn() }) };
});
vi.mock('@/lib/api', () => ({ api: { submitPublisherApplication: vi.fn(), uploadFile: vi.fn() } }));

import { renderWithProviders } from '@/test-utils/render';
import PublisherApplyPage from './page';

describe('publisher apply page', () => {
  it('renders step 1 fields and navigation', () => {
    renderWithProviders(<PublisherApplyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Publisher registration' })).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 9: Account/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Registrant role')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('moves between steps', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PublisherApplyPage />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Step 2 of 9: Company/)).toBeInTheDocument();
    expect(screen.getByLabelText('Official company name')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText(/Step 1 of 9: Account/)).toBeInTheDocument();
  });
});
