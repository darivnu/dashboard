import type { WidgetViewProps } from '../../../widgetRegistry'
import type { FactData } from './parse'

export default function FactWidget({ data }: WidgetViewProps<FactData>) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center">
            <span aria-hidden="true" className="text-2xl">
                💡
            </span>
            <p className="text-balance text-fg text-base leading-relaxed">
                {data.text}
            </p>
            {data.source &&
                (data.sourceUrl ? (
                    <a
                        href={data.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted text-xs hover:text-link hover:underline"
                    >
                        — {data.source}
                    </a>
                ) : (
                    <p className="text-muted text-xs">— {data.source}</p>
                ))}
        </div>
    )
}
