/* Race/team beam planner. MIT. No trained model is used.
 * Future replies are heuristic predictions, not a forced-win proof. */
(function(root){
'use strict';
const E=typeof module==='object'&&module.exports?require('../js/engine.js'):root.Starhop;
const V=typeof module==='object'&&module.exports?require('../js/ai.js'):root.StarhopAI;
const N=121;
const near=E.zones.map((_,p)=>E.cells.map((__,i)=>Math.min(...E.zones[(p+3)%6].map(g=>E.distances[i][g]))));
const tip=E.zones.map((_,p)=>E.zones[(p+3)%6].reduce((a,b)=>near[p][a]>near[p][b]?a:b));
const targetDepth=E.zones.map((_,p)=>E.cells.map((__,i)=>E.zoneOf[i]===(p+3)%6?E.zones[(p+3)%6].reduce((s,g)=>s+E.distances[i][g],0):0));

function destinations(board,from,rules,out=[]){
  const seen=new Uint8Array(N), queue=new Int16Array(N),p=board[from],goal=(p+3)%6;
  seen[from]=1;let tail=1;queue[0]=from;
  const allow=(here,to)=>!rules.goalLock||E.zoneOf[here]!==goal||E.zoneOf[to]===goal;
  for(const to of E.adjacent[from])if(to>=0&&board[to]<0&&allow(from,to))out.push(to);
  for(let head=0;head<tail;head++){
    const here=queue[head];
    for(const ray of E.rays[here]){
      let n=0;if(rules.jump==='long')while(n<ray.length&&(ray[n]===from||board[ray[n]]<0))n++;
      const mid=ray[n],to=ray[2*n+1];
      if(mid===undefined||to===undefined||mid===from||board[mid]<0||(to!==from&&board[to]>=0)||seen[to]||!allow(here,to))continue;
      let clear=true;for(let t=n+1;t<2*n+1;t++)if(ray[t]!==from&&board[ray[t]]>=0){clear=false;break;}
      if(!clear)continue;
      seen[to]=1;queue[tail++]=to;out.push(to);
    }
  }
  // A jump landing may already have been included as an adjacent step.
  return [...new Set(out)];
}

function cheap(board,p,cache){
  const pieces=[];let lag=0,home=0,done=0;
  for(let i=0;i<N;i++)if(board[i]===p){pieces.push(i);lag+=near[p][i]*near[p][i];home+=E.zoneOf[i]===p;done+=E.zoneOf[i]===(p+3)%6;}
  const k=p+':'+pieces.join('.');if(cache?.has(k))return cache.get(k);
  const value=-V.assignment(board,p)*10-lag*.32-home*2.5+done*4;
  if(cache){if(cache.size>30000)cache.clear();cache.set(k,value);}return value;
}

// Real multi-hop access is scored for all rear pieces. Board occupancy matters:
// moving a bridge forward can strand several teammates despite gaining distance.
function access(board,p,rules){
  let blocked=0,potential=0,spread=0,maxD=0,minD=99,mobility=0;
  const pieces=[];
  for(let i=0;i<N;i++)if(board[i]===p){
    const d=near[p][i];pieces.push(i);maxD=Math.max(maxD,d);minD=Math.min(minD,d);
    if(d===0)continue;
    const moves=destinations(board,i,rules);let g=0;
    for(const to of moves)g=Math.max(g,d-near[p][to]);
    mobility+=moves.length;
    if(d>=5){
      blocked+=d*d*(g>=3?.008:g>=2?.025:g===1?.055:.12);
      potential+=Math.min(g,6)*(1+d*.08);
      if(!moves.length)blocked+=d*1.2;
    }
  }
  // Excessively stretching a team removes jump partners from the slowest tail.
  spread=Math.max(0,maxD-minD-8);
  return {blocked,potential,spread,mobility,value:-blocked*1.3+potential*.3-spread*1.8};
}

function search(state,options={}){
  if(state.winner!==null||state.draw)return {move:null,algorithm:'Team planner',planning:true,nodes:0,depth:0,time:0,candidates:[],solved:false};
  if(state.players.length!==2||Number(options.level??4)<2||options.algorithm==='mcts')return V.search(state,options);
  const started=performance.now(),budget=Math.max(20,Math.min(30000,Number(options.time)||250)),deadline=started+budget;
  const p=state.players[state.turn],q=state.players[1-state.turn],rules=state.rules,cache=new Map(),fullCache=new Map();
  let nodes=0,hits=0,depth=0,expired=false;
  const STOP={},history=new Map(options.repetitions||[]);
  function check(){if(performance.now()>=deadline){expired=true;throw STOP;}}
  function value(b){
    const k=b.join(',');if(fullCache.has(k)){hits++;return fullCache.get(k);}
    nodes++;
    let v=cheap(b,p,cache)-cheap(b,q,cache);
    if(options.access!==false)v+=access(b,p,rules).value-access(b,q,rules).value;
    if(E.isWinner(b,p))v=100000;if(E.isWinner(b,q))v=-100000;
    fullCache.set(k,v);return v;
  }
  function moves(b,actor,cap=Infinity){
    const result=[];
    for(let from=0;from<N;from++)if(b[from]===actor){
      for(const to of destinations(b,from,rules)){
        const d=near[actor][from],after=near[actor][to];
        const priority=(d-after)*10+(d*d-after*after)*.32+(E.zoneOf[to]===(actor+3)%6?4:0)-(E.zoneOf[from]===(actor+3)%6?4:0);
        result.push({from,to,priority});
      }
    }
    result.sort((a,b)=>b.priority-a.priority);return result.slice(0,cap);
  }
  function mutate(b,m,actor){if(!m.pass){b[m.from]=-1;b[m.to]=actor;}}
  function undo(b,m,actor){if(!m.pass){b[m.to]=-1;b[m.from]=actor;}}
  function recordMove(actor,m){return m.pass?{player:actor,pass:true}:{player:actor,from:m.from,to:m.to};}
  function opponentCanFinish(b){
    if(E.progress(b,q)!==9)return false;
    const goal=(q+3)%6,missing=E.zones[goal].find(i=>b[i]!==q);
    if(b[missing]>=0)return false;
    for(let from=0;from<N;from++)if(b[from]===q&&E.zoneOf[from]!==goal){return destinations(b,from,rules).includes(missing);}
    return false;
  }
  function opponent(b,seen,scenario=0){
    const replies=moves(b,q);let best=null,bestV=-Infinity;
    if(!replies.length)return {pass:true,from:-1,to:-1};
    if(E.progress(b,q)===9){
      for(const m of replies){mutate(b,m,q);const win=E.isWinner(b,q);undo(b,m,q);if(win){mutate(b,m,q);return m;}}
    }
    const quick=[];
    for(const m of replies.slice(0,16)){
      mutate(b,m,q);
      let v=cheap(b,q,cache)-cheap(b,p,cache);
      if(E.isWinner(b,q))v=100000;
      const k=E.key(b,state.turn);if((history.get(k)||0)+(seen.get(k)||0)>=2)v-=1000;
      undo(b,m,q);quick.push({...m,replyValue:v});
    }
    quick.sort((a,b)=>b.replyValue-a.replyValue);
    const complete=[];
    for(const m of quick.slice(0,Number(options.replyWidth)||4)){
      mutate(b,m,q);let v=-value(b);
      const k=E.key(b,state.turn);if((history.get(k)||0)+(seen.get(k)||0)>=2)v-=1000;
      undo(b,m,q);complete.push({...m,responseScore:v});
    }
    complete.sort((a,b)=>b.responseScore-a.responseScore);best=complete[0];
    if(scenario===1&&complete.length>1)best=complete.find(m=>m.from!==complete[0].from&&m.responseScore>=complete[0].responseScore-12)||complete[1];
    if(best)mutate(b,best,q);return best;
  }
  const board=state.board.slice(),legal=E.legalMoves(board,p,rules);
  if(!legal.length)return {move:null,algorithm:'Team planner',planning:true,depth:0,nodes,time:performance.now()-started,candidates:[]};
  for(const m of legal){mutate(board,m,p);const won=E.isWinner(board,p);undo(board,m,p);if(won)return {move:m,algorithm:'Team planner',planning:true,depth:1,nodes:legal.length,time:performance.now()-started,score:100000,candidates:[{...m,score:100000}],solved:true};}
  const rootQuick=moves(board,p),byMove=new Map(legal.map(m=>[m.from+':'+m.to,m]));
  let chosen=byMove.get(rootQuick[0].from+':'+rootQuick[0].to)||legal[0],bestScore=-Infinity,candidates=[];
  const scored=[];
  try{
    // Retain a completed, deadline-safe greedy result even at a 20 ms budget.
    for(const m of rootQuick){
      check();mutate(board,m,p);let score,repeated=false;
      try{repeated=(history.get(E.key(board,1-state.turn))||0)>=2;score=repeated?0:opponentCanFinish(board)?-100000:value(board);}finally{undo(board,m,p);}
      if(score>bestScore){bestScore=score;chosen=byMove.get(m.from+':'+m.to);}
      scored.push({...m,score,repeated});
      if(score>=99900)return {move:chosen,algorithm:'Team planner',planning:true,depth:1,nodes,time:performance.now()-started,score,candidates:[{...chosen,score}],solved:true};
    }
    depth=1;scored.sort((a,b)=>b.score-a.score);candidates=scored.slice(0,5);
    options.onIteration?.({move:chosen,algorithm:'Team planner',planning:true,nodes,depth,hits,time:performance.now()-started,score:bestScore,candidates,solved:false});
    // Each surviving first move gets its own beam, preventing one attractive
    // opening move from wiping out all competing plans before horizon 6.
    const roots=scored.slice(0,Math.max(4,Number(options.width)||10));
    const beams=roots.map((root,index)=>[0,1].map(scenario=>{
      const b=board.slice();mutate(b,root,p);const seen=new Map();seen.set(E.key(b,1-state.turn),1);
      if(root.repeated)return {board:b,score:0,root,index,seen,scenario,trace:[root],line:[recordMove(p,root)],draw:true};
      const reply=opponent(b,seen,scenario);seen.set(E.key(b,state.turn),1);
      const draw=reply.pass&&!moves(b,p,1).length;
      return {board:b,score:draw?0:value(b),root,index,seen,scenario,trace:[root],line:[recordMove(p,root),recordMove(q,reply)],draw};
    }));
    for(let d=2;d<=Math.max(2,Number(options.depth)||8);d++){
      const nexts=[],evaluated=[];
      for(let ri=0;ri<beams.length;ri++){
        check();const expansion=[];
        for(const n of beams[ri]){
          if(n.draw||E.isWinner(n.board,p)||E.isWinner(n.board,q)){expansion.push(n);continue;}
          // Fast geometric filtering first; access-aware team evaluation then
          // rewards preparatory bridge moves that pay off on following turns.
          const ownMoves=moves(n.board,p,Number(options.expand)||14);
          if(!ownMoves.length)ownMoves.push({pass:true,from:-1,to:-1});
          for(const m of ownMoves){
            check();const b=n.board.slice();mutate(b,m,p);
            const seen=new Map(n.seen),k=E.key(b,1-state.turn),count=(history.get(k)||0)+(seen.get(k)||0);
            seen.set(k,(seen.get(k)||0)+1);
            const allStuck=m.pass&&!moves(b,q,1).length;
            let score=count>=2||allStuck?0:value(b),reply=null,draw=count>=2||allStuck;
            if(!draw&&score<99900){reply=opponent(b,seen,n.scenario);const k2=E.key(b,state.turn),repeat=(history.get(k2)||0)+(seen.get(k2)||0)>=2;seen.set(k2,(seen.get(k2)||0)+1);draw=repeat||(reply.pass&&!moves(b,p,1).length);score=draw?0:value(b);}
            expansion.push({board:b,root:n.root,index:ri,score,seen,draw,scenario:n.scenario,trace:n.trace.concat(m),line:n.line.concat(recordMove(p,m),...(reply?[recordMove(q,reply)]:[]))});
          }
        }
        expansion.sort((a,b)=>b.score-a.score);nexts[ri]=[0,1].map(s=>expansion.find(n=>n.scenario===s)).filter(Boolean);
        if(nexts[ri].length){const worse=nexts[ri].reduce((a,b)=>a.score<b.score?a:b);evaluated.push({...roots[ri],score:worse.score,plan:worse.line,selfPlan:worse.trace,scenarioScores:nexts[ri].map(n=>n.score)});}
      }
      // Replace the decision only after every candidate has equal horizon.
      if(!evaluated.length)break;
      evaluated.sort((a,b)=>b.score-a.score);
      chosen=byMove.get(evaluated[0].from+':'+evaluated[0].to);bestScore=evaluated[0].score;depth=d;candidates=evaluated.slice(0,5);
      options.onIteration?.({move:chosen,algorithm:'Team planner',planning:true,nodes,depth,hits,time:performance.now()-started,score:bestScore,candidates,solved:false,plan:candidates[0].plan});
      for(let i=0;i<beams.length;i++)beams[i]=nexts[i];
      if(bestScore>=99900)break;
    }
  }catch(e){if(e!==STOP)throw e;}
  return {move:chosen,algorithm:'Team planner',planning:true,nodes,depth,hits,simulations:0,time:performance.now()-started,score:bestScore,candidates,expired,solved:false,plan:candidates[0]?.plan};
}
const api={search,access,cheap,destinations,assignment:V.assignment,LEVELS:V.LEVELS};
if(typeof module==='object'&&module.exports)module.exports=api;else root.StarhopTeamPlanner=api;
})(typeof globalThis==='object'?globalThis:this);
