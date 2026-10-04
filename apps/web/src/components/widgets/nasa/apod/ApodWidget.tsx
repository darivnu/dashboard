/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** ApodWidget
 */

import { useState } from 'react'
import type { WidgetViewProps } from '../../../widgetRegistry'
import type { ApodData } from './parse'

export default function ApodWidget({ data }: WidgetViewProps<ApodData>) {
    const [showExplanation, setShowExplanation] = useState(false)

    return (
        <div className="flex flex-col gap-2">
            <h4 className="text-white font-semibold">{data.title}</h4>
            <p className="text-gray-300 text-sm">
                {new Date(data.date).toLocaleDateString()}
            </p>
            {data.media_type === 'image' ? (
                <img
                    src={data.hdurl}
                    alt={data.alt}
                    className="w-full rounded-lg object-cover"
                />
            ) : (
                <a
                    href={data.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 underline"
                >
                    Today's APOD is a video, watch it here
                </a>
            )}

            <button
                type="button"
                onClick={() => setShowExplanation(!showExplanation)}
                className="text-gray-400 hover:text-white text-sm self-start"
            >
                {showExplanation ? 'Hide explanation ▲' : 'Show explanation ▼'}
            </button>

            {showExplanation && (
                <p className="text-gray-300 text-sm">{data.explanation}</p>
            )}
        </div>
    )
}
