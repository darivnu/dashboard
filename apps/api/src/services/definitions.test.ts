import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guards the contract every service file must follow: it only describes a
 * service. Registration is register.ts's job and the environment is
 * index.ts's job (by array membership), so neither may appear here.
 */
const definitionsDir = join(import.meta.dir, 'definitions')
const files = readdirSync(definitionsDir).filter((file) => file.endsWith('.ts'))

/** Source with block and line comments removed, so prose mentioning a call does not count. */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('services/definitions/', () => {
    test('contains the hand-written index and at least one service file', () => {
        expect(files).toContain('index.ts')
        expect(files.length).toBeGreaterThan(1)
        expect(files.some((file) => file.endsWith('.test.ts'))).toBe(false)
    })

    test.each(files)('%s neither registers itself nor reads the environment', (file) => {
        const code = stripComments(readFileSync(join(definitionsDir, file), 'utf8'))

        expect(code).not.toMatch(/registry\.register/)
        expect(code).not.toMatch(/from\s+['"][^'"]*registry['"]/)
        expect(code).not.toMatch(/NODE_ENV/)
        expect(code).not.toMatch(/process\.env/)
        expect(code).not.toMatch(/config\/env/)
    })
})
