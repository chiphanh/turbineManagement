import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from './database.service';
import { AssignmentDto, BookingDto, CreateTeamDto, UpdateTeamDto } from './operations.dto';
export function validateInterval(start: string, end: string) {
 if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) throw new BadRequestException('End must be after start');
}
const BOOKING_COLUMNS=`id, project_id AS "projectId", team_id AS "teamId", starts_at AS "startsAt", ends_at AS "endsAt", status`;
@Injectable()
export class OperationsService {
 constructor(private readonly db: DatabaseService) {}
 private async transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client=await this.db.pool.connect();
  try { await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT'); return result; }
  catch(error) {
   await client.query('ROLLBACK');
   const code=(error as {code?:string}).code;
   if(code==='23P01') throw new ConflictException('This team has an overlapping installation');
   if(code==='23505') throw new ConflictException('Project already has a scheduled booking');
   throw error;
  } finally {client.release();}
 }
 async teams(){return (await this.db.pool.query('SELECT id,name,active FROM teams ORDER BY name,id')).rows;}
 async createTeam(dto:CreateTeamDto){return (await this.db.pool.query('INSERT INTO teams(name) VALUES($1) RETURNING id,name,active',[dto.name.trim()])).rows[0];}
 async updateTeam(id:string,dto:UpdateTeamDto){
  if(dto.name===undefined && dto.active===undefined) throw new BadRequestException('Provide a field to update');
  return this.transaction(async c=>{
   const team=await c.query('SELECT id FROM teams WHERE id=$1 FOR UPDATE',[id]);
   if(!team.rows.length) throw new NotFoundException('Team not found');
   if(dto.active===false && (await c.query("SELECT id FROM bookings WHERE team_id=$1 AND status='scheduled' LIMIT 1",[id])).rows.length) throw new ConflictException('Cancel scheduled bookings before deactivating this team');
   return (await c.query('UPDATE teams SET name=COALESCE($2,name), active=COALESCE($3,active) WHERE id=$1 RETURNING id,name,active',[id,dto.name?.trim()??null,dto.active??null])).rows[0];
  });
 }
 async assign(id:string,dto:AssignmentDto){return this.transaction(async c=>{
  const p=await c.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[id]);
  if(!p.rows.length) throw new NotFoundException('Project not found');
  if((await c.query("SELECT id FROM bookings WHERE project_id=$1 AND status='scheduled' LIMIT 1",[id])).rows.length) throw new ConflictException('Cancel the booking before changing assignment');
  if(dto.teamId!==null){
   const t=await c.query('SELECT active FROM teams WHERE id=$1 FOR UPDATE',[dto.teamId]);
   if(!t.rows.length) throw new NotFoundException('Team not found');
   if(!t.rows[0].active) throw new BadRequestException('Team is inactive');
  }
  return (await c.query('UPDATE projects SET team_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id,team_id AS "teamId"',[id,dto.teamId])).rows[0];
 });}
 async bookings(){return (await this.db.pool.query(`SELECT ${BOOKING_COLUMNS} FROM bookings ORDER BY starts_at,id`)).rows;}
 async schedule(dto:BookingDto){
  validateInterval(dto.startsAt,dto.endsAt);
  return this.transaction(async c=>{
   const p=await c.query('SELECT team_id FROM projects WHERE id=$1 FOR UPDATE',[dto.projectId]);
   if(!p.rows.length) throw new NotFoundException('Project not found');
   const t=await c.query('SELECT active FROM teams WHERE id=$1 FOR UPDATE',[dto.teamId]);
   if(!t.rows.length) throw new NotFoundException('Team not found');
   if(!t.rows[0].active) throw new BadRequestException('Team is inactive');
   if(p.rows[0].team_id!==dto.teamId) throw new BadRequestException('Assign this team to the project first');
   return (await c.query(`INSERT INTO bookings(project_id,team_id,starts_at,ends_at) VALUES($1,$2,$3,$4) RETURNING ${BOOKING_COLUMNS}`,[dto.projectId,dto.teamId,dto.startsAt,dto.endsAt])).rows[0];
  });
 }
 async cancel(id:string){
  const r=await this.db.pool.query(`UPDATE bookings SET status='cancelled' WHERE id=$1 RETURNING ${BOOKING_COLUMNS}`,[id]);
  if(!r.rows.length) throw new NotFoundException('Booking not found');return r.rows[0];
 }
}
