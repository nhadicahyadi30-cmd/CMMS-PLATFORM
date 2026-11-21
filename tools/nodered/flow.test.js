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

// ---- powermeter-flow.json: decode register & susun permintaan ----
{
  const pm = JSON.parse(fs.readFileSync(__dirname + '/powermeter-flow.json', 'utf8'));
  const g = (id) => pm.find((n) => n.id === id);
  const run2 = (id, msg, envv) => { const warns = []; const ctx = { msg, env: { get: (k) => envv[k] }, node: { warn: (x) => warns.push(x), error: (x) => warns.push(x), status() {} }, Buffer, JSON, Number };
    return { r: vm.runInNewContext('(function(){' + g(id).func + '})()', ctx), warns }; };
  const E2 = { MAINTHUB_URL: 'http://nginx/', MAINTHUB_KEY: 'mhk_k' };
  const f32 = (x, swap) => { const b = Buffer.alloc(4); b.writeFloatBE(x, 0); const a = [b.readUInt16BE(0), b.readUInt16BE(2)]; return swap ? a.reverse() : a; };
  let o = run2('pm_ex', {}, E2).r; assert.equal(o.meter, 'MTR-LINE1');
  o = run2('pm_dec', o, E2).r; assert.equal(o[0].url, 'http://nginx/api/ingest/meters'); assert.deepEqual(o[0].payload, { meters: [{ meter: 'MTR-LINE1', kwh: 12345.5 }] }); assert.equal(o[1], null);
  o = run2('pm_dec', { meter: 'M', format: 'f32sw', scale: 1, payload: f32(987.25, true) }, E2).r; assert.equal(o[0].payload.meters[0].kwh, 987.25);      // word terbalik
  o = run2('pm_dec', { meter: 'M', format: 'u32', scale: 0.001, payload: [0x0001, 0xE240] }, E2).r; assert.equal(o[0].payload.meters[0].kwh, 123.456);      // 123456 Wh -> kWh
  o = run2('pm_dec', { meter: 'M', format: 'u16', payload: [4321] }, E2).r; assert.equal(o[0].payload.meters[0].kwh, 4321);
  assert.equal(run2('pm_dec', { meter: 'M', format: 'f32', payload: [0xFFFF, 0xFFFF] }, E2).r[0], null);                 // NaN ditolak
  assert.equal(run2('pm_dec', { meter: 'M', format: 'f32', payload: f32(-5) }, E2).r[0], null);                          // negatif ditolak
  assert.equal(run2('pm_dec', { meter: 'M', format: 'f32', payload: [1] }, E2).r[0], null);                              // register kurang
  assert.equal(run2('pm_dec', { format: 'f32', payload: [1, 2] }, E2).r[0], null);                                       // tanpa kode meter
  assert.equal(run2('pm_dec', { meter: 'M', payload: [1, 2] }, { MAINTHUB_URL: 'x' }).r[0], null);                         // tanpa kunci
  const reqs = run2('pm_prep', {}, E2).r[0]; assert.equal(reqs.length, 2); assert.deepEqual(Object.keys(reqs[0].payload).sort(), ['address', 'fc', 'quantity', 'unitid']);
  for (const n of pm) for (const w of (n.wires || [])) for (const t of w) assert.ok(g(t), 'wire ke ' + t);
  console.log('powermeter flow ok');
}
