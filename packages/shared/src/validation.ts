/**
 * Validation bounds both sides read.
 *
 * The server enforces them with `class-validator` decorators; a future client
 * form reads the same numbers so the two cannot drift.
 */

export const VALIDATION = {
  email: { maxLength: 254 },
  password: { minLength: 12, maxLength: 128 },
  displayName: { maxLength: 80 },
  organization: { name: { minLength: 1, maxLength: 160 } },
  dashboardView: {
    name: { minLength: 1, maxLength: 120 },
    description: { maxLength: 500 },
  },
  contact: {
    name: { minLength: 1, maxLength: 120 },
    organization: { maxLength: 160 },
    message: { minLength: 10, maxLength: 4000 },
    source: { maxLength: 64 },
  },
  region: { slug: { maxLength: 120 } },
} as const;

/** Default `source` recorded on a submission that does not name one. */
export const DEFAULT_CONTACT_SOURCE = 'landing';
