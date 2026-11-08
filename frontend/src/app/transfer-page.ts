import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AMOUNT_ERROR_LABELS, formatAmount, parseAmount } from './core/amount';
import { ApiService, TOKENS, Token, TransferOutcome, TransferRequest } from './core/api.service';
import { IdempotencyKeys } from './core/idempotency';
import { OperationDetail } from './operation-detail';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

@Component({
  selector: 'app-transfer-page',
  imports: [FormsModule, OperationDetail],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="tr-title">
      <h2 id="tr-title">Nouveau transfert</h2>
      <form (ngSubmit)="submit()" novalidate>
        <label for="from">Compte émetteur</label>
        <input id="from" name="from" type="text" autocomplete="off" spellcheck="false" placeholder="0x…"
               [ngModel]="from()" (ngModelChange)="from.set($event)" [attr.aria-invalid]="!!errors().from"
               [attr.aria-describedby]="errors().from ? 'from-err' : null" />
        @if (errors().from; as e) { <p class="field-error" id="from-err">{{ e }}</p> }

        <label for="to">Compte destinataire</label>
        <input id="to" name="to" type="text" autocomplete="off" spellcheck="false" placeholder="0x…"
               [ngModel]="to()" (ngModelChange)="to.set($event)" [attr.aria-invalid]="!!errors().to"
               [attr.aria-describedby]="errors().to ? 'to-err' : null" />
        @if (errors().to; as e) { <p class="field-error" id="to-err">{{ e }}</p> }

        <label for="token">Jeton</label>
        <select id="token" name="token" [ngModel]="token()" (ngModelChange)="token.set($event)">
          @for (t of tokens; track t) { <option [value]="t">{{ t }}</option> }
        </select>

        <label for="amount">Montant (6 décimales maximum)</label>
        <input id="amount" name="amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00"
               [ngModel]="amount()" (ngModelChange)="amount.set($event)" [attr.aria-invalid]="!!errors().amount"
               [attr.aria-describedby]="errors().amount ? 'amount-err' : null" />
        @if (errors().amount; as e) { <p class="field-error" id="amount-err">{{ e }}</p> }

        <button type="submit" [disabled]="pending()">{{ pending() ? 'Envoi…' : 'Envoyer le transfert' }}</button>
      </form>

      @if (feedback(); as f) {
        <div class="banner" [class]="'banner banner-' + f.level" [attr.role]="f.level === 'error' ? 'alert' : 'status'"
             data-testid="feedback">
          <strong>{{ f.title }}</strong>
          @if (f.detail) { <div>{{ f.detail }}</div> }
        </div>
      }
    </section>

    @if (operationId(); as id) {
      <app-operation-detail [operationId]="id" />
    }
  `,
})
export class TransferPage {
  private readonly api = inject(ApiService);
  private readonly keys = new IdempotencyKeys();

  protected readonly tokens = TOKENS;
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly token = signal<Token>('TCE');
  protected readonly amount = signal('');
  protected readonly pending = signal(false);
  protected readonly operationId = signal<string | null>(null);
  protected readonly feedback = signal<{ level: 'ok' | 'warn' | 'error'; title: string; detail?: string } | null>(null);
  private readonly showErrors = signal(false);

  protected readonly errors = computed(() => {
    const out: { from?: string; to?: string; amount?: string } = {};
    if (!this.showErrors()) return out;
    if (!ADDRESS_RE.test(this.from().trim())) out.from = 'Adresse invalide (0x + 40 caractères hexadécimaux).';
    if (!ADDRESS_RE.test(this.to().trim())) out.to = 'Adresse invalide (0x + 40 caractères hexadécimaux).';
    const a = parseAmount(this.amount());
    if (!a.ok) out.amount = AMOUNT_ERROR_LABELS[a.error];
    return out;
  });

  submit(): void {
    this.showErrors.set(true);
    if (Object.keys(this.errors()).length > 0) return;
    const parsed = parseAmount(this.amount());
    if (!parsed.ok) return;
    const body: TransferRequest = {
      from: this.from().trim(),
      to: this.to().trim(),
      token: this.token(),
      amount: parsed.value,
    };
    const key = this.keys.keyFor(body);
    this.pending.set(true);
    this.feedback.set(null);
    this.api.createTransfer(body, key).subscribe((o) => {
      this.pending.set(false);
      this.handle(o);
    });
  }

  private handle(o: TransferOutcome): void {
    if (o.kind === 'accepted' || o.kind === 'replay') {
      this.keys.settle();
      this.operationId.set(o.operation.operationId);
      this.feedback.set(
        o.kind === 'accepted'
          ? { level: 'ok', title: 'Transfert accepté', detail: 'Le suivi ci-dessous se met à jour automatiquement.' }
          : {
              level: 'warn',
              title: 'Opération déjà enregistrée',
              detail: 'Cette soumission avait déjà été reçue (rejeu) : aucune nouvelle opération créée.',
            },
      );
      return;
    }
    const p = o.problem;
    if (o.httpStatus === 409 && p?.code === 'INSUFFICIENT_AVAILABLE') {
      this.feedback.set({
        level: 'error',
        title: 'Solde disponible insuffisant',
        detail: `Disponible actuel : ${formatAmount(p.available)} ${this.token()}.`,
      });
    } else if (o.httpStatus === 409) {
      this.feedback.set({
        level: 'error',
        title: 'Conflit',
        detail: p?.code === 'IDEMPOTENCY_CONFLICT'
          ? "Cette clé d'idempotence a déjà été utilisée avec un contenu différent."
          : (p?.detail ?? p?.title),
      });
    } else if (o.httpStatus === 400) {
      this.feedback.set({ level: 'error', title: 'Requête invalide', detail: p?.detail ?? p?.title });
    } else if (o.httpStatus === 503) {
      this.feedback.set({
        level: 'warn',
        title: 'Service momentanément indisponible',
        detail: p?.detail ?? 'Vous pouvez réessayer : la même clé d’idempotence sera réutilisée, sans doublon.',
      });
    } else {
      this.feedback.set({
        level: 'error',
        title: o.httpStatus === 0 ? 'API injoignable' : `Erreur inattendue (HTTP ${o.httpStatus})`,
        detail: p?.detail ?? p?.title ?? 'Vous pouvez réessayer sans risque de doublon.',
      });
    }
  }
}
