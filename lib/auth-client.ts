// lib/auth-client.ts
import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { storage } from "./storage";

export const authClient = createAuthClient({
  baseURL: "https://scaling-umbrella-j757wwx9rj6c5g4v-4004.app.github.dev/", // your Better Auth backend
  plugins: [
    expoClient({
      scheme: "hwb",
      storagePrefix: "hwb_auth_",
      storage,
    }),
  ],
});
