(function(){
  'use strict';
  const E=Starhop,A=StarhopAI,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  const materials={
    jade:{name:'青玉',color:'#73cdb0',rim:'#1c6653',light:'#edfff2',shine:'#b8efd6',shade:'#28745e',deep:'#0d3c31'},
    amber:{name:'暖金',color:'#e0b568',rim:'#886026',light:'#fff8dc',shine:'#f7dc9f',shade:'#b37831',deep:'#603c19'},
    blue:{name:'月蓝',color:'#80b9dd',rim:'#376c8c',light:'#edf9ff',shine:'#c1e8fa',shade:'#467b9b',deep:'#193e57'},
    purple:{name:'烟紫',color:'#b7a6df',rim:'#705e9e',light:'#faf3ff',shine:'#ded0f6',shade:'#8570ae',deep:'#483361'},
    rose:{name:'蔷薇',color:'#daa1b2',rim:'#915769',light:'#fff2f3',shine:'#f5d2da',shade:'#ac7084',deep:'#663d4f'},
    pearl:{name:'月白',color:'#d9e2cd',rim:'#7b907d',light:'#fffef0',shine:'#eef3dd',shade:'#a0b298',deep:'#506753'}
  };
  const seatMaterials=['amber','blue','purple','jade','rose','pearl'];
  const viewNames={play:'对弈大厅',lab:'AI 实验室',archive:'我的棋谱',rules:'规则与开源'};
  let config={players:2,jump:'short',goalLock:false,mode:'human-ai',humanSeat:0,level:4,secondLevel:4};
  let state=E.createGame(config),states=[state],moves=[],cursor=0,selected=null,targets=[],hintPath=null;
  let worker=null,workerURL=null,generation=0,busy=false,paused=false,flipped=false,coords=false,sound=false,lastSearch=null,timer=null,toastTimer;
  let currentSavedId=null,ended=false,studySource=null;
  let boardStamp='',historyStamp='',replaySerial=0,searchProgress=null,replyStarted=0,keyboardCell=null,motion=null;
  const prefs={algorithm:'auto',time:0,seed:20261010,pace:80};
  function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
  function storageGet(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
  function storageSet(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{toast('浏览器存储不可用，请导出棋谱文件备份');return false;}}
  function isHuman(p){const seat=state.players.indexOf(p);if(config.mode==='human')return true;if(config.mode==='ai-ai')return false;return seat===Number(config.humanSeat);}
  function levelFor(p){return config.mode==='ai-ai' && state.players.indexOf(p)%2===1?config.secondLevel:config.level;}
  function materialKey(p,options=config,players=state.players){
    if(players.length===2&&players.includes(p)){const jadePlayer=options.mode==='human-ai'?players[Number(options.humanSeat)||0]:players[0];return p===jadePlayer?'jade':'amber';}
    return seatMaterials[p]||'pearl';
  }
  function materialFor(p){return materials[materialKey(p)];}
  function colorFor(p){return materialFor(p).color;}
  function nameFor(p,options=config,players=state.players){return materials[materialKey(p,options,players)].name;}
  function playerName(p){return isHuman(p)?(config.mode==='human'?nameFor(p): '你 · '+nameFor(p)):A.LEVELS[levelFor(p)].name+' AI';}
  function ownTurns(p,shown){const n=shown.players.length,seat=shown.players.indexOf(p);return Math.floor(shown.ply/n)+(seat<shown.ply%n?1:0);}
  function svg(tag,attrs,parent){const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs||{}))el.setAttribute(k,v);if(parent)parent.append(el);return el;}
  function point(i){const {r,c}=E.cells[i];let x=108+c*21,y=21+r*35.5;if(flipped){x=720-x;y=610-y;}return [x,y];}
  function makeDefs(board){
    const defs=svg('defs',{},board);
    const wood=svg('linearGradient',{id:'wood',x1:0,y1:0,x2:'.7',y2:1},defs);svg('stop',{offset:'0%', 'stop-color':'var(--board-top)'},wood);svg('stop',{offset:'100%','stop-color':'var(--board-bottom)'},wood);
    const hole=svg('radialGradient',{id:'hole',cx:'.52',cy:'.55',r:'.65'},defs);svg('stop',{offset:'0%','stop-color':'var(--hole-center)'},hole);svg('stop',{offset:'74%','stop-color':'var(--hole-center)'},hole);svg('stop',{offset:'100%','stop-color':'var(--hole-edge)'},hole);
    seatMaterials.forEach((_,p)=>{const m=materialFor(p),grad=svg('radialGradient',{id:'piece'+p,cx:'.3',cy:'.22',r:'.86'},defs);
      [[0,m.light],[.16,m.shine],[.42,m.color],[.76,m.shade],[1,m.deep]].forEach(([offset,color])=>svg('stop',{offset:offset*100+'%','stop-color':color},grad));
      const gleam=svg('linearGradient',{id:'gleam'+p,x1:0,y1:0,x2:0,y2:1},defs);svg('stop',{offset:'0%','stop-color':m.light,'stop-opacity':'.85'},gleam);svg('stop',{offset:'100%','stop-color':m.light,'stop-opacity':'0'},gleam);
    });
    const arrow=svg('marker',{id:'move-arrow',viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'},defs);svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'var(--route)'},arrow);
  }
  function drawMarble(parent,p,x,y,kind='static'){
    const m=materialFor(p),g=svg('g',{'class':'marble marble-'+kind,'data-player':p,'data-material':materialKey(p),transform:'translate('+x+' '+y+')','pointer-events':'none'},parent);
    svg('ellipse',{cx:0,cy:10,rx:12.3,ry:4.4,fill:'#061c19','fill-opacity':'.44','class':'marble-shadow'},g);
    svg('circle',{cx:0,cy:-1,r:12.8,fill:'url(#piece'+p+')',stroke:m.rim,'stroke-width':1.15},g);
    svg('circle',{cx:0,cy:-1,r:10.7,fill:'none',stroke:m.light,'stroke-opacity':'.2','stroke-width':'.65'},g);
    svg('path',{d:'M -9 -4 C -7 -13 5 -14 9 -6 C 4 -9 -2 -6 -9 -4 Z',fill:'url(#gleam'+p+')'},g);
    svg('path',{d:'M -8 5 Q 0 11 8 4',fill:'none',stroke:m.shine,'stroke-width':1.2,'stroke-opacity':'.32','stroke-linecap':'round'},g);
    svg('path',{d:'M -5 1 Q -1 -4 4 0 T 7 -2',fill:'none',stroke:m.light,'stroke-width':'.65','stroke-opacity':'.18'},g);
    svg('ellipse',{cx:-4.1,cy:-7.3,rx:3.7,ry:1.8,fill:'#fff','fill-opacity':'.63',transform:'rotate(-22 -4.1 -7.3)'},g);
    svg('circle',{cx:-6.8,cy:-4.4,r:.9,fill:'#fff','fill-opacity':'.7'},g);return g;
  }
  function drawBoard(){
    const stamp=[config.mode,config.humanSeat,state.players.join('.'),cursor,flipped,coords,selected,targets.map(m=>m.to).join('.'),hintPath?.join('.'),moves[cursor-1]?.path?.join('.'),states[cursor].board.join('.')].join('|');
    if(stamp===boardStamp)return;boardStamp=stamp;
    const shown=states[cursor],board=$('board'),focused=document.activeElement?.closest?.('[data-i]');
    if(focused?.dataset?.i!==undefined)keyboardCell=Number(focused.dataset.i);
    if(keyboardCell===null)keyboardCell=shown.board.findIndex(p=>p===shown.players[shown.turn]);
    board.replaceChildren();makeDefs(board);
    const outline=[[0,12],[4,16],[4,24],[8,20],[12,24],[12,16],[16,12],[12,8],[12,0],[8,4],[4,0],[4,8]].map(([r,c])=>point(E.at(r,c)));
    const poly=outline.map(p=>p.join(',')).join(' ');
    svg('polygon',{points:poly,fill:'url(#wood)',stroke:'var(--board-edge)','stroke-width':13,'stroke-linejoin':'round'},board);
    svg('polygon',{points:poly,fill:'none',stroke:'var(--board-rim)','stroke-width':1,'stroke-linejoin':'round'},board);
    const camps=[[0,12,3,9,3,15],[4,18,4,24,7,21],[9,21,12,18,12,24],[13,9,13,15,16,12],[9,3,12,0,12,6],[4,0,4,6,7,3]];
    camps.forEach((a,p)=>{const pts=[point(E.at(a[0],a[1])),point(E.at(a[2],a[3])),point(E.at(a[4],a[5]))];svg('polygon',{points:pts.map(x=>x.join(',')).join(' '),fill:colorFor(p),'fill-opacity':shown.players.includes(p)?'.12':'.035',stroke:colorFor(p),'stroke-opacity':'.08','stroke-width':29,'stroke-linejoin':'round'},board);});
    E.cells.forEach((_,i)=>{const [x,y]=point(i);for(const to of E.adjacent[i])if(to>i){const [tx,ty]=point(to);svg('line',{x1:x,y1:y,x2:tx,y2:ty,stroke:'var(--board-grid)','stroke-width':'.7','stroke-opacity':'.45'},board);}});
    const last=cursor>0?moves[cursor-1]:null, route=hintPath||(last?.path);
    E.cells.forEach((_,i)=>{
      const [x,y]=point(i),p=shown.board[i],target=cursor===moves.length&&targets.some(m=>m.to===i);
      const g=svg('g',{'class':'hole'+(p>=0?' occupied':'')+(target?' legal-target':''),'data-i':i,role:'button',tabindex:i===keyboardCell?'0':'-1','aria-pressed':selected===i?'true':'false','aria-label':E.coord(i)+' '+(p<0?(target?'可落点':'空孔'):nameFor(p)+'棋子')},board);
      const title=svg('title',{},g);title.textContent=E.coord(i)+(p>=0?' · '+nameFor(p):'');
      svg('circle',{cx:x,cy:y,r:20,fill:'transparent'},g);
      svg('circle',{cx:x,cy:y+1,r:13,fill:'url(#hole)',stroke:'var(--hole-rim)','stroke-width':1},g);
      if(p>=0)drawMarble(g,p,x,y);
      if(target){svg('circle',{cx:x,cy:y,r:10,fill:'var(--target-fill)',stroke:'var(--accent)','stroke-width':2,'class':'target'},g);svg('circle',{cx:x,cy:y,r:3,fill:'var(--accent)'},g);}
      if(selected===i&&cursor===moves.length)svg('circle',{cx:x,cy:y,r:17,fill:'none',stroke:'var(--accent)','stroke-width':2.5},g);
      if(hintPath?.includes(i))svg('circle',{cx:x,cy:y,r:15,fill:'none',stroke:'#b99547','stroke-width':2},g);
      if(coords){const text=svg('text',{x,y:y+23,'text-anchor':'middle','font-size':8,fill:'var(--color-label)','pointer-events':'none'},g);text.textContent=E.coord(i);}
    });
    if(route?.length>1){
      const layer=svg('g',{'class':'last-route','pointer-events':'none','aria-hidden':'true'},board),points=route.map(i=>point(i).join(',')).join(' '),color=hintPath?'var(--accent)':'var(--route)';
      svg('polyline',{points,fill:'none',stroke:'var(--route-underlay)','stroke-width':6,'stroke-opacity':'.85','stroke-linejoin':'round'},layer);
      svg('polyline',{points,fill:'none',stroke:color,'stroke-width':2.8,'stroke-opacity':'.8','stroke-linejoin':'round','marker-end':'url(#move-arrow)'},layer);
      route.forEach((i,n)=>{const [x,y]=point(i);if(n===0||n===route.length-1){svg('circle',{cx:x,cy:y,r:17,fill:'none',stroke:'var(--route-underlay)','stroke-width':5},layer);svg('circle',{cx:x,cy:y,r:17,fill:'none',stroke:color,'stroke-width':2.5,'stroke-dasharray':n===0?'4 3':'none'},layer);}
        const bx=x+15,by=y-17;svg('circle',{cx:bx,cy:by,r:9,fill:color,stroke:'var(--route-underlay)','stroke-width':1.5},layer);svg('text',{x:bx,y:by+3.5,'text-anchor':'middle',fill:'var(--route-underlay)','font-size':10,'font-weight':700},layer).textContent=n===0?'起':n===route.length-1?'落':String(n);
      });
    }
    if(focused?.dataset?.i!==undefined)board.querySelector('[data-i="'+keyboardCell+'"]')?.focus();
  }
  function stopMotion(complete=false){
    const current=motion;if(!current)return;motion=null;replaySerial++;
    if(current.frame!==null)window.cancelAnimationFrame?.(current.frame);
    current.marble?.setAttribute('visibility','visible');current.ghost.remove();$('board').removeAttribute('data-moving');
    $('replay-last').textContent='↻ 重播';if(complete)current.onComplete?.();
  }
  function replayLast(onComplete=null){
    const complete=typeof onComplete==='function'?onComplete:motion?.onComplete;stopMotion();const m=cursor>0?moves[cursor-1]:null;
    if(!m||m.pass||window.matchMedia('(prefers-reduced-motion: reduce)').matches||!window.requestAnimationFrame){complete?.();return false;}
    const p=states[cursor-1].players[states[cursor-1].turn],g=svg('g',{'class':'replay-marble','pointer-events':'none','aria-hidden':'true','data-path':m.path.join('.')},$('board'));
    drawMarble(g,p,0,0,'moving');const marble=$('board').querySelector('[data-i="'+m.to+'"]')?.querySelector('.marble-static');marble?.setAttribute('visibility','hidden');
    const serial=++replaySerial,start=performance.now(),duration=Math.min(1050,Math.max(230,210*(m.path.length-1))),segmentMs=duration/(m.path.length-1);
    motion={ghost:g,marble,frame:null,onComplete:complete};$('board').setAttribute('data-moving','true');$('replay-last').textContent='↻ 重新播放';
    const first=point(m.from);g.setAttribute('transform','translate('+first.join(' ')+')');
    function frame(now){
      if(!motion||serial!==replaySerial)return;
      const elapsed=Math.max(0,now-start),part=Math.min(m.path.length-2,Math.floor(elapsed/segmentMs)),t=Math.min(1,(elapsed-part*segmentMs)/segmentMs),ease=t*t*(3-2*t),a=point(m.path[part]),b=point(m.path[part+1]);
      const distance=E.distance(m.path[part],m.path[part+1]),lift=distance>1?Math.sin(Math.PI*t)*Math.min(13,7+distance):Math.sin(Math.PI*t)*3;
      g.setAttribute('transform','translate('+(a[0]+(b[0]-a[0])*ease)+' '+(a[1]+(b[1]-a[1])*ease-lift)+')');
      g.setAttribute('data-segment',part);g.setAttribute('data-landed',t===1?m.path[part+1]:m.path[part]);
      if(elapsed>=duration){stopMotion(true);return;}motion.frame=window.requestAnimationFrame(frame);
    }
    motion.frame=window.requestAnimationFrame(frame);return true;
  }
  function strip(element,p,shown){
    element.replaceChildren();const icon=document.createElement('span');icon.className='player-icon';icon.style.background=colorFor(p)+'20';icon.style.color=colorFor(p);icon.textContent=isHuman(p)?'◈':'✦';
    const info=document.createElement('div'),b=document.createElement('b'),small=document.createElement('small');b.textContent=playerName(p);small.textContent=isHuman(p)?'执'+nameFor(p)+' · 移入对角营地':A.LEVELS[levelFor(p)].label+' · '+(shown.players.length===2?(prefs.algorithm==='mcts'?'MCTS':prefs.algorithm==='classic'?'经典搜索':prefs.algorithm==='pvs'||(prefs.algorithm!=='team'&&(levelFor(p)<2||levelFor(p)===4))||(prefs.algorithm!=='team'&&(shown.rules.jump==='long'||shown.rules.goalLock))?'快速搜索':'团队规划'):'MCTS');info.append(b,small);
    const progress=document.createElement('span');progress.className='progress-badge';progress.textContent=ownTurns(p,shown)+' 步';const arrived=document.createElement('small');arrived.textContent=E.progress(shown.board,p)+' / 10 到达';progress.append(arrived);element.append(icon,info,progress);
  }
  function render(){
    const shown=states[cursor],p=shown.players[shown.turn],review=cursor<moves.length;
    drawBoard();const humanIndex=config.mode==='human-ai'?Number(config.humanSeat)||0:0;strip($('opponent-strip'),shown.players[humanIndex===0?1:0],shown);strip($('human-strip'),shown.players[humanIndex],shown);
    const last=cursor>0?moves[cursor-1]:null,lastPlayer=cursor>0?states[cursor-1].players[states[cursor-1].turn]:null;
    $('last-action').hidden=!last;$('replay-last').disabled=!last||!!last.pass;
    $('last-action').style['--move-color']=last?colorFor(lastPlayer):'var(--gold)';
    $('last-action-title').textContent=last?'第 '+cursor+' 手 · '+nameFor(lastPlayer)+(last.pass?' 跳过回合':' '+E.coord(last.from)+' → '+E.coord(last.to)):'';
    $('last-action-path').textContent=last&&!last.pass?'完整路径：'+last.path.map(E.coord).join(' → ')+(last.path.length>2?' · '+(last.path.length-1)+' 连跳':''):'';
    $('record-source').hidden=!studySource;$('record-source').replaceChildren();if(studySource){
      const source=document.createElement('a');source.href=studySource.url;source.target='_blank';source.rel='noreferrer';source.textContent=studySource.title+' · 原始来源 ↗';$('record-source').append(source);
      const note=document.createElement('small');note.textContent=studySource.branch?'从大师第 40 手续弈，之后的走法是本局新走法。':'华夏：原蓝色对应青玉；九霄：原黄色对应暖金。原赛和棋（先手快一步算平），本软件按率先满营结束。';$('record-source').append(note);
    }
    const modeText={'human-ai':'人机练习',human:'同屏对弈','ai-ai':'AI 自战',mixed:'多人混战'};
    $('match-title').textContent=modeText[config.mode]+' · '+config.players+' 人';$('mode-badge').textContent=modeText[config.mode];
    const opponent=shown.players.find(s=>!isHuman(s)),profile=opponent===undefined?null:A.LEVELS[levelFor(opponent)];
    $('profile-name').textContent=profile?profile.name:'同屏对弈';
    $('profile-level').textContent=profile?profile.label+' · '+((prefs.time||profile.time)/1000)+' 秒':shown.players.length+' 人棋局';
    $('profile-summary').textContent=profile?'整队推进，借力而行。':'面对面，一盘好棋。';
    $('profile-status').textContent=review?'复盘第 '+cursor+' 手':shown.winner!==null||shown.draw?'本局已结束':paused?'对局已暂停':busy?'思考中':opponent===p?'轮到 AI':isHuman(p)?'等你落子':'轮到另一位 AI';
    $('rules-tag').textContent=config.jump==='long'?'等距长跳':'相邻跳';$('rule-info').textContent=(config.jump==='long'?'长跳':'相邻跳')+(config.goalLock?' · 营地锁定':'');$('ply-info').textContent=shown.ply;
    $('seats').replaceChildren();shown.players.forEach(s=>{
      const row=document.createElement('div');row.className='seat'+(s===p&&!shown.draw&&shown.winner===null?' current':'');
      const icon=document.createElement('span');icon.className='seat-avatar';icon.style.color=colorFor(s);icon.style.background=colorFor(s)+'15';icon.textContent=isHuman(s)?'◈':'✦';
      const text=document.createElement('div'),name=document.createElement('div'),detail=document.createElement('div');name.className='seat-name';detail.className='seat-detail';name.textContent=playerName(s);detail.textContent=nameFor(s)+' · '+(isHuman(s)?'人类棋手':A.LEVELS[levelFor(s)].label+'难度');text.append(name,detail);
      const prog=document.createElement('div');prog.className='seat-progress';prog.textContent=ownTurns(s,shown)+' 步';const small=document.createElement('small');small.textContent=E.progress(shown.board,s)+' / 10 到达';prog.append(small);row.append(icon,text,prog);$('seats').append(row);
    });
    let message=review?'复盘中 · 第 '+cursor+' 手':shown.winner!==null?playerName(shown.winner)+' 获胜 · 用 '+ownTurns(shown.winner,shown)+' 步全部到达':shown.draw?'对局结束 · '+shown.draw:paused?'对局已暂停':busy?'AI 正在规划下一步…':isHuman(p)?'轮到 '+playerName(p)+' · 选择一颗棋子开始':'轮到 '+playerName(p);
    $('turn-message').textContent=message;$('turn-message').style.color=shown.winner!==null?'var(--green)':'';
    $('pause').hidden=config.mode==='human';$('pause').textContent=paused?'▶ 继续':'Ⅱ 暂停';$('pause').disabled=!!state.draw||state.winner!==null;
    $('undo').disabled=!moves.length||review;$('hint').disabled=busy||review||state.winner!==null||!!state.draw||!isHuman(state.players[state.turn]);$('resign').disabled=review||state.winner!==null||!!state.draw;
    $('history-index').textContent=cursor+' / '+moves.length;$('first-move').disabled=cursor===0;$('prev-move').disabled=cursor===0;$('next-move').disabled=cursor===moves.length;$('last-move').disabled=cursor===moves.length;$('return-live').hidden=!review;
    const hs=moves.length+':'+cursor;if(hs!==historyStamp){historyStamp=hs;
    $('move-list').replaceChildren();if(!moves.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='棋局刚刚开始 · 每一步都会留在这里';$('move-list').append(empty);}
    moves.forEach((m,i)=>{const row=document.createElement('button');row.className='move-row'+(cursor===i+1?' selected':'');row.dataset.ply=i+1;
      const num=document.createElement('small');num.textContent=i+1;const dot=document.createElement('span');dot.className='color-dot';dot.style.background=colorFor(states[i].players[states[i].turn]);
      const notation=document.createElement('span');notation.textContent=m.pass?'无合法走法 · 跳过':E.coord(m.from)+' → '+E.coord(m.to);const jump=document.createElement('span');jump.className='jump-count';jump.textContent=m.path.length>2?(m.path.length-1)+' 连跳':'';row.append(num,dot,notation,jump);$('move-list').append(row);
    });
    if(!review)$('move-list').scrollTop=$('move-list').scrollHeight;}
    renderSearch();if(window.StarhopAnalysisUI)StarhopAnalysisUI.update(states,cursor,shown.players[Math.min(config.humanSeat,shown.players.length-1)],to=>{cancelSearch();cursor=Math.max(0,Math.min(moves.length,to));selected=null;targets=[];hintPath=null;render();if(cursor===moves.length)schedule();});
  }
  function renderSearch(){
    const s=busy?searchProgress:lastSearch;
    $('engine-status').textContent=busy?(s?.algorithm||'搜索中'):s?s.algorithm:'待命';$('engine-status').classList.toggle('thinking',busy);
    $('search-depth').textContent=s?(s.algorithm==='MCTS'?'MCTS':s.planning?s.depth+' 回合':s.depth+(s.selective?'*':'')):'—';
    $('search-nodes').textContent=s?Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(s.nodes):'—';$('search-time').textContent=s?((s.latency??s.time)/1000).toFixed(2):'—';
    $('search-summary').textContent=s?(s.solved?(s.score>=99900?'已找到终局获胜路线。':'搜索中发现对手可结束对局。'):s.algorithm==='MCTS'?'完成 '+s.simulations+' 次模拟。模拟评分用于排序。':s.planning?'已比较 '+s.depth+' 个自方回合的团队计划，含预测对手回复。':s.selective?'完成选择性深度 '+s.depth+'，部分次要分支减少搜索。':'完成深度 '+s.depth+'，命中 '+s.hits+' 次局面缓存。'):'选择棋子，浅色圆点是可落点。连跳会自动显示完整路径。';
    $('candidates').replaceChildren();if(s)s.candidates?.slice(0,3).forEach((m,i)=>{const row=document.createElement('div');row.className='candidate';const left=document.createElement('span'),right=document.createElement('span');left.textContent=(i+1)+'. '+E.coord(m.from)+' → '+E.coord(m.to);right.textContent=s.solved&&m.bound!=='upper'&&Math.abs(m.score)>=99900?(m.score>0?'终局胜':'终局负'):s.algorithm==='MCTS'?(m.visits||0)+' 访问':(m.bound==='upper'?'≤ ':'')+m.score.toFixed(1);row.append(left,right);$('candidates').append(row);});
    $('search-plan').replaceChildren();if(s?.plan?.length){
      const title=document.createElement('summary');title.textContent='展开 AI 的预测计划';$('search-plan').append(title);
      const note=document.createElement('p');note.className='fine-print';note.textContent='后续着法取决于实际回复；这里展示候选计划。';$('search-plan').append(note);
      const rows=document.createElement('ol');for(const m of s.plan.slice(0,8)){const li=document.createElement('li');li.textContent=nameFor(m.player)+' '+(m.pass?'无合法着 · 跳过':E.coord(m.from)+' → '+E.coord(m.to));rows.append(li);}$('search-plan').append(rows);
    }$('search-plan').hidden=!s?.plan?.length;
  }
  function disposeWorker(){if(worker)worker.terminate();if(workerURL)URL.revokeObjectURL(workerURL);worker=null;workerURL=null;}
  function cancelSearch(cancelVisual=true){generation++;clearTimeout(timer);if(cancelVisual)stopMotion();if(busy)disposeWorker();busy=false;searchProgress=null;replyStarted=0;}
  function repetitions(){const map=new Map();states.forEach(s=>{const k=E.key(s.board,s.turn);map.set(k,(map.get(k)||0)+1);});return [...map];}
  function persistSession(){storageSet('starhop-session',{record:record(),preferences:prefs});}
  function record(){return {format:'starhop-v1',options:{...config},moves:moves.map(m=>m.pass?{pass:true}:{from:m.from,to:m.to}),createdAt:new Date().toISOString(),result:{winner:state.winner,draw:state.draw},engineVersion:'1.2.0',...(studySource?{studySource}: {})};}
  function checkDraw(next){const k=E.key(next.board,next.turn),n=states.filter(s=>E.key(s.board,s.turn)===k).length+1;if(next.winner===null&&n>=3)next.draw='三次重复局面';if(next.winner===null&&next.ply>=600)next.draw='达到 600 手上限';}
  function playMove(move,searchResult=null){
    const result=E.applyMove(state,move);state=result.state;checkDraw(state);moves.push(result.move);states.push(state);cursor=moves.length;selected=null;targets=[];hintPath=null;if(searchResult)lastSearch=searchResult;
    playTone();persistSession();render();const animated=replayLast(config.mode==='ai-ai'?schedule:null);
    if(!searchResult&&config.mode==='human-ai')replyStarted=performance.now();
    if(state.winner!==null||state.draw){saveRecord(true);ended=true;return;}if(!animated||config.mode!=='ai-ai')schedule();
  }
  function schedule(){
    if(ended||paused||cursor<moves.length||state.winner!==null||state.draw||busy)return;
    const player=state.players[state.turn];
    if(!E.legalMoves(state.board,player,state.rules).length){timer=setTimeout(()=>{toast(playerName(player)+' 无合法走法，自动跳过');playMove({pass:true});},prefs.pace);return;}
    if(isHuman(player))return;
    clearTimeout(timer);timer=setTimeout(()=>requestSearch(false),config.mode==='ai-ai'?prefs.pace:0);
  }
  function requestSearch(hint){
    if(busy||state.winner!==null||state.draw)return;
    const player=state.players[state.turn],legal=E.legalMoves(state.board,player,state.rules);
    if(!legal.length){toast('当前方无合法走法');return;}
    const replyTime=replyStarted||performance.now();cancelSearch(false);const id=generation;busy=true;searchProgress=null;render();
    const options={level:hint?Math.max(config.level,3):levelFor(player),time:prefs.time||undefined,algorithm:prefs.algorithm,seed:(Number(prefs.seed)+state.ply)>>>0,repetitions:repetitions()};
    try{
      if(!worker){workerURL=URL.createObjectURL(new Blob([window.STARHOP_WORKER_SOURCE],{type:'application/javascript'}));worker=new Worker(workerURL);}
      worker.onmessage=({data})=>{if(id!==generation||data.id!==id)return;
        if(data.progress){searchProgress=data.progress;renderSearch();return;}
        busy=false;searchProgress=null;
        if(data.error){disposeWorker();toast('AI 搜索失败：'+data.error);paused=true;render();return;}
        data.result.latency=performance.now()-replyTime;
        lastSearch=data.result;if(!data.result.move){toast('没有合法走法');render();return;}
        if(hint){hintPath=data.result.move.path;selected=data.result.move.from;targets=E.pieceMoves(state.board,selected,state.rules);render();toast('建议 '+E.coord(data.result.move.from)+' → '+E.coord(data.result.move.to));}
        else{const apply=()=>{if(id!==generation)return;data.result.latency=performance.now()-replyTime;playMove(data.result.move,data.result);};if(motion){motion.onComplete=apply;$('profile-status').textContent='落子中';renderSearch();}else apply();}
      };
      worker.onerror=()=>{if(id!==generation)return;cancelSearch();paused=true;render();toast('浏览器无法启动 AI 工作线程，请使用启动脚本打开');};
      worker.postMessage({id,state,options});
    }catch(error){cancelSearch();paused=true;render();toast('AI 工作线程不可用：'+error.message);}
  }
  function onCell(i){
    if(cursor<moves.length||busy||state.winner!==null||state.draw)return;
    const p=state.players[state.turn];if(!isHuman(p))return;stopMotion();
    if(state.board[i]===p){selected=selected===i?null:i;targets=selected===null?[]:E.pieceMoves(state.board,selected,state.rules);hintPath=null;drawBoard();return;}
    const move=targets.find(m=>m.to===i);if(move)playMove(move);else{selected=null;targets=[];hintPath=null;drawBoard();}
  }
  function undo(){
    if(!moves.length)return;cancelSearch();let cut=moves.length-1;
    if(config.mode!=='human'&&config.mode!=='ai-ai'){while(cut>0&&!isHuman(states[cut].players[states[cut].turn]))cut--;}
    states=states.slice(0,cut+1);moves=moves.slice(0,cut);state=states.at(-1);cursor=moves.length;selected=null;targets=[];hintPath=null;ended=false;lastSearch=null;currentSavedId=null;persistSession();render();schedule();
  }
  function review(to){cancelSearch();cursor=Math.max(0,Math.min(moves.length,to));selected=null;targets=[];hintPath=null;render();if(cursor===moves.length)schedule();}
  function showView(name){document.querySelectorAll('.view').forEach(e=>e.classList.toggle('active',e.id==='view-'+name));document.querySelectorAll('.nav-item').forEach(e=>{e.classList.toggle('active',e.dataset.view===name);e.setAttribute('aria-current',e.dataset.view===name?'page':'false');});$('page-name').textContent=viewNames[name];if(document.body)document.body.dataset.view=name;if(name==='archive')renderArchive();window.location.hash=name;}
  function saveRecord(quiet=false){
    if(!moves.length){if(!quiet)toast('落子后即可保存棋谱');return;}
    const list=storageGet('starhop-archive',[]),item={...record(),id:currentSavedId||('game-'+Date.now()),savedAt:new Date().toISOString()};
    const index=list.findIndex(x=>x.id===item.id);if(index>=0)list[index]=item;else list.unshift(item);
    if(storageSet('starhop-archive',list.slice(0,100))){currentSavedId=item.id;if(!quiet)toast('已保存到“我的棋谱”');}
  }
  function download(content,filename,type='application/json'){const url=URL.createObjectURL(new Blob([typeof content==='string'?content:JSON.stringify(content,null,2)],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function renderArchive(){
    $('master-library').replaceChildren();for(const item of window.STARHOP_MASTER_GAMES||[]){
      const card=document.createElement('section');card.className='panel archive-card master-card';const tag=document.createElement('span');tag.className='eyebrow';tag.textContent='真实大师实战 · '+item.moves.length+' 手 · 已校验';
      const title=document.createElement('h2');title.textContent='华夏的汉子 vs 浪潮九霄';const note=document.createElement('p');note.textContent=item.metadata.eventDate+'。公开动态图逐手转录；可以逐手复盘，或接手中盘与最新版 AI 续弈。';const actions=document.createElement('div');actions.className='archive-actions';
      for(const [label,branch]of [['逐手复盘 →',false],['从第 40 手挑战 AI',true]]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{
        saveRecord(true);const source={title:'华夏的汉子 vs 浪潮九霄 · '+item.metadata.eventDate,url:item.metadata.sourceUrl,branch};
        loadRecord({...item,id:branch?null:item.id,options:{...item.options,mode:branch?'human-ai':'human',humanSeat:0,level:4,secondLevel:4},moves:branch?item.moves.slice(0,40):item.moves,studySource:source},true);
        cursor=branch?moves.length:0;ended=!branch;paused=!branch;render();showView('play');persistSession();if(branch)schedule();
      };actions.append(b);}card.append(tag,title,note,actions);$('master-library').append(card);
    }
    const list=storageGet('starhop-archive',[]);$('archive-list').replaceChildren();
    if(!list.length){const empty=document.createElement('section');empty.className='panel empty';empty.textContent='这里还没有棋谱。下完一局，点击“保存棋谱”，或导入已有对局。';$('archive-list').append(empty);return;}
    list.forEach(item=>{const card=document.createElement('section');card.className='panel archive-card';const tag=document.createElement('span');tag.className='eyebrow';tag.textContent=new Date(item.savedAt).toLocaleString('zh-CN');const title=document.createElement('h2');title.textContent=item.options.players+' 人 · '+(item.options.jump==='long'?'等距长跳':'相邻跳');const desc=document.createElement('p');desc.textContent=item.moves.length+' 手 · '+(item.result?.winner!==null&&item.result?.winner!==undefined?nameFor(item.result.winner,item.options,E.orders[Number(item.options.players)]||state.players)+'胜':item.result?.draw||'未结束');const actions=document.createElement('div');actions.className='archive-actions';
      const open=document.createElement('button');open.textContent='打开复盘 →';open.onclick=()=>{saveRecord(true);loadRecord(storageGet('starhop-archive',[]).find(saved=>saved.id===item.id)||item);persistSession();};const exp=document.createElement('button');exp.textContent='导出';exp.onclick=()=>download(item,item.id+'.json');actions.append(open,exp);card.append(tag,title,desc,actions);$('archive-list').append(card);});
  }
  function loadRecord(item,quiet=false){
    const loaded=E.replay(item);cancelSearch();config={...config,...item.options,mode:['human-ai','human','ai-ai','mixed'].includes(item.options.mode)?item.options.mode:'human',humanSeat:Math.max(0,Math.min(loaded.state.players.length-1,Math.floor(Number(item.options.humanSeat)||0))),level:Math.max(0,Math.min(4,Math.floor(Number(item.options.level)||0))),secondLevel:Math.max(0,Math.min(4,Math.floor(Number(item.options.secondLevel)||0)))};
    state=loaded.state;states=loaded.states;moves=loaded.moves;cursor=moves.length;selected=null;targets=[];hintPath=null;lastSearch=null;paused=true;ended=false;currentSavedId=item.id||null;historyStamp='';studySource=null;
    if(item.studySource&&/^https:\/\/tiaoqi\.top\/thread-\d+\.htm$/.test(item.studySource.url)){studySource={title:String(item.studySource.title).slice(0,120),url:item.studySource.url,branch:!!item.studySource.branch};}
    if(item.result?.draw&&state.winner===null)state.draw=String(item.result.draw).slice(0,80);render();if(!quiet){showView('play');toast('已载入棋谱 · 用复盘按钮逐手查看');}
  }
  function openDialog(forceMode){$('mode').value=forceMode||config.mode;$('player-count').value=config.players;$('jump-rule').value=config.jump;$('goal-lock').checked=config.goalLock;$('difficulty').value=config.level;$('difficulty-second').value=config.secondLevel;syncForm();$('human-seat').value=config.humanSeat;$('match-dialog').showModal();}
  function syncForm(){const seat=$('human-seat').value,mode=$('mode').value;if(mode==='human-ai')$('player-count').value='2';$('player-count').disabled=mode==='human-ai';const count=Number($('player-count').value);$('human-seat').replaceChildren();for(let i=0;i<count;i++){const opt=document.createElement('option');opt.value=i;opt.textContent=i===0?'先手座位':'第 '+(i+1)+' 座位';$('human-seat').append(opt);}$('human-seat').value=Math.min(Number(seat)||0,count-1);$('human-seat').disabled=mode==='ai-ai'||mode==='human';$('difficulty').disabled=mode==='human';$('second-level-label').hidden=mode!=='ai-ai';}
  function newGame(event){event.preventDefault();saveRecord(true);cancelSearch();config={players:Number($('player-count').value),mode:$('mode').value,humanSeat:Number($('human-seat').value),level:Number($('difficulty').value),secondLevel:Number($('difficulty-second').value),jump:$('jump-rule').value,goalLock:$('goal-lock').checked};state=E.createGame(config);states=[state];moves=[];cursor=0;selected=null;targets=[];hintPath=null;paused=false;ended=false;currentSavedId=null;lastSearch=null;studySource=null;$('match-dialog').close();persistSession();showView('play');render();schedule();}
  function playTone(){if(!sound)return;try{const audio=new(window.AudioContext||window.webkitAudioContext)(),osc=audio.createOscillator(),gain=audio.createGain();osc.connect(gain);gain.connect(audio.destination);osc.frequency.value=650;gain.gain.setValueAtTime(.06,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.11);osc.start();osc.stop(audio.currentTime+.12);osc.onended=()=>audio.close();}catch{}}
  function exportTraining(){const result=state.winner!==null?state.winner:state.draw?'draw':null;const rows=moves.map((move,i)=>{const s=states[i],p=s.players[s.turn];return {format:'starhop-training-v1',board:s.board,players:s.players,player:p,rules:s.rules,legal:E.legalMoves(s.board,p,s.rules).map(({from,to})=>({from,to})),policyMove:{from:move.from,to:move.to},outcome:result===null?null:result==='draw'?0:result===p?1:-1,engineVersion:'1.2.0'};});download(rows.map(x=>JSON.stringify(x)).join('\n'),'starhop-training-'+Date.now()+'.jsonl','application/x-ndjson');toast(rows.length+' 个局面已导出；未结束对局的结果标签为空');}
  window.StarhopPresentation=Object.freeze({playerName:nameFor,playerColor:colorFor,playerMaterial:materialKey});
  A.LEVELS.forEach((level,i)=>{for(const id of ['difficulty','difficulty-second']){const opt=document.createElement('option');opt.value=i;opt.textContent=level.name+' · '+level.label+' ('+(level.time/1000)+'s)';$(id).append(opt);}});
  document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('quick-lab').onclick=()=>showView('lab');$('help').onclick=()=>showView('rules');$('new-game').onclick=()=>openDialog();$('lab-match').onclick=()=>openDialog('ai-ai');$('close-dialog').onclick=()=>$('match-dialog').close();$('mode').onchange=syncForm;$('player-count').onchange=syncForm;$('match-form').onsubmit=newGame;
  $('board').addEventListener('click',event=>{const cell=event.target.closest('[data-i]');if(cell){keyboardCell=Number(cell.dataset.i);onCell(keyboardCell);}});
  $('board').addEventListener('focusin',event=>{
    const cell=event.target.closest('[data-i]');if(!cell)return;
    const active=$('board').querySelector('[tabindex="0"]');if(active!==cell)active?.setAttribute('tabindex','-1');
    keyboardCell=Number(cell.dataset.i);cell.setAttribute('tabindex','0');
  });
  $('board').addEventListener('keydown',event=>{
    const cell=event.target.closest('[data-i]');if(!cell)return;
    if(event.key==='Enter'||event.key===' '){event.preventDefault();keyboardCell=Number(cell.dataset.i);onCell(keyboardCell);return;}
    const vector={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!vector)return;
    event.preventDefault();const from=Number(cell.dataset.i),[x,y]=point(from),[vx,vy]=vector;
    const next=E.adjacent[from].map(i=>{const [tx,ty]=point(i),dx=tx-x,dy=ty-y,along=dx*vx+dy*vy;return {i,along,error:Math.abs(dx*vy-dy*vx)/Math.max(1,along)};}).filter(n=>n.along>0).sort((a,b)=>a.error-b.error||a.i-b.i)[0];
    if(next){$('board').querySelector('[tabindex="0"]')?.setAttribute('tabindex','-1');cell.setAttribute('tabindex','-1');keyboardCell=next.i;const target=$('board').querySelector('[data-i="'+next.i+'"]');target?.setAttribute('tabindex','0');target?.focus();}
  });
  $('coordinates').onclick=()=>{while(motion)stopMotion(true);coords=!coords;$('coordinates').classList.toggle('active',coords);$('coordinates').setAttribute('aria-pressed',String(coords));drawBoard();};$('flip').onclick=()=>{while(motion)stopMotion(true);flipped=!flipped;$('flip').setAttribute('aria-pressed',String(flipped));drawBoard();};$('sound').onclick=()=>{sound=!sound;$('sound').classList.toggle('active',sound);$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');playTone();};
  $('undo').onclick=undo;$('hint').onclick=()=>requestSearch(true);$('pause').onclick=()=>{paused=!paused;if(paused)cancelSearch();render();schedule();};$('resign').onclick=()=>{cancelSearch();state={...state,draw:'手动结束'};states[states.length-1]=state;ended=true;saveRecord(true);persistSession();render();toast('对局已结束并保存棋谱');};
  $('replay-last').onclick=()=>replayLast(config.mode==='ai-ai'&&!paused?schedule:null);
  $('save-game').onclick=()=>saveRecord();$('export-game').onclick=()=>download(record(),'starhop-'+Date.now()+'.json');$('first-move').onclick=()=>review(0);$('prev-move').onclick=()=>review(cursor-1);$('next-move').onclick=()=>review(cursor+1);$('last-move').onclick=()=>review(moves.length);$('return-live').onclick=()=>review(moves.length);$('move-list').onclick=event=>{const row=event.target.closest('[data-ply]');if(row)review(Number(row.dataset.ply));};
  $('algorithm').onchange=()=>{prefs.algorithm=$('algorithm').value;persistSession();};$('time-budget').onchange=()=>{prefs.time=Number($('time-budget').value);persistSession();};$('seed').onchange=()=>{prefs.seed=Number($('seed').value)>>>0;persistSession();};$('pace').onchange=()=>{prefs.pace=Number($('pace').value);persistSession();};$('export-training').onclick=exportTraining;
  $('import-game').onclick=()=>$('file-input').click();$('file-input').onchange=async()=>{const file=$('file-input').files[0];if(!file)return;try{if(file.size>3*1024*1024)throw new Error('棋谱文件超过 3 MB');const item=JSON.parse(await file.text());E.replay(item);saveRecord(true);loadRecord(item);saveRecord(true);persistSession();}catch(error){toast('导入失败：'+error.message);}$('file-input').value='';};
  const session=storageGet('starhop-session',null);if(session){try{Object.assign(prefs,session.preferences);loadRecord(session.record,true);$('algorithm').value=prefs.algorithm;$('time-budget').value=prefs.time;$('seed').value=prefs.seed;$('pace').value=prefs.pace;}catch{state=E.createGame(config);states=[state];moves=[];cursor=0;}}
  window.addEventListener('beforeunload',()=>{cancelSearch();disposeWorker();});showView(viewNames[location.hash.slice(1)]?location.hash.slice(1):'play');render();
})();
