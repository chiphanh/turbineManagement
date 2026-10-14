import { IsBoolean, IsISO8601, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
export class CreateTeamDto {
 @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
}
export class UpdateTeamDto {
 @ValidateIf((_,v)=>v!==undefined) @IsString() @Matches(/\S/) @MaxLength(120) name?: string;
 @ValidateIf((_,v)=>v!==undefined) @IsBoolean() active?: boolean;
}
export class AssignmentDto {
 @ValidateIf((_,v)=>v!==null) @IsUUID() teamId!: string | null;
}
export class BookingDto {
 @IsUUID() projectId!: string;
 @IsUUID() teamId!: string;
 @IsISO8601({strict:true}) @Matches(/(Z|[+-]\d{2}:\d{2})$/) startsAt!: string;
 @IsISO8601({strict:true}) @Matches(/(Z|[+-]\d{2}:\d{2})$/) endsAt!: string;
}
