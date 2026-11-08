/** UUID v4 ; `crypto.randomUUID` n'existe pas hors contexte sécurisé, d'où le repli getRandomValues. */
export function newUuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Une clé par soumission : réutilisée tant que la charge utile est identique (nouvel essai après
 * 503/réseau, double clic), renouvelée si l'opérateur modifie le formulaire ou après un succès.
 */
export class IdempotencyKeys {
  private fingerprint: string | null = null;
  private key: string | null = null;

  keyFor(payload: object): string {
    const fp = JSON.stringify(payload);
    if (this.key === null || fp !== this.fingerprint) {
      this.key = newUuid();
      this.fingerprint = fp;
    }
    return this.key;
  }

  /** À appeler quand l'API a répondu 200/202 : la prochaine soumission est une nouvelle opération. */
  settle(): void {
    this.key = null;
    this.fingerprint = null;
  }
}
