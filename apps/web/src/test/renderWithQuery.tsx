import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type RenderOptions, render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

// A fresh client per test: no retries, so a failing request fails at once,
// and nothing cached leaks from one test into the next.
export function createTestQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
            mutations: { retry: false },
        },
    })
}

export function renderWithQuery(
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'> & { client?: QueryClient },
) {
    const { client = createTestQueryClient(), ...rest } = options ?? {}
    function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        )
    }
    return { client, ...render(ui, { wrapper: Wrapper, ...rest }) }
}
