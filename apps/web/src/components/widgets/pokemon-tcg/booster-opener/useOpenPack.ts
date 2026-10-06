import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../../../api'
import { type Pack, parsePack } from './parse'

const SERVICE_ID = 'pokemon_tcg'
const ACTION_ID = 'open_pack'

/** What the user reads when a pack could not be opened. */
export const OPEN_PACK_MESSAGES = {
    busy: 'The card database is busy, try again in a moment',
    failed: 'Could not open the pack',
    tooMany: (seconds: number | null) =>
        seconds === null
            ? 'Too many packs, try again in a moment'
            : `Too many packs, try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`,
}

/** An error whose message is already written for the user. */
class OpenPackError extends Error {}

type OpenPackInput = {
    set: string
    booster: string | null
}

// The seconds the API asks to wait for, from the Retry-After header of its
// 429 answer; null when the header is missing or is not a whole number.
function retryAfterSeconds(response: Response | undefined): number | null {
    const header = response?.headers.get('retry-after')
    const seconds = Number(header)
    if (!header || !Number.isInteger(seconds) || seconds < 1) return null
    return seconds
}

async function requestPack({ set, booster }: OpenPackInput): Promise<Pack> {
    const params: Record<string, string> = { set }
    if (booster) params.booster = booster

    const result = await api
        .services({ serviceId: SERVICE_ID })
        .actions({ actionId: ACTION_ID })
        .post({ params })

    // 429: this user opened too many packs; the API says how long to wait.
    if (result.error?.status === 429) {
        throw new OpenPackError(
            OPEN_PACK_MESSAGES.tooMany(retryAfterSeconds(result.response)),
        )
    }
    if (result.error || !result.data) {
        throw new OpenPackError(OPEN_PACK_MESSAGES.failed)
    }

    // 200 with ok: false: the action ran but could not finish. `rate_limited`
    // here is about TCGdex refusing the API, not about this user.
    if (!result.data.ok) {
        throw new OpenPackError(
            result.data.code === 'rate_limited'
                ? OPEN_PACK_MESSAGES.busy
                : OPEN_PACK_MESSAGES.failed,
        )
    }

    return parsePack(result.data.data)
}

/**
 * Opens packs through the `open_pack` action.
 *
 * `pack` is the last pack that was opened and stays there while the next one
 * is on its way or fails, so a refused click never empties the widget.
 */
export function useOpenPack() {
    const [pack, setPack] = useState<Pack | null>(null)

    const mutation = useMutation({
        mutationFn: requestPack,
        onSuccess: setPack,
    })

    // Anything that is not one of the messages above (no network, an answer
    // parsePack refused) is reported the same plain way.
    let error: string | null = null
    if (mutation.error) {
        error =
            mutation.error instanceof OpenPackError
                ? mutation.error.message
                : OPEN_PACK_MESSAGES.failed
    }

    return {
        pack,
        isOpening: mutation.isPending,
        error,
        open(set: string, booster: string | null = null) {
            mutation.mutate({ set, booster })
        },
        /** Forgets the pack and the error, for when the collection changes. */
        clear() {
            setPack(null)
            mutation.reset()
        },
    }
}
