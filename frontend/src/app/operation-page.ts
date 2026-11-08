import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { OperationDetail } from './operation-detail';

@Component({
  selector: 'app-operation-page',
  imports: [OperationDetail],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-operation-detail [operationId]="id()" />`,
})
export class OperationPage {
  private readonly route = inject(ActivatedRoute);
  private readonly param = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: '',
  });
  protected readonly id = computed(() => this.param());
}
