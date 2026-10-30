// Explicit opt-in only: one real provider call with a procedural demo image.
import assert from 'node:assert/strict';
const base=process.env.BASE_URL??'http://frontend:3000';
if(process.env.CONFIRM_REAL_GENERATION!=='yes') throw new Error('Set CONFIRM_REAL_GENERATION=yes to authorize one billed demo generation');
const config=await(await fetch(base+'/api/generation/config')).json();
assert.equal(config.mode,'BAILIAN');
const session=await fetch(base+'/api/session',{method:'POST'});
const cookie=session.headers.get('set-cookie').split(';')[0];
const png=await(await fetch(base+'/api/templates/pet-cover/cover')).blob();
const form=new FormData();form.append('file',png,'synthetic-pet-demo.png');
const upload=await fetch(base+'/api/assets',{method:'POST',headers:{Cookie:cookie},body:form});assert.equal(upload.status,201);
const asset=await upload.json();
const created=await fetch(base+'/api/tasks',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({templateId:'pet-cover',assetIds:[asset.id]})});
assert.equal(created.status,202);const task=await created.json();assert.equal(task.generationMode,'BAILIAN');
console.log(`Real test accepted: task=${task.id}, model=${task.generationModel}`);
let previous='';
for(let i=0;i<180;i++){
 const r=await fetch(base+`/api/tasks/${task.id}`,{headers:{Cookie:cookie}});assert.equal(r.status,200);const state=(await r.json()).task;
 const step=state.status+':'+state.currentStage;if(step!==previous){console.log(step);previous=step;}
 if(state.status==='FAILED'){console.log(`FAILED ${state.errorCode}: ${state.errorMessage}`);process.exitCode=1;break;}
 if(state.status==='SUCCEEDED'){
   const output=await fetch(base+state.resultUrl,{headers:{Cookie:cookie}});assert.equal(output.status,200);
   const bytes=Buffer.from(await output.arrayBuffer());assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   console.log(`PASS real generation: PNG stored locally, ${bytes.length} bytes`);break;
 }
 if(i===179)throw new Error('Test observation timed out; inspect task before retrying');
 await new Promise(r=>setTimeout(r,2000));
}
