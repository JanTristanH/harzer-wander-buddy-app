import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
    baseURL: "http://localhost:4004", // Base URL of your Better Auth backend.
    plugins: [
        expoClient({
            scheme: "hwb",
            storagePrefix: "hwb_auth_",
            storage: SecureStore,
        })
    ]
});