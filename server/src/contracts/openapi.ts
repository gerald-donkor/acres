import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { API_ERROR_CODES } from '@acres/shared';

type Schema = Record<string, unknown>;

export const stringSchema = (format?: string): Schema => ({
  type: 'string',
  ...(format ? { format } : {}),
});

export const nullableStringSchema = (format?: string): Schema => ({
  oneOf: [stringSchema(format), { type: 'null' }],
});

export const booleanLiteralSchema = (value: boolean): Schema => ({
  type: 'boolean',
  enum: [value],
});

export const arraySchema = (items: Schema): Schema => ({
  type: 'array',
  items,
});

export const objectSchema = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({
  type: 'object',
  required,
  properties,
});

export const successEnvelope = (data: Schema): Schema =>
  objectSchema({
    ok: booleanLiteralSchema(true),
    data,
  });

export const errorEnvelope = (): Schema =>
  objectSchema({
    ok: booleanLiteralSchema(false),
    error: objectSchema(
      {
        code: { type: 'string', enum: API_ERROR_CODES },
        message: stringSchema(),
        requestId: stringSchema('uuid'),
        details: arraySchema(stringSchema()),
      },
      ['code', 'message'],
    ),
  });

export function ApiEnvelope(options: {
  summary: string;
  status?: HttpStatus.OK | HttpStatus.CREATED;
  description: string;
  data: Schema;
}) {
  const response =
    options.status === HttpStatus.CREATED ? ApiCreatedResponse : ApiOkResponse;
  return applyDecorators(
    ApiOperation({ summary: options.summary }),
    response({
      description: options.description,
      schema: successEnvelope(options.data),
    }),
    ApiBadRequestResponse({
      description: 'Validation, CSRF, idempotency or query-limit failure.',
      schema: errorEnvelope(),
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid authenticated session.',
      schema: errorEnvelope(),
    }),
    ApiForbiddenResponse({
      description: 'Authenticated account lacks the required permission.',
      schema: errorEnvelope(),
    }),
    ApiNotFoundResponse({
      description: 'The requested resource was not found in this scope.',
      schema: errorEnvelope(),
    }),
    ApiConflictResponse({
      description: 'Conflict, including idempotency key/body mismatch.',
      schema: errorEnvelope(),
    }),
    ApiTooManyRequestsResponse({
      description: 'Rate limit exceeded.',
      schema: errorEnvelope(),
    }),
  );
}

export function ApiSessionAuth() {
  return ApiCookieAuth('acres_session');
}

export function ApiCsrfHeader() {
  return ApiHeader({
    name: 'x-csrf-token',
    required: true,
    description: 'Session-bound CSRF token from /api/v1/auth/csrf.',
  });
}

export function ApiIdempotencyHeader() {
  return ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Printable 16-128 character replay key for safe retries.',
  });
}

export function ApiOrganizationHeader() {
  return ApiHeader({
    name: 'x-acres-organization-id',
    required: false,
    description:
      'Optional selected organization UUID. When present, it must match the organizationId path parameter.',
  });
}

export const accountSchema = objectSchema({
  id: stringSchema(),
  email: stringSchema('email'),
  displayName: nullableStringSchema(),
  createdAt: stringSchema('date-time'),
});

export const sessionProfileSchema = objectSchema({
  authenticated: { type: 'boolean' },
  account: { oneOf: [accountSchema, { type: 'null' }] },
  expiresAt: nullableStringSchema('date-time'),
});

export const organizationSummarySchema = objectSchema({
  id: stringSchema('uuid'),
  name: stringSchema(),
  createdAt: stringSchema('date-time'),
  updatedAt: stringSchema('date-time'),
  membership: objectSchema({
    id: stringSchema('uuid'),
    role: { type: 'string', enum: ['owner', 'admin', 'analyst', 'viewer'] },
  }),
});

export const organizationMemberSchema = objectSchema({
  id: stringSchema('uuid'),
  accountId: stringSchema(),
  email: stringSchema('email'),
  displayName: nullableStringSchema(),
  role: { type: 'string', enum: ['owner', 'admin', 'analyst', 'viewer'] },
  createdAt: stringSchema('date-time'),
  updatedAt: stringSchema('date-time'),
  revokedAt: nullableStringSchema('date-time'),
});

export const organizationInvitationSchema = objectSchema({
  id: stringSchema('uuid'),
  organizationId: stringSchema('uuid'),
  email: stringSchema('email'),
  role: { type: 'string', enum: ['admin', 'analyst', 'viewer'] },
  invitedByAccountId: stringSchema(),
  expiresAt: stringSchema('date-time'),
  createdAt: stringSchema('date-time'),
  acceptedAt: nullableStringSchema('date-time'),
  revokedAt: nullableStringSchema('date-time'),
});

export const issuedInvitationSchema = objectSchema({
  ...((organizationInvitationSchema.properties as Record<string, Schema>) ??
    {}),
  token: stringSchema(),
});

export const regionalMetricSchema = objectSchema({
  id: stringSchema(),
  regionId: stringSchema(),
  key: stringSchema(),
  label: stringSchema(),
  value: { type: 'number' },
  unit: nullableStringSchema(),
  periodStart: nullableStringSchema('date-time'),
  periodEnd: nullableStringSchema('date-time'),
  source: nullableStringSchema(),
});

export const regionSummarySchema = objectSchema({
  id: stringSchema(),
  slug: stringSchema(),
  name: stringSchema(),
  countryCode: nullableStringSchema(),
  summary: nullableStringSchema(),
  metrics: arraySchema(regionalMetricSchema),
});

export const contactReceiptSchema = objectSchema({
  id: stringSchema(),
  receivedAt: stringSchema('date-time'),
});

export const jobRunSchema = objectSchema({
  id: stringSchema(),
  jobName: stringSchema(),
  status: { type: 'string', enum: ['running', 'succeeded', 'failed'] },
  startedAt: stringSchema('date-time'),
  finishedAt: nullableStringSchema('date-time'),
  message: nullableStringSchema(),
});
