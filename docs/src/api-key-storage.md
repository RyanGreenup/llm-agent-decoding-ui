# API Key Storage (To Implement)

Store user-provided OpenAI API keys **server-side**, encrypted at rest in a database. Never expose keys to the browser.

## Why Not localStorage

- Any JavaScript on the page can read it (XSS = full key exposure)
- No expiration — persists until explicitly cleared
- Readable by browser extensions
- The key must be sent to the client, exposing it in network responses

## Why Not In-Memory

- Lost on every server restart, redeploy, or crash
- Users must re-enter their key constantly
- Doesn't scale across multiple server instances

## Approach: Encrypted Database Storage

Encrypt keys with **AES-256-GCM** before persisting. The encryption secret lives in an environment variable, separate from the data.

```
User submits key → server encrypts with AES-256-GCM → stores in SQLite
Server function needs key → reads from DB → decrypts → calls LLM API
```

Compromise of the database alone doesn't expose keys (they're encrypted). Compromise of the env alone doesn't either (no data). Both are needed.

### Session Layer

Identify the user's session via a secure cookie set through SolidStart middleware:

```typescript
import { createMiddleware } from "@solidjs/start/middleware";
import { setCookie } from "vinxi/http";

export default createMiddleware({
  onRequest: (event) => {
    setCookie(event.nativeEvent, "session", sessionToken, {
      httpOnly: true,  // JS cannot read it
      secure: true,    // HTTPS only
      maxAge: 60 * 60 * 24, // 1 day
    });
  },
});
```

### Encryption Layer

Encrypt each API key with a unique IV before writing to the database:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENC_KEY = Buffer.from(process.env.API_KEY_ENCRYPTION_SECRET!, "hex"); // 32 bytes

export function encryptApiKey(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, iv, tag };
}

export function decryptApiKey(encrypted: Buffer, iv: Buffer, tag: Buffer) {
  const decipher = createDecipheriv(ALGORITHM, ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
```

### Data Flow

Server functions read the session cookie, look up the encrypted key in SQLite, decrypt it, and make the LLM API call. The key never leaves the server.

## Key Principles

- **Least privilege** — only server functions that call the LLM API access the decryption path
- **Never log keys** — avoid recording plaintext keys in logs or error messages
- **Rotate regularly** — prompt users to rotate keys every 30-90 days
