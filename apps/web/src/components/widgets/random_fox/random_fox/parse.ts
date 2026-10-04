/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** parse
 */

export type FoxData = {
    image: string
}

// The backend already checks the data, so this only gives it a type.
export function parseFox(raw: unknown): FoxData {
    return raw as FoxData
}
