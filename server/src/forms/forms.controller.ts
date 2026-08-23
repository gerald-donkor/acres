import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { ContactSubmissionReceipt } from '@acres/shared';
import { StrictThrottle } from '../security/strict-throttle.decorator';
import { ContactSubmissionDto } from './dto/contact-submission.dto';
import { FormsService } from './forms.service';

@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Post('contact')
  @StrictThrottle()
  @HttpCode(HttpStatus.CREATED)
  contact(
    @Body() body: ContactSubmissionDto,
  ): Promise<ContactSubmissionReceipt> {
    return this.forms.recordContact(body);
  }
}
