import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { CreateProjectDto } from './projects.dto';
import { ProjectsService } from './projects.service';
import { DatabaseService } from './database.service';
test('creation rejects blank names, negative power and unknown stage', async () => {
 const dto = Object.assign(new CreateProjectDto(), {customerName:' ',address:'Test',ratedPowerKw:-1,stage:'invalid'});
 const fields = (await validate(dto)).map(e=>e.property);
 assert.deepEqual(fields.sort(), ['customerName','ratedPowerKw','stage'].sort());
});
test('valid turbine input passes validation', async () => {
 const dto=Object.assign(new CreateProjectDto(),{customerName:'Anna',address:'Test',ratedPowerKw:15.5});
 assert.equal((await validate(dto)).length,0);
});
test('update parameterizes user text and reports missing rows', async () => {
 let recorded: {sql:string;values:unknown[]} | undefined;
 const db={pool:{query:async(sql:string,values:unknown[])=>{recorded={sql,values};return {rows:[]};}}} as unknown as DatabaseService;
 const service=new ProjectsService(db);
 await assert.rejects(service.update('id',{customerName:"O'Connor"}), /Project not found/);
 assert.ok(recorded);
 assert.equal(recorded.sql.includes("O'Connor"),false);
 assert.deepEqual(recorded.values,["O'Connor",'id']);
 await assert.rejects(service.update('id',{}), /at least one field/);
});

test('notes reject null and overlong input', async()=>{
 for(const notes of [null,'x'.repeat(10001)]) {
  const dto=Object.assign(new CreateProjectDto(),{customerName:'Anna',address:'Test',ratedPowerKw:15.5,notes});
  assert.ok((await validate(dto)).some(e=>e.property==='notes'));
 }
});
