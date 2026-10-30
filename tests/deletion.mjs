import assert from 'node:assert/strict';
const base=process.env.BASE_URL??'http://frontend:3000';
async function session(){const r=await fetch(base+'/api/session',{method:'POST'});return r.headers.get('set-cookie').split(';')[0];}
const cookie=await session(), other=await session();
async function req(path,data,who=cookie){return fetch(base+'/api'+path,{method:data?'POST':'GET',headers:{Cookie:who,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});}
const png=await(await req('/templates/travel-postcard/cover')).blob();
const form=new FormData(); form.append('file',png,'deletion.png');
const asset=await(await fetch(base+'/api/assets',{method:'POST',headers:{Cookie:cookie},body:form})).json();
async function create(delayMs,failAt='NONE'){return (await req('/tasks',{templateId:'travel-postcard',assetIds:[asset.id],simulation:{delayMs,failAt}})).json();}
const first=await create(400),second=await create(0,'GENERATE');
assert.equal((await req(`/tasks/${first.id}/delete`,{})).status,409);
assert.equal((await req(`/tasks/${first.id}/delete`,{},other)).status,404);
assert.equal((await req(`/tasks/${first.id}/delete`,{},'')).status,401);
for(let i=0;i<80;i++){const states=await Promise.all([first,second].map(async t=>(await(await req(`/tasks/${t.id}`)).json()).task.status)); if(states.every(s=>['SUCCEEDED','FAILED'].includes(s)))break;await new Promise(r=>setTimeout(r,100));}
assert.equal((await req(`/tasks/${first.id}/result`)).status,200);
assert.equal((await req(`/tasks/${first.id}/delete`,{})).status,200);
for(const suffix of ['', '/result']) assert.equal((await req(`/tasks/${first.id}${suffix}`)).status,404);
assert.equal((await req(`/tasks/${first.id}/delete`,{})).status,404);
const rows=await(await req('/tasks')).json();assert.deepEqual(rows.items.map(t=>t.id),[second.id]);
assert.equal((await req(`/assets/${asset.id}/content`)).status,200);
assert.equal((await req(`/tasks/${second.id}/delete`,{})).status,200);
assert.equal((await(await req('/tasks')).json()).items.length,0);
console.log('PASS deletion: terminal-only, ownership, hidden history/detail/result, repeat request, shared asset retained, failed task deletion');
