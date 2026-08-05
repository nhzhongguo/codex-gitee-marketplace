import { createHash, randomUUID } from "node:crypto";

export type PendingAction<T> = {
  action: string;
  expiresAt: number;
  payload: T;
  payloadHash: string;
};

export class ConfirmationStore {
  private readonly pending = new Map<string, PendingAction<unknown>>();

  public issue<T>(action: string, payload: T, ttlMs = 10 * 60 * 1000) {
    this.removeExpired();
    const token = randomUUID();
    const expiresAt = Date.now() + ttlMs;
    const payloadHash = hashPayload(payload);

    this.pending.set(token, { action, expiresAt, payload, payloadHash });
    return { token, expiresAt: new Date(expiresAt).toISOString(), payloadHash };
  }

  public consume<T>(token: string, action: string): PendingAction<T> {
    const pending = this.pending.get(token);
    this.pending.delete(token);

    if (!pending || pending.action !== action || pending.expiresAt < Date.now()) {
      throw new Error("The confirmation token is invalid, expired, or was already used. Run the preview again.");
    }

    return pending as PendingAction<T>;
  }

  private removeExpired() {
    const now = Date.now();
    for (const [token, action] of this.pending) {
      if (action.expiresAt < now) {
        this.pending.delete(token);
      }
    }
  }
}

export function hashPayload(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}
