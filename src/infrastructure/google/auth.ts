import { JWT } from "google-auth-library";

import type { GoogleCredential } from "./config";

export function createGoogleAccessTokenProvider(
  credential: GoogleCredential,
  scopes: readonly string[],
): () => Promise<string> {
  const client = new JWT({
    email: credential.clientEmail,
    key: credential.privateKey,
    scopes: [...scopes],
  });
  return async () => {
    const result = await client.getAccessToken();
    if (!result.token) throw new Error("Google service account did not return an access token");
    return result.token;
  };
}
