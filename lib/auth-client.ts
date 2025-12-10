// lib/auth-client.ts
import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { storage } from "./storage";

export const authClient = createAuthClient({
  baseURL: "http://localhost:4004", // your Better Auth backend
  plugins: [
    expoClient({
      scheme: "hwb",
      storagePrefix: "hwb_auth_",
      storage,
    }),
  ],
});
