import { beforeEach, describe, expect, test } from 'bun:test'
import { createTtlCache } from '../lib/cache'
import { createFakeRepo } from '../modules/dashboard/dashboard.fakes'
import { createDashboardService } from '../modules/dashboard/dashboard.service'
import { createDataService } from '../modules/dashboard/data.service'
import type { CachedWidgetData } from '../modules/dashboard/data.service'
import { registerServices } from './register'
import { __resetRegistryForTests } from './registry'
import type { HttpClient } from './types'
import { WidgetFetchError } from './types'

const ALICE = 'user-alice'

// Mismo truco que la capa A: un <item> con overrides, y el envoltorio RSS.
function item(fields: Record<string, string> = {}): string {
    const f = {
        filmTitle: 'Behemoth!', filmYear: '2026', memberRating: '3.5',
        watchedDate: '2026-10-02', rewatch: 'No',
        link: 'https://letterboxd.com/u/film/behemoth/',
        poster: 'https://a.ltrbxd.com/poster.jpg', ...fields,
    }
    return `<item>
        <link>${f.link}</link>
        <letterboxd:filmTitle>${f.filmTitle}</letterboxd:filmTitle>
        <letterboxd:filmYear>${f.filmYear}</letterboxd:filmYear>
        <letterboxd:memberRating>${f.memberRating}</letterboxd:memberRating>
        <letterboxd:watchedDate>${f.watchedDate}</letterboxd:watchedDate>
        <letterboxd:rewatch>${f.rewatch}</letterboxd:rewatch>
        <description>&lt;p&gt;&lt;img src="${f.poster}"/&gt;&lt;/p&gt;</description>
    </item>`
}
function feed(items: string): string {
    return `<?xml version="1.0"?><rss xmlns:letterboxd="https://letterboxd.com"><channel>${items}</channel></rss>`
}

// Stub del HttpClient: graba la URL pedida y responde por text() lo que le digas.
function createStubHttp() {
    const calls: URL[] = []
    let reply: (url: URL) => string = () => feed(item())

    const http: HttpClient = {
        async json<T>(): Promise<T> { throw new Error('letterboxd no usa json()') },
        async text(url: string): Promise<string> {
            calls.push(new URL(url))
            return reply(new URL(url))
        },
    }
    return { http, calls, replyWith(next: (url: URL) => string) { reply = next } }
}

let stub: ReturnType<typeof createStubHttp>
let dashboard: ReturnType<typeof createDashboardService>
let data: ReturnType<typeof createDataService>

beforeEach(() => {
    __resetRegistryForTests()
    registerServices('development')
    stub = createStubHttp()
    const repo = createFakeRepo()
    dashboard = createDashboardService(repo)
    data = createDataService({ repo, http: stub.http, cache: createTtlCache<CachedWidgetData>() })
})

async function fetchFilms(params: Record<string, unknown> = {}) {
    const instance = await dashboard.create(ALICE, {
        serviceId: 'letterboxd', widgetId: 'recent_films',
        params: { username: 'davidehrlich', ...params },
    })
    const result = await data.getInstanceData(ALICE, instance.id)
    if (!result.ok) throw new Error(`esperaba ok, salió code "${result.code}"`)
    return (result.data as { films: unknown[] }).films
}

describe('letterboxd / recent_films e2e', () => {
    test('pide el RSS del username y devuelve las pelis parseadas', async () => {
        stub.replyWith(() => feed(item({ filmTitle: 'Dune' })))

        const films = await fetchFilms({ username: 'davidehrlich' })

        // la URL pedida es la correcta
        expect(stub.calls[0]?.href).toBe('https://letterboxd.com/davidehrlich/rss/')
        // y el parseo llegó entero
        expect(films).toEqual([{
            film: 'Dune', year: 2026, rating: 3.5,
            watchedDate: '2026-10-02', rewatch: false,
            poster: 'https://a.ltrbxd.com/poster.jpg',
            link: 'https://letterboxd.com/u/film/behemoth/',
        }])
    })

    test('limit recorta la lista', async () => {
        stub.replyWith(() => feed(item() + item() + item()))
        expect(await fetchFilms({ limit: 2 })).toHaveLength(2)
    })

    test('un feed inválido (username inexistente) es invalid_config', async () => {
        stub.replyWith(() => '<html>Not found</html>')

        const instance = await dashboard.create(ALICE, {
            serviceId: 'letterboxd', widgetId: 'recent_films',
            params: { username: 'noexiste' },
        })
        expect(await data.getInstanceData(ALICE, instance.id)).toEqual({ ok: false, code: 'invalid_config' })
    })

    test('un 429 del upstream (rate_limited) se propaga', async () => {
        stub.replyWith(() => { throw new WidgetFetchError('rate_limited', '429') })

        const instance = await dashboard.create(ALICE, {
            serviceId: 'letterboxd', widgetId: 'recent_films',
            params: { username: 'davidehrlich' },
        })
        expect(await data.getInstanceData(ALICE, instance.id)).toEqual({ ok: false, code: 'rate_limited' })
    })

    test('una segunda petición dentro del ttl no vuelve a pedir el RSS', async () => {
        stub.replyWith(() => feed(item()))
        const instance = await dashboard.create(ALICE, {
            serviceId: 'letterboxd', widgetId: 'recent_films',
            params: { username: 'davidehrlich' },
        })
        await data.getInstanceData(ALICE, instance.id)
        await data.getInstanceData(ALICE, instance.id)
        expect(stub.calls).toHaveLength(1)   // solo una llamada real
    })
})