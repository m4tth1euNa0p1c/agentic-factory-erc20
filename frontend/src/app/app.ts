import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="top">
      <h1>TELA · Interface opérateur</h1>
      <nav aria-label="Navigation principale">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Compte</a>
        <a routerLink="/transfer" routerLinkActive="active">Nouveau transfert</a>
      </nav>
    </header>
    <main><router-outlet /></main>
  `,
})
export class App {}
