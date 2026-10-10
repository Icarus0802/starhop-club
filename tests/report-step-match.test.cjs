'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');

test('a public checkout without arena data recomputes all batches without reading original-machine paths',()=>{
  const clone=fs.mkdtempSync(path.join(os.tmpdir(),'starhop-report-public-'));
  try{
    for(const name of ['assets','js','tests','benchmarks','docs','scripts','vendor','index.html','style.css','LICENSE','THIRD_PARTY.md','README.md','CHANGELOG.md','package.json','server.cjs','启动跳棋.cmd','启动服务.ps1','.nojekyll','.gitignore','.gitattributes']){
      fs.cpSync(path.join(root,name),path.join(clone,name),{recursive:true});
    }
    assert.equal(fs.existsSync(path.join(clone,'arena-results')),false);
    const manifest=JSON.parse(fs.readFileSync(path.join(clone,'docs','benchmarks','2026-10-10','manifest.json')));
    const modelHashes=['learned-value-v1.json','learned-value-v2.json'].map(name=>hash(fs.readFileSync(path.join(clone,'benchmarks',name))));
    // The old absolute filenames still exist on this test machine. Deny every
    // read outside the copied checkout so that accidentally using one fails.
    const guard=path.join(clone,'public-clone-guard.cjs');
    fs.writeFileSync(guard,"const fs=require('node:fs'),path=require('node:path');const base=path.resolve(process.env.STARHOP_PUBLIC_CLONE_ROOT).toLowerCase()+path.sep;const read=fs.readFileSync;fs.readFileSync=function(file,...args){if(typeof file==='string'||Buffer.isBuffer(file)){const resolved=path.resolve(String(file)).toLowerCase();if(!resolved.startsWith(base))throw new Error('External checkout read: '+resolved);}return read.call(this,file,...args);};\n");
    const stdout=execFileSync(process.execPath,['--require',guard,path.join(clone,'scripts','report-step-match.cjs'),'--include-heldout','--public-evidence'],{
      cwd:clone,env:{...process.env,STARHOP_PUBLIC_CLONE_ROOT:clone},encoding:'utf8',windowsHide:true,timeout:20000
    });
    const result=JSON.parse(stdout.trim());assert.equal(result.runs.length,11);assert.ok(result.runs.every(run=>run.status==='complete'));
    assert.equal(result.evidence.originalFiles,75);assert.ok(result.package.withinLimits);
    const report=fs.readFileSync(path.join(clone,'docs','benchmarks','SELF_PLAY_2026_10_10.md'),'utf8');
    assert.match(report,/350ms新开局完整8局为3胜4负1和/);assert.match(report,/原始.*没有捕获.*模型JSON/);
    for(const item of manifest.files)assert.equal(hash(fs.readFileSync(path.join(clone,'docs','benchmarks','2026-10-10',item.file))),item.sha256,'Raw public evidence was changed');
    assert.deepEqual(['learned-value-v1.json','learned-value-v2.json'].map(name=>hash(fs.readFileSync(path.join(clone,'benchmarks',name)))),modelHashes);
  }finally{
    const absolute=path.resolve(clone);assert.ok(absolute.startsWith(path.resolve(os.tmpdir())+path.sep));assert.ok(path.basename(absolute).startsWith('starhop-report-public-'));
    fs.rmSync(absolute,{recursive:true,force:true});
  }
});
