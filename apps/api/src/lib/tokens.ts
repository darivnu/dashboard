const TOKEN_BYTES = 32

/** Random, URL-safe token to hand to the client. Never stored. */
export function generateToken(): string {
    const bytes = new Uint8Array(TOKEN_BYTES)
    crypto.getRandomValues(bytes)
    return Buffer.from(bytes).toString('base64url')
}

/** Deterministic digest of a token. This is what the database stores. */
export function hashToken(token: string): string {
    return new Bun.CryptoHasher('sha256').update(token).digest('hex')
}