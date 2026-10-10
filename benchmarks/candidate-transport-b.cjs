/* Allocation-conscious two-player search. MIT; rules remain in engine.js.
 * Moves inside the tree are integers; the chosen move is validated again by
 * the shared rules engine and receives its canonical hop path at the boundary.
 * Late move reductions are explicitly reported as selective search. */
(function(root){
  'use strict';
  const E=typeof module==='object'&&module.exports?require('../js/engine.js'):root.Starhop;
  const fallback=typeof module==='object'&&module.exports?require('../js/ai.js'):root.StarhopAI;
  const N=121, STRIDE=128, SIZE=1<<18, MASK=SIZE-1, MAXPLY=72, WIN=100000;
  const near=E.zones.map((_,p)=>Int8Array.from(E.cells.map((__,i)=>Math.min(...E.zones[(p+3)%6].map(g=>E.distances[i][g])))));
  const neighbours=Int16Array.from(E.adjacent.flat());
  const jumpTo=Int16Array.from(E.rays.flatMap(row=>row.map(ray=>ray[1]??-1)));
  const zsLo=new Uint32Array(N*6),zsHi=new Uint32Array(N*6),turnLo=new Uint32Array(2),turnHi=new Uint32Array(2);
  let rand=0x5eadbeef;
  function rnd(){rand^=rand<<13;rand^=rand>>>17;rand^=rand<<5;return rand>>>0;}
  for(let i=0;i<zsLo.length;i++){zsLo[i]=rnd();zsHi[i]=rnd();}
  for(let i=0;i<2;i++){turnLo[i]=rnd();turnHi[i]=rnd();}
  const ttLo=new Uint32Array(SIZE),ttHi=new Uint32Array(SIZE),ttScore=new Float64Array(SIZE),ttMove=new Int16Array(SIZE),ttDepth=new Uint8Array(SIZE),ttFlag=new Uint8Array(SIZE);
  const cacheSize=1<<15,cacheLo=new Uint32Array(cacheSize),cacheHi=new Uint32Array(cacheSize),cacheValue=new Float64Array(cacheSize),cacheValid=new Uint8Array(cacheSize);
  const routeLo=new Uint32Array(cacheSize),routeHi=new Uint32Array(cacheSize),routeValue=new Float64Array(cacheSize),routeValid=new Uint8Array(cacheSize);
  // A worker runs one synchronous search at a time. Reuse scratch pages across
  // turns, avoiding a fresh multi-megabyte allocation and GC on every reply.
  const moveLists=Array.from({length:MAXPLY},()=>[]),moveScores=Array.from({length:MAXPLY},()=>new Float32Array(STRIDE*STRIDE));
  const historyScores=[new Int32Array(STRIDE*STRIDE),new Int32Array(STRIDE*STRIDE)],killer1=new Int16Array(MAXPLY),killer2=new Int16Array(MAXPLY);
  const visited=new Uint32Array(N),landings=new Uint32Array(N),queue=new Int16Array(N),stackLo=new Uint32Array(MAXPLY),stackHi=new Uint32Array(MAXPLY);let stamp=0;
  const needs=new Int16Array(10),outside=new Int16Array(10),outsideDistance=new Int8Array(10),selectedOutside=new Uint8Array(10),distanceMarks=new Uint32Array(N),needDistances=new Int8Array(N),routeParent=new Int16Array(N),routeBridge=new Int16Array(N);let distanceStamp=0;
  const campDepth=E.zones.map((_,p)=>{
    const goal=(p+3)%6,boundary=E.zones[goal].filter(i=>E.adjacent[i].some(to=>to>=0&&E.zoneOf[to]!==goal));
    return Int8Array.from(E.cells.map((__,i)=>Math.min(...boundary.map(g=>E.distances[i][g]))));
  });
  const staticOrder=E.zones.map((_,p)=>{
    const a=new Float32Array(STRIDE*STRIDE),goal=(p+3)%6;
    for(let from=0;from<N;from++)for(let to=0;to<N;to++){
      const d=near[p][from],e=near[p][to];
      a[from*STRIDE+to]=(d-e)*6+(d*d-e*e)*.08+(E.zoneOf[to]===goal?10:0)-(E.zoneOf[from]===goal?10:0)+(E.zoneOf[from]===p?3:0)-(E.zoneOf[to]===p?3:0);
    }
    return a;
  });
  let configuration='';
  function clear(){ttDepth.fill(0);cacheValid.fill(0);routeValid.fill(0);configuration='';}
  function search(state,options={}){
    if((state.winner!==null||state.draw)&&!options.inspect)return {move:null,algorithm:'Fast PVS',depth:0,nodes:0,time:0,candidates:[],solved:state.winner!==null};
    if(state.players.length!==2||options.algorithm==='mcts'||Number(options.level)===0)return fallback.search(state,options);
    const start=performance.now(),level=Math.max(0,Math.min(4,Number(options.level??4))),profile=fallback.LEVELS[level];
    const budget=Math.max(15,Math.min(30000,Number(options.time)||profile.time)),deadline=start+budget;
    const maxDepth=Math.min(MAXPLY-3,Number(options.depth)||profile.depth),selective=options.selective!==false;
    const board=Int8Array.from(state.board),players=state.players,pieces=[new Int16Array(10),new Int16Array(10)],slotAt=new Int8Array(N),counts=new Int8Array(2),ownLo=new Uint32Array(2),ownHi=new Uint32Array(2),goals=new Int8Array(2);
    let low=0,high=0;slotAt.fill(-1);
    for(let i=0;i<N;i++)if(board[i]>=0){
      const p=board[i],s=players.indexOf(p);if(s<0)continue;
      slotAt[i]=counts[s];pieces[s][counts[s]++]=i;const z=i*6+p;
      low^=zsLo[z];high^=zsHi[z];ownLo[s]^=zsLo[z];ownHi[s]^=zsHi[z];if(E.zoneOf[i]===(p+3)%6)goals[s]++;
    }
    if(counts[0]!==10||counts[1]!==10)throw new Error('每方必须有 10 枚棋子');
    // Keep finishing lines un-reduced even when a camp move temporarily pulls
    // a bridge back out of the goal and lowers the arrival count.
    const finishThreshold=Math.max(1,Math.min(10,Number(options.finishThreshold)||8));
    const rootFinishing=goals[0]>=finishThreshold||goals[1]>=finishThreshold;
    const weights={lag:Number(options.weights?.lag??.14),home:Number(options.weights?.home??2.2),done:Number(options.weights?.done??7),transport:Number(options.weights?.transport??1)};
    const legacyObjective=options.objective==='v13'||options.heuristic==='legacy';
    const heuristic=legacyObjective?'legacy':'hybrid-transport';
    const routeCorrection=legacyObjective?0:Math.max(0,Math.min(1,Number(options.routeCorrection??.25)));
    const cfg=players.join(',')+':'+state.rules.jump+':'+!!state.rules.goalLock+':'+selective+':'+rootFinishing+':'+finishThreshold+':'+heuristic+':'+routeCorrection+':'+weights.lag+':'+weights.home+':'+weights.done+':'+weights.transport;
    if(cfg!==configuration){ttDepth.fill(0);cacheValid.fill(0);routeValid.fill(0);configuration=cfg;}
    const long=state.rules.jump==='long',locked=!!state.rules.goalLock;
    historyScores[0].fill(0);historyScores[1].fill(0);killer1.fill(-1);killer2.fill(-1);
    const past=new Map();
    for(const [key,count]of options.repetitions||[]){
      const parts=key.split('|'),values=parts[0].split(','),turn=Number(parts[1]);let a=turnLo[turn],b=turnHi[turn];
      for(let i=0;i<N;i++){const p=Number(values[i]);if(p>=0){const z=i*6+p;a^=zsLo[z];b^=zsHi[z];}}
      a>>>=0;b>>>=0;let row=past.get(a);if(!row){row=[];past.set(a,row);}row.push([b,count]);
    }
    let nodes=0,hits=0,depth=0,value=0,expired=false,reductions=0,completedReductions=0,evals=0;
    const STOP={};
    function check(){if(performance.now()>=deadline){expired=true;throw STOP;}}
    function generate(actor,ply,pv=-1){
      const list=moveLists[ply];list.length=0;const scores=moveScores[ply],p=players[actor],goal=(p+3)%6,base=staticOrder[p],hs=historyScores[actor];
      for(let slot=0;slot<10;slot++){
        const from=pieces[actor][slot],mark=++stamp;visited[from]=mark;let head=0,tail=1;queue[0]=from;
        const fromGoal=locked&&E.zoneOf[from]===goal;
        for(let dir=0;dir<6;dir++){
          const to=neighbours[from*6+dir];if(to>=0&&board[to]<0&&(!fromGoal||E.zoneOf[to]===goal)){
            landings[to]=mark;const code=from*STRIDE+to;list.push(code);scores[code]=base[code]+Math.min(hs[code],2000)*.05;
          }
        }
        while(head<tail){
          const here=queue[head++],hereGoal=locked&&E.zoneOf[here]===goal;
          for(let dir=0;dir<6;dir++){
            let mid,to;
            if(!long){mid=neighbours[here*6+dir];to=jumpTo[here*6+dir];if(mid<0||to<0||mid===from||board[mid]<0||to!==from&&board[to]>=0)continue;}
            else{
              const ray=E.rays[here][dir];let k=0;
              while(k<ray.length&&(ray[k]===from||board[ray[k]]<0))k++;
              mid=ray[k];to=ray[2*k+1];if(mid===undefined||to===undefined||to!==from&&board[to]>=0)continue;
              let clear=true;for(let j=k+1;j<2*k+1;j++)if(ray[j]!==from&&board[ray[j]]>=0){clear=false;break;}if(!clear)continue;
            }
            if(visited[to]===mark||hereGoal&&E.zoneOf[to]!==goal)continue;
            visited[to]=mark;queue[tail++]=to;
            if(landings[to]!==mark){landings[to]=mark;const code=from*STRIDE+to;list.push(code);scores[code]=base[code]+Math.min(hs[code],2000)*.05;}
          }
        }
      }
      if(pv>=0)scores[pv]+=1000000;
      if(killer1[ply]>=0)scores[killer1[ply]]+=10000;
      if(killer2[ply]>=0)scores[killer2[ply]]+=5000;
      list.sort((a,b)=>scores[b]-scores[a]);return list;
    }
    function push(code,actor){
      const from=code>>>7,to=code&127,p=players[actor],slot=slotAt[from],zf=from*6+p,zt=to*6+p;
      board[from]=-1;board[to]=p;slotAt[from]=-1;slotAt[to]=slot;pieces[actor][slot]=to;
      low^=zsLo[zf]^zsLo[zt];high^=zsHi[zf]^zsHi[zt];ownLo[actor]^=zsLo[zf]^zsLo[zt];ownHi[actor]^=zsHi[zf]^zsHi[zt];
      const goal=(p+3)%6;goals[actor]+=(E.zoneOf[to]===goal?1:0)-(E.zoneOf[from]===goal?1:0);
    }
    function pop(code,actor){const reverse=(code&127)*STRIDE+(code>>>7);push(reverse,actor);}
    const u=new Float64Array(11),v=new Float64Array(11),match=new Int16Array(11),way=new Int16Array(11),minimum=new Float64Array(11),used=new Uint8Array(11);
    function matching(actor){
      u.fill(0);v.fill(0);match.fill(0);const holes=E.zones[(players[actor]+3)%6],pcs=pieces[actor];
      for(let i=1;i<=10;i++){
        match[0]=i;let j0=0;minimum.fill(Infinity);used.fill(0);
        do{
          used[j0]=1;const i0=match[j0];let delta=Infinity,j1=0;const dist=E.distances[pcs[i0-1]];
          for(let j=1;j<=10;j++)if(!used[j]){const cur=dist[holes[j-1]]-u[i0]-v[j];if(cur<minimum[j]){minimum[j]=cur;way[j]=j0;}if(minimum[j]<delta){delta=minimum[j];j1=j;}}
          for(let j=0;j<=10;j++)if(used[j]){u[match[j]]+=delta;v[j]-=delta;}else minimum[j]-=delta;
          j0=j1;
        }while(match[j0]!==0);
        do{const j1=way[j0];match[j0]=match[j1];j0=j1;}while(j0!==0);
      }
      return -v[0];
    }
    function quality(actor){
      const p=players[actor],a=ownLo[actor]>>>0,b=ownHi[actor]>>>0,index=a&(cacheSize-1);let result;
      if(cacheValid[index]&&cacheLo[index]===a&&cacheHi[index]===b)result=cacheValue[index];
      else{
        let lag=0,home=0,bridges=0;
        for(let slot=0;slot<10;slot++){
          const i=pieces[actor][slot],d=near[p][i];lag+=d*d;if(E.zoneOf[i]===p)home++;
          for(let dir=0;dir<6;dir++){const to=neighbours[i*6+dir];if(to>=0&&board[to]===p)bridges++;}
        }
        result=-matching(actor)*10-lag*weights.lag-home*weights.home+goals[actor]*weights.done+Math.min(bridges,16)*.13;
        cacheValid[index]=1;cacheLo[index]=a;cacheHi[index]=b;cacheValue[index]=result;
      }
      let routeCost=0;
      if(routeCorrection){
        const key=(low^turnLo[actor])>>>0,signature=(high^turnHi[actor])>>>0,at=key&(cacheSize-1);
        let cost;
        if(routeValid[at]&&routeLo[at]===key&&routeHi[at]===signature)cost=routeValue[at];
        else{cost=transport(actor);routeLo[at]=key;routeHi[at]=signature;routeValue[at]=cost;routeValid[at]=1;}
        routeCost=cost;
      }
      // Preserve the original transport reward as the main term; complete
      // routes add a smaller occupancy-sensitive correction instead of
      // replacing the already useful forward-jump reward wholesale.
      let cost=0;
      for(let slot=0;slot<10;slot++){
        const i=pieces[actor][slot],d=near[p][i];if(d<=2)continue;
        let gain=0,forward=0,exit=0;
        for(let dir=0;dir<6;dir++){
          const adj=neighbours[i*6+dir];if(adj>=0&&board[adj]<0){exit++;if(near[p][adj]<d)forward++;}
          let mid,to;
          if(!long){mid=adj;to=jumpTo[i*6+dir];if(mid<0||to<0||board[mid]<0||board[to]>=0)continue;}
          else{
            const ray=E.rays[i][dir];let k=0;while(k<ray.length&&board[ray[k]]<0)k++;
            mid=ray[k];to=ray[2*k+1];if(mid===undefined||to===undefined||board[to]>=0)continue;
            let valid=true;for(let j=k+1;j<2*k+1;j++)if(board[ray[j]]>=0){valid=false;break;}if(!valid)continue;
          }
          gain=Math.max(gain,d-near[p][to]);
        }
        if(gain===0)cost+=d*d*.045;
        if(!forward&&gain===0)cost+=d*.65;
        if(!exit&&gain===0)cost+=d*.9;
        cost-=Math.min(gain,4)*.7;
      }
      return result-(cost+routeCorrection*routeCost)*weights.transport;
    }
    function transport(actor,details=false){
      check();const p=players[actor],goal=(p+3)%6,stage=Math.max(0,(goals[actor]-5)/5),mark=++distanceStamp;
      let needCount=0,outsideCount=0,unfilledDepth=0,blockedHoles=0,cost=0,worst=0;
      for(const g of E.zones[goal])if(board[g]!==p){needs[needCount++]=g;unfilledDepth+=campDepth[p][g];if(board[g]>=0)blockedHoles++;}
      const distance=i=>{
        if(needCount===10)return near[p][i];
        if(distanceMarks[i]===mark)return needDistances[i];
        let d=99;for(let j=0;j<needCount;j++)d=Math.min(d,E.distances[i][needs[j]]);
        distanceMarks[i]=mark;needDistances[i]=d===99?0:d;return needDistances[i];
      };
      selectedOutside.fill(0);
      for(let slot=0;slot<10;slot++){const i=pieces[actor][slot];if(E.zoneOf[i]!==goal){outside[outsideCount]=i;outsideDistance[outsideCount]=distance(i);outsideCount++;}}
      // Full routes for the three slowest trailers, including distance ties so
      // board enumeration cannot arbitrarily hide an equally slow rear piece.
      // A finishing camp needs all remaining trailers.
      const count=goals[actor]>=6?outsideCount:Math.min(3,outsideCount);
      for(let n=0;n<count;n++){let chosen=-1;for(let j=0;j<outsideCount;j++)if(!selectedOutside[j]&&(chosen<0||outsideDistance[j]>outsideDistance[chosen]))chosen=j;selectedOutside[chosen]=1;}
      if(count){let threshold=99;for(let j=0;j<outsideCount;j++)if(selectedOutside[j])threshold=Math.min(threshold,outsideDistance[j]);for(let j=0;j<outsideCount;j++)if(outsideDistance[j]>=threshold)selectedOutside[j]=1;}
      const records=details?[]:null;
      for(let j=0;j<outsideCount;j++){
        check();const from=outside[j],d=near[p][from],fillDistance=outsideDistance[j];
        if(!selectedOutside[j]){
          let gain=0,forward=0,exit=0;
          for(let dir=0;dir<6;dir++){
            const adj=neighbours[from*6+dir];if(adj>=0&&board[adj]<0){exit++;if(near[p][adj]<d)forward++;}
            let mid,to;
            if(!long){mid=adj;to=jumpTo[from*6+dir];if(mid<0||to<0||board[mid]<0||board[to]>=0)continue;}
            else{const ray=E.rays[from][dir];let k=0;while(k<ray.length&&board[ray[k]]<0)k++;mid=ray[k];to=ray[2*k+1];if(mid===undefined||to===undefined||board[to]>=0)continue;let valid=true;for(let n=k+1;n<2*k+1;n++)if(board[ray[n]]>=0){valid=false;break;}if(!valid)continue;}
            gain=Math.max(gain,d-near[p][to]);
          }
          let penalty=(gain===0?d*d*.045:0)+(!forward&&gain===0?d*.65:0)+(!exit&&gain===0?d*.9:0)-Math.min(gain,4)*.7;cost+=penalty;
          if(details)records.push({cell:from,coordinate:E.coord(from),distance:d,fillDistance,fullRoute:false,cost:penalty});continue;
        }
        const visit=++stamp;visited[from]=visit;let head=0,tail=1;queue[0]=from;
        let remaining=99,bestCell=-1,hasLanding=false,canEnter=false;
        const landing=to=>{hasLanding=true;if(E.zoneOf[to]===goal)canEnter=true;const r=distance(to);if(r<remaining){remaining=r;bestCell=to;}};
        for(let dir=0;dir<6;dir++){const to=neighbours[from*6+dir];if(to>=0&&board[to]<0){if(details){routeParent[to]=from;routeBridge[to]=-1;}landing(to);}}
        while(head<tail){
          if((head&31)===0)check();const here=queue[head++],inGoal=locked&&E.zoneOf[here]===goal;
          for(let dir=0;dir<6;dir++){
            let mid,to;
            if(!long){mid=neighbours[here*6+dir];to=jumpTo[here*6+dir];if(mid<0||to<0||mid===from||board[mid]<0||to!==from&&board[to]>=0)continue;}
            else{const ray=E.rays[here][dir];let k=0;while(k<ray.length&&(ray[k]===from||board[ray[k]]<0))k++;mid=ray[k];to=ray[2*k+1];if(mid===undefined||to===undefined||to!==from&&board[to]>=0)continue;let valid=true;for(let n=k+1;n<2*k+1;n++)if(ray[n]!==from&&board[ray[n]]>=0){valid=false;break;}if(!valid)continue;}
            if(visited[to]===visit||inGoal&&E.zoneOf[to]!==goal)continue;visited[to]=visit;queue[tail++]=to;
            if(details){routeParent[to]=here;routeBridge[to]=mid;}landing(to);
          }
        }
        const gain=hasLanding?Math.max(0,fillDistance-remaining):0,estimate=hasLanding?1+remaining/Math.max(1,gain):fillDistance+6;
        const entryPenalty=d<=2&&!canEnter?(3-d)*(1.2+stage*1.8):0,penalty=estimate*(1.25+stage*1.2)+entryPenalty+(gain<=1?Math.max(0,fillDistance-2)*(.22+stage*.35):0);
        cost+=penalty;worst=Math.max(worst,estimate);
        if(details){const supports=[];let i=bestCell,steps=0;while(i>=0&&i!==from&&steps++<N){const mid=routeBridge[i];if(mid>=0&&board[mid]===p&&!supports.includes(mid))supports.push(mid);i=routeParent[i];}records.push({cell:from,coordinate:E.coord(from),distance:d,fillDistance,fullRoute:true,remaining:hasLanding?remaining:null,gain,turnEstimate:estimate,canEnter,hasLanding,cost:penalty,routeSupports:supports});}
      }
      const bottleneck=worst*(.8+stage*1.2),campCost=unfilledDepth*stage*1.35+blockedHoles*(2+stage*4);cost+=bottleneck+campCost;
      return details?{cost,stage,bottleneck,campCost,blockedHoles,unfilledDepth,pieces:records}:cost;
    }
    function evaluate(actor){evals++;return quality(actor)-quality(actor^1);}
    function repetitions(a,b,ply){
      let repeat=0;const row=past.get(a);if(row)for(const item of row)if(item[0]===b){repeat+=item[1];break;}
      for(let i=0;i<ply;i++)if(stackLo[i]===a&&stackHi[i]===b)repeat++;return repeat;
    }
    function ab(left,actor,alpha,beta,ply){
      nodes++;if((nodes&255)===0)check();
      if(goals[actor]===10)return WIN;if(goals[actor^1]===10)return -WIN;
      const a=(low^turnLo[actor])>>>0,b=(high^turnHi[actor])>>>0,repeat=repetitions(a,b,ply);
      if(repeat>=3)return 0;
      if(left===0)return evaluate(actor);
      const index=a&MASK,known=ttDepth[index]&&ttLo[index]===a&&ttHi[index]===b,pv=known?ttMove[index]:-1,original=alpha;
      if(known&&ttDepth[index]>=left&&repeat<=1){
        hits++;const val=ttScore[index],flag=ttFlag[index];if(flag===0||flag===1&&val>=beta||flag===2&&val<=alpha)return val;
      }
      const list=generate(actor,ply,pv);stackLo[ply]=a;stackHi[ply]=b;
      if(!list.length){if(!generate(actor^1,ply+1).length)return 0;return -ab(left-1,actor^1,-beta,-alpha,ply+1);}
      let best=-Infinity,bestMove=list[0];
      for(let i=0;i<list.length;i++){
        const code=list[i],finishing=rootFinishing||goals[actor]>=finishThreshold||goals[actor^1]>=finishThreshold;push(code,actor);let child;
        try{
          if(i===0||options.pvs===false)child=-ab(left-1,actor^1,-beta,-alpha,ply+1);
          else{
            let reduce=0;
            if(selective&&!finishing&&left>=3&&i>=6&&code!==pv&&code!==killer1[ply]&&code!==killer2[ply]){reduce=left>=5&&i>=16?2:1;reductions++;}
            child=-ab(left-1-reduce,actor^1,-alpha-.001,-alpha,ply+1);
            if(reduce&&child>alpha)child=-ab(left-1,actor^1,-alpha-.001,-alpha,ply+1);
            if(child>alpha&&child<beta)child=-ab(left-1,actor^1,-beta,-alpha,ply+1);
          }
        }finally{pop(code,actor);}
        if(child>best){best=child;bestMove=code;}if(child>alpha)alpha=child;
        if(alpha>=beta){historyScores[actor][code]=Math.min(100000,historyScores[actor][code]+left*left);if(killer1[ply]!==code){killer2[ply]=killer1[ply];killer1[ply]=code;}break;}
      }
      if(repeat<=1){ttLo[index]=a;ttHi[index]=b;ttMove[index]=bestMove;ttScore[index]=best;ttDepth[index]=left;ttFlag[index]=best<=original?2:best>=beta?1:0;}
      return best;
    }
    const actor=state.turn;
    if(options.inspect)return {score:evaluate(actor),heuristic,routeCorrection,finishThreshold,sides:players.map((player,a)=>({player,arrived:goals[a],matching:matching(a),quality:quality(a),transport:transport(a,true)}))};
    let rootMoves=generate(actor,0).slice(),rootRestricted=false,rootAllowed=null;
    stackLo[0]=(low^turnLo[actor])>>>0;stackHi[0]=(high^turnHi[actor])>>>0;
    if(options.legalMovesOnly)return {moves:rootMoves.map(code=>({from:code>>>7,to:code&127}))};
    // A planning policy can pass a shortlist to spend a small tactical budget
    // comparing its final candidates. Immediate wins are scanned before this
    // filter, and only shared-rule legal endpoints enter the restriction.
    if(!rootMoves.length)return {move:null,algorithm:'Fast PVS',depth:0,nodes:0,time:performance.now()-start,candidates:[],selective};
    let best=rootMoves[0],candidates=[];
    for(const code of rootMoves){push(code,actor);const won=goals[actor]===10;pop(code,actor);if(won){const move=E.pieceMoves(state.board,code>>>7,state.rules).find(m=>m.to===(code&127));return {move,algorithm:'Fast PVS',depth:1,nodes:rootMoves.length,time:performance.now()-start,score:WIN,candidates:[{...move,score:WIN}],solved:true,selective:false};}}
    if(Array.isArray(options.rootMoves)&&options.rootMoves.length){
      const allow=new Set(options.rootMoves.map(m=>typeof m==='number'?m:m.from*STRIDE+m.to)),filtered=rootMoves.filter(code=>allow.has(code));
      if(filtered.length){rootMoves=filtered;rootRestricted=true;rootAllowed=allow;}
    }
    // Retain the best evaluated one-ply candidate if a deeper iteration misses
    // its deadline. A busy browser can also interrupt this initial scan safely.
    try{
      let greedy=-Infinity;
      for(const code of rootMoves){check();push(code,actor);let score;try{score=evaluate(actor);}finally{pop(code,actor);}if(score>greedy){greedy=score;best=code;value=score;}}
      for(let d=1;d<=maxDepth;d++){
        check();const all=generate(actor,0,best),sorted=rootRestricted?all.filter(code=>rootAllowed.has(code)):all,scored=[];let alpha=-Infinity,v=-Infinity,chosen=best;
        for(const code of sorted){
          check();push(code,actor);let score;try{score=-ab(d-1,actor^1,-Infinity,-alpha,1);}finally{pop(code,actor);}
          scored.push({code,score,bound:score<=alpha?'upper':'exact'});
          if(score>v){v=score;chosen=code;}if(v>alpha)alpha=v;
        }
        best=chosen;value=v;depth=d;completedReductions=reductions;candidates=scored.sort((a,b)=>b.score-a.score).slice(0,5);
        if(typeof options.onIteration==='function')options.onIteration({depth,nodes,hits,time:performance.now()-start,score:value,selective,reductions:completedReductions});
        if(Math.abs(v)>=WIN)break;
      }
    }catch(error){if(error!==STOP)throw error;}
    const canonical=code=>E.pieceMoves(state.board,code>>>7,state.rules).find(m=>m.to===(code&127));
    const move=canonical(best);if(!move)throw new Error('Fast search produced an illegal move');
    return {move,algorithm:selective?'Fast PVS · selective':'Fast PVS',nodes,depth,hits,simulations:0,time:performance.now()-start,score:value,candidates:candidates.map(c=>({...canonical(c.code),score:c.score,bound:c.bound})),expired,solved:!selective&&!rootRestricted&&Math.abs(value)>=WIN,selective,rootRestricted,reductions:completedReductions,evaluations:evals,heuristic,routeCorrection,finishThreshold};
  }
  // Test/debug interface returns endpoints only; production returns canonical
  // paths from engine.js. This deliberately keeps rules verification independent.
  const api={search,clear,LEVELS:fallback.LEVELS,assignment:fallback.assignment,seeded:fallback.seeded};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.StarhopFastAI=api;
})(typeof globalThis==='object'?globalThis:this);
