import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BookingDto, AssignmentDto } from './operations.dto';
import { ListProjectsDto } from './projects.dto';
import { validateInterval } from './operations.service';
test('reversed and zero-duration bookings fail',()=>{
 assert.throws(()=>validateInterval('2026-10-12T10:00:00Z','2026-10-12T09:00:00Z'));
 assert.throws(()=>validateInterval('2026-10-12T10:00:00Z','2026-10-12T10:00:00Z'));
 assert.doesNotThrow(()=>validateInterval('2026-10-12T09:00:00Z','2026-10-12T10:00:00Z'));
});
test('booking timestamps require a timezone',async()=>{
 const dto=Object.assign(new BookingDto(),{projectId:'00000000-0000-4000-8000-000000000001',teamId:'00000000-0000-4000-8000-000000000002',startsAt:'2026-10-12T09:00:00',endsAt:'2026-10-12T10:00:00Z'});
 assert.ok((await validate(dto)).some(e=>e.property==='startsAt'));
});
test('pagination transforms numbers and rejects excessive sizes',async()=>{
 const good=plainToInstance(ListProjectsDto,{page:'2',pageSize:'10'});
 assert.equal((await validate(good)).length,0);assert.equal(good.page,2);
 const bad=plainToInstance(ListProjectsDto,{page:'0',pageSize:'101'});
 assert.equal((await validate(bad)).length,2);
});
test('assignment requires UUID or explicit null',async()=>{
 assert.equal((await validate(Object.assign(new AssignmentDto(),{teamId:null}))).length,0);
 assert.ok((await validate(new AssignmentDto())).length>0);
});
