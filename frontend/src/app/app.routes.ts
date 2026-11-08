import { Routes } from '@angular/router';
import { AccountPage } from './account-page';
import { OperationPage } from './operation-page';
import { TransferPage } from './transfer-page';

export const routes: Routes = [
  { path: '', component: AccountPage, title: 'Compte · TELA' },
  { path: 'transfer', component: TransferPage, title: 'Nouveau transfert · TELA' },
  { path: 'operations/:id', component: OperationPage, title: 'Opération · TELA' },
  { path: '**', redirectTo: '' },
];
