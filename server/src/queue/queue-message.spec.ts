import {
  InvalidQueueMessageError,
  deterministicKeyFor,
  parseQueueMessage,
  toJobPayload,
  toQueueMessage,
} from './queue-message';

const ID = '01920000-0000-7000-8000-000000000001';
const OUTBOX = '01920000-0000-7000-8000-000000000002';

describe('queue message contract', () => {
  it('carries only the job name and opaque identifiers', () => {
    expect(
      toQueueMessage('upload.completed', {
        uploadId: ID,
        outboxEventId: OUTBOX,
      }),
    ).toEqual({
      v: 1,
      jobName: 'upload.completed',
      id: ID,
      outboxEventId: OUTBOX,
    });
    expect(toQueueMessage('ingestion.run', { ingestionRunId: ID })).toEqual({
      v: 1,
      jobName: 'ingestion.run',
      id: ID,
    });
  });

  it('rejects a payload whose identifier does not belong to the job', () => {
    expect(() => toQueueMessage('export.requested', { uploadId: ID })).toThrow(
      InvalidQueueMessageError,
    );
    expect(() =>
      toQueueMessage('upload.completed', { uploadId: 'not-a-uuid' }),
    ).toThrow(InvalidQueueMessageError);
  });

  it('round-trips through the strict parser', () => {
    const message = toQueueMessage('export.requested', {
      exportRequestId: ID,
      outboxEventId: OUTBOX,
    });
    expect(parseQueueMessage(JSON.parse(JSON.stringify(message)))).toEqual(
      message,
    );
    expect(toJobPayload(message)).toEqual({
      exportRequestId: ID,
      outboxEventId: OUTBOX,
    });
    expect(deterministicKeyFor(message)).toBe(`export.requested:${ID}`);
  });

  it.each([
    ['null', null],
    ['array', [1]],
    ['string', 'upload.completed'],
    ['unknown version', { v: 2, jobName: 'upload.completed', id: ID }],
    ['unknown job', { v: 1, jobName: 'tenant.delete', id: ID }],
    [
      'uppercase id',
      {
        v: 1,
        jobName: 'upload.completed',
        id: '0192abcd-0000-7000-8000-00000000beef'.toUpperCase(),
      },
    ],
    [
      'extra authority key',
      { v: 1, jobName: 'upload.completed', id: ID, organizationId: ID },
    ],
    [
      'bad outbox id',
      { v: 1, jobName: 'upload.completed', id: ID, outboxEventId: 'x' },
    ],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseQueueMessage(raw)).toThrow(InvalidQueueMessageError);
  });
});
