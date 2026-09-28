/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** encrypted
*/

import { customType } from "drizzle-orm/pg-core" //allos to convert values on the way in and out of the database

import { encrypt, decrypt} from "../lib/crypto"


//what this does is that it will encrypt the data before it is stored in the database and decrypt it when it is retrieved from the database.
//this only works for text data, if you want to encrypt other types of data you will have to create a custom type for that as well.
export const encryptedText = customType<{data: string; driverData: string}>
({
    dataType: () => "text", //encure postgres column type is text
    toDriver: (v) => encrypt(v),
    fromDriver: (v) => decrypt(v)
})

//oooh, t is type assertion
export const encryptedJson = <T>(name: string) => customType<{data: T; driverData: string}>
({
    dataType: () => "text",
    toDriver: (v) => encrypt(JSON.stringify(v)),
    fromDriver: (v) => JSON.parse(decrypt(v)) as T
})(name) //name is the postgress column name