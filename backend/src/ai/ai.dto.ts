import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
export class TaskDto {
 @IsString() @Length(1,4000) @Matches(/\S/) message!: string;
 @IsOptional() @IsUUID() projectId?: string;
 @IsOptional() @IsIn(['coordinator-v1','coordinator-v2']) promptVersion?: 'coordinator-v1'|'coordinator-v2';
}
export class FollowupDto { @IsString() @Length(1,4000) @Matches(/\S/) message!:string; }
export class EvalDto { @IsIn(['coordinator-v1','coordinator-v2']) promptVersion!: 'coordinator-v1'|'coordinator-v2'; }
