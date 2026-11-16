import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { SCENARIOS, evaluateScenario } from './evaluations';
import { PromptVersion } from './prompts';
@Injectable()
export class EvaluationService {
 private running=false;
 constructor(private readonly db:DatabaseService){}
 async list(){return (await this.db.pool.query('SELECT * FROM ai_eval_runs ORDER BY created_at DESC LIMIT 20')).rows;}
 async start(version:PromptVersion){
  if(!process.env.GROQ_API_KEY)throw new ServiceUnavailableException('Set GROQ_API_KEY to run evaluations');
  if(this.running)throw new ConflictException('An evaluation is already running');
  this.running=true;
  try{
   const row=(await this.db.pool.query('INSERT INTO ai_eval_runs(prompt_version,model) VALUES($1,$2) RETURNING *',[version,process.env.GROQ_MODEL??'openai/gpt-oss-20b'])).rows[0];
   void this.execute(row.id,version).catch(()=>{}).finally(()=>this.running=false);return row;
  }catch(e){this.running=false;throw e;}
 }
 private async execute(id:string,version:PromptVersion){
  const results:any[]=[];
  try{
   for(const scenario of SCENARIOS){
    try{results.push(await evaluateScenario(scenario,version));}
    catch{results.push({id:scenario.id,name:scenario.name,passed:false,error:'Model request failed or quota exhausted',reviewRequired:true});}
    await this.db.pool.query('UPDATE ai_eval_runs SET results=$2 WHERE id=$1',[id,JSON.stringify(results)]);
   }
   await this.db.pool.query("UPDATE ai_eval_runs SET status='completed',finished_at=now() WHERE id=$1",[id]);
  }catch{await this.db.pool.query("UPDATE ai_eval_runs SET status='failed',finished_at=now() WHERE id=$1",[id]);}
 }
}
