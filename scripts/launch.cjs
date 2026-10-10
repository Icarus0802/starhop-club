'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function status(url){try{return await(await fetch(url+'/api/app/status',{signal:AbortSignal.timeout(600)})).json();}catch{return null;}}
const ours=s=>s?.app==='starhop-club'&&s.installation===root&&s.version===version;
function open(url){if(process.argv.includes('--no-browser'))return;const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url+'/#play'],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',e=>console.error('Open this address in your browser: '+url+' ('+e.message+')'));child.unref();}
async function available(port){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});}
async function main(){
  const first=Number(process.env.PORT)||5173;
  for(let port=first;port<first+20;port++){
    const url='http://127.0.0.1:'+port,s=await status(url);
    if(process.argv.includes('--stop')){
      if(ours(s))await fetch(url+'/api/app/stop',{method:'POST',headers:{Origin:url,'X-Starhop-Stop':'1'},signal:AbortSignal.timeout(2000)});
      continue;
    }
    if(ours(s)){open(url);console.log(url);return;}
    if(!await available(port))continue;
    fs.mkdirSync(path.join(root,'logs'),{recursive:true});
    const out=fs.openSync(path.join(root,'logs/server.log'),'a'),err=fs.openSync(path.join(root,'logs/server-error.log'),'a');
    const child=spawn(process.execPath,[path.join(root,'server.cjs')],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,detached:true,stdio:['ignore',out,err]});
    fs.closeSync(out);fs.closeSync(err);
    let failure;child.on('error',e=>failure=e);child.unref();
    for(let n=0;n<60;n++){
      if(failure)throw failure;
      if(ours(await status(url))){open(url);console.log(url);return;}
      if(child.exitCode!==null)throw Error('Server failed; see logs/server-error.log');
      await sleep(200);
    }
    child.kill();throw Error('Startup timed out; see logs/server-error.log');
  }
  if(!process.argv.includes('--stop'))throw Error('No available local port');
}
main().catch(e=>{console.error(e.message+'\nYou can open index.html to play with browser AI.');process.exitCode=1;});
