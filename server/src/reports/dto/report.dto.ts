import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VALIDATION } from '@acres/shared';
import { trimValue } from '../../common/transform';

export class ReportInsightDto {
  @IsString()
  @Transform(trimValue)
  @MinLength(VALIDATION.report.insightHeading.minLength)
  @MaxLength(VALIDATION.report.insightHeading.maxLength)
  heading!: string;

  @IsString()
  @Transform(trimValue)
  @MinLength(VALIDATION.report.insightBody.minLength)
  @MaxLength(VALIDATION.report.insightBody.maxLength)
  body!: string;
}

export class ReportEvidenceDto {
  @IsOptional()
  @IsUUID()
  aggregateId?: string;

  @IsOptional()
  @IsUUID()
  dashboardViewId?: string;
}

export class CreateReportDto {
  @IsString()
  @Transform(trimValue)
  @MinLength(VALIDATION.report.title.minLength)
  @MaxLength(VALIDATION.report.title.maxLength)
  title!: string;

  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MaxLength(VALIDATION.report.summary.maxLength)
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReportInsightDto)
  insights?: ReportInsightDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ReportEvidenceDto)
  evidence?: ReportEvidenceDto[];
}

export class UpdateReportDto {
  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MinLength(VALIDATION.report.title.minLength)
  @MaxLength(VALIDATION.report.title.maxLength)
  title?: string;

  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MaxLength(VALIDATION.report.summary.maxLength)
  summary?: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  expectedVersion!: number;
}

export class UpdateRevisionDto {
  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MinLength(VALIDATION.report.title.minLength)
  @MaxLength(VALIDATION.report.title.maxLength)
  title?: string;

  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MaxLength(VALIDATION.report.summary.maxLength)
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReportInsightDto)
  insights?: ReportInsightDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ReportEvidenceDto)
  evidence?: ReportEvidenceDto[];

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  expectedVersion!: number;
}

export class CreateRevisionDto extends UpdateRevisionDto {}

export class CreateExportDto {
  @IsOptional()
  @IsUUID()
  reportId?: string;

  @IsOptional()
  @IsUUID()
  revisionId?: string;

  @IsIn(['csv', 'pdf'])
  format!: 'csv' | 'pdf';
}
