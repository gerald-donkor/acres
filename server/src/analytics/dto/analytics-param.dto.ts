import { IsUUID } from 'class-validator';

export class MetricParamDto {
  @IsUUID()
  metricId!: string;
}

export class AggregateParamDto {
  @IsUUID()
  aggregateId!: string;
}
