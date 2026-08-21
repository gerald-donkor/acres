import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { ContactSubmissionReceipt } from '@acres/shared';
import { ContactSubmissionDto } from './dto/contact-submission.dto';
import { FormsService } from './forms.service';

@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Post('contact')
  @HttpCode(HttpStatus.CREATED)
  contact(
    @Body() body: ContactSubmissionDto,
  ): Promise<ContactSubmissionReceipt> {
    return this.forms.recordContact(body);
  }
}
