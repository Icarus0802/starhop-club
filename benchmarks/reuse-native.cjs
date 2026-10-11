'use strict';
// Experimental local adapter. No executable or model is bundled in the site.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const E=require('../js/engine.js'),Fast=require('../js/fast-search.js'),Finish=require('../js/race-finish.js');
const runtime=path.resolve(__dirname,'../arena-results/current-challenge/runtime');
const FinishPolicy=require('../js/finish-policy.js').create();
const letters='ABCDEFGHJ';
function xy(i,player){
  const c=E.cells[i];if(!c)return null;
  let x=(c.r+c.c-12)/2,y=(c.r-c.c+12)/2;
  if(player===0){x=8-x;y=8-y;}
  return x>=0&&x<=8&&y>=0&&y<=8?{x,y}:null;
}
function vertex(i,player){const c=xy(i,player);return c?letters[c.x]+(9-c.y):null;}
function cell(v,player){return E.cells.findIndex((_,i)=>vertex(i,player)===v.toUpperCase());}
function supported(s){return s.players.length===2&&s.players.includes(0)&&s.players.includes(3)&&s.rules.jump==='short'&&!s.rules.goalLock&&s.board.every((p,i)=>p<0||xy(i,3));}
function positionSgf(s){
  if(!supported(s))throw Error('Kata cannot represent this board/rules.');
  const player=s.players[s.turn],groups={AB:[],AW:[],AE:[]};
  for(let i=0;i<121;i++){const c=xy(i,player);if(!c)continue;const p=s.board[i],key=p<0?'AE':p===player?'AB':'AW';groups[key].push('['+String.fromCharCode(97+c.x,97+c.y)+']');}
  // Explicit empty points remove the engine's automatically populated camps.
  // Rotate and swap colours so the current mover is always its native black.
  return '(;FF[4]GM[1]SZ[9]KM[0]PL[B]'+Object.entries(groups).map(([k,v])=>k+v.join('')).join('')+')';
}
const config=`numSearchThreads = ${Number(process.env.STARHOP_THREADS)||4}
nnCacheSizePowerOfTwo = 18
nnMutexPoolSizePowerOfTwo = 14
numNNServerThreadsPerModel = 1
gpuToUseThread0 = 0
homeDataDir = cache
useGraphSearch = true
cpuctExploration = 0.9
cpuctExplorationLog = 0.6
cpuctExplorationBase = 500
useNoisePruning = true
nnPolicyTemperature = 1.1
subtreeValueBiasFactor = 0.0
noResultUtilityForWhite = 0.0
analysisPVLen = 30
logDir = logs
logAllGTPCommunication = false
logSearchInfo = false
logToStderr = true
koRule = SIMPLE
scoringRule = AREA
taxRule = NONE
multiStoneSuicideLegal = false
hasButton = false
whiteHandicapBonus = N
allowResignation = false
resignThreshold = -0.90
resignConsecTurns = 3
playoutDoublingAdvantage = 0.0
lagBuffer = 0.005
ponderingEnabled = false
searchFactorAfterOnePass = 1.0
searchFactorAfterTwoPass = 1.0
searchFactorWhenWinning = 1.0
searchFactorWhenWinningThreshold = 0.95
chosenMoveTemperature = 0
chosenMoveTemperatureEarly = 0
maxTime = 30
`;
let tracked=null, reused=0;
let child,buffer='',nextId=0,readyPromise,pending=Promise.resolve(),lastError='';
const requests=new Map();
function command(text,timeout=30000){return new Promise((resolve,reject)=>{
  const id=++nextId,timer=setTimeout(()=>{requests.delete(id);reject(Error('GTP timeout: '+text.split(' ')[0]));},timeout);
  requests.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
  child.stdin.write(id+' '+text+'\n');
});}
function fail(error){lastError=error.message;for(const p of requests.values())p.reject(error);requests.clear();}
async function ready(){
  if(readyPromise)return readyPromise;
  readyPromise=(async()=>{
    for(const file of ['yizitiao.exe','yizitiao.bin.gz'])if(!fs.existsSync(path.join(runtime,file)))throw Error('Missing local Kata file: '+file);
    fs.writeFileSync(path.join(runtime,'candidate.cfg'),config);
    const log=fs.createWriteStream(path.join(runtime,'adapter-stderr.log'),{flags:'a'});
    child=spawn(path.join(runtime,'yizitiao.exe'),['gtp','-config','candidate.cfg','-model','yizitiao.bin.gz'],{cwd:runtime,windowsHide:true,stdio:['pipe','pipe','pipe']});
    child.stderr.pipe(log);child.stdin.on('error',fail);child.on('error',fail);child.on('exit',code=>{log.end();fail(Error('Kata exited: '+code));});
    child.stdout.setEncoding('utf8');child.stdout.on('data',data=>{
      buffer+=data.replace(/\r/g,'');let at;
      while((at=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,at);buffer=buffer.slice(at+2);const m=block.match(/(?:^|\n)([=?])(\d+)(?:[ \t]|\n|$)([\s\S]*)/);if(!m)continue;const id=Number(m[2]),p=requests.get(id);if(!p)continue;requests.delete(id);if(m[1]==='?')p.reject(Error(m[3].trim()));else p.resolve(m[3].trim());}
    });
    await command('protocol_version',240000);await command('komi 0');
    await command('time_settings 0 0.15 1');
    return {name:await command('name'),version:await command('version')};
  })();return readyPromise;
}
async function clear(){await ready();await pending;tracked=null;reused=0;FinishPolicy.clear();Fast.clear();await command('clear_cache');}
async function search(state,options={}){
  await ready();await pending;
  const start=performance.now(),budget=Number(options.time)||350,deadline=start+budget-8;
  const route=FinishPolicy.search(state,{...options,time:budget});
  if(route)return {...route,native:true};
  if(!supported(state))return {...Fast.search(state,options),nativeFallback:'unsupported-board-or-rules'};
  const player=state.players[state.turn],ownRows=[],otherRows=[];
  state.board.forEach((p,i)=>{if(p===player)ownRows.push(player===3?E.cells[i].r:16-E.cells[i].r);else if(p>=0)otherRows.push(player===3?E.cells[i].r:16-E.cells[i].r);});
  if(Math.max(...ownRows)<=7&&Math.min(...otherRows)>=9&&E.progress(state.board,player)>=5){
    const plan=Finish.finish(state,{player,time:Math.min(180,budget*.22),depth:12,exact:true,repetitions:options.repetitions});
    if(plan.shortest&&plan.plan.length){const m=plan.plan[0],move=E.pieceMoves(state.board,m.from,state.rules).find(x=>x.to===m.to);if(move)return {move,native:true,algorithm:'Kata + exact static finish',frozenOpponent:true,forcedWin:false,finishTurns:plan.distance,nodes:plan.nodes,time:performance.now()-start};}
  }
  const fallback=Fast.search(state,{...options,time:15,depth:1});
  const actor=state.players[state.turn],sgf=path.join(runtime,'candidate.sgf');
  fs.writeFileSync(sgf,positionSgf(state));
  let timeoutId, pvFallback=null;
  const work=(async()=>{
    const treeReused=await synchronize(state);
    let seconds=Math.max(.005,(deadline-performance.now()-90)*.65/1000);
    await command('time_settings 0 '+seconds.toFixed(4)+' 1');
    const analysis=await command('kata-genmove_analyze interval 100000 maxmoves 20 avoid B pass 1000 avoid W pass 1000');
    if(process.env.STARHOP_TRACE)fs.appendFileSync(path.join(runtime,'candidate-analysis.log'),analysis+'\n\n');
    const lines=analysis.trim().split('\n'),selected=lines[lines.length-1].trim().replace(/^play /,'');
    const from=cell(selected,actor);
    const infos=analysis.split(/\binfo move /).slice(1);
    const info=infos.find(line=>line.split(/\s/)[0]===selected);
    const pv=info?.match(/\bpv ([A-HJ][1-9]) ([A-HJ][1-9])/);
    let to=pv&&pv[1]===selected?cell(pv[2],actor):-1;
    pvFallback=E.pieceMoves(state.board,from,state.rules).find(m=>m.to===to)||null;
    {
      seconds=Math.max(.005,(deadline-performance.now()-65)/1000);
      await command('time_settings 0 '+seconds.toFixed(4)+' 1');
      const destination=await command('kata-genmove_analyze interval 100000 maxmoves 1 avoid B pass 1000 avoid W pass 1000');
      to=cell(destination.trim().split('\n').at(-1).replace(/^play /,''),actor);
    }
    const move=E.pieceMoves(state.board,from,state.rules).find(m=>m.to===to);
    if(!move||state.board[from]!==actor)throw Error('Native move failed shared-rules validation: '+selected+' '+pv?.[2]+' ('+from+','+to+').');
    const after=E.applyMove(state,move).state;
    if(after.winner===null&&new Map(options.repetitions||[]).get(E.key(after.board,after.turn))>=2)throw Error('Native move repeats a position for the third time.');
    tracked={state:after,actor};
    return {move,treeReused,reused,algorithm:'Kata retained search tree · experimental',depth:null,nodes:Number(info?.match(/\bvisits (\d+)/)?.[1])||null,score:null,candidates:[],native:true,pv:pv?.slice(1)};
  })();
  pending=work.catch(()=>{});
  let result;try{
    result=await Promise.race([work,new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(Error('Combined native budget expired')),Math.max(1,deadline-performance.now()));})]);
  }catch(error){tracked=null;const candidate=pvFallback&&E.applyMove(state,pvFallback).state;const safe=candidate&&(candidate.winner!==null||(new Map(options.repetitions||[]).get(E.key(candidate.board,candidate.turn))||0)<2);result=safe?{move:pvFallback,native:true,algorithm:'Kata validated PV fallback',nativeFallback:error.message}:{...fallback,nativeFallback:error.message};}
  finally{clearTimeout(timeoutId);}
  return {...result,time:performance.now()-start};
}
async function close(){if(child&&!child.killed){await pending;try{await command('quit',2000);}catch{}child.kill();}child=null;readyPromise=null;}
process.once('exit',()=>child?.kill());
module.exports={search,clear,ready,close,waitForIdle:()=>pending,xy,vertex,cell,supported,positionSgf,runtime,command};

