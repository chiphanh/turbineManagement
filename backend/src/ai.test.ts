import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { AiService } from './ai/ai.service';
import { ProjectsService } from './projects.service';
import { AiGuard } from './ai/ai.guard';
import { overlaps,candidateSlots,validateWindow } from './ai/scheduling';
import { runCoordinator } from './ai/runner';
const P='11111111-1111-4111-8111-111111111111',T='22222222-2222-4222-8222-222222222222';

test('availability handles adjacent intervals, weekends and DST',()=>{
 assert.equal(overlaps({startsAt:'2030-01-01T09:00Z',endsAt:'2030-01-01T10:00Z'},{startsAt:'2030-01-01T10:00Z',endsAt:'2030-01-01T11:00Z'}),false);
 assert.throws(()=>validateWindow('2030-01-01T09:00:00','2030-01-01T12:00:00Z',180,0));
 assert.throws(()=>validateWindow('2030-01-01T09:00Z','2030-03-01T12:00Z',180,0));
 const winter=candidateSlots('2030-01-07T00:00Z','2030-01-08T00:00Z',180);
 assert.equal(winter[0].startsAt,'2030-01-07T08:00:00.000Z');
 const summer=candidateSlots('2030-07-01T00:00Z','2030-07-02T00:00Z',180);
 assert.equal(summer[0].startsAt,'2030-07-01T07:00:00.000Z');
 assert.equal(candidateSlots('2030-01-05T00:00Z','2030-01-07T00:00Z',180).length,0);
});
test('workspace guard fails closed and accepts only the configured token',()=>{
 process.env.AI_WORKSPACE_TOKEN='x'.repeat(32);const guard=new AiGuard();
 const ctx=(value:string)=>({switchToHttp:()=>({getRequest:()=>({headers:{authorization:value}})})}) as any;
 assert.throws(()=>guard.canActivate(ctx('Bearer wrong')));
 assert.equal(guard.canActivate(ctx('Bearer '+'x'.repeat(32))),true);
 delete process.env.AI_WORKSPACE_TOKEN;assert.throws(()=>guard.canActivate(ctx('')));
});
test('SQL migrations, conflict rollback, confirmation and idempotency',async()=>{
 const pg=new PGlite({extensions:{btree_gist}});
 try{
  await pg.exec(readFileSync('schema.sql','utf8'));
  await pg.exec(readFileSync('migrations/002_features.sql','utf8'));
  await pg.exec(readFileSync('migrations/003_ai_operations.sql','utf8'));
  const client={query:(text:string,values?:any[])=>pg.query(text,values),release:()=>{}};
  const db={pool:{query:client.query,connect:async()=>client}} as any;
  const service=new AiService(db,new ProjectsService(db));
  await pg.query('INSERT INTO teams(id,name) VALUES($1,$2)',[T,'Test Team']);
  await pg.query('INSERT INTO projects(id,customer_name,address,rated_power_kw) VALUES($1,$2,$3,10)',[P,'Test project','Berlin']);
  const task=(await pg.query<any>("INSERT INTO ai_tasks(message,model,prompt_version,status) VALUES('test','fixture','coordinator-v2','needs_approval') RETURNING id")).rows[0].id;
  async function proposal(start:string,end:string){return (await pg.query<any>('INSERT INTO ai_booking_proposals(task_id,project_id,team_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5) RETURNING id',[task,P,T,start,end])).rows[0].id;}
  const id=await proposal('2030-01-07T09:00Z','2030-01-07T12:00Z');
  assert.equal((await pg.query<any>('SELECT count(*)::int AS n FROM bookings')).rows[0].n,0,'proposal must not book');
  const booking=await service.confirm(id);
  assert.equal((await service.confirm(id)).bookingId,booking.bookingId,'repeated confirmation is idempotent');
  assert.equal((await pg.query<any>('SELECT count(*)::int AS n FROM bookings')).rows[0].n,1);
  assert.equal((await pg.query<any>('SELECT team_id FROM projects WHERE id=$1',[P])).rows[0].team_id,T);
  const clash=await proposal('2030-01-07T10:00Z','2030-01-07T13:00Z');
  await assert.rejects(()=>service.confirm(clash),/conflicting booking/);
  assert.equal((await pg.query<any>('SELECT status FROM ai_booking_proposals WHERE id=$1',[clash])).rows[0].status,'pending','failure rolls back');
  await service.reject(clash);
  const expired=await proposal('2030-01-08T09:00Z','2030-01-08T12:00Z');
  await pg.query("UPDATE ai_booking_proposals SET expires_at=now()-interval '1 second' WHERE id=$1",[expired]);
  await assert.rejects(()=>service.confirm(expired),/expired/);
  const unavailable=await service.availability({projectId:P,from:'2030-01-07T08:00Z',to:'2030-01-08T17:00Z',durationMinutes:180});
  assert.equal(unavailable.slots.length,0);
  await service.onModuleInit();
 }finally{await pg.close();}
});
test('real SDK tool loop calls application function and returns a final answer using a mock Groq server',async()=>{
 let requestCount=0;
 const server=createServer(async(req,res)=>{
  let text='';for await(const part of req)text+=part;const body=JSON.parse(text);requestCount++;
  const hasTool=body.messages.some((m:any)=>m.role==='tool');
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({id:'mock',object:'chat.completion',created:1,model:'openai/gpt-oss-20b',choices:[{index:0,message:hasTool?{role:'assistant',content:'The project is in planning.'}:{role:'assistant',content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'getProject',arguments:JSON.stringify({projectId:P})}}]},finish_reason:hasTool?'stop':'tool_calls'}],usage:{prompt_tokens:50,completion_tokens:10,total_tokens:60}}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address() as any;process.env.GROQ_BASE_URL=`http://127.0.0.1:${address.port}/openai/v1`;process.env.GROQ_API_KEY='mock-key';
 try{
  const calls:string[]=[];const result=await runCoordinator('What is the project status?','coordinator-v2',async(name,input)=>{calls.push(name);assert.equal(input.projectId,P);return {stage:'planning'};});
  assert.deepEqual(calls,['getProject']);assert.match(result.text,/planning/);assert.equal(requestCount,2);
 }finally{delete process.env.GROQ_BASE_URL;delete process.env.GROQ_API_KEY;await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
