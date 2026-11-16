import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {auditProjectDesign,createProjectDesign,inspectProjectDesign,listDesignProfiles} from '../src/design-manager.js';

test('design profile catalog and create-only project DESIGN.md',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bridge-design-'));
 const old=process.env.BRIDGE_WRITE_ROOTS;
 process.env.BRIDGE_WRITE_ROOTS=temp;
 try{
  assert.ok(listDesignProfiles().some(p=>p.id==='vercel'));
  const first=await inspectProjectDesign(temp);
  assert.equal(first.exists,false);
  const created=await createProjectDesign(temp,'vercel');
  assert.equal(created.created,true);
  const read=await inspectProjectDesign(temp);
  assert.equal(read.exists,true);
  assert.match(read.markdown??'',/Preserve/);
  await assert.rejects(createProjectDesign(temp,'stripe'),{code:'EEXIST'});
  await fs.mkdir(path.join(temp,'src'));
  await fs.writeFile(path.join(temp,'src','Button.tsx'),'<button style={{width: "420px", color: "#fff"}}>Click</button>');
  const audit=await auditProjectDesign(temp);
  assert.equal(audit.filesScanned,1);
  assert.ok(audit.findings.some(f=>f.kind==='hardcoded-hex-colors'));
 }finally{
  if(old===undefined)delete process.env.BRIDGE_WRITE_ROOTS;else process.env.BRIDGE_WRITE_ROOTS=old;
  await fs.rm(temp,{recursive:true,force:true});
 }
});
