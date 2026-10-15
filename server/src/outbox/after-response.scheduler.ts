import { waitUntil } from '@vercel/functions';

export const AFTER_RESPONSE_SCHEDULER = Symbol('AFTER_RESPONSE_SCHEDULER');

export interface AfterResponseScheduler {
  waitUntil(promise: Promise<unknown>): void;
}

export const defaultAfterResponseScheduler: AfterResponseScheduler = {
  waitUntil(promise: Promise<unknown>): void {
    waitUntil(promise);
  },
};
