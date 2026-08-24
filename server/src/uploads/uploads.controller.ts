import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { interval, from, type Observable } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';
import {
  ApiCsrfHeader,
  ApiEnvelope,
  ApiSessionAuth,
  objectSchema,
  stringSchema,
} from '../contracts/openapi';
import { CurrentOrganization } from '../organizations/current-organization.decorator';
import type { OrganizationContext } from '../organizations/organization-context';
import { OrganizationContextGuard } from '../organizations/organization-context.guard';
import { RequiresOrganizationPermission } from '../organizations/permissions';
import { PermissionGuard } from '../organizations/permission.guard';
import { SessionGuard } from '../sessions/session.guard';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { UploadsService, type UploadStatus } from './uploads.service';

const uploadStatusSchema = objectSchema({
  id: stringSchema(),
  state: stringSchema(),
  filename: stringSchema(),
  mediaType: stringSchema(),
});

@Controller({ path: 'uploads', version: '1' })
@UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
@RequiresOrganizationPermission('uploads.read')
@ApiTags('uploads')
@ApiSessionAuth()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @RequiresOrganizationPermission('uploads.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Initiate upload',
    status: HttpStatus.CREATED,
    description:
      'Creates an upload ledger row and returns a short-lived signed PUT URL.',
    data: objectSchema({
      uploadId: stringSchema(),
    }),
  })
  initiate(
    @CurrentOrganization() organization: OrganizationContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: InitiateUploadDto,
  ) {
    return this.uploads.initiate(organization, idempotencyKey, body);
  }

  @Post(':uploadId/complete')
  @RequiresOrganizationPermission('uploads.create')
  @HttpCode(HttpStatus.OK)
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Complete upload',
    description: 'Verifies object metadata and queues the scan worker.',
    data: uploadStatusSchema,
  })
  complete(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('uploadId') uploadId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CompleteUploadDto,
  ): Promise<UploadStatus> {
    return this.uploads.complete(organization, uploadId, idempotencyKey, body);
  }

  @Get(':uploadId')
  @ApiEnvelope({
    summary: 'Get upload status',
    description: 'Returns durable upload state and progress.',
    data: uploadStatusSchema,
  })
  get(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('uploadId') uploadId: string,
  ): Promise<UploadStatus> {
    return this.uploads.get(organization, uploadId);
  }

  @Delete(':uploadId')
  @RequiresOrganizationPermission('uploads.create')
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Cancel upload',
    description: 'Records cancellation for queued or in-flight upload work.',
    data: uploadStatusSchema,
  })
  cancel(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('uploadId') uploadId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<UploadStatus> {
    return this.uploads.cancel(organization, uploadId, idempotencyKey);
  }

  @Get(':uploadId/download')
  @ApiEnvelope({
    summary: 'Create accepted object download URL',
    description:
      'Returns a short-lived attachment download URL for accepted uploads.',
    data: objectSchema({ url: stringSchema(), method: stringSchema() }),
  })
  download(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('uploadId') uploadId: string,
  ) {
    return this.uploads.download(organization, uploadId);
  }

  @Sse(':uploadId/events')
  events(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('uploadId') uploadId: string,
  ): Observable<MessageEvent> {
    return interval(1500).pipe(
      switchMap(() => from(this.uploads.get(organization, uploadId))),
      takeWhile((status) => !terminal(status.state), true),
      switchMap((status) =>
        from([
          {
            type: 'upload.progress',
            id: `${status.id}:${status.progress.stage}:${status.progress.percent}`,
            data: status,
          } satisfies MessageEvent,
        ]),
      ),
    );
  }
}

function terminal(state: string): boolean {
  return ['accepted', 'rejected', 'cancelled', 'expired'].includes(state);
}
