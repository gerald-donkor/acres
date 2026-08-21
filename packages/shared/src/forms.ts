/** Lead / contact capture. */

export interface ContactSubmissionInput {
  name: string;
  email: string;
  organization?: string;
  message: string;
  /** Which surface produced the submission. Defaults to `landing`. */
  source?: string;
}

export interface ContactSubmissionReceipt {
  id: string;
  /** ISO 8601. */
  receivedAt: string;
}
