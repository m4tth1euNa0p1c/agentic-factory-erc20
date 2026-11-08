import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, switchMap, timer } from 'rxjs';
import { formatAmount } from './core/amount';
import { ApiService, Balance, Operation } from './core/api.service';
import { statusLabel, statusTone } from './core/status';
import { FreshnessBanner } from './freshness-banner';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TOKEN_ORDER = ['TCE', 'TCD', 'TIF'];

@Component({
  selector: 'app-account-page',
  imports: [FormsModule, RouterLink, DatePipe, FreshnessBanner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-freshness-banner />

    <section class="card" aria-labelledby="acc-title">
      <h2 id="acc-title">Compte</h2>
      <form (ngSubmit)="select()" novalidate>
        <label for="account">Adresse du compte</label>
        <input id="account" name="account" type="text" autocomplete="off" spellcheck="false" placeholder="0x…"
               [ngModel]="input()" (ngModelChange)="input.set($event)" [attr.aria-invalid]="!!inputError()"
               [attr.aria-describedby]="inputError() ? 'account-err' : null" />
        @if (inputError(); as e) { <p class="field-error" id="account-err">{{ e }}</p> }
        <button type="submit">Afficher</button>
      </form>
    </section>

    @if (account()) {
      <section class="card" aria-labelledby="bal-title">
        <h2 id="bal-title">Soldes</h2>
        @if (balancesError(); as e) {
          <p class="banner banner-error" role="alert">{{ e }}</p>
        } @else if (balances(); as bs) {
          <table data-testid="balances">
            <caption class="sr-only">Soldes par jeton</caption>
            <thead>
              <tr><th scope="col">Jeton</th><th scope="col">Indexé</th><th scope="col">En attente</th><th scope="col">Disponible</th></tr>
            </thead>
            <tbody>
              @for (b of bs; track b.token) {
                <tr [attr.data-token]="b.token">
                  <th scope="row">{{ b.token }}</th>
                  <td class="num">{{ fmt(b.indexed) }}</td>
                  <td class="num">{{ fmt(b.pending) }}</td>
                  <td class="num"><strong>{{ fmt(b.available) }}</strong></td>
                </tr>
              }
            </tbody>
          </table>
          <details>
            <summary>Diagnostic</summary>
            <p class="muted">Valeurs brutes (unités minimales) pour l'analyse ; ne pas utiliser comme solde réservable.</p>
            <table data-testid="diagnostic">
              <thead>
                <tr><th scope="col">Jeton</th><th scope="col">availableRaw</th><th scope="col">heldTotal</th><th scope="col">Bloc indexé</th></tr>
              </thead>
              <tbody>
                @for (b of bs; track b.token) {
                  <tr>
                    <th scope="row">{{ b.token }}</th>
                    <td class="num">{{ b.availableRaw }}</td>
                    <td class="num">{{ b.heldTotal }}</td>
                    <td class="num">{{ b.indexedAtBlock ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </details>
        } @else {
          <p class="muted" role="status">Chargement…</p>
        }
      </section>

      <section class="card" aria-labelledby="ops-title">
        <h2 id="ops-title">Opérations récentes</h2>
        <p><a [routerLink]="['/transfer']">Nouveau transfert</a></p>
        @if (opsError(); as e) {
          <p class="banner banner-error" role="alert">{{ e }}</p>
        } @else if (ops(); as os) {
          @if (os.length === 0) {
            <p class="muted">Aucune opération pour ce compte.</p>
          } @else {
            <table data-testid="operations">
              <caption class="sr-only">Opérations récentes</caption>
              <thead>
                <tr><th scope="col">Créée</th><th scope="col">Opération</th><th scope="col">Transfert</th><th scope="col">Statut</th></tr>
              </thead>
              <tbody>
                @for (o of os; track o.operationId) {
                  <tr>
                    <td><time [attr.datetime]="o.createdAt">{{ o.createdAt | date: 'yyyy-MM-dd HH:mm:ss' }}</time></td>
                    <td><a [routerLink]="['/operations', o.operationId]"><code>{{ o.operationId.slice(0, 8) }}…</code></a></td>
                    <td>{{ fmt(o.amount) }} {{ o.token }}</td>
                    <td><span [class]="'badge tone-' + tone(o)">{{ label(o) }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        }
      </section>
    }
  `,
})
export class AccountPage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly input = signal('');
  protected readonly inputError = signal<string | null>(null);
  protected readonly account = signal<string | null>(null);
  protected readonly balances = signal<Balance[] | null>(null);
  protected readonly balancesError = signal<string | null>(null);
  protected readonly ops = signal<Operation[] | null>(null);
  protected readonly opsError = signal<string | null>(null);

  constructor() {
    const q = this.route.snapshot.queryParamMap.get('account');
    if (q && ADDRESS_RE.test(q)) {
      this.input.set(q);
      this.account.set(q);
    }
    effect((onCleanup) => {
      const acc = this.account();
      this.balances.set(null);
      this.balancesError.set(null);
      this.ops.set(null);
      this.opsError.set(null);
      if (!acc) return;
      const sub = timer(0, 3000)
        .pipe(switchMap(() => forkJoin([this.api.getBalances(acc), this.api.listOperations(acc)])))
        .subscribe(([b, o]) => {
          if (b.ok) {
            this.balances.set([...b.data].sort((x, y) => TOKEN_ORDER.indexOf(x.token) - TOKEN_ORDER.indexOf(y.token)));
            this.balancesError.set(null);
          } else {
            // Pas de donnée périmée présentée comme actuelle.
            this.balances.set(null);
            this.balancesError.set(
              b.httpStatus === 503
                ? 'Modèle de lecture indisponible : soldes non affichés.'
                : 'API indisponible : soldes non affichés.',
            );
          }
          if (o.ok) {
            this.ops.set(o.data);
            this.opsError.set(null);
          } else {
            this.ops.set(null);
            this.opsError.set('API indisponible : liste des opérations non affichée.');
          }
        });
      onCleanup(() => sub.unsubscribe());
    });
  }

  select(): void {
    const v = this.input().trim();
    if (!ADDRESS_RE.test(v)) {
      this.inputError.set('Adresse invalide (0x + 40 caractères hexadécimaux).');
      return;
    }
    this.inputError.set(null);
    this.account.set(v);
    void this.router.navigate([], { queryParams: { account: v }, replaceUrl: true });
  }

  protected fmt = formatAmount;
  protected label = (o: Operation) => statusLabel(o.status);
  protected tone = (o: Operation) => statusTone(o.status);
}
