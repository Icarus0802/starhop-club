'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const E=require('../js/engine.js');
const root=path.resolve(__dirname,'..');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function verifiedInstallation(){
  try{
    const folder=path.join(root,'docs/benchmarks/kata-acceptance-20261011');
    const acceptance=JSON.parse(fs.readFileSync(path.join(folder,'acceptance.json'),'utf8'));
    const protocol=JSON.parse(fs.readFileSync(path.join(folder,'protocol.json'),'utf8'));
    if(!acceptance.accepted)return false;
    for(const file of ['benchmarks/kata-native.cjs','js/fast-search.js'])if(sha(path.join(root,file))!==protocol.sha256[file])return false;
    for(const name of ['yizitiao.exe','yizitiao.bin.gz']){
      const expected=protocol.nativeFiles.find(f=>f.file===name)?.sha256;
      if(!expected||sha(path.join(root,'arena-results/external-kata/runtime',name))!==expected)return false;
    }
    return true;
  }catch{return false;}
}
function validate(input){
  const s=input?.state,o=input?.options||{};
  if(!s||!Array.isArray(s.board)||s.board.length!==121||s.board.some(p=>![-1,0,3].includes(p)))throw Error('Invalid board');
  if(JSON.stringify(s.players)!=='[3,0]'||![0,1].includes(s.turn)||s.winner!==null||s.draw||s.rules?.jump!=='short'||s.rules.goalLock)throw Error('Unsupported position');
  if([0,3].some(p=>s.board.filter(v=>v===p).length!==10)||[0,3].some(p=>E.isWinner(s.board,p)))throw Error('Invalid piece counts or finished position');
  if(!Number.isInteger(s.ply)||s.ply<0||s.ply>10000||Number(o.level)!==4||(o.time!==undefined&&o.time!==350)||(o.algorithm&&o.algorithm!=='auto'))throw Error('Unsupported search options');
  if(o.repetitions!==undefined&&(!Array.isArray(o.repetitions)||o.repetitions.length>1000||o.repetitions.some(r=>!Array.isArray(r)||r.length!==2||typeof r[0]!=='string'||r[0].length>400||!Number.isInteger(r[1])||r[1]<1||r[1]>3)))throw Error('Invalid history');
  return {state:{board:s.board.slice(),players:[3,0],turn:s.turn,ply:s.ply,winner:null,draw:null,rules:{jump:'short',goalLock:false}},options:{level:4,time:350,algorithm:'auto',seed:Number(o.seed)>>>0,repetitions:o.repetitions||[]}};
}
function createNativeApi({engine,enabled=false}={}){
  let phase=enabled?'loading':'unavailable',busy=false;
  const ready=enabled?Promise.resolve().then(()=>engine.ready()).then(()=>{phase='ready';},error=>{phase='unavailable';console.error('Local AI unavailable:',error.message);}):Promise.resolve();
  function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
  async function handle(req,res){
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!pathname.startsWith('/api/ai/'))return false;
    if(req.headers.origin){try{const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host||origin.protocol!=='http:')throw Error();}catch{json(res,403,{error:'Origin rejected'});return true;}}
    if(pathname==='/api/ai/status'&&req.method==='GET'){json(res,200,{state:phase,engine:phase==='ready'?'Kata one-piece':'Fast PVS',budgetMs:350});return true;}
    if(pathname!=='/api/ai/search'||req.method!=='POST'){json(res,404,{error:'Not found'});return true;}
    if(phase!=='ready'){json(res,503,{error:'Local model unavailable'});return true;}
    if(busy){json(res,409,{error:'Local model busy'});return true;}
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){json(res,415,{error:'JSON required'});return true;}
    busy=true;
    try{
      let bytes=0;const chunks=[];
      for await(const chunk of req){bytes+=chunk.length;if(bytes>300000){json(res,413,{error:'Request too large'});return true;}chunks.push(chunk);}
      let parsed;try{parsed=validate(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(error){json(res,400,{error:error.message});return true;}
      const result=await engine.search(parsed.state,parsed.options);
      if(result.move)result.move=E.applyMove(parsed.state,result.move).move;
      else if(E.legalMoves(parsed.state.board,parsed.state.players[parsed.state.turn],parsed.state.rules).length)throw Error('Engine returned no legal move');
      if(!res.destroyed)json(res,200,{result});
    }catch(error){if(!res.destroyed)json(res,500,{error:'Local search failed'});console.error('Local AI search:',error.message);}
    finally{busy=false;}
    return true;
  }
  return {handle,ready,close:()=>engine?.close?.()};
}
module.exports={verifiedInstallation,validate,createNativeApi};
