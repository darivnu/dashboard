/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** crypto
*/

import { randomUUID, randomBytes, createCipheriv, createDecipheriv, } from 'node:crypto'

//structure of the what we return is: v1.<iv>.<ciphertext>.<tag>
export function encryptWith(key: Buffer, plaintext: string): string
{
    const version = 'v1' //make sure to update this if we change the encryption algorithm or parameters in the future
    const iv = randomBytes(12) //generate new for every encryption
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    let encrypted = cipher.update(plaintext, 'utf8') //encrypt the plaintext

    encrypted = Buffer.concat([encrypted, cipher.final()]) //finalize the encryption
    const tag = cipher.getAuthTag().toString('hex')
    const return_value = `${version}.${iv.toString('hex')}.${encrypted.toString('hex')}.${tag}`
    return return_value
}

//the payload should be split in exactly 4 parts, otherwise it is invalid
//structure of the payload is: v1.<iv>.<ciphertext>.<tag>
export function decryptWith(key: Buffer, ciphertext: string): string
{
    const [version, ivHex, encrypted, tag] = ciphertext.split('.') //

    //check starts with v1
    if (version !== 'v1') {
        throw new Error(`Invalid ciphertext version: ${version}`)
    }

    const iv = Buffer.from(ivHex, 'hex')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(Buffer.from(tag, 'hex'))
    let decrypted = decipher.update(encrypted, 'hex', 'utf8') //decrypt the ciphertext
    decrypted += decipher.final('utf8') //finalize the decryption
    return decrypted
}