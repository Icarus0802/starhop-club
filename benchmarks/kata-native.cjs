'use strict';
// Experimental local adapter. No executable or model is bundled in the site.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const E=require('../js/engine.js'),Fast=require('../js/fast-search.js');
const runtime=path.resolve(__dirname,'../arena-results/external-kata/runtime');
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
const config=`numSearchThreads = 4
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
maxTime = 0.15
`;
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
    fs.writeFileSync(path.join(runtime,'starhop.cfg'),config);
    const log=fs.createWriteStream(path.join(runtime,'adapter-stderr.log'),{flags:'a'});
    child=spawn(path.join(runtime,'yizitiao.exe'),['gtp','-config','starhop.cfg','-model','yizitiao.bin.gz'],{cwd:runtime,windowsHide:true,stdio:['pipe','pipe','pipe']});
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
async function clear(){await ready();await pending;Fast.clear();await command('clear_cache');}
async function search(state,options={}){
  await ready();await pending;
  const start=performance.now(),budget=Number(options.time)||350,deadline=start+budget-8;
  if(!supported(state))return {...Fast.search(state,options),nativeFallback:'unsupported-board-or-rules'};
  const fallback=Fast.search(state,{...options,time:15,depth:1});
  const actor=state.players[state.turn],sgf=path.join(runtime,'position.sgf');
  fs.writeFileSync(sgf,positionSgf(state));
  let timeoutId;
  const work=(async()=>{
    await command('loadsgf position.sgf');
    let seconds=Math.min(.15,Math.max(.005,(deadline-performance.now()-25)/2000));
    await command('time_settings 0 '+seconds.toFixed(4)+' 1');
    const from=cell(await command('genmove'),actor);
    seconds=Math.min(.15,Math.max(.005,(deadline-performance.now()-15)/1000));
    await command('time_settings 0 '+seconds.toFixed(4)+' 1');
    const to=cell(await command('genmove'),actor);
    const move=E.pieceMoves(state.board,from,state.rules).find(m=>m.to===to);
    if(!move||state.board[from]!==actor)throw Error('Native move failed shared-rules validation.');
    const after=E.applyMove(state,move).state;
    if(after.winner===null&&new Map(options.repetitions||[]).get(E.key(after.board,after.turn))>=2)throw Error('Native move repeats a position for the third time.');
    return {move,algorithm:'Kata one-piece · experimental',depth:null,nodes:null,score:null,candidates:[],native:true};
  })();
  pending=work.catch(()=>{});
  let result;try{
    result=await Promise.race([work,new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(Error('Combined native budget expired')),Math.max(1,deadline-performance.now()));})]);
  }catch(error){result={...fallback,nativeFallback:error.message};}
  finally{clearTimeout(timeoutId);}
  return {...result,time:performance.now()-start};
}
async function close(){if(child&&!child.killed){await pending;try{await command('quit',2000);}catch{}child.kill();}child=null;readyPromise=null;}
process.once('exit',()=>child?.kill());
module.exports={search,clear,ready,close,xy,vertex,cell,supported,positionSgf,runtime};
