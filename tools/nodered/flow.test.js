// Uji fungsi cabang D flow Node-RED (tanpa Node-RED): node tools/nodered/flow.test.js

const vm=require('vm'),fs=require('fs');
const flow=JSON.parse(fs.readFileSync(__dirname+'/mainthub-flow.json','utf8'));
const get=id=>flow.find(n=>n.id===id);
function run(id,msg,envv){const warns=[];const ctx={msg,env:{get:k=>envv[k]},node:{warn:x=>warns.push(x),error:x=>warns.push('ERR '+x),status(){}},Buffer,JSON};
  const r=vm.runInNewContext('(function(){'+get(id).func+'})()',ctx);return {r,warns};}
const assert=require('assert');
const E={MAINTHUB_URL:'http://nginx/',MAINTHUB_KEY:'mhk_env'};
let o=run('d_fn',{topic:'mainthub/esp-a1/ingest',payload:{key:'mhk_dev',readings:[{asset:'P1',tag:'x',value:1}],device:{id:'esp-a1'}}},E).r;
assert.equal(o[0].url,'http://nginx/api/ingest/readings'); assert.equal(o[0].headers['x-api-key'],'mhk_dev'); assert.equal(o[0].dev,'esp-a1'); assert.ok(o[0].payload.device); assert.ok(!('key' in o[0].payload)); assert.equal(o[1],null);
o=run('d_fn',{topic:'mainthub/esp-a1/ingest',payload:{readings:[{a:1}]}},E).r; assert.equal(o[0].headers['x-api-key'],'mhk_env');
o=run('d_fn',{topic:'mainthub/esp-a1/ingest',payload:'{"key":"k","readings":[{"a":1}]}'},E).r; assert.equal(o[0].headers['x-api-key'],'k');
o=run('d_fn',{topic:'mainthub/esp-a1/ingest',payload:Buffer.from('{"readings":[{"a":1}]}')},E).r; assert.ok(o[0]);
o=run('d_fn',{topic:'mainthub/esp-a1/ingest',payload:'not json'},E).r; assert.equal(o[0],null); assert.equal(o[1].payload.code,400); assert.equal(o[1].topic,'mainthub/esp-a1/ack');
o=run('d_fn',{topic:'mainthub/esp-a1/ingest',payload:{readings:[]}},E).r; assert.equal(o[1].payload.code,400);
o=run('d_fn',{topic:'mainthub/esp-a1/ingest',payload:{readings:[{a:1}]}},{MAINTHUB_URL:'http://x'}).r; assert.equal(o[1].payload.code,500);
let a=run('d_rp',{dev:'esp-a1',statusCode:200,payload:{ok:true}},E).r; assert.deepEqual(a.payload,{code:200}); assert.equal(a.topic,'mainthub/esp-a1/ack');
a=run('d_rp',{dev:'esp-a1',statusCode:401,payload:{error:'x'}},E); assert.equal(a.r.payload.code,401); assert.equal(a.warns.length,1);
a=run('d_rp',{dev:'esp-a1',payload:null},E).r; assert.equal(a.payload.code,502);   // tidak ada balasan = 502
// wiring
for(const n of flow){ for(const w of (n.wires||[])) for(const t of w) assert.ok(get(t),'wire ke '+t); }
console.log('flow D ok, node:',flow.length);
