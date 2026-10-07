import { describe, expect, test } from 'bun:test'
import { parseLetterboxdRss } from './definitions/letterboxd'

// Construye el XML de UN <item>, dejándote sobreescribir solo lo que importa
// en cada test (mismo truco que el stationRow, pero para XML).
function item(fields: Record<string, string> = {}): string {
    const f = {
        filmTitle: 'Behemoth!',
        filmYear: '2026',
        memberRating: '3.5',
        watchedDate: '2026-10-02',
        rewatch: 'No',
        link: 'https://letterboxd.com/u/film/behemoth/',
        poster: 'https://a.ltrbxd.com/poster.jpg',
        ...fields,
    }
    return `
    <item>
        <title>${f.filmTitle}, ${f.filmYear} - ★★★½</title>
        <link>${f.link}</link>
        <letterboxd:filmTitle>${f.filmTitle}</letterboxd:filmTitle>
        <letterboxd:filmYear>${f.filmYear}</letterboxd:filmYear>
        <letterboxd:memberRating>${f.memberRating}</letterboxd:memberRating>
        <letterboxd:watchedDate>${f.watchedDate}</letterboxd:watchedDate>
        <letterboxd:rewatch>${f.rewatch}</letterboxd:rewatch>
        <description>&lt;p&gt;&lt;img src="${f.poster}"/&gt;&lt;/p&gt;</description>
    </item>`
}

// Envuelve N items en el esqueleto RSS que tendría un feed real.
function feed(items: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
    <rss xmlns:letterboxd="https://letterboxd.com"><channel>${items}</channel></rss>`
}

describe('parseLetterboxdRss', () => {
    test('una peli bien formada da los campos limpios', () => {
        const [film] = parseLetterboxdRss(feed(item()), 10)

        expect(film).toEqual({
            film: 'Behemoth!',
            year: 2026,
            rating: 3.5,
            watchedDate: '2026-10-02',
            rewatch: false,
            poster: 'https://a.ltrbxd.com/poster.jpg',
            link: 'https://letterboxd.com/u/film/behemoth/',
        })
    })

    test('sin memberRating → rating es null (no 0)', () => {
        // omitimos el tag quitándolo del XML
        const xml = feed(item().replace(/<letterboxd:memberRating>.*<\/letterboxd:memberRating>/, ''))
        const [film] = parseLetterboxdRss(xml, 10)

        expect(film.rating).toBeNull()
    })

    test('rewatch "Yes" → true, "No" → false', () => {
        const xml = feed(item({ rewatch: 'Yes' }) + item({ rewatch: 'No' }))
        const films = parseLetterboxdRss(xml, 10)

        expect(films.map((f) => f.rewatch)).toEqual([true, false])
    })

    test('el póster se extrae del <img> dentro de description', () => {
        const xml = feed(item({ poster: 'https://a.ltrbxd.com/otra.jpg' }))
        const [film] = parseLetterboxdRss(xml, 10)

        expect(film.poster).toBe('https://a.ltrbxd.com/otra.jpg')
    })

    test('limit recorta la lista', () => {
        const xml = feed(item() + item() + item())
        expect(parseLetterboxdRss(xml, 2)).toHaveLength(2)
    })

    test('un solo <item> se normaliza a array (no peta)', () => {
        const films = parseLetterboxdRss(feed(item()), 10)
        expect(films).toHaveLength(1)
    })

    test('XML sin <channel> lanza error (feed inválido)', () => {
        expect(() => parseLetterboxdRss('<html>nope</html>', 10)).toThrow()
    })
})