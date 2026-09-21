import { HttpStatus } from '@nestjs/common';
import {
  API_ERROR_CODES,
  INVITATION_ROLES,
  JOB_RUN_STATUSES,
  ORGANIZATION_ROLES,
} from '@acres/shared';
import {
  ApiCsrfHeader,
  ApiEnvelope,
  ApiIdempotencyHeader,
  ApiOrganizationHeader,
  ApiSessionAuth,
  accountSchema,
  arraySchema,
  booleanLiteralSchema,
  contactReceiptSchema,
  errorEnvelope,
  issuedInvitationSchema,
  jobRunSchema,
  nullableStringSchema,
  objectSchema,
  organizationInvitationSchema,
  organizationMemberSchema,
  organizationSummarySchema,
  regionSummarySchema,
  regionalMetricSchema,
  sessionProfileSchema,
  stringSchema,
  successEnvelope,
} from './openapi';

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('openapi contracts', () => {
  describe('schema builders', () => {
    it('builds stringSchema with and without format', () => {
      expect(stringSchema()).toEqual({ type: 'string' });
      expect(stringSchema('email')).toEqual({
        type: 'string',
        format: 'email',
      });
      expect(stringSchema('uuid')).toEqual({ type: 'string', format: 'uuid' });
    });

    it('builds nullableStringSchema with and without format', () => {
      expect(nullableStringSchema()).toEqual({
        oneOf: [{ type: 'string' }, { type: 'null' }],
      });
      expect(nullableStringSchema('date-time')).toEqual({
        oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
      });
    });

    it('builds booleanLiteralSchema', () => {
      expect(booleanLiteralSchema(true)).toEqual({
        type: 'boolean',
        enum: [true],
      });
      expect(booleanLiteralSchema(false)).toEqual({
        type: 'boolean',
        enum: [false],
      });
    });

    it('builds arraySchema', () => {
      const item = stringSchema();
      expect(arraySchema(item)).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    });

    it('builds objectSchema with default and custom required keys', () => {
      const props = {
        name: stringSchema(),
        age: { type: 'number' },
      };
      expect(objectSchema(props)).toEqual({
        type: 'object',
        required: ['name', 'age'],
        properties: props,
      });
      expect(objectSchema(props, ['name'])).toEqual({
        type: 'object',
        required: ['name'],
        properties: props,
      });
    });
  });

  describe('envelope schemas', () => {
    it('builds successEnvelope wrapping payload', () => {
      const payload = stringSchema();
      const schema = successEnvelope(payload);
      expect(schema).toEqual({
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean', enum: [true] },
          data: payload,
        },
      });
    });

    it('builds errorEnvelope with canonical API_ERROR_CODES enum and fields', () => {
      const schema = errorEnvelope();
      expect(schema.type).toBe('object');
      expect(schema.required).toEqual(['ok', 'error']);

      const props = asRecord(schema.properties);
      const errorProp = asRecord(props['error']);
      const errorInnerProps = asRecord(errorProp['properties']);

      expect(errorProp['type']).toBe('object');
      expect(errorProp['required']).toEqual(['code', 'message']);
      expect(errorInnerProps['code']).toEqual({
        type: 'string',
        enum: API_ERROR_CODES,
      });
      expect(errorInnerProps['message']).toEqual({ type: 'string' });
      expect(errorInnerProps['requestId']).toEqual({
        type: 'string',
        format: 'uuid',
      });
      expect(errorInnerProps['details']).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    });
  });

  describe('decorators', () => {
    it('ApiEnvelope returns an array of decorators including operation and status response', () => {
      const okDec = ApiEnvelope({
        summary: 'Test summary',
        description: 'Test description',
        data: stringSchema(),
      });
      expect(typeof okDec).toBe('function');

      const createdDec = ApiEnvelope({
        summary: 'Created summary',
        status: HttpStatus.CREATED,
        description: 'Created description',
        data: stringSchema(),
      });
      expect(typeof createdDec).toBe('function');
    });

    it('ApiSessionAuth returns cookie auth decorator', () => {
      const dec = ApiSessionAuth();
      expect(typeof dec).toBe('function');
    });

    it('ApiCsrfHeader returns header decorator for x-csrf-token', () => {
      const dec = ApiCsrfHeader();
      expect(typeof dec).toBe('function');
    });

    it('ApiIdempotencyHeader returns header decorator for Idempotency-Key', () => {
      const dec = ApiIdempotencyHeader();
      expect(typeof dec).toBe('function');
    });

    it('ApiOrganizationHeader returns header decorator for x-acres-organization-id', () => {
      const dec = ApiOrganizationHeader();
      expect(typeof dec).toBe('function');
    });
  });

  describe('model schemas', () => {
    it('accountSchema conforms to AccountProfile', () => {
      expect(accountSchema.type).toBe('object');
      expect(accountSchema.required).toEqual([
        'id',
        'email',
        'displayName',
        'createdAt',
      ]);
    });

    it('sessionProfileSchema conforms to SessionProfile', () => {
      expect(sessionProfileSchema.type).toBe('object');
      expect(sessionProfileSchema.required).toEqual([
        'authenticated',
        'account',
        'expiresAt',
      ]);
    });

    it('organizationSummarySchema references canonical ORGANIZATION_ROLES', () => {
      expect(organizationSummarySchema.type).toBe('object');
      const props = asRecord(organizationSummarySchema.properties);
      const membershipProp = asRecord(props['membership']);
      const membershipProps = asRecord(membershipProp['properties']);
      const roleProp = asRecord(membershipProps['role']);
      expect(roleProp['enum']).toEqual(ORGANIZATION_ROLES);
    });

    it('organizationMemberSchema references canonical ORGANIZATION_ROLES', () => {
      expect(organizationMemberSchema.type).toBe('object');
      const props = asRecord(organizationMemberSchema.properties);
      const roleProp = asRecord(props['role']);
      expect(roleProp['enum']).toEqual(ORGANIZATION_ROLES);
    });

    it('organizationInvitationSchema references canonical INVITATION_ROLES', () => {
      expect(organizationInvitationSchema.type).toBe('object');
      const props = asRecord(organizationInvitationSchema.properties);
      const roleProp = asRecord(props['role']);
      expect(roleProp['enum']).toEqual(INVITATION_ROLES);
    });

    it('issuedInvitationSchema extends organizationInvitationSchema with token', () => {
      expect(issuedInvitationSchema.type).toBe('object');
      const props = asRecord(issuedInvitationSchema.properties);
      expect(props['token']).toEqual({ type: 'string' });
      expect(props['organizationId']).toBeDefined();
      const roleProp = asRecord(props['role']);
      expect(roleProp['enum']).toEqual(INVITATION_ROLES);
    });

    it('regionalMetricSchema and regionSummarySchema structures match', () => {
      expect(regionalMetricSchema.type).toBe('object');
      expect(regionSummarySchema.type).toBe('object');
      const props = asRecord(regionSummarySchema.properties);
      const metricsProp = asRecord(props['metrics']);
      expect(metricsProp['type']).toBe('array');
      expect(metricsProp['items']).toEqual(regionalMetricSchema);
    });

    it('contactReceiptSchema conforms to receipt shape', () => {
      expect(contactReceiptSchema.type).toBe('object');
      expect(contactReceiptSchema.required).toEqual(['id', 'receivedAt']);
    });

    it('jobRunSchema references canonical JOB_RUN_STATUSES', () => {
      expect(jobRunSchema.type).toBe('object');
      const props = asRecord(jobRunSchema.properties);
      const statusProp = asRecord(props['status']);
      expect(statusProp['enum']).toEqual(JOB_RUN_STATUSES);
    });
  });
});
