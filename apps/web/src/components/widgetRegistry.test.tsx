import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { makeInstance } from '../test/apiMock'
import {
    defineWidget,
    getWidgetEntry,
    type WidgetViewProps,
} from './widgetRegistry'
import AdviceWidget from './widgets/AdviceWidget'
import EchoWidget from './widgets/mock/echo/EchoWidget'
import StationMap from './widgets/radio-browser/station-map/StationMap'

describe('defineWidget', () => {
    type Greeting = { text: string }

    function GreetingWidget({ data, params }: WidgetViewProps<Greeting>) {
        return (
            <p>
                {data.text} / {String(params.who)}
            </p>
        )
    }

    const entry = defineWidget<Greeting>({
        component: GreetingWidget,
        parse: (raw) => {
            if (typeof raw !== 'string') throw new Error('not a greeting')
            return { text: raw.toUpperCase() }
        },
        defaultSize: { w: 6, h: 5 },
        minSize: { w: 4, h: 4 },
    })

    test('keeps the sizes', () => {
        expect(entry.defaultSize).toEqual({ w: 6, h: 5 })
        expect(entry.minSize).toEqual({ w: 4, h: 4 })
    })

    test('the component renders what parse produced', () => {
        const instance = makeInstance({ params: { who: 'you' } })
        const Component = entry.component
        render(
            <Component
                instance={instance}
                params={instance.params}
                data={entry.parse('hello')}
            />,
        )
        expect(screen.getByText('HELLO / you')).toBeInTheDocument()
    })

    test('parse throws on data of an unexpected shape', () => {
        expect(() => entry.parse(42)).toThrow('not a greeting')
    })
})

describe('getWidgetEntry', () => {
    test('an unknown widget gets the "not implemented" fallback', () => {
        const entry = getWidgetEntry('nope', 'nothing')
        if (!('legacy' in entry)) throw new Error('expected a legacy entry')
        const Fallback = entry.legacy
        render(
            <Fallback
                instanceId="x"
                params={{ limit: 5 }}
                refreshSeconds={60}
            />,
        )
        expect(
            screen.getByText('Widget not implemented yet'),
        ).toBeInTheDocument()
        expect(entry.defaultSize).toEqual({ w: 4, h: 3 })
    })

    test('the advice widget is registered as a legacy widget', () => {
        const entry = getWidgetEntry('advice_slip', 'random_advice')
        expect('legacy' in entry && entry.legacy).toBe(AdviceWidget)
    })

    test('mock/echo and mock_key/secret_echo share the new echo widget', () => {
        const echo = getWidgetEntry('mock', 'echo')
        const secret = getWidgetEntry('mock_key', 'secret_echo')
        expect(secret).toBe(echo)
        if ('legacy' in echo) throw new Error('expected a widget-base entry')
        expect(echo.component).toBe(EchoWidget)
        expect(echo.parse({ message: 'hi', count: 1 })).toEqual({
            message: 'hi',
            count: 1,
        })
        expect(() => echo.parse('nope')).toThrow()
    })

    test('the station map is registered 6 x 5, at least 4 x 4', () => {
        const entry = getWidgetEntry('radio_browser', 'station_map')
        if ('legacy' in entry) throw new Error('expected a widget-base entry')
        expect(entry.component).toBe(StationMap)
        expect(entry.defaultSize).toEqual({ w: 6, h: 5 })
        expect(entry.minSize).toEqual({ w: 4, h: 4 })
        expect(entry.parse({ stations: [] })).toEqual({ stations: [] })
        expect(() => entry.parse({ stations: 'many' })).toThrow()
    })

    test('every entry has a default size no smaller than its minimum', () => {
        for (const [service, widget] of [
            ['advice_slip', 'random_advice'],
            ['mock', 'echo'],
            ['mock_key', 'secret_echo'],
            ['radio_browser', 'station_map'],
            ['nope', 'nothing'],
        ]) {
            const { defaultSize, minSize } = getWidgetEntry(service, widget)
            expect(defaultSize.w).toBeGreaterThanOrEqual(minSize.w)
            expect(defaultSize.h).toBeGreaterThanOrEqual(minSize.h)
        }
    })
})
