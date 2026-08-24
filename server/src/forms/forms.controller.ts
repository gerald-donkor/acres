import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ContactSubmissionReceipt } from '@acres/shared';
import {
  ApiCsrfHeader,
  ApiEnvelope,
  contactReceiptSchema,
} from '../contracts/openapi';
import { StrictThrottle } from '../security/strict-throttle.decorator';
import { ContactSubmissionDto } from './dto/contact-submission.dto';
import { FormsService } from './forms.service';

@Controller({ path: 'forms', version: '1' })
@ApiTags('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Post('contact')
  @StrictThrottle()
  @HttpCode(HttpStatus.CREATED)
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Submit contact form',
    status: HttpStatus.CREATED,
    description: 'Stores a public contact request and returns a receipt.',
    data: contactReceiptSchema,
  })
  contact(
    @Body() body: ContactSubmissionDto,
  ): Promise<ContactSubmissionReceipt> {
    return this.forms.recordContact(body);
  }
}
