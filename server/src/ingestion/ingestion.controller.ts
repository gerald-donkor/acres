import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiCsrfHeader,
  ApiEnvelope,
  ApiIdempotencyHeader,
  ApiSessionAuth,
  arraySchema,
  nullableStringSchema,
  objectSchema,
  stringSchema,
} from '../contracts/openapi';
import { CurrentOrganization } from '../organizations/current-organization.decorator';
import type { OrganizationContext } from '../organizations/organization-context';
import { OrganizationContextGuard } from '../organizations/organization-context.guard';
import { PermissionGuard } from '../organizations/permission.guard';
import { RequiresOrganizationPermission } from '../organizations/permissions';
import { SessionGuard } from '../sessions/session.guard';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { CreateMappingDto } from './dto/create-mapping.dto';
import { StartIngestionRunDto } from './dto/start-ingestion-run.dto';
import { UpdateDatasetDto } from './dto/update-dataset.dto';
import { IngestionService } from './ingestion.service';

const mappingSchema = objectSchema({
  id: stringSchema('uuid'),
  datasetId: stringSchema('uuid'),
  uploadId: stringSchema('uuid'),
  versionNumber: { type: 'number' },
  validationStatus: stringSchema(),
  createdAt: stringSchema('date-time'),
});

const runSchema = objectSchema({
  id: stringSchema('uuid'),
  datasetId: stringSchema('uuid'),
  uploadId: stringSchema('uuid'),
  mappingId: stringSchema('uuid'),
  datasetVersionId: nullableStringSchema('uuid'),
  state: stringSchema(),
  stage: stringSchema(),
  progressPercent: { type: 'number' },
  failure: {
    oneOf: [
      objectSchema({
        code: stringSchema(),
        message: nullableStringSchema(),
      }),
      { type: 'null' },
    ],
  },
  createdAt: stringSchema('date-time'),
  startedAt: nullableStringSchema('date-time'),
  finishedAt: nullableStringSchema('date-time'),
});

const versionSchema = objectSchema({
  id: stringSchema('uuid'),
  versionNumber: { type: 'number' },
  publicationStatus: stringSchema(),
  publishedAt: stringSchema('date-time'),
  checksumHex: nullableStringSchema(),
  sourceSummary: { type: 'object', additionalProperties: true },
});

const datasetSchema = objectSchema({
  id: stringSchema('uuid'),
  name: stringSchema(),
  description: nullableStringSchema(),
  state: stringSchema(),
  createdAt: stringSchema('date-time'),
  updatedAt: stringSchema('date-time'),
  latestVersion: {
    oneOf: [versionSchema, { type: 'null' }],
  },
});

@Controller({ version: '1' })
@UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
@ApiTags('datasets')
@ApiSessionAuth()
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Get('datasets')
  @RequiresOrganizationPermission('datasets.read')
  @ApiEnvelope({
    summary: 'List datasets',
    description:
      'Lists organization datasets with their latest published version.',
    data: arraySchema(datasetSchema),
  })
  listDatasets(@CurrentOrganization() organization: OrganizationContext) {
    return this.ingestion.listDatasets(organization);
  }

  @Post('datasets')
  @RequiresOrganizationPermission('datasets.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Create dataset',
    status: HttpStatus.CREATED,
    description: 'Creates organization-owned dataset metadata.',
    data: datasetSchema,
  })
  createDataset(
    @CurrentOrganization() organization: OrganizationContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateDatasetDto,
  ) {
    return this.ingestion.createDataset(organization, idempotencyKey, body);
  }

  @Get('datasets/:datasetId')
  @RequiresOrganizationPermission('datasets.read')
  @ApiEnvelope({
    summary: 'Get dataset',
    description: 'Reads one organization dataset.',
    data: datasetSchema,
  })
  getDataset(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('datasetId') datasetId: string,
  ) {
    return this.ingestion.getDataset(organization, datasetId);
  }

  @Patch('datasets/:datasetId')
  @RequiresOrganizationPermission('datasets.update')
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Update dataset',
    description: 'Updates draft or active dataset metadata.',
    data: datasetSchema,
  })
  updateDataset(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('datasetId') datasetId: string,
    @Body() body: UpdateDatasetDto,
  ) {
    return this.ingestion.updateDataset(organization, datasetId, body);
  }

  @Get('datasets/:datasetId/versions')
  @RequiresOrganizationPermission('datasets.read')
  @ApiEnvelope({
    summary: 'List dataset versions',
    description: 'Lists immutable published dataset versions.',
    data: arraySchema(versionSchema),
  })
  listVersions(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('datasetId') datasetId: string,
  ) {
    return this.ingestion.listVersions(organization, datasetId);
  }

  @Post('datasets/:datasetId/mappings')
  @RequiresOrganizationPermission('ingestion.run')
  @HttpCode(HttpStatus.CREATED)
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Create column mapping',
    status: HttpStatus.CREATED,
    description: 'Records mapping metadata for an accepted upload.',
    data: mappingSchema,
  })
  createMapping(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('datasetId') datasetId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateMappingDto,
  ) {
    return this.ingestion.createMapping(
      organization,
      datasetId,
      idempotencyKey,
      body,
    );
  }

  @Post('datasets/:datasetId/ingestion-runs')
  @RequiresOrganizationPermission('ingestion.run')
  @HttpCode(HttpStatus.CREATED)
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Start ingestion run',
    status: HttpStatus.CREATED,
    description:
      'Queues parse, validation, and publication for an accepted upload.',
    data: runSchema,
  })
  startRun(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('datasetId') datasetId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: StartIngestionRunDto,
  ) {
    return this.ingestion.startRun(
      organization,
      datasetId,
      idempotencyKey,
      body,
    );
  }

  @Get('ingestion-runs/:runId')
  @RequiresOrganizationPermission('ingestion.read')
  @ApiEnvelope({
    summary: 'Get ingestion run',
    description: 'Reads durable ingestion run state.',
    data: runSchema,
  })
  getRun(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('runId') runId: string,
  ) {
    return this.ingestion.getRun(organization, runId);
  }

  @Get('ingestion-runs/:runId/issues')
  @RequiresOrganizationPermission('ingestion.read')
  @ApiEnvelope({
    summary: 'List ingestion issues',
    description: 'Lists bounded validation issues for an ingestion run.',
    data: arraySchema(
      objectSchema({
        id: stringSchema('uuid'),
        severity: stringSchema(),
        code: stringSchema(),
        message: stringSchema(),
      }),
    ),
  })
  listIssues(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('runId') runId: string,
  ) {
    return this.ingestion.listIssues(organization, runId);
  }

  @Delete('ingestion-runs/:runId')
  @RequiresOrganizationPermission('ingestion.cancel')
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Cancel ingestion run',
    description: 'Requests cancellation before publication.',
    data: runSchema,
  })
  cancelRun(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('runId') runId: string,
  ) {
    return this.ingestion.cancelRun(organization, runId);
  }
}
