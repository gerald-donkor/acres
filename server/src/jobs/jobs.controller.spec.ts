import { ForbiddenException } from '@nestjs/common';
import { JobsController } from './jobs.controller';

describe('JobsController', () => {
  it('denies global maintenance history without a persistence dependency', () => {
    const controller = new JobsController();

    expect(() => controller.listRuns()).toThrow(ForbiddenException);
    try {
      controller.listRuns();
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getStatus()).toBe(403);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        message: 'Global maintenance history is not available.',
      });
    }
  });
});