// Reuse a search only when the previous state plus exactly one legal opponent
// move equals the supplied board. Undo/import/seat changes force a full reload.
function opponentDelta(previous,current,actor){
  if(!previous||previous.actor!==actor||current.ply!==previous.state.ply+1||JSON.stringify(current.rules)!==JSON.stringify(previous.state.rules))return null;
  const before=previous.state,opponent=before.players[before.turn];
  const changed=before.board.flatMap((v,i)=>v!==current.board[i]?[i]:[]);
  if(changed.length!==2)return null;
  const from=changed.find(i=>before.board[i]===opponent&&current.board[i]===-1);
  const to=changed.find(i=>before.board[i]===-1&&current.board[i]===opponent);
  if(from===undefined||to===undefined)return null;
  try {const s=E.applyMove(before,{from,to}).state;return s.turn===current.turn&&s.board.every((v,i)=>v===current.board[i])?{from,to}:null;}catch{return null;}
}
async function synchronize(state){
  const actor=state.players[state.turn],move=opponentDelta(tracked,state,actor);
  if(move){
    try{await command('play W '+vertex(move.from,actor));await command('play W '+vertex(move.to,actor));tracked=null;reused++;return true;}catch{tracked=null;}
  }
  await command('loadsgf candidate.sgf');tracked=null;return false;
}
module.exports.opponentDelta=opponentDelta;
