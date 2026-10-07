/**
 * Tells TypeScript what `import ... from './pack-rules.json'` gives. Typed
 * `unknown` on purpose: rules.ts is the one place that says what is inside.
 */
declare module '*/pack-rules.json' {
    const file: unknown
    export default file
}
