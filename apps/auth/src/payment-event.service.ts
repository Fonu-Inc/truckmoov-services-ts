import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class PaymentEventService {
  private readonly subjects = new Map<string, Subject<{ data: unknown }>>();

  subscribe(tenantId: string): Observable<{ data: unknown }> {
    if (!this.subjects.has(tenantId)) {
      this.subjects.set(tenantId, new Subject());
    }
    return this.subjects.get(tenantId)!.asObservable();
  }

  emit(tenantId: string, event: unknown): void {
    const subject = this.subjects.get(tenantId);
    if (subject) {
      subject.next({ data: event });
      subject.complete();
      this.subjects.delete(tenantId);
    }
  }
}
