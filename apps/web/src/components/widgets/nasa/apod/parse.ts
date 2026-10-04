/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** parse
 */

export type ApodData = {
    title: string
    date: string | Date
    hdurl: string
    media_type: string
    permalink: string
    alt: string
    explanation: string
}

// The backend already checks the data, so this only gives it a type.
export function parseApod(raw: unknown): ApodData {
    return raw as ApodData
}
