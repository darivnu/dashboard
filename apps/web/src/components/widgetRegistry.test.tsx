import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { makeInstance } from '../test/apiMock'
import {
    defineWidget,
    getWidgetEntry,
    type WidgetViewProps,
} from './widgetRegistry'
import AdviceWidget from './widgets/AdviceWidget'
import FreeGames from './widgets/epic-games/free-games/FreeGames'
import LetterboxdWidget from './widgets/LetterboxdWidget'
import EchoWidget from './widgets/mock/echo/EchoWidget'
import BoosterOpener from './widgets/pokemon-tcg/booster-opener/BoosterOpener'
import StationMap from './widgets/radio-browser/station-map/StationMap'
import RecentlyPlayed from './widgets/spotify/recently-played/RecentlyPlayed'

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

    test('the letterboxd widget is registered as a legacy widget', () => {
        const entry = getWidgetEntry('letterboxd', 'recent_films')
        expect('legacy' in entry && entry.legacy).toBe(LetterboxdWidget)
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

    test('the free games widget is registered 4 x 6, at least 3 x 4', () => {
        const entry = getWidgetEntry('epic_games', 'free_games')
        if ('legacy' in entry) throw new Error('expected a widget-base entry')
        expect(entry.component).toBe(FreeGames)
        expect(entry.defaultSize).toEqual({ w: 4, h: 6 })
        expect(entry.minSize).toEqual({ w: 3, h: 4 })
        expect(entry.parse({ current: [], upcoming: [] })).toEqual({
            current: [],
            upcoming: [],
        })
        expect(() => entry.parse({ current: 'none', upcoming: [] })).toThrow()
    })

    test('the booster opener is registered 6 x 7, at least 4 x 5', () => {
        const entry = getWidgetEntry('pokemon_tcg', 'booster_opener')
        if ('legacy' in entry) throw new Error('expected a widget-base entry')
        expect(entry.component).toBe(BoosterOpener)
        expect(entry.defaultSize).toEqual({ w: 6, h: 7 })
        expect(entry.minSize).toEqual({ w: 4, h: 5 })
        expect(entry.parse({ sets: [] })).toEqual({ sets: [] })
        expect(() => entry.parse({ sets: 'many' })).toThrow()
    })

    test('the spotify recently played widget is registered 4 x 5, at least 3 x 3', () => {
        const entry = getWidgetEntry('spotify', 'recently_played')
        if ('legacy' in entry) throw new Error('expected a widget-base entry')
        expect(entry.component).toBe(RecentlyPlayed)
        expect(entry.defaultSize).toEqual({ w: 4, h: 5 })
        expect(entry.minSize).toEqual({ w: 3, h: 3 })
        expect(entry.parse({ tracks: [] })).toEqual({ tracks: [] })
        expect(() => entry.parse({ tracks: 'many' })).toThrow()
    })

    test('every entry has a default size no smaller than its minimum', () => {
        for (const [service, widget] of [
            ['advice_slip', 'random_advice'],
            ['mock', 'echo'],
            ['mock_key', 'secret_echo'],
            ['radio_browser', 'station_map'],
            ['random_fox', 'random_fox'],
            ['nasa', 'apod'],
            ['epic_games', 'free_games'],
            ['pokemon_tcg', 'booster_opener'],
            ['spotify', 'recently_played'],
            ['nope', 'nothing'],
        ]) {
            const { defaultSize, minSize } = getWidgetEntry(service, widget)
            expect(defaultSize.w).toBeGreaterThanOrEqual(minSize.w)
            expect(defaultSize.h).toBeGreaterThanOrEqual(minSize.h)
        }
    })
})
