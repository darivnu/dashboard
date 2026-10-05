export type EchoData = {
    message: string
    count?: number
}

export function parseEcho(raw: unknown): EchoData {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('Unexpected echo data')
    }
    const { message, count } = raw as Record<string, unknown>
    if (typeof message !== 'string') {
        throw new Error('Unexpected echo data')
    }
    if (count !== undefined && typeof count !== 'number') {
        throw new Error('Unexpected echo data')
    }
    return { message, count }
}
