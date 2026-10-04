import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type RenderOptions, render, renderHook } from '@testing-library/react'
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

function wrapperFor(client: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        )
    }
}

export function renderWithQuery(
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'> & { client?: QueryClient },
) {
    const { client = createTestQueryClient(), ...rest } = options ?? {}
    return { client, ...render(ui, { wrapper: wrapperFor(client), ...rest }) }
}

export function renderHookWithQuery<Result>(
    hook: () => Result,
    client: QueryClient = createTestQueryClient(),
) {
    return { client, ...renderHook(hook, { wrapper: wrapperFor(client) }) }
}
