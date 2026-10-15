// Synthetic producer for the isolated preview queue probe. Publishes only
// opaque probe IDs; never reads project secrets or customer data.
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { send } from '@vercel/queue';

const MODES = new Set(['ok', 'fail-once', 'crash-once', 'always-fail']);

const digest = (value) => createHash('sha256').update(value).digest();

// Fail closed: the production alias is public, so every publish needs the
// operator-held probe secret. Unset secret denies all requests.
function authorized(request) {
  const expected = process.env.ACRES_QUEUE_PROBE_SECRET;
  const supplied = request.headers.get('x-acres-probe-secret');
  if (!expected || expected.length < 32 || !supplied) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
}

export async function GET(request) {
  if (!authorized(request)) return new Response(null, { status: 404 });
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') ?? 'ok';
  if (!MODES.has(mode)) return Response.json({ error: 'mode' }, { status: 400 });
  const copies = Math.min(Number(url.searchParams.get('copies') ?? '1') || 1, 3);
  const probeId = url.searchParams.get('probeId') ?? randomUUID();
  const ids = [];
  for (let i = 0; i < copies; i += 1) {
    const { messageId } = await send(
      'acres-probe-jobs',
      { probeId, mode },
      { idempotencyKey: `probe:${probeId}`, retentionSeconds: 3600 },
    );
    ids.push(messageId);
  }
  console.log('ACRES_QUEUE_PROBE', JSON.stringify({ event: 'sent', probeId, mode, copies, deploymentId: process.env.VERCEL_DEPLOYMENT_ID }));
  return Response.json({ probeId, mode, messageIds: ids, deploymentId: process.env.VERCEL_DEPLOYMENT_ID });
}
