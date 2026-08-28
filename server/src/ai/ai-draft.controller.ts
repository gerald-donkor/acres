import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiCsrfHeader,
  ApiEnvelope,
  ApiIdempotencyHeader,
  ApiOrganizationHeader,
  ApiSessionAuth,
  arraySchema,
  objectSchema,
  stringSchema,
} from '../contracts/openapi';
import { CurrentOrganization } from '../organizations/current-organization.decorator';
import { OrganizationContextGuard } from '../organizations/organization-context.guard';
import type { OrganizationContext } from '../organizations/organization-context';
import { PermissionGuard } from '../organizations/permission.guard';
import { RequiresOrganizationPermission } from '../organizations/permissions';
import { SessionGuard } from '../sessions/session.guard';
import { AiService } from './ai.service';
import { CreateAiDraftDto } from './dto/ai-draft.dto';

const aiDraftProposalSchema = objectSchema({
  heading: stringSchema(),
  body: stringSchema(),
  citedEvidenceIds: arraySchema(stringSchema('uuid')),
});

const aiDraftMetadataSchema = objectSchema({
  generationId: stringSchema('uuid'),
  provider: stringSchema(),
  model: stringSchema(),
  promptTemplateVersion: stringSchema(),
  proposalCount: { type: 'number' },
  createdAt: stringSchema('date-time'),
});

const aiDraftResultSchema = objectSchema({
  proposals: arraySchema(aiDraftProposalSchema),
  metadata: aiDraftMetadataSchema,
});

@Controller({ version: '1' })
@UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
@ApiTags('reports')
@ApiSessionAuth()
@ApiOrganizationHeader()
export class AiDraftController {
  constructor(private readonly aiService: AiService) {}

  @Post('reports/:reportId/revisions/:revisionId/ai-drafts')
  @RequiresOrganizationPermission('reports.update')
  @HttpCode(HttpStatus.CREATED)
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Generate evidence-grounded AI report draft proposals',
    status: HttpStatus.CREATED,
    description:
      'Requests schema-constrained, evidence-cited draft insight proposals from the unpaid Gemini preview. Proposals cite only attached evidence and require explicit human review/editing before saving or publishing.',
    data: aiDraftResultSchema,
  })
  generateDrafts(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() body: CreateAiDraftDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.aiService.generateDraftProposals(
      organization,
      reportId,
      revisionId,
      body,
      idempotencyKey,
    );
  }
}
