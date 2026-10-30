import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base=process.env.BASE_URL??"http://frontend:3000";
async function client(){
  let cookie="";
  async function request(path,data,options={}) {
    const response=await fetch(`${base}/api${path}`,{method:data?"POST":"GET",...options,headers:{Cookie:cookie,...(data?{"Content-Type":"application/json"}:{}),...options.headers},body:data?JSON.stringify(data):options.body});
    if(response.ok&&response.headers.get("set-cookie"))cookie=response.headers.get("set-cookie").split(";")[0];
    return response;
  }
  await request("/session",{});return request;
}
async function expect(response,status){assert.equal(response.status,status,await response.clone().text());return response;}
const owner=await client(),other=await client();
assert.equal((await (await owner("/generation/config")).json()).mode,"SIMULATION","Run only in isolated empty-key test stack");
const publicTemplates=await (await owner("/templates")).json();assert.equal(publicTemplates.length,6);
for(const t of publicTemplates){
  assert.ok(t.coverCredit.author);assert.ok(t.coverCredit.source.startsWith("https://commons.wikimedia.org/"));
  const cover=await expect(await owner(`/templates/${t.id}/cover`),200);
  assert.equal(cover.headers.get("content-type"),"image/jpeg");
  const bytes=new Uint8Array(await cover.arrayBuffer());assert.deepEqual([...bytes.slice(0,3)],[255,216,255]);
}
const photo=await (await owner("/templates/travel-postcard/cover")).blob();
async function upload(person){const form=new FormData();form.append("file",photo,"cover.jpg");return (await expect(await person("/assets",null,{method:"POST",body:form}),201)).json();}
const ownAsset=await upload(owner),foreignAsset=await upload(other);
const input={title:"个人胶片模板",description:"自建模板集成验收",prompt:"保留照片主体，以暖色胶片风格制作双图拼贴。",requiredImageCount:2,coverAssetId:ownAsset.id};
await expect(await owner("/templates",input),403);
const credentials={email:`template-${randomUUID()}@example.test`,password:`Template-${randomUUID()}`,displayName:"模板验收"};
await expect(await owner("/auth/register",credentials),201);
for(const change of [{title:" "},{prompt:" "},{requiredImageCount:0},{requiredImageCount:3},{prompt:"字".repeat(1001)}])await expect(await owner("/templates",{...input,...change}),400);
await expect(await owner("/templates",{...input,coverAssetId:foreignAsset.id}),422);
await expect(await owner("/templates",input,{headers:{Origin:"https://untrusted.example"}}),403);
const template=await (await expect(await owner("/templates",input),201)).json();
assert.equal(template.custom,true);assert.equal(template.prompt,input.prompt);assert.equal(template.ownerId,undefined);
assert.equal((await (await owner("/templates")).json()).length,7);
assert.equal((await (await other("/templates")).json()).length,6);
assert.ok(!(await (await other("/categories")).json()).includes("我的模板"));
await expect(await other(`/templates/${template.id}`),404);
await expect(await other(template.coverUrl.replace("/api","")),404);
await expect(await fetch(`${base}/api/templates/${template.id}`),404);
await expect(await other("/tasks",{templateId:template.id,assetIds:[foreignAsset.id,foreignAsset.id]}),404);
const ownCover=await expect(await owner(template.coverUrl.replace("/api","")),200);
assert.deepEqual(new Uint8Array(await ownCover.arrayBuffer()),new Uint8Array(await photo.arrayBuffer()));
await expect(await owner("/tasks",{templateId:template.id,assetIds:[ownAsset.id]}),422);
const secondAsset=await upload(owner);
const task=await (await expect(await owner("/tasks",{templateId:template.id,assetIds:[ownAsset.id,secondAsset.id],simulation:{delayMs:0}}),202)).json();
let finished;
for(let i=0;i<60;i++){finished=await (await owner(`/tasks/${task.id}`)).json();if(["SUCCEEDED","FAILED"].includes(finished.task.status))break;await new Promise(r=>setTimeout(r,200));}
assert.equal(finished.task.status,"SUCCEEDED");await expect(await owner(`/tasks/${task.id}/result`),200);
await expect(await owner("/auth/logout",{}),200);await expect(await owner(`/templates/${template.id}`),404);
await expect(await owner("/auth/login",credentials),200);assert.equal((await (await owner(`/templates/${template.id}`)).json()).prompt,input.prompt);
console.log("PASS: 6 local covers + credits; registered creation; field validation; cover ownership; private list/detail/cover/task; custom double-image generation; account persistence");

await expect(await other(`/templates/${template.id}/delete`,{}),403);
await expect(await other("/auth/register",{email:`other-template-${randomUUID()}@example.test`,password:`Template-${randomUUID()}`,displayName:"其他模板账户"}),201);
await expect(await other(`/templates/${template.id}/delete`,{}),404);
await expect(await owner("/templates/travel-postcard/delete",{}),404);
await expect(await owner(`/templates/${template.id}/delete`,{},{headers:{Origin:"https://untrusted.example"}}),403);
const running=await (await expect(await owner("/tasks",{templateId:template.id,assetIds:[ownAsset.id,secondAsset.id],simulation:{delayMs:1000}}),202)).json();
await expect(await owner(`/templates/${template.id}/delete`,{}),200);
await expect(await owner(`/templates/${template.id}/delete`,{}),404);
assert.equal((await (await owner("/templates")).json()).length,6);
await expect(await owner(`/templates/${template.id}`),404);
await expect(await owner(template.coverUrl.replace("/api","")),404);
await expect(await owner("/tasks",{templateId:template.id,assetIds:[ownAsset.id,secondAsset.id]}),404);
await expect(await owner(`/tasks/${task.id}/result`),200);
await expect(await owner(`/assets/${ownAsset.id}/content`),200);
assert.ok((await (await owner("/tasks")).json()).items.some(item=>item.id===task.id));
for(let i=0;i<100;i++){finished=await (await owner(`/tasks/${running.id}`)).json();if(["SUCCEEDED","FAILED"].includes(finished.task.status))break;await new Promise(r=>setTimeout(r,200));}
assert.equal(finished.task.status,"SUCCEEDED");await expect(await owner(`/tasks/${running.id}/result`),200);
console.log("PASS template deletion: own custom only; system/other/origin blocked; repeat delete; hidden list/detail/cover; no new tasks; history/results/assets retained; in-flight task completes");
