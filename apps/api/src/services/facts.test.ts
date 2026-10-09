import { describe, expect, test } from 'bun:test'
import { parseFact } from './definitions/facts'

describe('parseFact', () => {
    test('a well-formed body gives the clean fields', () => {
        expect(
            parseFact({
                id: '66c9546d229838f57824ad4b3c534220',
                text: 'Honey never spoils.',
                source: 'djtech.net',
                source_url: 'http://www.djtech.net/humor/useless_facts.htm',
                language: 'en',
                permalink: 'https://uselessfacts.jsph.pl/api/v2/facts/66c9',
            }),
        ).toEqual({
            text: 'Honey never spoils.',
            source: 'djtech.net',
            sourceUrl: 'http://www.djtech.net/humor/useless_facts.htm',
        })
    })

    test('a missing source and source_url become null', () => {
        expect(parseFact({ text: 'A fact with no attribution' })).toEqual({
            text: 'A fact with no attribution',
            source: null,
            sourceUrl: null,
        })
    })

    test.each([
        ['null', null],
        ['a string', 'hi'],
        ['a list', ['hi']],
        ['an object without text', { source: 'x' }],
        ['a text that is not a string', { text: 5 }],
    ])('throws on %s', (_name, raw) => {
        expect(() => parseFact(raw)).toThrow()
    })
})
