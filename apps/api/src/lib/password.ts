const HASH_OPTIONS = {
    algorithm: 'argon2id',
    memoryCost: 65536,
    timeCost: 3,
} as const

export function hashPassword(password: string): Promise<string> {
    return Bun.password.hash(password, HASH_OPTIONS)
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
    return Bun.password.verify(password, hash)
}

export const DUMMY_PASSWORD_HASH: string = await hashPassword(crypto.randomUUID())
