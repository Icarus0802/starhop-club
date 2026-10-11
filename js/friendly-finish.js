/* Friendly-bridge route search, derived from race-finish.js. MIT.
 * Opposing pieces block landing holes but are never used as bridges.
 * The original planner stays frozen with the measured 2.1 baseline.
 * An available plan is an upper bound on own turns, never a forced game win.
 * Exact mode uses a parity matching lower bound; fast mode is weighted A*. */
(function(root){
'use strict';
const E=typeof module==='object'&&module.exports?require('./engine.js'):root.Starhop;
const N=121,bits=Array.from({length:N},(_,i)=>1n<<BigInt(i));
const adjacent=Int16Array.from(E.adjacent.flat()),jump=Int16Array.from(E.rays.flatMap(row=>row.map(ray=>ray[1]??-1)));
const parity=E.cells.map(({r,c})=>(r&1)*2+(((c-r)/2)&1));
const lower=E.cells.map((_,i)=>Uint8Array.from(E.cells.map((__,j)=>i===j?0:E.distances[i][j]===1||parity[i]===parity[j]?1:2)));
function pieceMoves(board,from,rules={}){
  const p=board[from];if(p===undefined||p<0)return [];
  const goal=(p+3)%6,paths=new Map(),seen=new Set([from]),queue=[[from,[from]]],value=i=>i===from?-1:board[i];
  const allowed=(a,b)=>!rules.goalLock||E.zoneOf[a]!==goal||E.zoneOf[b]===goal;
  for(const to of E.adjacent[from])if(to>=0&&board[to]<0&&allowed(from,to))paths.set(to,[from,to]);
  for(let head=0;head<queue.length;head++){
    const [here,path]=queue[head];
    for(const ray of E.rays[here]){
      let n=0;if(rules.jump==='long')while(n<ray.length&&value(ray[n])<0)n++;
      if(n>=ray.length||value(ray[n])!==p)continue;
      const to=ray[n*2+1];if(to===undefined||seen.has(to)||!allowed(here,to))continue;
      if(ray.slice(n+1,n*2+2).some(i=>value(i)>=0))continue;
      const next=path.concat(to);seen.add(to);paths.set(to,next);queue.push([to,next]);
    }
  }
  return [...paths].map(([to,path])=>({from,to,path}));
}
class Heap{
  constructor(){this.a=[];}
  less(a,b){return a.f<b.f||a.f===b.f&&(a.rank<b.rank||a.rank===b.rank&&a.g>b.g);}
  push(n){const a=this.a;let i=a.length;a.push(n);while(i){const p=(i-1)>>1;if(!this.less(n,a[p]))break;a[i]=a[p];i=p;}a[i]=n;}
  pop(){const a=this.a,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let k=i*2+1;if(k+1<a.length&&this.less(a[k+1],a[k]))k++;if(!this.less(a[k],last))break;a[i]=a[k];i=k;}a[i]=last;}return top;}
}
function finish(state,options={}){
  const start=performance.now(),deadline=start+Math.max(1,Number(options.time)||100),p=options.player??state.players[state.turn],goal=(p+3)%6;
  const exact=options.exact===true,maxDepth=options.depth??14,holes=E.zones[goal],rules=state.rules;
  let nodes=0,expanded=0;const output=(status,extra={})=>({status,plan:[],nodes,expanded,time:performance.now()-start,frozenOpponent:true,forcedWin:false,shortest:false,...extra});
  if(holes.some(i=>state.board[i]>=0&&state.board[i]!==p))return output('blocked-by-frozen-opponent');
  const pcs=[];let mask=0n;for(let i=0;i<N;i++)if(state.board[i]===p){pcs.push(i);mask|=bits[i];}
  if(pcs.length!==10)throw new Error('每方必须有 10 枚棋子');
  const missing=new Int16Array(10),outside=new Int16Array(10),dp=new Float64Array(1024),counts=new Uint8Array(1024);
  for(let i=1;i<1024;i++)counts[i]=counts[i>>1]+(i&1);
  function estimate(board,pieces){
    let n=0,k=0,rank=0;
    for(const i of holes)if(board[i]!==p)missing[n++]=i;
    for(const i of pieces)if(E.zoneOf[i]!==goal)outside[k++]=i;
    if(!n)return {h:0,rank:0};
    // Fix occupied goals to themselves: the relaxed distance is a metric.
    // Every step costs one; any number of short jumps retains axial parity.
    const size=1<<n;dp.fill(Infinity,0,size);dp[0]=0;
    for(let m=0;m<size-1;m++){
      const row=lower[outside[counts[m]]];
      for(let j=0;j<n;j++)if(!(m&(1<<j))){const next=m|(1<<j),v=dp[m]+(rules.jump==='long'?1:row[missing[j]]);if(v<dp[next])dp[next]=v;}
    }
    for(let i=0;i<n;i++){let d=99;for(let j=0;j<n;j++)d=Math.min(d,E.distances[outside[i]][missing[j]]);rank+=d*d;}
    return {h:dp[size-1],rank};
  }
  const seen=new Uint32Array(N),landed=new Uint32Array(N),queue=new Int16Array(N);let stamp=0;
  function moves(board,pieces){
    if(rules.jump==='long'){
      const list=[];
      for(const from of pieces){
        const seen=new Set([from]),landed=new Set(),queue=[from],value=i=>i===from?-1:board[i];
        const allowed=(a,b)=>!rules.goalLock||E.zoneOf[a]!==goal||E.zoneOf[b]===goal;
        for(const to of E.adjacent[from])if(to>=0&&board[to]<0&&allowed(from,to))landed.add(to);
        for(let head=0;head<queue.length;head++)for(const ray of E.rays[queue[head]]){
          let n=0;while(n<ray.length&&value(ray[n])<0)n++;
          if(n>=ray.length||value(ray[n])!==p)continue;
          const to=ray[n*2+1];if(to===undefined||seen.has(to)||!allowed(queue[head],to))continue;
          if(ray.slice(n+1,n*2+2).some(i=>value(i)>=0))continue;
          seen.add(to);landed.add(to);queue.push(to);
        }
        for(const to of landed)list.push(from*128+to);
      }
      return list;
    }
    const list=[];
    for(const from of pieces){
      const mark=++stamp;seen[from]=mark;queue[0]=from;let tail=1;
      for(let dir=0;dir<6;dir++){const to=adjacent[from*6+dir];if(to>=0&&board[to]<0&&(!rules.goalLock||E.zoneOf[from]!==goal||E.zoneOf[to]===goal)){landed[to]=mark;list.push(from*128+to);}}
      for(let head=0;head<tail;head++){
        const here=queue[head];
        for(let dir=0;dir<6;dir++){
          const mid=adjacent[here*6+dir],to=jump[here*6+dir];
          if(mid<0||to<0||mid===from||board[mid]!==p||to!==from&&board[to]>=0||seen[to]===mark||rules.goalLock&&E.zoneOf[here]===goal&&E.zoneOf[to]!==goal)continue;
          seen[to]=mark;queue[tail++]=to;if(landed[to]!==mark){landed[to]=mark;list.push(from*128+to);}
        }
      }
    }
    return list;
  }
  const initial=estimate(state.board,pcs),open=new Heap(),visited=new Map([[mask,0]]),history=new Map(options.repetitions||[]);
  if(initial.h===0)return output('finished',{distance:0,shortest:true,lowerBound:0});
  open.push({board:Int8Array.from(state.board),pieces:pcs,mask,g:0,f:initial.h,rank:initial.rank,parent:null,code:-1});
  while(open.a.length){
    if(performance.now()>=deadline)return output('timeout',{lowerBound:initial.h});
    const node=open.pop();if(visited.get(node.mask)!==node.g)continue;
    if(holes.every(i=>node.board[i]===p)){
      const plan=[];for(let n=node;n.parent;n=n.parent)plan.push({from:n.code>>>7,to:n.code&127});plan.reverse();
      return output('found',{plan,distance:plan.length,shortest:exact,lowerBound:exact?plan.length:initial.h});
    }
    if(node.g>=maxDepth)continue;expanded++;
    for(const code of moves(node.board,node.pieces)){
      const from=code>>>7,to=code&127,g=node.g+1,mask=node.mask^bits[from]^bits[to];
      if((visited.get(mask)??Infinity)<=g)continue;
      const board=node.board.slice();board[from]=-1;board[to]=p;
      if(node.g===0&&(history.get(E.key(board,(state.players.indexOf(p)+1)%state.players.length))||0)>=2)continue;
      const pieces=node.pieces.slice();pieces[pieces.indexOf(from)]=to;
      const {h,rank}=estimate(board,pieces);nodes++;if(nodes>(options.maxNodes??150000))return output('node-limit',{lowerBound:initial.h});if(g+h>maxDepth)continue;
      visited.set(mask,g);open.push({board,pieces,mask,g,f:exact?g+h:g+h*1.7+Math.sqrt(rank)*.32,rank,parent:node,code});
    }
  }
  return output('unreachable-within-depth',{lowerBound:maxDepth+1});
}
const api={finish,pieceMoves};if(typeof module==='object'&&module.exports)module.exports=api;else root.StarhopFriendlyFinish=api;
})(typeof globalThis==='object'?globalThis:this);
