import { IsString, IsUUID, Length, Matches } from "class-validator";

export class AskProjectDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @Length(1, 2000)
  @Matches(/\S/)
  message!: string;
}
