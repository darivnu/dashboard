/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** crypto
*/

import { randomBytes, createCipheriv, createDecipheriv, } from 'node:crypto'
import { env } from '../config/env'

//structure of the what we return is: v1.<iv>.<ciphertext>.<tag>
export function encryptWith(key: Buffer, plaintext: string): string
{
    const version = 'v1' //make sure to update this if we change the encryption algorithm or parameters in the future
    const iv = randomBytes(12) //generate new for every encryption
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    let encrypted = cipher.update(plaintext, 'utf8') //encrypt the plaintext

    encrypted = Buffer.concat([encrypted, cipher.final()]) //finalize the encryption
    const tag = cipher.getAuthTag().toString('base64') //get the authentication tag
    const return_value = `${version}.${iv.toString('base64')}.${encrypted.toString('base64')}.${tag}`
    return return_value
}

//the payload should be split in exactly 4 parts, otherwise it is invalid
//structure of the payload is: v1.<iv>.<ciphertext>.<tag>
export function decryptWith(key: Buffer, ciphertext: string): string
{
    //first we check that it can separate into 4 parts, otherwise it is invalid
    const parts = ciphertext.split('.')
    if (parts.length !== 4) {
        throw new Error(`Invalid ciphertext format, Shoudld be: v1.<iv>.<ciphertext>.<tag>`)
    }
    //then actual separate
    const [version, ivHex, encrypted, tag] = ciphertext.split('.') //

    //check starts with v1
    if (version !== 'v1') {
        throw new Error(`Invalid ciphertext version)`)
    }

    const iv = Buffer.from(ivHex, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    let decrypted = decipher.update(encrypted, 'base64', 'utf8') //decrypt the ciphertext
    decrypted += decipher.final('utf8') //finalize the decryption
    return decrypted
}

export const encrypt = (plaintext: string): string => encryptWith(env.masterKey, plaintext)
export const decrypt = (ciphertext: string): string => decryptWith(env.masterKey, ciphertext)