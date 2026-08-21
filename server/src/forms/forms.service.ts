import { Injectable } from '@nestjs/common';
import {
  DEFAULT_CONTACT_SOURCE,
  type ContactSubmissionInput,
  type ContactSubmissionReceipt,
} from '@acres/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FormsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The receipt carries the id and the timestamp only. Echoing the submitted
   * message back would turn the endpoint into a reflector.
   */
  async recordContact(
    input: ContactSubmissionInput,
  ): Promise<ContactSubmissionReceipt> {
    const submission = await this.prisma.contactSubmission.create({
      data: {
        name: input.name,
        email: input.email,
        organization: input.organization ?? null,
        message: input.message,
        source: input.source ?? DEFAULT_CONTACT_SOURCE,
      },
      select: { id: true, createdAt: true },
    });

    return {
      id: submission.id,
      receivedAt: submission.createdAt.toISOString(),
    };
  }
}
