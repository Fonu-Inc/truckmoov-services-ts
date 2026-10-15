import { Inject, Injectable } from '@nestjs/common';
import { ListSystemSupportTicketsUseCase } from './list-system-support-tickets.use-case';
import { escapeCsvValue } from '@shared/csv';

@Injectable()
export class ExportSystemSupportTicketsUseCase {
  constructor(
    @Inject(ListSystemSupportTicketsUseCase)
    private readonly listUseCase: ListSystemSupportTicketsUseCase,
  ) {}

  async execute(
    accessToken: string,
    filters?: { status?: string; category?: string; search?: string },
  ) {
    const result = await this.listUseCase.execute(accessToken, filters);
    const tickets = result.data.tickets;
    const headers = [
      'id', 'tenantId', 'category', 'subject', 'status', 'priority',
      'contextType', 'escalatedTo', 'escalatedReferenceId', 'assignedTo',
      'createdBy', 'resolvedAt', 'closedAt', 'createdAt', 'updatedAt',
    ];
    const rows = tickets.map((t) => [
      t.id, t.tenantId, t.category, t.subject, t.status, t.priority,
      t.contextType, t.escalatedTo, t.escalatedReferenceId, t.assignedTo,
      t.createdBy, t.resolvedAt, t.closedAt, t.createdAt, t.updatedAt,
    ]);
    const csv = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return { filename: `support-tickets-${timestamp}.csv`, csv };
  }
}
