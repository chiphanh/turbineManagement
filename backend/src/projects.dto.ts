import { Type } from 'class-transformer';
import { ValidateIf, IsInt, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
export const STAGES = ['inspection', 'planning', 'installation', 'completed'] as const;
export class CreateProjectDto {
  @ValidateIf((_, v) => v !== undefined) @IsString() @MaxLength(10000) notes?: string;
  @IsString() @MaxLength(120) @Matches(/\S/) customerName!: string;
  @IsString() @MaxLength(300) @Matches(/\S/) address!: string;
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }) @Min(0.01) @Max(99999999.99) ratedPowerKw!: number;
  @IsOptional() @IsIn(STAGES) stage?: typeof STAGES[number];
}
export class UpdateProjectDto {
  @ValidateIf((_, v) => v !== undefined) @IsString() @MaxLength(10000) notes?: string;
  @IsOptional() @IsString() @MaxLength(120) @Matches(/\S/) customerName?: string;
  @IsOptional() @IsString() @MaxLength(300) @Matches(/\S/) address?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }) @Min(0.01) @Max(99999999.99) ratedPowerKw?: number;
  @IsOptional() @IsIn(STAGES) stage?: typeof STAGES[number];
}

export class ListProjectsDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(STAGES) stage?: typeof STAGES[number];
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
}
