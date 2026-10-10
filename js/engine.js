/* Adapted from jumpogpo/ai-chinese-checker, MIT © 2022 arthur-x.
 * Standard star geometry and breadth-first multi-hop generation retained;
 * rewritten 2026-10-10 for one shared 121-hole rules engine. */
(function (root) {
  'use strict';
  const DIRS = [[-1,-1],[-1,1],[0,-2],[0,2],[1,-1],[1,1]];
  const cells = [], lookup = new Map();
  // Upstream 17 × 25 standard star (not its reduced 17 × 17 AI board).
  for (let r=0;r<17;r++) {
    const lo = r<4 ? 12-r : r>12 ? r-4 : r<=8 ? r-4 : 12-r;
    const hi = 24-lo;
    for (let c=lo;c<=hi;c+=2) { lookup.set(`${r},${c}`,cells.length); cells.push({r,c}); }
  }
  const at = (r,c) => lookup.get(`${r},${c}`) ?? -1;
  const zones = [[],[],[],[],[],[]];
  cells.forEach(({r,c},i) => {
    if(r<4) zones[0].push(i);
    else if(r>12) zones[3].push(i);
    else if(r<8 && c>=r+14) zones[1].push(i);
    else if(r>8 && c>=30-r) zones[2].push(i);
    else if(r>8 && c<=r-6) zones[4].push(i);
    else if(r<8 && c<=10-r) zones[5].push(i);
  });
  const zoneOf = Array(121).fill(-1);
  zones.forEach((z,p)=>z.forEach(i=>zoneOf[i]=p));
  const adjacent = cells.map(({r,c})=>DIRS.map(([dr,dc])=>at(r+dr,c+dc)));
  const distance = (a,b) => {
    const dr=cells[a].r-cells[b].r, dq=(cells[a].c-cells[b].c-dr)/2;
    return (Math.abs(dr)+Math.abs(dq)+Math.abs(dr+dq))/2;
  };
  const distances = cells.map((_,a)=>cells.map((_,b)=>distance(a,b)));
  const orders = {2:[3,0],3:[3,5,1],4:[5,1,2,4],6:[3,4,5,0,1,2]};
  function createGame(options={}) {
    const count=Number(options.players||2), players=orders[count];
    if(!players) throw new Error('仅支持 2、3、4、6 人');
    const board=Array(121).fill(-1);
    players.forEach(p=>zones[p].forEach(i=>board[i]=p));
    return {board,players:[...players],turn:0,ply:0,winner:null,draw:null,rules:{jump:options.jump==='long'?'long':'short',goalLock:!!options.goalLock}};
  }
  function pieceMoves(board,from,rules={}) {
    const player=board[from];
    if(player<0 || player===undefined) return [];
    const goal=(player+3)%6;
    const allowed=(a,b)=>!rules.goalLock || zoneOf[a]!==goal || zoneOf[b]===goal;
    const paths=new Map(), visited=new Set([from]);
    for(const to of adjacent[from]) if(to>=0 && board[to]===-1 && allowed(from,to)) paths.set(to,[from,to]);
    const queue=[[from,[from]]];
    const value=i=>i===from?-1:board[i];
    for(let head=0;head<queue.length;head++) {
      const [here,path]=queue[head], {r,c}=cells[here];
      for(const [dr,dc] of DIRS) {
        let stride=1, mid=at(r+dr,c+dc);
        if(rules.jump==='long') {
          while(mid>=0 && value(mid)===-1) {stride++;mid=at(r+dr*stride,c+dc*stride);}
        }
        if(mid<0 || value(mid)<0) continue;
        let clear=true;
        for(let t=stride+1;t<2*stride;t++) {const k=at(r+dr*t,c+dc*t);if(k<0 || value(k)!==-1){clear=false;break;}}
        const to=at(r+dr*stride*2,c+dc*stride*2);
        if(!clear || to<0 || value(to)!==-1 || visited.has(to) || !allowed(here,to)) continue;
        visited.add(to);
        const next=path.concat(to); paths.set(to,next);queue.push([to,next]);
      }
    }
    return [...paths].map(([to,path])=>({from,to,path}));
  }
  function legalMoves(board,player,rules) {
    const moves=[];for(let i=0;i<121;i++) if(board[i]===player) moves.push(...pieceMoves(board,i,rules));return moves;
  }
  const isWinner=(board,p)=>zones[(p+3)%6].every(i=>board[i]===p);
  const progress=(board,p)=>zones[(p+3)%6].filter(i=>board[i]===p).length;
  const key=(board,turn)=>board.join(',')+'|'+turn;
  function applyMove(state,move) {
    if(state.winner!==null || state.draw) throw new Error('对局已结束');
    const player=state.players[state.turn];
    if(move?.pass){
      if(legalMoves(state.board,player,state.rules).length)throw new Error('有合法走法时不能跳过回合');
      const stuck=state.players.every(p=>!legalMoves(state.board,p,state.rules).length);
      return {state:{...state,board:state.board.slice(),turn:(state.turn+1)%state.players.length,ply:state.ply+1,draw:stuck?'全部棋手无合法走法':null},move:{pass:true,from:-1,to:-1,path:[]}};
    }
    if(boardValue(state,move.from)!==player) throw new Error('请选择当前方棋子');
    const legal=pieceMoves(state.board,move.from,state.rules).find(m=>m.to===move.to);
    if(!legal) throw new Error('非法走法');
    // Persist the canonical path rather than trusting an imported/UI path.
    const board=state.board.slice();board[move.to]=player;board[move.from]=-1;
    const won=isWinner(board,player);
    const next={...state,board,turn:(state.turn+1)%state.players.length,ply:state.ply+1,winner:won?player:null,draw:null};
    return {state:next,move:legal};
  }
  function boardValue(state,i) { return Number.isInteger(i)&&i>=0&&i<121?state.board[i]:undefined; }
  function replay(record) {
    if(!record || record.format!=='starhop-v1' || !Array.isArray(record.moves) || record.moves.length>10000) throw new Error('棋谱格式不正确');
    if(!record.options || !orders[Number(record.options.players)] || !['short','long'].includes(record.options.jump)) throw new Error('棋谱规则不正确');
    let state=createGame(record.options);const states=[state],moves=[],seen=new Map([[key(state.board,state.turn),1]]);
    for(const input of record.moves) {
      if(!input || (!input.pass && (!Number.isInteger(input.from) || !Number.isInteger(input.to)))) throw new Error('棋谱走法格式不正确');
      const result=applyMove(state,input);state=result.state;moves.push(result.move);
      const k=key(state.board,state.turn), n=(seen.get(k)||0)+1;seen.set(k,n);
      if(state.winner===null && n>=3) state={...state,draw:'三次重复局面'};
      if(state.winner===null && state.ply>=600) state={...state,draw:'达到 600 手上限'};
      states.push(state);
    }
    return {state,states,moves};
  }
  function coord(i) { const {r,c}=cells[i];return String.fromCharCode(65+r)+(Math.floor(c/2)+1); }
  const api={DIRS,cells,zones,zoneOf,adjacent,distances,orders,at,distance,createGame,pieceMoves,legalMoves,isWinner,progress,key,applyMove,replay,coord};
  if(typeof module==='object'&&module.exports) module.exports=api;else root.Starhop=api;
})(typeof globalThis==='object'?globalThis:this);
