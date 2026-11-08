import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import type { components } from '../api/schema';

export type Operation = components['schemas']['Operation'];
export type Balance = components['schemas']['Balance'];
export type Transition = components['schemas']['Transition'];
export type IndexerStatus = components['schemas']['IndexerStatus'];
export type Problem = components['schemas']['Problem'];
export type TransferRequest = components['schemas']['TransferRequest'];
export type Token = components['schemas']['Token'];

export const TOKENS: readonly Token[] = ['TCE', 'TCD', 'TIF'];
export const API_BASE = '/api/v1';

export type TransferOutcome =
  | { kind: 'accepted'; operation: Operation }
  | { kind: 'replay'; operation: Operation }
  | { kind: 'error'; httpStatus: number; problem: Problem | null };

export type Loaded<T> = { ok: true; data: T } | { ok: false; httpStatus: number; problem: Problem | null };

function toProblem(e: HttpErrorResponse): Problem | null {
  const b = e.error as unknown;
  return b && typeof b === 'object' ? (b as Problem) : null;
}

/** Seul point d'accès réseau du navigateur : l'API TELA (chemin relatif). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  createTransfer(body: TransferRequest, idempotencyKey: string): Observable<TransferOutcome> {
    return this.http
      .post<Operation>(`${API_BASE}/transfers`, body, {
        headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
        observe: 'response',
      })
      .pipe(
        map((r): TransferOutcome => ({
          kind: r.status === 200 ? 'replay' : 'accepted',
          operation: r.body as Operation,
        })),
        catchError((e: HttpErrorResponse) =>
          of<TransferOutcome>({ kind: 'error', httpStatus: e.status, problem: toProblem(e) }),
        ),
      );
  }

  getOperation(id: string): Observable<Loaded<Operation>> {
    return this.load(this.http.get<Operation>(`${API_BASE}/operations/${encodeURIComponent(id)}`));
  }

  getTransitions(id: string): Observable<Loaded<Transition[]>> {
    return this.load(
      this.http.get<Transition[]>(`${API_BASE}/operations/${encodeURIComponent(id)}/transitions`),
    );
  }

  listOperations(account: string): Observable<Loaded<Operation[]>> {
    return this.load(
      this.http.get<Operation[]>(`${API_BASE}/operations`, { params: { account, limit: 20 } }),
    );
  }

  getBalances(address: string): Observable<Loaded<Balance[]>> {
    return this.load(
      this.http.get<Balance[]>(`${API_BASE}/accounts/${encodeURIComponent(address)}/balances`),
    );
  }

  getIndexerStatus(): Observable<Loaded<IndexerStatus>> {
    return this.load(this.http.get<IndexerStatus>(`${API_BASE}/system/indexer-status`));
  }

  private load<T>(src: Observable<T>): Observable<Loaded<T>> {
    return src.pipe(
      map((data): Loaded<T> => ({ ok: true, data })),
      catchError((e: HttpErrorResponse) =>
        of<Loaded<T>>({ ok: false, httpStatus: e.status, problem: toProblem(e) }),
      ),
    );
  }
}
