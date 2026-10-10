'use strict';
// Actual require-chain regression: isolated normal/frozen JSON snapshots,
// source hashes and lazy dependency capture without changing real weights.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const S=require('../scripts/step-match.cjs');
const root=path.resolve(__dirname,'..'),benchmarkRoot=path.join(root,'benchmarks');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function temporaryFixture(t){
  const directory=fs.mkdtempSync(path.join(benchmarkRoot,'step-json-test-'));
  t.after(()=>{
    const resolved=path.resolve(directory);assert.ok(resolved.startsWith(benchmarkRoot+path.sep));assert.ok(path.basename(resolved).startsWith('step-json-test-'));
    for(const file of ['weights.json','helper.cjs','engine.cjs'])delete require.cache[path.join(resolved,file)];
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  fs.writeFileSync(path.join(directory,'engine.cjs'),"const read=require('./helper.cjs');module.exports={search:()=>({value:read().coefficient}),inspect:read};\n");
  fs.writeFileSync(path.join(directory,'helper.cjs'),"module.exports=()=>require('./weights.json');\n");
  const weights=path.join(directory,'weights.json');
  return {engine:path.join(directory,'engine.cjs'),helper:path.join(directory,'helper.cjs'),weights,write(value){const bytes=Buffer.from('\uFEFF'+JSON.stringify({coefficient:value}));fs.writeFileSync(weights,bytes);return hash(bytes);}};
}
function row(loaded,filename){return loaded.metadata.modules.find(entry=>entry.file===path.relative(root,filename).replaceAll('\\','/'));}

test('normal engine tracks nested lazy JSON bytes and privately retains its loaded version despite native cache and disk changes',t=>{
  const fixture=temporaryFixture(t),firstHash=fixture.write(1);
  const native=require(fixture.weights);assert.equal(native.coefficient,1);
  const a=S.loadEngine(fixture.engine);assert.ok(row(a,fixture.helper));assert.ok(!row(a,fixture.weights),'lazy JSON has not been required yet');
  assert.equal(a.engine.search().value,1);assert.equal(row(a,fixture.weights).sourceSha256,firstHash);assert.equal(row(a,fixture.weights).adapter,'json-isolated-unmodified');
  const secondHash=fixture.write(2),b=S.loadEngine(fixture.engine);
  assert.equal(b.engine.search().value,2,'new version must not inherit the native JSON cache');assert.equal(a.engine.search().value,1,'already loaded version retains its JSON snapshot');
  assert.equal(native.coefficient,1);assert.notStrictEqual(a.engine.inspect(),b.engine.inspect());
  assert.equal(a.metadata.sourceSha256,b.metadata.sourceSha256,'the wrapper code did not change');
  assert.equal(row(b,fixture.weights).sourceSha256,secondHash);assert.notEqual(firstHash,secondHash);
  assert.equal(a.metadata.modules.filter(entry=>entry.file===row(a,fixture.weights).file).length,1);
});

test('frozen adapter has its own nested JSON snapshot and reports the exact data it used',t=>{
  const fixture=temporaryFixture(t);fixture.write(3);const normal=S.loadEngine(fixture.engine);assert.equal(normal.engine.search().value,3);
  const frozenHash=fixture.write(4),frozen=S.loadEngine(fixture.engine,{frozenPlayer:3});
  assert.equal(frozen.engine.search().value,4);assert.equal(normal.engine.search().value,3);
  assert.equal(row(frozen,fixture.weights).sourceSha256,frozenHash);assert.equal(row(frozen,fixture.weights).adapter,'json-isolated-unmodified');
  assert.ok(row(frozen,fixture.helper).adapter.includes('frozen-rules-proxy'));assert.equal(frozen.metadata.frozenPlayer,3);
});

test('actual learned candidate normal and Fast frozen dependency chains record the weight JSON hash',()=>{
  const filename='benchmarks/candidate-learned-i.cjs',model=path.join(benchmarkRoot,'learned-value-v1.json'),expected=hash(fs.readFileSync(model));
  for(const frozenPlayer of [null,3]){
    const loaded=S.loadEngine(filename,{frozenPlayer}),weights=row(loaded,model);assert.ok(weights);assert.equal(weights.sourceSha256,expected);
    assert.equal(weights.adapter,'json-isolated-unmodified');assert.ok(row(loaded,path.join(root,'js','ai.js')),'local JS dependency is tracked too');
    if(frozenPlayer!==null)assert.ok(row(loaded,path.resolve(root,filename)).adapter.includes('virtual-pass'));
  }
});
