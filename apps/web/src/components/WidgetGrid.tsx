import type { CSSProperties } from 'react'
import { GRID_COLUMNS, sortByPosition } from './dashboard/layout'
import type { Instance } from './dashboard/types'
import WidgetShell from './dashboard/WidgetShell'

type Props = {
    instances: Instance[]
    onEdit: (instance: Instance) => void
    onDelete: (instance: Instance) => void
    onMove: (instance: Instance, direction: 'left' | 'right') => void
}

export default function WidgetGrid({
    instances,
    onEdit,
    onDelete,
    onMove,
}: Props) {
    if (instances.length === 0) {
        return (
            <p className="text-gray-400 text-center text-lg mt-12">
                No widgets yet — click "Add Widget" to start.
            </p>
        )
    }

    return (
        // 12 columns, 96 px rows, 16 px gaps; a single column on narrow screens.
        <div className="grid grid-cols-1 md:grid-cols-12 auto-rows-[96px] gap-4">
            {sortByPosition(instances).map((instance) => (
                <div
                    key={instance.id}
                    className="md:col-span-(--w) row-span-(--h) min-h-0"
                    style={
                        {
                            '--w': Math.min(instance.w, GRID_COLUMNS),
                            '--h': instance.h,
                        } as CSSProperties
                    }
                >
                    <WidgetShell
                        instance={instance}
                        onEdit={() => onEdit(instance)}
                        onDelete={() => onDelete(instance)}
                        onMove={(direction) => onMove(instance, direction)}
                    />
                </div>
            ))}
        </div>
    )
}
