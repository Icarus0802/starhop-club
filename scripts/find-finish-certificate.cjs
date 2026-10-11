'use strict';
const E=require('../js/engine.js'),R=require('../js/repetition-rule.js');

// The restricted reverse database supplies possible routes, never a global
// shortest-distance claim. Replay every move on the real frozen board.
function validate(state,player,plan,ownRepetitions=[]){
  let current={...state,winner:null,draw:null,stopped:null};
  const counts=new Map(ownRepetitions);
  try{
    for(const move of plan){
      current=E.applyMove({...current,turn:current.players.indexOf(player)},move).state;
      const key=R.position(current.board,player),count=(counts.get(key)||0)+1;counts.set(key,count);
      if(R.enabled(state)&&count>=3&&current.winner===null)return false;
    }
    return current.winner===player||plan.length===0&&E.isWinner(current.board,player);
  }catch{return false;}
}

function find(state,options={}){
  const start=performance.now(),deadline=start+(options.time||5000),player=options.player??state.players[state.turn];
  const book=options.book||require('../benchmarks/finish-book-v2.cjs');book.load();
  const counts=new Map(options.ownRepetitions||[]),initial={...state,turn:state.players.indexOf(player),winner:null,draw:null,stopped:null};
  const queue=[{state:initial,plan:[]}],visited=new Set([R.position(state.board,player)]);
  const maxPrefix=options.prefixDepth??2,maxNodes=options.maxNodes??20000,target=options.target??Infinity;
  let best=null,expanded=0;
  for(let head=0;head<queue.length;head++){
    if(performance.now()>=deadline||expanded>=maxNodes)break;
    const node=queue[head];expanded++;
    const tail=book.continuation(node.state.board,player);
    if(tail){
      const plan=node.plan.concat(tail);
      if((!best||plan.length<best.length)&&validate(state,player,plan,counts)){
        best=plan;if(best.length<=target)break;
      }
    }
    if(node.plan.length>=maxPrefix)continue;
    for(const move of E.legalMoves(node.state.board,player,state.rules)){
      const next=E.applyMove({...node.state,turn:state.players.indexOf(player)},move).state,key=R.position(next.board,player);
      if(visited.has(key)||R.enabled(state)&&(counts.get(key)||0)>=2&&next.winner===null)continue;
      visited.add(key);const plan=node.plan.concat({from:move.from,to:move.to});
      if(next.winner===player){if(validate(state,player,plan,counts)&&(!best||plan.length<best.length))best=plan;continue;}
      queue.push({state:next,plan});
    }
    if(best&&best.length<=target)break;
  }
  return {status:best?'found':'unresolved',plan:best||[],upperBound:best?.length??null,expanded,time:performance.now()-start,shortest:false};
}
module.exports={find,validate};
