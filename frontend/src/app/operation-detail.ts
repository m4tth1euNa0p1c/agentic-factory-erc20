import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { forkJoin, switchMap, takeWhile, timer } from 'rxjs';
import { formatAmount } from './core/amount';
import { ApiService, Operation, Transition } from './core/api.service';
import { isTerminal, statusLabel, statusTone } from './core/status';
import { buildTimeline } from './core/timeline';

export const POLL_INTERVAL_MS = 1000;

@Component({
  selector: 'app-operation-detail',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="op-title" data-testid="operation-detail">
      <h2 id="op-title">Opération</h2>
      @if (notFound()) {
        <p class="banner banner-error" role="alert">Opération introuvable.</p>
      } @else if (op(); as o) {
        @if (degraded()) {
          <p class="banner banner-warn" role="status">
            API momentanément indisponible : dernières données connues affichées, nouvelle tentative en cours.
          </p>
        }
        <p>
          <span class="badge" [class]="'badge tone-' + tone()" data-testid="status-label">{{ label() }}</span>
          @if (!terminal()) {
            <span class="muted"> mise à jour toutes les secondes…</span>
          }
        </p>
        @if (o.status === 'UNKNOWN') {
          <p class="muted">
            Le résultat de la transaction est en cours de vérification. Ce n'est pas un échec : le statut sera
            tranché automatiquement.
          </p>
        }
        <dl class="kv">
          <dt>Identifiant (operationId)</dt>
          <dd><code data-testid="operation-id">{{ o.operationId }}</code></dd>
          <dt>Statut technique</dt>
          <dd data-testid="status-code">{{ o.status }}</dd>
          <dt>Transfert</dt>
          <dd>{{ amount() }} {{ o.token }} de <code>{{ o.from }}</code> vers <code>{{ o.to }}</code></dd>
          <dt>Hash de transaction</dt>
          <dd data-testid="tx-hash">@if (o.txHash) {<code>{{ o.txHash }}</code>} @else {<span class="muted">pas encore connu</span>}</dd>
          <dt>Bloc</dt>
          <dd data-testid="block">{{ o.blockNumber ?? '—' }}</dd>
          @if (o.failureReason) {
            <dt>Motif</dt>
            <dd data-testid="failure-reason">{{ o.failureReason }}</dd>
          }
          <dt>Créée</dt>
          <dd><time [attr.datetime]="o.createdAt">{{ o.createdAt | date: 'yyyy-MM-dd HH:mm:ss' }}</time></dd>
          <dt>Dernière mise à jour</dt>
          <dd><time [attr.datetime]="o.updatedAt">{{ o.updatedAt | date: 'yyyy-MM-dd HH:mm:ss' }}</time></dd>
        </dl>
        <h3>Chronologie (transitions observées)</h3>
        @if (timeline().length === 0) {
          <p class="muted">Aucune transition enregistrée pour le moment.</p>
        } @else {
          <ol class="timeline" data-testid="timeline">
            @for (e of timeline(); track $index) {
              <li [attr.data-status]="e.status">
                <strong>{{ e.label }}</strong>
                <span class="muted"> · {{ e.status }} · source {{ e.source }}</span>
                <time [attr.datetime]="e.at"> {{ e.at | date: 'HH:mm:ss.SSS' }}</time>
              </li>
            }
          </ol>
        }
      } @else {
        <p class="muted" role="status">Chargement…</p>
      }
    </section>
  `,
})
export class OperationDetail {
  private readonly api = inject(ApiService);

  readonly operationId = input.required<string>();

  protected readonly op = signal<Operation | null>(null);
  private readonly transitions = signal<Transition[]>([]);
  protected readonly degraded = signal(false);
  protected readonly notFound = signal(false);

  protected readonly terminal = computed(() => {
    const o = this.op();
    return o !== null && isTerminal(o.status);
  });
  protected readonly label = computed(() => statusLabel(this.op()?.status ?? ''));
  protected readonly tone = computed(() => {
    const o = this.op();
    return o ? statusTone(o.status) : 'progress';
  });
  protected readonly amount = computed(() => formatAmount(this.op()?.amount));
  protected readonly timeline = computed(() => buildTimeline(this.transitions()));

  constructor() {
    effect((onCleanup) => {
      const id = this.operationId();
      this.op.set(null);
      this.transitions.set([]);
      this.degraded.set(false);
      this.notFound.set(false);
      const sub = timer(0, POLL_INTERVAL_MS)
        .pipe(
          switchMap(() => forkJoin([this.api.getOperation(id), this.api.getTransitions(id)])),
          takeWhile(([o]) => !(o.ok && isTerminal(o.data.status)), true),
          takeWhile(([o]) => o.ok || o.httpStatus !== 404, true),
        )
        .subscribe(([o, t]) => {
          if (!o.ok) {
            if (o.httpStatus === 404) this.notFound.set(true);
            else this.degraded.set(true);
            return;
          }
          this.degraded.set(false);
          this.op.set(o.data);
          if (t.ok) this.transitions.set(t.data);
        });
      onCleanup(() => sub.unsubscribe());
    });
  }
}
