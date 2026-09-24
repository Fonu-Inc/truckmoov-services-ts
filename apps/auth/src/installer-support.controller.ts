import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Portals, SignedIn } from '@shared/access';
import { InstallerSupportUseCases } from './contexts/installation/application/use-cases/installer-support.use-cases';
import { CreateInstallerTicketDto } from './dto/installer-portal.dto';
import { bearer, mapped, numeric, ok } from './installation-http';
import { SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_STATUSES } from './support-ticket.repository';

/** The installer's own tickets, read-only once raised. Another installer's ticket answers as a missing one. */
@ApiTags('Installer portal')
@ApiBearerAuth()
@Portals('installer')
@SignedIn()
@Controller('installer/support/tickets')
export class InstallerSupportController {
  constructor(@Inject(InstallerSupportUseCases) private readonly support: InstallerSupportUseCases) {}

  @Post()
  @ApiOperation({ summary: 'Raise a ticket with the installation desk' })
  async create(@Body() body: CreateInstallerTicketDto, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.support.create(bearer(authorization), body)), 'Ticket raised');
  }

  @Get()
  @ApiOperation({ summary: 'My tickets with counts: total, open, in progress, escalated, closed (resolved and closed)' })
  @ApiQuery({ name: 'status', required: false, enum: SUPPORT_TICKET_STATUSES })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'priority', required: false, enum: SUPPORT_TICKET_PRIORITIES })
  @ApiQuery({ name: 'search', required: false, description: 'Ticket id (#tkt-1000), title or description' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const query = { status, category, priority, search, page: numeric(page), limit: numeric(limit) };
    return ok(await mapped(() => this.support.list(bearer(authorization), query)));
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my tickets, read-only, with its related job and attachments' })
  async detail(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.support.detail(bearer(authorization), id)));
  }

  @Get(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'A short-lived download link for one attachment' })
  async attachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await mapped(() => this.support.attachmentLink(bearer(authorization), id, attachmentId)));
  }
}
