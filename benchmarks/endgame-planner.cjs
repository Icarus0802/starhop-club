/* Isolated late-game finishing experiment. MIT.
 * A* solves the player's real legal move graph with the other side frozen.
 * Such a plan is an estimate of transport cost, never a forced game win. */
'use strict';
const E=require('../js/engine.js'),P=require('../js/team-planner.js');
const bits=Array.from({length:121},(_,i)=>1n<<BigInt(i));
const nearest=E.zones.map((_,p)=>E.cells.map((__,i)=>Math.min(...E.zones[(p+3)%6].map(g=>E.distances[i][g]))));
function canFinish(board,p,rules){
  if(E.progress(board,p)!==9)return false;
  const goal=(p+3)%6,hole=E.zones[goal].find(i=>board[i]!==p);if(board[hole]>=0)return false;
  for(let from=0;from<121;from++)if(board[from]===p&&E.zoneOf[from]!==goal)return E.pieceMoves(board,from,rules).some(m=>m.to===hole);
  return false;
}
class Heap{
  constructor(){this.items=[];}
  less(a,b){return a.f<b.f||a.f===b.f&&(a.rank<b.rank||a.rank===b.rank&&a.g>b.g);}
  push(node){const a=this.items;let i=a.length;a.push(node);while(i){const p=(i-1)>>1;if(!this.less(node,a[p]))break;a[i]=a[p];i=p;}a[i]=node;}
  pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let k=i*2+1;if(k+1<a.length&&this.less(a[k+1],a[k]))k++;if(!this.less(a[k],last))break;a[i]=a[k];i=k;}a[i]=last;}return top;}
  get length(){return this.items.length;}
}
function finish(state,options={}){
  const started=performance.now(),budget=Math.max(1,Math.min(1000,Number(options.time)||50)),deadline=started+budget,maxDepth=Math.max(1,Math.min(12,Number(options.depth)||6));
  const p=Number(options.player??state.players[state.turn]),goal=(p+3)%6,opponent=state.players.find(q=>q!==p),rules=state.rules;
  const holes=E.zones[goal],board=state.board.slice(),history=new Map(options.repetitions||[]);let nodes=0,expanded=0,defensePruned=0;
  const result=(status,extra={})=>({status,plan:[],nodes,expanded,defensePruned,time:performance.now()-started,frozenOpponent:true,forcedWin:false,...extra});
  if(holes.some(i=>board[i]>=0&&board[i]!==p))return result('blocked-by-frozen-opponent');
  let mask=0n,arrived=0,count=0;for(let i=0;i<121;i++)if(board[i]===p){mask|=bits[i];count++;arrived+=E.zoneOf[i]===goal;}
  if(count!==10)throw new Error('每方必须有 10 枚棋子');
  if(arrived===10)return result('finished',{distance:0,shortest:true});
  if(10-arrived>maxDepth)return result('beyond-depth');
  const rank=b=>{let value=0;const missing=holes.filter(i=>b[i]!==p);for(let i=0;i<121;i++)if(b[i]===p&&E.zoneOf[i]!==goal){let d=99;for(const g of missing)d=Math.min(d,E.distances[i][g]);value+=d*d+nearest[p][i];}return value;};
  const open=new Heap(),visited=new Map([[mask,0]]);
  open.push({board,mask,g:0,arrived,f:10-arrived,rank:rank(board),parent:null,move:null});
  while(open.length){
    if(performance.now()>=deadline)return result('timeout');
    const node=open.pop();if(visited.get(node.mask)!==node.g)continue;
    if(node.arrived===10){
      const plan=[];for(let n=node;n.parent;n=n.parent)plan.push(n.move);plan.reverse();
      // Outside-piece count is admissible. If defense pruned no edges, this is
      // minimum own-move length in the full frozen-board graph. Otherwise the
      // minimum is conditional on excluding immediate-loss positions.
      return result('found',{plan,distance:plan.length,shortest:defensePruned===0,shortestSafe:true});
    }
    if(node.g>=maxDepth)continue;expanded++;
    const moves=E.legalMoves(node.board,p,rules);
    for(const move of moves){
      const g=node.g+1,arrived=node.arrived+(E.zoneOf[move.to]===goal?1:0)-(E.zoneOf[move.from]===goal?1:0);if(g+10-arrived>maxDepth)continue;
      const mask=node.mask^bits[move.from]^bits[move.to];if((visited.get(mask)??Infinity)<=g)continue;
      const b=node.board.slice();b[move.from]=-1;b[move.to]=p;nodes++;
      // Even in a frozen-board plan, never walk past an available opponent
      // finish. Such a path would lose as soon as that opponent resumed moving.
      if(arrived<10&&options.defend!==false&&canFinish(b,opponent,rules)){defensePruned++;continue;}
      if(node.g===0){
        const nextTurn=(state.players.indexOf(p)+1)%state.players.length;
        if((history.get(E.key(b,nextTurn))||0)>=2)continue;
      }
      visited.set(mask,g);open.push({board:b,mask,g,arrived,f:g+10-arrived,rank:rank(b),parent:node,move});
    }
  }
  return result('unreachable-within-depth');
}
function search(state,options={}){
  if(state.winner!==null||state.draw||state.players.length!==2||Number(options.level??4)<2||options.algorithm==='mcts')return P.search(state,options);
  const started=performance.now(),budget=Math.max(20,Math.min(30000,Number(options.time)||250)),p=state.players[state.turn],q=state.players[state.turn^1];
  const done=E.progress(state.board,p);
  if(done<7||done===10)return P.search(state,options);
  const finishing=finish(state,{...options,time:Math.min(50,budget*.35),depth:6});
  if(finishing.status==='found'){
    const move=finishing.plan[0],b=state.board.slice();b[move.from]=-1;b[move.to]=p;
    const immediate=E.isWinner(b,p);
    // A future finish prediction is not treated as terminal score or a win.
    if(immediate||!canFinish(b,q,state.rules))return {move,algorithm:'Frozen-board finish planner',planning:true,nodes:finishing.nodes,depth:finishing.distance,hits:0,simulations:0,time:performance.now()-started,score:immediate?100000:1000-finishing.distance*10,candidates:[{...move,score:immediate?100000:1000-finishing.distance*10}],plan:finishing.plan.map(m=>({player:p,from:m.from,to:m.to})),solved:immediate,finish:finishing,expired:false};
  }
  const planned=P.search(state,{...options,time:Math.max(20,budget-(performance.now()-started))});
  return {...planned,nodes:planned.nodes+finishing.nodes,time:performance.now()-started,finish:finishing};
}
module.exports={...P,search,finish,canFinish};
