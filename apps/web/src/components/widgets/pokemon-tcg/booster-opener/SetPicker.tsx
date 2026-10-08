import type { Confidence, PackSet } from './parse'

type Props = {
    /** Every collection a pack can be opened from, oldest first. */
    sets: PackSet[]
    /** The chosen collection, or null when none is chosen yet. */
    selected: PackSet | null
    /** The chosen booster of that collection, when it has several. */
    booster: string | null
    onChange: (setId: string, booster: string | null) => void
}

const selectClass =
    'min-w-0 max-w-full rounded-lg bg-surface-raised p-2 text-sm text-fg outline-none focus:ring-2 focus:ring-focus'

// Pull rates are only published for a few collections; for the others the
// list says how far the odds can be trusted.
const ODDS_NOTE: Record<Confidence, string> = {
    high: '',
    medium: ' (estimated odds)',
    low: ' (uncertain odds)',
}

type SerieGroup = {
    id: string
    name: string
    sets: PackSet[]
}

/** The collections under the serie they belong to, series in order of first appearance. */
function bySerie(sets: PackSet[]): SerieGroup[] {
    const groups = new Map<string, SerieGroup>()
    for (const set of sets) {
        let group = groups.get(set.serie.id)
        if (!group) {
            group = { id: set.serie.id, name: set.serie.name, sets: [] }
            groups.set(set.serie.id, group)
        }
        group.sets.push(set)
    }
    return [...groups.values()]
}

export default function SetPicker({
    sets,
    selected,
    booster,
    onChange,
}: Props) {
    function chooseSet(setId: string) {
        const set = sets.find((candidate) => candidate.id === setId)
        if (!set) return
        // A collection with several boosters starts on its first one.
        onChange(set.id, set.boosters[0]?.id ?? null)
    }

    return (
        <>
            <select
                aria-label="Collection"
                className={selectClass}
                value={selected?.id ?? ''}
                onChange={(event) => chooseSet(event.target.value)}
            >
                {/* Shown until a collection is chosen; cannot be picked again. */}
                <option value="" disabled>
                    Choose a collection…
                </option>
                {bySerie(sets).map((serie) => (
                    <optgroup key={serie.id} label={serie.name}>
                        {serie.sets.map((set) => (
                            <option key={set.id} value={set.id}>
                                {set.name}
                                {ODDS_NOTE[set.confidence]}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>

            {selected !== null && selected.boosters.length > 0 && (
                <select
                    aria-label="Booster"
                    className={selectClass}
                    value={booster ?? selected.boosters[0].id}
                    onChange={(event) =>
                        onChange(selected.id, event.target.value)
                    }
                >
                    {selected.boosters.map((each) => (
                        <option key={each.id} value={each.id}>
                            {each.name}
                        </option>
                    ))}
                </select>
            )}
        </>
    )
}
