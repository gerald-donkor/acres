import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VALIDATION } from '@acres/shared';
import { trimValue } from '../../common/transform';

export class DashboardFiltersDto {
  @IsOptional()
  @IsUUID()
  metricId?: string;

  @IsOptional()
  @IsUUID()
  regionId?: string;

  @IsOptional()
  @IsUUID()
  datasetVersionId?: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{64}$/)
  dimensionHash?: string;

  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @IsOptional()
  @IsISO8601()
  periodEnd?: string;
}

export class DashboardPresentationDto {
  @IsOptional()
  @IsIn(['bar', 'line', 'table'])
  chart?: 'bar' | 'line' | 'table';

  @IsOptional()
  @IsIn(['region', 'period'])
  compareBy?: 'region' | 'period';
}

export class CreateDashboardViewDto {
  @IsString()
  @Transform(trimValue)
  @MinLength(VALIDATION.dashboardView.name.minLength)
  @MaxLength(VALIDATION.dashboardView.name.maxLength)
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MaxLength(VALIDATION.dashboardView.description.maxLength)
  description?: string;

  @ValidateNested()
  @IsObject()
  @Type(() => DashboardFiltersDto)
  filters!: DashboardFiltersDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DashboardPresentationDto)
  presentation?: DashboardPresentationDto;
}

export class UpdateDashboardViewDto {
  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MinLength(VALIDATION.dashboardView.name.minLength)
  @MaxLength(VALIDATION.dashboardView.name.maxLength)
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MaxLength(VALIDATION.dashboardView.description.maxLength)
  description?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DashboardFiltersDto)
  filters?: DashboardFiltersDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DashboardPresentationDto)
  presentation?: DashboardPresentationDto;
}
