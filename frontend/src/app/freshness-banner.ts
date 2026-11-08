import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { switchMap, timer } from 'rxjs';
import { ApiService, IndexerStatus } from './core/api.service';
import { evaluateFreshness } from './core/freshness';

/** Fraîcheur de l'indexation : dernier bloc indexé, âge, bandeaux retard / régression / indisponible. */
@Component({
  selector: 'app-freshness-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="freshness" aria-label="Fraîcheur de l'indexation" data-testid="freshness">
      @if (f().banner; as b) {
        <p class="banner" [class]="'banner banner-' + (f().level === 'late' ? 'warn' : 'error')" role="alert"
           data-testid="freshness-banner">{{ b }}</p>
      }
      @if (f().level !== 'unavailable') {
        <p class="muted">
          Dernier bloc indexé : <strong>{{ f().indexedBlock ?? '—' }}</strong>
          @if (f().ageSeconds !== null) { · âge {{ f().ageSeconds }} s }
        </p>
      }
    </section>
  `,
})
export class FreshnessBanner {
  private readonly api = inject(ApiService);
  private readonly status = signal<IndexerStatus | null>(null);
  private readonly unavailable = signal(false);
  private readonly now = signal(Date.now());

  protected readonly f = computed(() => evaluateFreshness(this.status(), this.unavailable(), this.now()));

  constructor() {
    const destroyRef = inject(DestroyRef);
    const tick = timer(1000, 1000).subscribe(() => this.now.set(Date.now()));
    const poll = timer(0, 2000)
      .pipe(switchMap(() => this.api.getIndexerStatus()))
      .subscribe((r) => {
        this.now.set(Date.now());
        if (r.ok) {
          this.status.set(r.data);
          this.unavailable.set(false);
        } else {
          // 503 (D-23) ou API injoignable : ne jamais présenter l'ancien état comme actuel.
          this.status.set(null);
          this.unavailable.set(true);
        }
      });
    destroyRef.onDestroy(() => {
      tick.unsubscribe();
      poll.unsubscribe();
    });
  }
}
