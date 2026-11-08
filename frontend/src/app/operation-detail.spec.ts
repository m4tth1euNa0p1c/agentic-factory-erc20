import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OperationDetail } from './operation-detail';

const ID = '11111111-2222-4333-8444-555555555555';
const op = (status: string) => ({
  operationId: ID, type: 'TRANSFER', from: '0x' + 'a'.repeat(40), to: '0x' + 'b'.repeat(40), token: 'TCE',
  amount: '1500000', reference: '0x' + '0'.repeat(64), status, txHash: '0x' + 'c'.repeat(64), blockNumber: '12',
  createdAt: '2026-11-08T10:00:00Z', updatedAt: '2026-11-08T10:00:05Z',
});

async function setup() {
  await TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();
  const fixture = TestBed.createComponent(OperationDetail);
  fixture.componentRef.setInput('operationId', ID);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  await new Promise((r) => setTimeout(r, 20));
  return { fixture, http };
}

describe('OperationDetail', () => {
  it('shows only observed transitions and stops polling at SETTLED (D-14 path)', async () => {
    const { fixture, http } = await setup();
    http.expectOne(`/api/v1/operations/${ID}`).flush(op('SETTLED'));
    http.expectOne(`/api/v1/operations/${ID}/transitions`).flush([
      { from: null, to: 'RECEIVED', source: 'api', at: '2026-11-08T10:00:00Z' },
      { from: 'RECEIVED', to: 'PUBLISHED', source: 'outbox', at: '2026-11-08T10:00:01Z' },
      { from: 'PUBLISHED', to: 'SETTLED', source: 'indexer', at: '2026-11-08T10:00:05Z' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const items = Array.from(el.querySelectorAll('[data-testid=timeline] li')).map((li) => li.getAttribute('data-status'));
    expect(items).toEqual(['RECEIVED', 'PUBLISHED', 'SETTLED']);
    expect(el.querySelector('[data-testid=status-label]')?.textContent).toContain('Réglée');
    expect(el.querySelector('[data-testid=tx-hash]')?.textContent).toContain('0x' + 'c'.repeat(64));
    expect(el.querySelector('[data-testid=operation-id]')?.textContent).toBe(ID);
    await new Promise((r) => setTimeout(r, 1100));
    http.expectNone(`/api/v1/operations/${ID}`);
  });

  it('displays UNKNOWN as verification in progress, not as a failure, and keeps polling', async () => {
    const { fixture, http } = await setup();
    http.expectOne(`/api/v1/operations/${ID}`).flush(op('UNKNOWN'));
    http.expectOne(`/api/v1/operations/${ID}/transitions`).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Résultat en cours de vérification');
    expect(text).not.toContain('Échec');
    await new Promise((r) => setTimeout(r, 1100));
    http.expectOne(`/api/v1/operations/${ID}`).flush(op('UNKNOWN'));
    http.expectOne(`/api/v1/operations/${ID}/transitions`).flush([]);
  });
});
