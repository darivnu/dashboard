import { useState } from 'react'
import { useUpdateInstance } from '../../../dashboard/queries'
import Alert from '../../../ui/Alert'
import Button from '../../../ui/Button'
import type { WidgetViewProps } from '../../../widgetRegistry'
import PackCard from './PackCard'
import type { BoosterOpenerData, Pack, PackSet } from './parse'
import SetPicker from './SetPicker'
import { useOpenPack } from './useOpenPack'

type Choice = {
    set: string | null
    booster: string | null
}

function textOrNull(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null
}

/** The booster to open for this collection: the chosen one if it has it, else its first, else none. */
function boosterFor(set: PackSet, wanted: string | null): string | null {
    if (set.boosters.length === 0) return null
    const known = set.boosters.some((booster) => booster.id === wanted)
    return known ? wanted : set.boosters[0].id
}

export default function BoosterOpener({
    instance,
    params,
    data,
}: WidgetViewProps<BoosterOpenerData>) {
    const update = useUpdateInstance()
    const { pack, isOpening, error, open, clear } = useOpenPack()

    // What the widget's settings hold: the choice made last time, here or on
    // another device.
    const saved: Choice = {
        set: textOrNull(params.set),
        booster: textOrNull(params.booster),
    }

    // The choice on screen. It follows the user's click at once, without
    // waiting for the settings to be saved, and follows the settings when
    // they change from somewhere else (the edit dialog).
    const [choice, setChoice] = useState<Choice>(saved)
    const savedKey = `${saved.set}|${saved.booster}`
    const [seenSaved, setSeenSaved] = useState(savedKey)
    if (seenSaved !== savedKey && !update.isPending) {
        setSeenSaved(savedKey)
        setChoice(saved)
    }

    // Which cards of the current pack are face up, by position. A new pack
    // starts over with every card face down.
    const [revealed, setRevealed] = useState<number[]>([])
    const [seenPack, setSeenPack] = useState<Pack | null>(pack)
    // Counts the packs opened, to tell the cards of one pack from the next.
    const [packNumber, setPackNumber] = useState(0)
    if (seenPack !== pack) {
        setSeenPack(pack)
        setRevealed([])
        setPackNumber(packNumber + 1)
    }

    const selected = data.sets.find((set) => set.id === choice.set) ?? null
    const booster = selected ? boosterFor(selected, choice.booster) : null
    const faceDown = pack ? pack.cards.length - revealed.length : 0

    function choose(setId: string, nextBooster: string | null) {
        setChoice({ set: setId, booster: nextBooster })
        // The pack on screen belongs to the previous choice.
        clear()

        const nextParams: Record<string, string> = { set: setId }
        if (nextBooster) nextParams.booster = nextBooster
        update.mutate({ id: instance.id, body: { params: nextParams } })
    }

    function reveal(position: number) {
        setRevealed((current) =>
            current.includes(position) ? current : [...current, position],
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <SetPicker
                    sets={data.sets}
                    selected={selected}
                    booster={booster}
                    onChange={choose}
                />
                <Button
                    disabled={selected === null || isOpening}
                    onClick={() => selected && open(selected.id, booster)}
                >
                    Open pack
                </Button>
                {faceDown > 0 && pack && (
                    <Button
                        variant="secondary"
                        onClick={() =>
                            setRevealed(
                                pack.cards.map((_, position) => position),
                            )
                        }
                    >
                        Reveal all
                    </Button>
                )}
            </div>

            {update.isError && (
                <Alert variant="info">
                    Your choice could not be saved, so it will not be remembered
                    next time.
                </Alert>
            )}
            {error !== null && <Alert>{error}</Alert>}

            {selected === null && (
                <p className="text-gray-400 text-sm">
                    Choose a collection to open a pack.
                </p>
            )}

            {pack !== null && (
                <>
                    {/* As many columns as fit, each at least 7rem wide. */}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
                        {pack.cards.map((card, position) => (
                            <PackCard
                                // A pack can hold the same card twice and its
                                // order never changes, so the position tells
                                // two cards apart. The pack number makes a
                                // new pack start from fresh face-down cards
                                // instead of turning the old ones back over,
                                // which would show the new picture mid-turn.
                                // biome-ignore lint/suspicious/noArrayIndexKey: explained above
                                key={`${packNumber}-${position}`}
                                card={card}
                                revealed={revealed.includes(position)}
                                onReveal={() => reveal(position)}
                            />
                        ))}
                    </div>
                    {pack.extras.length > 0 && (
                        <p className="text-gray-400 text-xs">
                            Also in the pack: {pack.extras.join(', ')}
                        </p>
                    )}
                </>
            )}
        </div>
    )
}
