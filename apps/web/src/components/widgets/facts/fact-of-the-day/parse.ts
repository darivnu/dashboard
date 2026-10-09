export type FactData = {
    text: string
    source: string | null
    sourceUrl: string | null
}

export function parseFact(raw: unknown): FactData {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('Unexpected fact data')
    }
    const { text, source, sourceUrl } = raw as Record<string, unknown>
    if (typeof text !== 'string') {
        throw new Error('Unexpected fact data')
    }
    return {
        text,
        source: typeof source === 'string' ? source : null,
        sourceUrl: typeof sourceUrl === 'string' ? sourceUrl : null,
    }
}
