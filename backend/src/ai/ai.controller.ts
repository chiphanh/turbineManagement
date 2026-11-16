import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiGuard } from './ai.guard';
import { TaskDto, FollowupDto, EvalDto } from './ai.dto';
import { EvaluationService } from './evaluation.service';
import { PROMPTS } from './prompts';
@Controller('agent')
@UseGuards(AiGuard)
export class AiController {
 constructor(private readonly ai:AiService,private readonly evaluations:EvaluationService){}
 @Get('config') config(){return {configured:!!process.env.GROQ_API_KEY,model:process.env.GROQ_MODEL??'openai/gpt-oss-20b',timezone:'Europe/Berlin',prompts:PROMPTS};}
 @Get('projects') projects(){return this.ai.projectOptions();}
 @Get('tasks') list(){return this.ai.list();}
 @Post('tasks') create(@Body() dto:TaskDto){return this.ai.create(dto);}
 @Get('tasks/:id') detail(@Param('id',new ParseUUIDPipe()) id:string){return this.ai.detail(id);}
 @Post('tasks/:id/messages') message(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:FollowupDto){return this.ai.followup(id,dto.message);}
 @Post('proposals/:id/confirm') confirm(@Param('id',new ParseUUIDPipe()) id:string){return this.ai.confirm(id);}
 @Post('proposals/:id/reject') reject(@Param('id',new ParseUUIDPipe()) id:string){return this.ai.reject(id);}
 @Get('evaluations') evals(){return this.evaluations.list();}
 @Post('evaluations') evaluate(@Body() dto:EvalDto){return this.evaluations.start(dto.promptVersion);}
}
