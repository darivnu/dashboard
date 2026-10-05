import { describe, expect, test } from 'vitest'
import type { CatalogParam } from './types'
import { initialValues, validateParams } from './validateParams'

const message: CatalogParam = {
    name: 'message',
    label: 'Message',
    type: 'string',
    required: true,
}
const fail: CatalogParam = {
    name: 'fail',
    label: 'Force an error',
    type: 'string',
    required: false,
}
const limit: CatalogParam = {
    name: 'limit',
    label: 'How many stations to show on the map',
    type: 'integer',
    required: false,
    default: 200,
    min: 1,
    max: 500,
}
const count: CatalogParam = {
    name: 'count',
    label: 'Count',
    type: 'integer',
    required: true,
}

describe('validateParams', () => {
    test('accepts valid values and returns integers as numbers', () => {
        expect(
            validateParams([message, limit], { message: 'hi', limit: '50' }),
        ).toEqual({ ok: true, params: { message: 'hi', limit: 50 } })
    })

    test('trims surrounding spaces', () => {
        expect(
            validateParams([message, limit], {
                message: '  hi  ',
                limit: ' 50 ',
            }),
        ).toEqual({ ok: true, params: { message: 'hi', limit: 50 } })
    })

    test('a required field left empty is an error', () => {
        expect(validateParams([message], { message: '   ' })).toEqual({
            ok: false,
            errors: { message: 'This field is required.' },
        })
        expect(validateParams([count], {})).toEqual({
            ok: false,
            errors: { count: 'This field is required.' },
        })
    })

    test('an optional field left empty is left out, so the server uses its default', () => {
        expect(
            validateParams([message, fail, limit], {
                message: 'hi',
                fail: '',
                limit: '',
            }),
        ).toEqual({ ok: true, params: { message: 'hi' } })
    })

    test.each(['1.5', 'abc', '12abc', '1e3', '--3'])(
        'an integer field refuses "%s"',
        (text) => {
            expect(validateParams([limit], { limit: text })).toEqual({
                ok: false,
                errors: { limit: 'Enter a whole number.' },
            })
        },
    )

    test('an integer below min is an error', () => {
        expect(validateParams([limit], { limit: '0' })).toEqual({
            ok: false,
            errors: { limit: 'Must be at least 1.' },
        })
    })

    test('an integer above max is an error', () => {
        expect(validateParams([limit], { limit: '501' })).toEqual({
            ok: false,
            errors: { limit: 'Must be at most 500.' },
        })
    })

    test('min and max themselves are accepted', () => {
        expect(validateParams([limit], { limit: '1' })).toEqual({
            ok: true,
            params: { limit: 1 },
        })
        expect(validateParams([limit], { limit: '500' })).toEqual({
            ok: true,
            params: { limit: 500 },
        })
    })

    test('an integer without bounds accepts any whole number, negative too', () => {
        expect(validateParams([count], { count: '-7' })).toEqual({
            ok: true,
            params: { count: -7 },
        })
    })

    test('reports every invalid field at once', () => {
        expect(
            validateParams([message, limit, count], {
                message: '',
                limit: '900',
                count: 'x',
            }),
        ).toEqual({
            ok: false,
            errors: {
                message: 'This field is required.',
                limit: 'Must be at most 500.',
                count: 'Enter a whole number.',
            },
        })
    })

    test('ignores values that are not in the catalog', () => {
        expect(
            validateParams([message], { message: 'hi', other: 'x' }),
        ).toEqual({ ok: true, params: { message: 'hi' } })
    })
})

describe('initialValues', () => {
    test('a new widget starts from the catalog defaults, as text', () => {
        expect(initialValues([message, fail, limit])).toEqual({
            message: '',
            fail: '',
            limit: '200',
        })
    })

    test('an existing widget starts from its stored params', () => {
        expect(
            initialValues([message, fail, limit], { message: 'hi', limit: 50 }),
        ).toEqual({ message: 'hi', fail: '', limit: '50' })
    })
})
