/* Search inspired by the upstream Alpha-Beta AI; rewritten with correct
 * full-star rules, deadlines, transpositions, exact goal assignment and MCTS.
 * MIT — see ../LICENSE and ../THIRD_PARTY.md. */
(function(root){
  'use strict';
  const E=typeof module==='object'&&module.exports?require('../js/engine.js'):root.Starhop;
  const LEVELS=[
    {name:'小跳',label:'入门',time:100,depth:1,noise:0.7},
    {name:'青竹',label:'基础',time:250,depth:2,noise:0.12},
    {name:'飞跃',label:'进阶',time:500,depth:8,noise:0},
    {name:'玄石',label:'高手',time:900,depth:12,noise:0},
    {name:'星河',label:'挑战',time:1500,depth:20,noise:0}
  ];
  const nearest=E.zones.map((_,p)=>E.cells.map((__,i)=>Math.min(...E.zones[(p+3)%6].map(g=>E.distances[i][g]))));
  // Cheap occupancy-sensitive escape evaluation. Enemy pieces are also bridges;
  // a stationary rear piece is costly even when its geometric distance is small.
  function transport(board,p,rules={}){
    let cost=0;
    for(let i=0;i<121;i++)if(board[i]===p){
      const d=nearest[p][i];if(d<=2)continue;
      let gain=0,forward=0,exit=0;
      for(let dir=0;dir<6;dir++){
        const a=E.adjacent[i][dir];if(a>=0&&board[a]<0){exit++;if(nearest[p][a]<d)forward++;}
        const ray=E.rays[i][dir];let n=0;
        if(rules.jump==='long')while(n<ray.length&&board[ray[n]]<0)n++;
        const mid=ray[n],to=ray[2*n+1];if(mid===undefined||to===undefined||board[mid]<0||board[to]>=0)continue;
        let clear=true;for(let k=n+1;k<2*n+1;k++)if(board[ray[k]]>=0){clear=false;break;}
        if(clear)gain=Math.max(gain,d-nearest[p][to]);
      }
      if(gain===0)cost+=d*d*.09;
      if(!forward&&gain===0)cost+=d*1.1;
      if(!exit&&gain===0)cost+=d*.9;
      cost-=Math.min(gain,4)*1.1;
    }
    return cost;
  }
  // Hungarian algorithm: exact minimum-cost matching to ALL ten goal holes.
  // Unlike tip-distance alone, this remains informative in crowded endgames.
  function assignment(board,p){
    const pieces=[];for(let i=0;i<121;i++)if(board[i]===p)pieces.push(i);
    const goals=E.zones[(p+3)%6], n=pieces.length;
    if(n!==10)throw new Error('每方必须有 10 枚棋子');
    const u=new Float64Array(n+1),v=new Float64Array(n+1),match=new Int16Array(n+1),way=new Int16Array(n+1);
    for(let i=1;i<=n;i++){
      match[0]=i;let j0=0;const min=Array(n+1).fill(Infinity),used=Array(n+1).fill(false);
      do{
        used[j0]=true;const i0=match[j0];let delta=Infinity,j1=0;
        for(let j=1;j<=n;j++)if(!used[j]){
          const d=E.distances[pieces[i0-1]][goals[j-1]];
          const cost=d*10;const cur=cost-u[i0]-v[j];
          if(cur<min[j]){min[j]=cur;way[j]=j0;}if(min[j]<delta){delta=min[j];j1=j;}
        }
        for(let j=0;j<=n;j++){if(used[j]){u[match[j]]+=delta;v[j]-=delta;}else min[j]-=delta;}
        j0=j1;
      }while(match[j0]!==0);
      do{const j1=way[j0];match[j0]=match[j1];j0=j1;}while(j0!==0);
    }
    return Math.max(0,-v[0]/10);
  }
  function seeded(seed){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  function search(state,options={}){
    const start=performance.now(),level=Math.max(0,Math.min(4,Number(options.level??2))),profile=LEVELS[level];
    const budget=Math.max(30,Math.min(30000,Number(options.time)||profile.time)), deadline=start+budget;
    const rng=options.seed===undefined?Math.random:seeded(options.seed), player=state.players[state.turn];
    let nodes=0,depth=0,hits=0,simulations=0,expired=false;
    const STOP={},table=new Map(),evalCache=new Map(),moveHistory=new Map(),killers=new Map();
    const history=new Map(options.repetitions||[]),path=new Map();
    function check(){if(performance.now()>=deadline){expired=true;throw STOP;}}
    function quality(board,p){
      const pieces=[];let home=0,done=0,lag=0,bridges=0;
      const goal=(p+3)%6;
      for(let i=0;i<121;i++)if(board[i]===p){
        pieces.push(i);if(E.zoneOf[i]===p)home++;if(E.zoneOf[i]===goal)done++;
        const d=nearest[p][i];lag+=d*d;
        for(const near of E.adjacent[i])if(near>=0&&board[near]===p)bridges++;
      }
      const cacheKey=p+':'+pieces.join('.');let value=evalCache.get(cacheKey);
      if(value===undefined){value=-assignment(board,p)*10-lag*0.14-home*2.2+done*7+Math.min(bridges,16)*0.13;
        if(evalCache.size>80000)evalCache.clear();evalCache.set(cacheKey,value);}
      return value-transport(board,p,state.rules);
    }
    function evaluate(board){const other=state.players.find(p=>p!==player);return quality(board,player)-quality(board,other);}
    function ordered(board,p,pv,remaining=0){
      const goal=(p+3)%6,tip=E.zones[goal].reduce((a,b)=>E.distances[E.zones[p][0]][a]>E.distances[E.zones[p][0]][b]?a:b);
      return E.legalMoves(board,p,state.rules).map(m=>{
        let score=(E.distances[m.from][tip]-E.distances[m.to][tip])*5;
        score+=(E.zoneOf[m.to]===goal?12:0)-(E.zoneOf[m.from]===goal?12:0);
        score+=(E.zoneOf[m.from]===p?3:0)-(E.zoneOf[m.to]===p?3:0);
        if(pv&&m.from===pv.from&&m.to===pv.to)score+=10000;
        const mk=p+':'+m.from+':'+m.to;score+=Math.min(moveHistory.get(mk)||0,200)*.1;if(killers.get(remaining)===mk)score+=250;score+=Math.min(m.path.length-2,5)*0.05;return {...m,order:score};
      }).sort((a,b)=>b.order-a.order);
    }
    function push(board,m,p){board[m.from]=-1;board[m.to]=p;}
    function pop(board,m,p){board[m.to]=-1;board[m.from]=p;}
    function terminal(board,remaining){for(const p of state.players)if(E.isWinner(board,p))return p===player?100000+remaining:-100000-remaining;return null;}
    const board=state.board.slice(), rootMoves=ordered(board,player),algorithm=options.algorithm==='mcts'||state.players.length>2?'MCTS':'Alpha-Beta';
    if(!rootMoves.length)return {move:null,algorithm,nodes,depth:0,time:performance.now()-start,candidates:[]};
    let best=rootMoves[0],value=0,candidates=[];
    // Check every immediate finish even at the lowest level.
    for(const m of rootMoves){push(board,m,player);const won=E.isWinner(board,player);pop(board,m,player);if(won)return {move:m,algorithm,nodes:rootMoves.length,depth:1,time:performance.now()-start,score:100000,candidates:[{...m,score:100000}],solved:true};}
    if(level===0 && algorithm!=='MCTS'){
      const scored=rootMoves.map(m=>{push(board,m,player);const score=evaluate(board);pop(board,m,player);nodes++;return {...m,score};}).sort((a,b)=>b.score-a.score);
      const spread=level===0?Math.min(scored.length,8):Math.min(scored.length,3);
      best=scored[rng()<profile.noise?Math.floor(rng()*spread):0];value=best.score;candidates=scored.slice(0,5);depth=1;
    }else if(algorithm==='Alpha-Beta'){
      function ab(plyLeft,turn,alpha,beta){
        nodes++;if((nodes&31)===0)check();
        const term=terminal(board,plyLeft);if(term!==null)return term;
        const k=E.key(board,turn),repeat=(history.get(k)||0)+(path.get(k)||0);if(repeat>=3)return 0;
        if(plyLeft===0)return evaluate(board);
        const old=table.get(k),origA=alpha,origB=beta;
        // Repeated nodes are path-dependent: do not reuse their table bounds.
        if(old&&old.depth>=plyLeft&&repeat<=1){hits++;if(old.flag===0)return old.value;if(old.flag===1)alpha=Math.max(alpha,old.value);else beta=Math.min(beta,old.value);if(alpha>=beta)return old.value;}
        const p=state.players[turn],max=p===player,moves=old?.moves?old.moves.slice():ordered(board,p,old?.move,plyLeft);
        if(!moves.length){
          if(state.players.every(s=>!E.legalMoves(board,s,state.rules).length))return 0;
          return ab(plyLeft-1,(turn+1)%state.players.length,alpha,beta);
        }
        let v=max?-Infinity:Infinity,chosen=moves[0];
        path.set(k,(path.get(k)||0)+1);
        try{
          for(let mi=0;mi<moves.length;mi++){
            const m=moves[mi];push(board,m,p);let child;
            try{
              // Principal variation search: other moves first get a narrow
              // window, then a full search if they can improve the best line.
              if(mi===0)child=ab(plyLeft-1,(turn+1)%state.players.length,alpha,beta);
              else if(max){child=ab(plyLeft-1,(turn+1)%state.players.length,alpha,Math.min(beta,alpha+.001));if(child>alpha&&child<beta)child=ab(plyLeft-1,(turn+1)%state.players.length,alpha,beta);}
              else{child=ab(plyLeft-1,(turn+1)%state.players.length,Math.max(alpha,beta-.001),beta);if(child<beta&&child>alpha)child=ab(plyLeft-1,(turn+1)%state.players.length,alpha,beta);}
            }finally{pop(board,m,p);}
            if(max?child>v:child<v){v=child;chosen=m;}if(max)alpha=Math.max(alpha,v);else beta=Math.min(beta,v);if(alpha>=beta){const mk=p+':'+m.from+':'+m.to;moveHistory.set(mk,(moveHistory.get(mk)||0)+plyLeft*plyLeft);killers.set(plyLeft,mk);break;}
          }
        }finally{const n=path.get(k)-1;if(n)path.set(k,n);else path.delete(k);}
        if(repeat<=1){if(table.size>120000)table.clear();if(chosen!==moves[0]){const at=moves.indexOf(chosen);moves.splice(at,1);moves.unshift(chosen);}table.set(k,{depth:plyLeft,value:v,move:chosen,moves,flag:v<=origA?2:v>=origB?1:0});}
        return v;
      }
      try{
        // Full-width search: no arbitrary move truncation. Only completed
        // iterations replace the last usable answer when the deadline expires.
        for(let d=1;d<=(options.depth||profile.depth);d++){
          check();const sorted=ordered(board,player,best),scored=[];let a=-Infinity,chosen=best,v=-Infinity;
          for(const m of sorted){
            check();push(board,m,player);let score;
            try{score=ab(d-1,(state.turn+1)%2,a,Infinity);}finally{pop(board,m,player);}
            // A fail-low score is an upper bound; marked in analysis output.
            scored.push({...m,score,bound:score<=a?'upper':'exact'});
            if(score>v){v=score;chosen=m;}a=Math.max(a,v);
          }
          best=chosen;value=v;depth=d;candidates=scored.sort((a,b)=>b.score-a.score).slice(0,5);
          if(Math.abs(v)>=99900)break;
        }
      }catch(e){if(e!==STOP)throw e;}
    }else{
      function rewards(b){
        const winner=state.players.find(p=>E.isWinner(b,p));
        if(winner!==undefined)return state.players.map(p=>p===winner?1:0);
        const scores=state.players.map(p=>quality(b,p)),max=Math.max(...scores),weights=scores.map(s=>Math.exp((s-max)/60)),sum=weights.reduce((a,b)=>a+b,0);return weights.map(w=>w/sum);
      }
      function node(b,turn,move=null,parent=null){
        const moves=ordered(b,state.players[turn]);
        return {board:b,turn,move,parent,moves,children:[],visits:0,sums:Array(state.players.length).fill(0),terminal:state.players.some(p=>E.isWinner(b,p))};
      }
      const tree=node(board.slice(),state.turn);
      try{
        while(true){
          check();simulations++;let n=tree;const branch=[n];
          while(!n.terminal){
            const width=Math.min(n.moves.length,Math.max(3,Math.floor(Math.sqrt(n.visits+1)*1.7)));
            if(n.children.length<width){
              const m=n.moves[n.children.length],b=n.board.slice();push(b,m,state.players[n.turn]);
              const child=node(b,(n.turn+1)%state.players.length,m,n);n.children.push(child);n=child;branch.push(n);break;
            }
            if(!n.children.length)break;
            const log=Math.log(n.visits+1),actor=n.turn;let chosen=null,highest=-Infinity;
            for(const c of n.children){const u=c.sums[actor]/Math.max(c.visits,1)+0.65*Math.sqrt(log/Math.max(c.visits,1))+0.06*c.move.order/(c.visits+1);if(u>highest){highest=u;chosen=c;}}
            n=chosen;branch.push(n);
          }
          const b=n.board.slice();let turn=n.turn;const seen=new Set();
          for(let t=0;t<10&&!state.players.some(p=>E.isWinner(b,p));t++){
            if((t&3)===0)check();const p=state.players[turn],moves=ordered(b,p);if(!moves.length)break;
            let chosen=moves[0],qualityBest=-Infinity;
            for(const m of moves.slice(0,10)){
              push(b,m,p);const k=E.key(b,(turn+1)%state.players.length),v=quality(b,p)-(seen.has(k)?80:0)+(rng()-0.5)*4;pop(b,m,p);
              if(v>qualityBest){qualityBest=v;chosen=m;}
            }
            push(b,chosen,p);turn=(turn+1)%state.players.length;seen.add(E.key(b,turn));nodes++;
          }
          const reward=rewards(b);for(const c of branch){c.visits++;reward.forEach((v,i)=>c.sums[i]+=v);}
        }
      }catch(e){if(e!==STOP)throw e;}
      candidates=tree.children.filter(c=>c.visits).sort((a,b)=>b.visits-a.visits).slice(0,5).map(c=>({...c.move,visits:c.visits,score:c.sums[state.turn]/c.visits}));
      if(candidates.length){best=candidates[0];value=best.score;}depth=0;
    }
    return {move:{from:best.from,to:best.to,path:best.path},algorithm,nodes,depth,hits,simulations,time:performance.now()-start,score:value,candidates,expired,solved:Math.abs(value)>=99900};
  }
  const api={LEVELS,assignment,search,seeded,transport};if(typeof module==='object'&&module.exports)module.exports=api;else root.StarhopAI=api;
})(typeof globalThis==='object'?globalThis:this);
