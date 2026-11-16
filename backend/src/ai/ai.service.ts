import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database.service';
import { ProjectsService } from '../projects.service';
import { candidateSlots, overlaps, validateWindow } from './scheduling';
import { TaskDto } from './ai.dto';
import { runCoordinator, ToolName } from './runner';
import { PromptVersion } from './prompts';

@Injectable()
export class AiService implements OnModuleInit {
 private active=new Set<string>();
 constructor(private readonly db:DatabaseService,private readonly projects:ProjectsService){}
 async onModuleInit(){
  // Single backend process: interrupted jobs are visible and can be resubmitted.
  await this.db.pool.query("UPDATE ai_tasks SET status='failed',error='Server restarted during this task. Please run it again.',finished_at=now() WHERE status IN ('queued','running')");
  await this.db.pool.query("UPDATE ai_eval_runs SET status='failed',finished_at=now() WHERE status='running'");
 }
 async projectOptions(){const found=await this.projects.list({page:1,pageSize:100});return found.data.map((p:any)=>({id:p.id,name:p.customerName,address:p.address}));}
 async list(){
  await this.db.pool.query("UPDATE ai_booking_proposals SET status='expired' WHERE status='pending' AND expires_at<=now()");
  await this.db.pool.query("UPDATE ai_tasks t SET status='completed' WHERE status='needs_approval' AND NOT EXISTS(SELECT 1 FROM ai_booking_proposals p WHERE p.task_id=t.id AND p.status='pending')");
  return (await this.db.pool.query('SELECT * FROM ai_tasks ORDER BY created_at DESC LIMIT 100')).rows;
 }
 async detail(id:string){
  const task=(await this.db.pool.query('SELECT * FROM ai_tasks WHERE id=$1',[id])).rows[0];
  if(!task)throw new NotFoundException('Task not found');
  await this.db.pool.query("UPDATE ai_booking_proposals SET status='expired' WHERE task_id=$1 AND status='pending' AND expires_at<=now()",[id]);
  const [messages,calls,proposals]=await Promise.all([
   this.db.pool.query('SELECT * FROM ai_messages WHERE task_id=$1 ORDER BY id',[id]),
   this.db.pool.query('SELECT * FROM ai_tool_calls WHERE task_id=$1 ORDER BY id',[id]),
   this.db.pool.query(`SELECT p.*,t.name AS team_name,pr.customer_name AS project_name FROM ai_booking_proposals p JOIN teams t ON t.id=p.team_id JOIN projects pr ON pr.id=p.project_id WHERE task_id=$1 ORDER BY created_at DESC`,[id]),
  ]);
  return {...task,messages:messages.rows,calls:calls.rows,proposals:proposals.rows};
 }
 async create(dto:TaskDto){
  if(!process.env.GROQ_API_KEY)throw new ServiceUnavailableException('Set GROQ_API_KEY in the backend .env to run AI tasks.');
  if(this.active.size>=2)throw new ConflictException('Two tasks are already running. Please wait.');
  const id=randomUUID();this.active.add(id);
  try {
   if(dto.projectId)await this.projects.get(dto.projectId);
   const task=(await this.db.pool.query('INSERT INTO ai_tasks(id,message,project_id,model,prompt_version) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,dto.message,dto.projectId??null,process.env.GROQ_MODEL??'openai/gpt-oss-20b',dto.promptVersion??'coordinator-v2'])).rows[0];
   this.start(task.id,dto.message);return task;
  } catch(e){this.active.delete(id);throw e;}
 }
 private start(id:string,message:string){this.active.add(id);void this.run(id,message).catch(()=>{}).finally(()=>this.active.delete(id));}
 async followup(id:string,message:string){
  if(!process.env.GROQ_API_KEY)throw new ServiceUnavailableException('Set GROQ_API_KEY');
  if(this.active.size>=2)throw new ConflictException('Please wait for running tasks');
  if(this.active.has(id))throw new ConflictException('This task is already running');
  this.active.add(id);
  const c=await this.db.pool.connect();
  try {
   await c.query('BEGIN');
   const row=(await c.query('SELECT status FROM ai_tasks WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!row)throw new NotFoundException('Task not found');
   if(['queued','running'].includes(row.status))throw new ConflictException('This task is already running');
   await c.query("UPDATE ai_tasks SET status='queued',error=NULL,finished_at=NULL WHERE id=$1",[id]);
   await c.query("UPDATE ai_booking_proposals SET status='rejected' WHERE task_id=$1 AND status='pending'",[id]);
   await c.query('COMMIT');this.start(id,message);return {id,status:'queued'};
  }catch(e){await c.query('ROLLBACK');this.active.delete(id);throw e;}finally{c.release();}
 }
 private async run(id:string,message:string){
  const began=Date.now();
  try{
   const task=await this.detail(id);
   await this.db.pool.query("UPDATE ai_tasks SET status='running' WHERE id=$1",[id]);
   await this.db.pool.query("INSERT INTO ai_messages(task_id,role,content) VALUES($1,'user',$2)",[id,message]);
   const offered=new Set<string>();
   const execute=async(name:ToolName,input:any)=>{
    const started=Date.now();
    const call=(await this.db.pool.query('INSERT INTO ai_tool_calls(task_id,name,input) VALUES($1,$2,$3) RETURNING id',[id,name,JSON.stringify(input)])).rows[0];
    try{
     let output:any;
     if(name==='searchProjects'){
      const found=await this.projects.list({search:input.search,page:1,pageSize:20});
      output={...found,data:found.data.map((p:any)=>({id:p.id,customerName:p.customerName,address:p.address,stage:p.stage,teamId:p.teamId,notes:p.notes.slice(0,1200)}))};
     }
     if(name==='getProject')output={...await this.projects.get(input.projectId),bookings:(await this.db.pool.query("SELECT * FROM bookings WHERE project_id=$1 AND status='scheduled'",[input.projectId])).rows};
     if(name==='findAvailableSlots'){
      output=await this.availability(input);
      const rejected=(await this.db.pool.query("SELECT project_id,team_id,starts_at,ends_at FROM ai_booking_proposals WHERE task_id=$1 AND status='rejected'",[id])).rows;
      const excluded=new Set(rejected.map((p:any)=>this.slotKey({projectId:p.project_id,teamId:p.team_id,startsAt:p.starts_at,endsAt:p.ends_at})));
      output.slots=output.slots.filter((slot:any)=>!excluded.has(this.slotKey(slot)));
      if(!output.slots.length)output.reason='No new available slots in this window. Ask about a wider or later date range.';
      for(const slot of output.slots)offered.add(this.slotKey(slot));
     }
     if(name==='proposeBooking'){
      if(!offered.has(this.slotKey(input)))throw new BadRequestException('Select a slot returned by findAvailableSlots in this request.');
      if((await this.db.pool.query("SELECT id FROM ai_booking_proposals WHERE task_id=$1 AND status='pending'",[id])).rows.length)throw new BadRequestException('A proposal already exists. Review it before requesting another.');
      // Recheck now; the database checks again at confirmation.
      await this.assertAvailable(input);
      output=(await this.db.pool.query('INSERT INTO ai_booking_proposals(task_id,project_id,team_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,input.projectId,input.teamId,input.startsAt,input.endsAt])).rows[0];
      output={...output,message:'Proposal only. No booking or assignment has been created. Confirm with the UI button.'};
     }
     await this.db.pool.query("UPDATE ai_tool_calls SET status='completed',output=$2,duration_ms=$3 WHERE id=$1",[call.id,JSON.stringify(output),Date.now()-started]);return output;
    }catch(error){
     const output={error:error instanceof Error?error.message:'Tool failed'};
     await this.db.pool.query("UPDATE ai_tool_calls SET status='failed',output=$2,duration_ms=$3 WHERE id=$1",[call.id,JSON.stringify(output),Date.now()-started]);return output;
    }
   };
   const history=task.messages.slice(-12).map((m:any)=>({role:m.role,content:m.content}));
   const result=await runCoordinator(message,task.prompt_version as PromptVersion,execute,task.project_id?`Selected project UUID: ${task.project_id}`:'',history);
   await this.db.pool.query("INSERT INTO ai_messages(task_id,role,content) VALUES($1,'assistant',$2)",[id,result.text]);
   const pending=(await this.db.pool.query("SELECT id FROM ai_booking_proposals WHERE task_id=$1 AND status='pending' AND expires_at>now()",[id])).rows.length>0;
   await this.db.pool.query('UPDATE ai_tasks SET status=$2,answer=$3,input_tokens=input_tokens+$4,output_tokens=output_tokens+$5,duration_ms=COALESCE(duration_ms,0)+$6,finished_at=now() WHERE id=$1',[id,pending?'needs_approval':'completed',result.text,result.usage.inputTokens??0,result.usage.outputTokens??0,Date.now()-began]);
  }catch(error){
   // Do not persist provider payloads, which may contain credentials or sensitive data.
   await this.db.pool.query("UPDATE ai_tasks SET status='failed',error=$2,duration_ms=COALESCE(duration_ms,0)+$3,finished_at=now() WHERE id=$1",[id,'AI request failed or timed out. Check the model, API key and Groq quota, then retry.',Date.now()-began]);
   await this.db.pool.query("UPDATE ai_booking_proposals SET status='rejected' WHERE task_id=$1 AND status='pending'",[id]);
  }
 }
 private slotKey(s:any){return [s.projectId,s.teamId,new Date(s.startsAt).toISOString(),new Date(s.endsAt).toISOString()].join('|');}
 async availability(input:{projectId:string;from:string;to:string;durationMinutes:number}){
  validateWindow(input.from,input.to,input.durationMinutes);
  const project=await this.projects.get(input.projectId);
  if(project.stage==='completed')return {slots:[],reason:'Project is completed'};
  const existing=await this.db.pool.query("SELECT id FROM bookings WHERE project_id=$1 AND status='scheduled'",[input.projectId]);
  if(existing.rows.length)return {slots:[],reason:'Project already has a scheduled booking'};
  const teams=(await this.db.pool.query('SELECT id,name FROM teams WHERE active AND ($1::uuid IS NULL OR id=$1) ORDER BY name',[project.teamId])).rows;
  const bookings=(await this.db.pool.query("SELECT team_id,starts_at,ends_at FROM bookings WHERE status='scheduled' AND starts_at<$2 AND ends_at>$1",[input.from,input.to])).rows;
  const slots:any[]=[];
  for(const s of candidateSlots(input.from,input.to,input.durationMinutes)){
   for(const t of teams){if(!bookings.some(b=>b.team_id===t.id&&overlaps(s,{startsAt:b.starts_at.toISOString(),endsAt:b.ends_at.toISOString()})))slots.push({...s,projectId:input.projectId,teamId:t.id,teamName:t.name});}
   if(slots.length>=12)break;
  }
  return {slots:slots.slice(0,12),timezone:'Europe/Berlin',durationMinutes:input.durationMinutes,reason:slots.length?undefined:'No available active team in this window'};
 }
 private async assertAvailable(s:any){
  validateWindow(s.startsAt,s.endsAt,(Date.parse(s.endsAt)-Date.parse(s.startsAt))/60000);
  const p=await this.projects.get(s.projectId);
  if(p.stage==='completed'||(p.teamId&&p.teamId!==s.teamId))throw new ConflictException('Project is completed or assigned to another team.');
  const team=await this.db.pool.query('SELECT id FROM teams WHERE id=$1 AND active',[s.teamId]);
  if(!team.rows.length)throw new ConflictException('Team is unavailable');
  const clash=await this.db.pool.query("SELECT id FROM bookings WHERE status='scheduled' AND (project_id=$1 OR (team_id=$2 AND starts_at<$4 AND ends_at>$3))",[s.projectId,s.teamId,s.startsAt,s.endsAt]);
  if(clash.rows.length)throw new ConflictException('Slot is no longer available');
 }
 async confirm(id:string){
  const c=await this.db.pool.connect();
  try{
   await c.query('BEGIN');
   const owner=(await c.query('SELECT task_id FROM ai_booking_proposals WHERE id=$1',[id])).rows[0];
   if(!owner)throw new NotFoundException('Proposal not found');
   const task=(await c.query('SELECT status FROM ai_tasks WHERE id=$1 FOR UPDATE',[owner.task_id])).rows[0];
   if(['queued','running'].includes(task.status))throw new ConflictException('Wait for the running task before confirming');
   const p=(await c.query('SELECT * FROM ai_booking_proposals WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!p)throw new NotFoundException('Proposal not found');
   if(p.status==='confirmed'){await c.query('COMMIT');return {bookingId:p.booking_id,status:'confirmed'};}
   if(p.status!=='pending')throw new ConflictException('Proposal is no longer pending');
   if(new Date(p.expires_at).getTime()<=Date.now()||new Date(p.starts_at).getTime()<=Date.now())throw new ConflictException('Proposal expired. Ask for a new slot.');
   const project=(await c.query('SELECT stage,team_id FROM projects WHERE id=$1 FOR UPDATE',[p.project_id])).rows[0];
   const team=(await c.query('SELECT active FROM teams WHERE id=$1 FOR UPDATE',[p.team_id])).rows[0];
   if(project.stage==='completed'||!team.active||(project.team_id&&project.team_id!==p.team_id))throw new ConflictException('Project or team changed. Ask for a new proposal.');
   // Same locking and database constraints as ordinary scheduling. Assignment is
   // committed atomically with the booking and never changed by the model.
   await c.query('UPDATE projects SET team_id=$2,updated_at=now() WHERE id=$1',[p.project_id,p.team_id]);
   const booking=(await c.query('INSERT INTO bookings(project_id,team_id,starts_at,ends_at) VALUES($1,$2,$3,$4) RETURNING id',[p.project_id,p.team_id,p.starts_at,p.ends_at])).rows[0];
   await c.query("UPDATE ai_booking_proposals SET status='confirmed',booking_id=$2 WHERE id=$1",[id,booking.id]);
   await c.query("UPDATE ai_tasks SET status='completed' WHERE id=$1",[p.task_id]);
   await c.query("INSERT INTO ai_messages(task_id,role,content) VALUES($1,'assistant',$2)",[p.task_id,`Booking confirmed. Booking ID: ${booking.id}`]);
   await c.query('COMMIT');return {bookingId:booking.id,status:'confirmed'};
  }catch(error){await c.query('ROLLBACK');if(['23P01','23505'].includes((error as any).code))throw new ConflictException('A conflicting booking exists. Ask for a new slot.');throw error;}finally{c.release();}
 }
 async reject(id:string){
  const p=(await this.db.pool.query("UPDATE ai_booking_proposals SET status='rejected' WHERE id=$1 AND status='pending' RETURNING task_id",[id])).rows[0];
  if(!p)throw new ConflictException('Proposal is no longer pending');
  await this.db.pool.query("UPDATE ai_tasks SET status='completed' WHERE id=$1 AND status='needs_approval'",[p.task_id]);return {status:'rejected'};
 }
}
