import { vi } from 'vitest';
import { AUTH_USER } from './fixtures';

export function stubAdminSession(overrides: Record<string, unknown> = {}) {
  const store = new Map<string, string>([
    ['hakawi_user', JSON.stringify({ ...AUTH_USER, accountType: 'admin', adminRole: 'super_admin', ...overrides })],
  ]);
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
  });
  return store;
}
