'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const version=require('../package.json').version;
test('launcher reuses its running installation without starting another server',async()=>{
  let stops=0;const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/app/stop')stops++;res.end(JSON.stringify({app:'starhop-club',version,installation:root}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{const result=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/launch.cjs','--no-browser'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true});let output='';p.stdout.on('data',b=>output+=b);p.once('error',reject);p.once('exit',code=>resolve({code,output}));});assert.equal(result.code,0);assert.equal(result.output.trim(),'http://127.0.0.1:'+port);assert.equal(stops,0);}finally{await new Promise(r=>server.close(r));}
});
test('stop launcher leaves a different installation untouched',async()=>{
  let stops=0;const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/app/stop')stops++;res.end(JSON.stringify({app:'starhop-club',version,installation:root+'-different'}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/launch.cjs','--stop'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:'ignore'});p.once('error',reject);p.once('exit',resolve);});assert.equal(code,0);assert.equal(stops,0);}finally{await new Promise(r=>server.close(r));}
});
