// Synthetic consumer for the isolated preview queue probe. Exposed by no
// rewrite; reachable only through its queue/v2beta trigger.
import { handleCallback } from '@vercel/queue';

const log = (event, message, metadata) =>
  console.log('ACRES_QUEUE_PROBE', JSON.stringify({
    event,
    probeId: message?.probeId,
    mode: message?.mode,
    messageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
    consumerGroup: metadata.consumerGroup,
    topic: metadata.topicName,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  }));

export const POST = handleCallback(
  async (message, metadata) => {
    log('delivered', message, metadata);
    if (message.mode === 'fail-once' && metadata.deliveryCount < 2) {
      throw new Error('probe induced failure');
    }
    if (message.mode === 'crash-once' && metadata.deliveryCount < 2) {
      // Simulates an instance lost mid-job: no ack, no thrown-error retry path.
      process.exit(1);
    }
    if (message.mode === 'always-fail') throw new Error('probe poison');
    log('acknowledged', message, metadata);
  },
  {
    visibilityTimeoutSeconds: 30,
    retry: (_error, metadata) =>
      metadata.deliveryCount >= 3 ? { acknowledge: true } : { afterSeconds: 5 },
  },
);
