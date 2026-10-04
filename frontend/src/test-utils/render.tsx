import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { RenderOptions, RenderResult } from "@testing-library/react";

import { LocaleProvider } from "@/components/providers/LocaleProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";

/**
 * The providers every component in the product expects to be under.
 *
 * WHY A HELPER RATHER THAN `render()`. The shell (header, sidebar, bottom bar)
 * reads the theme and the locale, and the story components read the query cache.
 * A test that renders one of those without the providers does not fail with a
 * useful message — it throws "useTheme must be used inside <ThemeProvider>", which
 * says nothing about the component under test. Wrapping once here keeps every
 * test honest and keeps the provider stack in one place, so adding a provider
 * is a one-line change instead of twenty.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Retries and caching are disabled so a test observes exactly one request.
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface ProviderRenderOptions extends Omit<RenderOptions, "wrapper"> {
  queryClient?: QueryClient;
}

export function renderWithProviders(ui: React.ReactElement, options: ProviderRenderOptions = {}): RenderResult {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LocaleProvider>
            <ToastProvider>{children}</ToastProvider>
          </LocaleProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
