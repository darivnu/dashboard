import { type CSSProperties, useMemo } from 'react'
import ReactGridLayout, {
    type Layout,
    useContainerWidth,
} from 'react-grid-layout'
import {
    compact,
    GRID_COLUMNS,
    layoutChanges,
    MAX_ROWS,
    sortByPosition,
} from './dashboard/layout'
import type { Instance, LayoutItem } from './dashboard/types'
import { useMediaQuery } from './dashboard/useMediaQuery'
import WidgetShell from './dashboard/WidgetShell'
import { getWidgetEntry } from './widgetRegistry'

type Props = {
    instances: Instance[]
    onEdit: (instance: Instance) => void
    onDelete: (instance: Instance) => void
    onMove: (instance: Instance, direction: 'earlier' | 'later') => void
    /** the cards a drop or a resize moved or resized, to be saved */
    onLayoutChange: (changes: LayoutItem[]) => void
    onSetApiKey: (instance: Instance) => void
}

// Tailwind's md breakpoint, written the way Tailwind writes it, so this and
// the md: classes of the cards always switch at the same width (768 px at
// the browser's default font size).
const WIDE_SCREEN = '(min-width: 48rem)'

// 12 columns, 96 px rows, 16 px gaps. Defined once, outside the component:
// the grid sets itself up again whenever it is given a new config object.
const gridConfig = {
    cols: GRID_COLUMNS,
    rowHeight: 96,
    margin: [16, 16],
    containerPadding: [0, 0],
} as const
// A card is dragged by its header, but never from a control inside it.
const dragConfig = {
    handle: '.widget-drag-handle',
    cancel: 'button, a, input, select, textarea',
}
const resizeConfig = { handles: ['se'] } as const

export default function WidgetGrid(props: Props) {
    const wide = useMediaQuery(WIDE_SCREEN)

    if (props.instances.length === 0) {
        return (
            <p className="text-muted text-center text-lg mt-12">
                No widgets yet — click "Add Widget" to start.
            </p>
        )
    }

    return wide ? <DraggableGrid {...props} /> : <SingleColumn {...props} />
}

function Card({
    instance,
    onEdit,
    onDelete,
    onMove,
    onSetApiKey,
}: Omit<Props, 'instances' | 'onLayoutChange'> & { instance: Instance }) {
    return (
        <WidgetShell
            instance={instance}
            onEdit={() => onEdit(instance)}
            onDelete={() => onDelete(instance)}
            onMove={(direction) => onMove(instance, direction)}
            onSetApiKey={() => onSetApiKey(instance)}
        />
    )
}

function DraggableGrid({ instances, onLayoutChange, ...handlers }: Props) {
    // The grid places cards in pixels, so it has to know how wide it is.
    const { width, containerRef, mounted } = useContainerWidth({
        measureBeforeMount: true,
    })

    const layout = useMemo(
        () =>
            instances.map((instance) => {
                const { minSize } = getWidgetEntry(
                    instance.serviceId,
                    instance.widgetId,
                )
                return {
                    i: instance.id,
                    x: instance.x,
                    y: instance.y,
                    w: instance.w,
                    h: instance.h,
                    minW: minSize.w,
                    minH: minSize.h,
                    maxW: GRID_COLUMNS,
                    maxH: MAX_ROWS,
                }
            }),
        [instances],
    )

    // Called once, when the pointer is released, with the final layout.
    const save = (final: Layout) => {
        const next = final.map(({ i, x, y, w, h }) => ({ id: i, x, y, w, h }))
        // The grid floats cards up by itself, so what it shows can differ
        // from what is stored. A drop that leaves the cards as shown saves
        // nothing; a real change saves everything that differs from the store.
        if (layoutChanges(compact(instances), next).length === 0) return
        onLayoutChange(layoutChanges(instances, next))
    }

    return (
        <div ref={containerRef}>
            {mounted && (
                <ReactGridLayout
                    width={width}
                    layout={layout}
                    gridConfig={gridConfig}
                    dragConfig={dragConfig}
                    resizeConfig={resizeConfig}
                    onDragStop={save}
                    onResizeStop={save}
                >
                    {instances.map((instance) => (
                        <div key={instance.id}>
                            <Card instance={instance} {...handlers} />
                        </div>
                    ))}
                </ReactGridLayout>
            )}
        </div>
    )
}

function SingleColumn({ instances, onLayoutChange: _, ...handlers }: Props) {
    return (
        // One column of 96 px rows, in reading order. Nothing drags here.
        <div className="grid grid-cols-1 auto-rows-[96px] gap-4">
            {sortByPosition(instances).map((instance) => (
                <div
                    key={instance.id}
                    className="row-span-(--h) min-h-0"
                    style={{ '--h': instance.h } as CSSProperties}
                >
                    <Card instance={instance} {...handlers} />
                </div>
            ))}
        </div>
    )
}
