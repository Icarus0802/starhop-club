(function(){
  'use strict';
  const E=Starhop,A=StarhopAI,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  const colors=['#d87569','#78a7c8','#a493ba','#599383','#cc8aa0','#d6ac59'];
  const names=['珊瑚红','晴空蓝','丁香紫','松石绿','蔷薇粉','琥珀黄'];
  const viewNames={play:'对弈大厅',lab:'AI 实验室',archive:'我的棋谱',rules:'规则与开源'};
  let config={players:2,jump:'short',goalLock:false,mode:'human-ai',humanSeat:0,level:3,secondLevel:3};
  let state=E.createGame(config),states=[state],moves=[],cursor=0,selected=null,targets=[],hintPath=null;
  let worker=null,workerURL=null,generation=0,busy=false,paused=false,flipped=false,coords=false,sound=false,lastSearch=null,timer=null,toastTimer;
  let currentSavedId=null,ended=false;
  let boardStamp='',historyStamp='',replaySerial=0;
  const prefs={algorithm:'auto',time:0,seed:20261010,pace:80};
  function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
  function storageGet(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
  function storageSet(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{toast('浏览器存储不可用，请导出棋谱文件备份');return false;}}
  function isHuman(p){const seat=state.players.indexOf(p);if(config.mode==='human')return true;if(config.mode==='ai-ai')return false;return seat===Number(config.humanSeat);}
  function levelFor(p){return config.mode==='ai-ai' && state.players.indexOf(p)%2===1?config.secondLevel:config.level;}
  function playerName(p){return isHuman(p)?(config.mode==='human'?names[p]: '你 · '+names[p]):A.LEVELS[levelFor(p)].name+' AI';}
  function svg(tag,attrs,parent){const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs||{}))el.setAttribute(k,v);if(parent)parent.append(el);return el;}
  function point(i){const {r,c}=E.cells[i];let x=108+c*21,y=21+r*35.5;if(flipped){x=720-x;y=610-y;}return [x,y];}
  function makeDefs(board){
    const defs=svg('defs',{},board);
    const wood=svg('linearGradient',{id:'wood',x1:0,y1:0,x2:0,y2:1},defs);svg('stop',{offset:'0%', 'stop-color':'#f5eacf'},wood);svg('stop',{offset:'100%','stop-color':'#e9d8b6'},wood);
    const hole=svg('radialGradient',{id:'hole'},defs);svg('stop',{offset:'0%','stop-color':'#c9b998'},hole);svg('stop',{offset:'85%','stop-color':'#d2c3a4'},hole);svg('stop',{offset:'100%','stop-color':'#eee3c9'},hole);
    colors.forEach((color,p)=>{const grad=svg('radialGradient',{id:'piece'+p,cx:'.35',cy:'.28',r:'.8'},defs);svg('stop',{offset:'0%','stop-color':'#ffffff','stop-opacity':'.55'},grad);svg('stop',{offset:'28%','stop-color':color},grad);svg('stop',{offset:'100%','stop-color':color,'stop-opacity':'.95'},grad);});
    const arrow=svg('marker',{id:'move-arrow',viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'},defs);svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#294e76'},arrow);
  }
  function drawBoard(){
    const stamp=[cursor,flipped,coords,selected,targets.map(m=>m.to).join('.'),hintPath?.join('.'),states[cursor].board.join('.')].join('|');
    if(stamp===boardStamp)return;boardStamp=stamp;
    const shown=states[cursor],board=$('board');board.replaceChildren();makeDefs(board);
    const outline=[[0,12],[4,16],[4,24],[8,20],[12,24],[12,16],[16,12],[12,8],[12,0],[8,4],[4,0],[4,8]].map(([r,c])=>point(E.at(r,c)));
    const poly=outline.map(p=>p.join(',')).join(' ');
    svg('polygon',{points:poly,fill:'url(#wood)',stroke:'#d6c8a8','stroke-width':13,'stroke-linejoin':'round'},board);
    const camps=[[0,12,3,9,3,15],[4,18,4,24,7,21],[9,21,12,18,12,24],[13,9,13,15,16,12],[9,3,12,0,12,6],[4,0,4,6,7,3]];
    camps.forEach((a,p)=>{const pts=[point(E.at(a[0],a[1])),point(E.at(a[2],a[3])),point(E.at(a[4],a[5]))];svg('polygon',{points:pts.map(x=>x.join(',')).join(' '),fill:colors[p],'fill-opacity':'.13',stroke:colors[p],'stroke-opacity':'.1','stroke-width':29,'stroke-linejoin':'round'},board);});
    E.cells.forEach((_,i)=>{const [x,y]=point(i);for(const to of E.adjacent[i])if(to>i){const [tx,ty]=point(to);svg('line',{x1:x,y1:y,x2:tx,y2:ty,stroke:'#cbbb95','stroke-width':'.6','stroke-opacity':'.5'},board);}});
    const last=cursor>0?moves[cursor-1]:null, route=hintPath||(last?.path);
    E.cells.forEach((_,i)=>{
      const [x,y]=point(i),p=shown.board[i],target=cursor===moves.length&&targets.some(m=>m.to===i);
      const g=svg('g',{'class':'hole','data-i':i,role:'button',tabindex:'0','aria-label':E.coord(i)+' '+(p<0?(target?'可落点':'空孔'):names[p]+'棋子')},board);
      const title=svg('title',{},g);title.textContent=E.coord(i)+(p>=0?' · '+names[p]:'');
      svg('circle',{cx:x,cy:y,r:20,fill:'transparent'},g);
      svg('circle',{cx:x,cy:y+1,r:13,fill:'url(#hole)',stroke:'#c8b897','stroke-width':'.7'},g);
      if(p>=0){
        svg('circle',{cx:x,cy:y+2,r:12.4,fill:'#5f6853','fill-opacity':'.15'},g);
        svg('circle',{cx:x,cy:y-1,r:12,fill:'url(#piece'+p+')',stroke:colors[p],'stroke-width':'.7'},g);
        svg('ellipse',{cx:x-3,cy:y-5,rx:3.9,ry:2,fill:'#fff','fill-opacity':'.23'},g);
      }
      if(target){svg('circle',{cx:x,cy:y,r:8,fill:'#fcfcf5',stroke:'#809d72','stroke-width':'1.5','class':'target'},g);svg('circle',{cx:x,cy:y,r:2,fill:'#7f9a6c'},g);}
      if(selected===i&&cursor===moves.length)svg('circle',{cx:x,cy:y,r:16,fill:'none',stroke:'#265f47','stroke-width':2.5},g);
      if(hintPath?.includes(i))svg('circle',{cx:x,cy:y,r:15,fill:'none',stroke:'#b99547','stroke-width':2},g);
      if(coords){const text=svg('text',{x,y:y+23,'text-anchor':'middle','font-size':7,fill:'#a2977d','pointer-events':'none'},g);text.textContent=E.coord(i);}
    });
    if(route?.length>1){
      const layer=svg('g',{'class':'last-route','pointer-events':'none','aria-hidden':'true'},board),points=route.map(i=>point(i).join(',')).join(' '),color=hintPath?'#b27c16':'#294e76';
      svg('polyline',{points,fill:'none',stroke:'#fff','stroke-width':6,'stroke-opacity':'.85','stroke-linejoin':'round'},layer);
      svg('polyline',{points,fill:'none',stroke:color,'stroke-width':2.8,'stroke-opacity':'.8','stroke-linejoin':'round','marker-end':'url(#move-arrow)'},layer);
      route.forEach((i,n)=>{const [x,y]=point(i);if(n===0||n===route.length-1){svg('circle',{cx:x,cy:y,r:17,fill:'none',stroke:'#fff','stroke-width':5},layer);svg('circle',{cx:x,cy:y,r:17,fill:'none',stroke:color,'stroke-width':2.5,'stroke-dasharray':n===0?'4 3':'none'},layer);}
        const bx=x+15,by=y-17;svg('circle',{cx:bx,cy:by,r:9,fill:color,stroke:'#fff','stroke-width':1.5},layer);svg('text',{x:bx,y:by+3.5,'text-anchor':'middle',fill:'#fff','font-size':10,'font-weight':700},layer).textContent=n===0?'起':n===route.length-1?'落':String(n);
      });
    }
  }
  function replayLast(){
    const m=cursor>0?moves[cursor-1]:null;if(!m||m.pass)return;
    $('board').querySelector('.replay-marble')?.remove();const p=states[cursor-1].players[states[cursor-1].turn],g=svg('g',{'class':'replay-marble','pointer-events':'none'},$('board'));
    svg('circle',{r:14,fill:colors[p],stroke:'#fff','stroke-width':3},g);
    const path=m.path.map((i,n)=>(n?'L':'M')+point(i).join(' ')).join(' ');
    const animation=svg('animateMotion',{path,dur:Math.min(1.5,.35*(m.path.length-1))+'s',fill:'freeze'},g);animation.beginElement();
    const serial=++replaySerial;setTimeout(()=>{if(serial===replaySerial)g.remove();},1800);
  }
  function strip(element,p,shown){
    element.replaceChildren();const icon=document.createElement('span');icon.className='player-icon';icon.style.background=colors[p]+'20';icon.style.color=colors[p];icon.textContent=isHuman(p)?'◈':'✦';
    const info=document.createElement('div'),b=document.createElement('b'),small=document.createElement('small');b.textContent=playerName(p);small.textContent=isHuman(p)?'执'+names[p]+' · 移入对角营地':A.LEVELS[levelFor(p)].label+' · '+(shown.players.length===2?(prefs.algorithm==='mcts'?'MCTS':'Alpha-Beta'):'MCTS');info.append(b,small);
    const progress=document.createElement('span');progress.className='progress-badge';progress.textContent=E.progress(shown.board,p)+' / 10 到达';element.append(icon,info,progress);
  }
  function render(){
    const shown=states[cursor],p=shown.players[shown.turn],review=cursor<moves.length;
    drawBoard();strip($('opponent-strip'),shown.players[1],shown);strip($('human-strip'),shown.players[0],shown);
    const last=cursor>0?moves[cursor-1]:null,lastPlayer=cursor>0?states[cursor-1].players[states[cursor-1].turn]:null;
    $('last-action').hidden=!last;$('replay-last').disabled=!last||!!last.pass;
    $('last-action-title').textContent=last?'第 '+cursor+' 手 · '+names[lastPlayer]+(last.pass?' 跳过回合':' '+E.coord(last.from)+' → '+E.coord(last.to)):'';
    $('last-action-path').textContent=last&&!last.pass?'完整路径：'+last.path.map(E.coord).join(' → ')+(last.path.length>2?' · '+(last.path.length-1)+' 连跳':''):'';
    const modeText={'human-ai':'人机练习',human:'同屏对弈','ai-ai':'AI 自战',mixed:'多人混战'};
    $('match-title').textContent=modeText[config.mode]+' · '+config.players+' 人';$('mode-badge').textContent=modeText[config.mode];
    $('rules-tag').textContent=config.jump==='long'?'等距长跳':'相邻跳';$('rule-info').textContent=(config.jump==='long'?'长跳':'相邻跳')+(config.goalLock?' · 营地锁定':'');$('ply-info').textContent=shown.ply;
    $('seats').replaceChildren();shown.players.forEach(s=>{
      const row=document.createElement('div');row.className='seat'+(s===p&&!shown.draw&&shown.winner===null?' current':'');
      const icon=document.createElement('span');icon.className='seat-avatar';icon.style.color=colors[s];icon.style.background=colors[s]+'15';icon.textContent=isHuman(s)?'◈':'✦';
      const text=document.createElement('div'),name=document.createElement('div'),detail=document.createElement('div');name.className='seat-name';detail.className='seat-detail';name.textContent=playerName(s);detail.textContent=names[s]+' · '+(isHuman(s)?'人类棋手':A.LEVELS[levelFor(s)].label+'难度');text.append(name,detail);
      const prog=document.createElement('div');prog.className='seat-progress';prog.textContent=E.progress(shown.board,s)+' / 10';const small=document.createElement('small');small.textContent='进入目标';prog.append(small);row.append(icon,text,prog);$('seats').append(row);
    });
    let message=review?'复盘中 · 第 '+cursor+' 手':shown.winner!==null?playerName(shown.winner)+' 获胜，全部棋子已到达目标':shown.draw?'对局结束 · '+shown.draw:paused?'对局已暂停':busy?'AI 正在搜索，请稍候…':isHuman(p)?'轮到 '+playerName(p)+' · 选择一颗棋子开始':'轮到 '+playerName(p);
    $('turn-message').textContent=message;$('turn-message').style.color=shown.winner!==null?'#1f5748':'';
    $('pause').hidden=config.mode==='human';$('pause').textContent=paused?'▶ 继续':'Ⅱ 暂停';$('pause').disabled=!!state.draw||state.winner!==null;
    $('undo').disabled=!moves.length||review;$('hint').disabled=busy||review||state.winner!==null||!!state.draw||!isHuman(state.players[state.turn]);$('resign').disabled=review||state.winner!==null||!!state.draw;
    $('history-index').textContent=cursor+' / '+moves.length;$('first-move').disabled=cursor===0;$('prev-move').disabled=cursor===0;$('next-move').disabled=cursor===moves.length;$('last-move').disabled=cursor===moves.length;$('return-live').hidden=!review;
    const hs=moves.length+':'+cursor;if(hs!==historyStamp){historyStamp=hs;
    $('move-list').replaceChildren();if(!moves.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='棋局刚刚开始 · 每一步都会留在这里';$('move-list').append(empty);}
    moves.forEach((m,i)=>{const row=document.createElement('button');row.className='move-row'+(cursor===i+1?' selected':'');row.dataset.ply=i+1;
      const num=document.createElement('small');num.textContent=i+1;const dot=document.createElement('span');dot.className='color-dot';dot.style.background=colors[states[i].players[states[i].turn]];
      const notation=document.createElement('span');notation.textContent=m.pass?'无合法走法 · 跳过':E.coord(m.from)+' → '+E.coord(m.to);const jump=document.createElement('span');jump.className='jump-count';jump.textContent=m.path.length>2?(m.path.length-1)+' 连跳':'';row.append(num,dot,notation,jump);$('move-list').append(row);
    });
    if(!review)$('move-list').scrollTop=$('move-list').scrollHeight;}
    renderSearch();if(window.StarhopAnalysisUI)StarhopAnalysisUI.update(states,cursor,shown.players[Math.min(config.humanSeat,shown.players.length-1)],to=>{cancelSearch();cursor=Math.max(0,Math.min(moves.length,to));selected=null;targets=[];hintPath=null;render();if(cursor===moves.length)schedule();});
  }
  function renderSearch(){
    $('engine-status').textContent=busy?'搜索中':lastSearch?lastSearch.algorithm:'待命';$('engine-status').classList.toggle('thinking',busy);
    $('search-depth').textContent=lastSearch?(lastSearch.algorithm==='MCTS'?'MCTS':lastSearch.depth):'—';
    $('search-nodes').textContent=lastSearch?Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(lastSearch.nodes):'—';$('search-time').textContent=lastSearch?(lastSearch.time/1000).toFixed(2):'—';
    $('search-summary').textContent=lastSearch?(lastSearch.solved?'搜索已找到强制胜负结果。':lastSearch.algorithm==='MCTS'?'完成 '+lastSearch.simulations+' 次模拟。模拟评分用于排序。':'完成深度 '+lastSearch.depth+'，命中 '+lastSearch.hits+' 次局面缓存。'):'选择棋子，浅色圆点是可落点。连跳会自动显示完整路径。';
    $('candidates').replaceChildren();if(lastSearch)lastSearch.candidates?.slice(0,3).forEach((m,i)=>{const row=document.createElement('div');row.className='candidate';const left=document.createElement('span'),right=document.createElement('span');left.textContent=(i+1)+'. '+E.coord(m.from)+' → '+E.coord(m.to);right.textContent=lastSearch.solved?'胜负确定':lastSearch.algorithm==='MCTS'?(m.visits||0)+' 访问':(m.bound==='upper'?'≤ ':'')+m.score.toFixed(1);row.append(left,right);$('candidates').append(row);});
  }
  function cancelSearch(){generation++;clearTimeout(timer);if(worker)worker.terminate();if(workerURL)URL.revokeObjectURL(workerURL);worker=null;workerURL=null;busy=false;}
  function repetitions(){const map=new Map();states.forEach(s=>{const k=E.key(s.board,s.turn);map.set(k,(map.get(k)||0)+1);});return [...map];}
  function persistSession(){storageSet('starhop-session',{record:record(),preferences:prefs});}
  function record(){return {format:'starhop-v1',options:{...config},moves:moves.map(m=>m.pass?{pass:true}:{from:m.from,to:m.to}),createdAt:new Date().toISOString(),result:{winner:state.winner,draw:state.draw},engineVersion:'1.1.0'};}
  function checkDraw(next){const k=E.key(next.board,next.turn),n=states.filter(s=>E.key(s.board,s.turn)===k).length+1;if(next.winner===null&&n>=3)next.draw='三次重复局面';if(next.winner===null&&next.ply>=600)next.draw='达到 600 手上限';}
  function playMove(move,searchResult=null){
    const result=E.applyMove(state,move);state=result.state;checkDraw(state);moves.push(result.move);states.push(state);cursor=moves.length;selected=null;targets=[];hintPath=null;if(searchResult)lastSearch=searchResult;
    playTone();persistSession();render();if(searchResult&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)replayLast();
    if(state.winner!==null||state.draw){saveRecord(true);ended=true;return;}schedule();
  }
  function schedule(){
    if(ended||paused||cursor<moves.length||state.winner!==null||state.draw||busy)return;
    const player=state.players[state.turn];
    if(!E.legalMoves(state.board,player,state.rules).length){timer=setTimeout(()=>{toast(playerName(player)+' 无合法走法，自动跳过');playMove({pass:true});},prefs.pace);return;}
    if(isHuman(player))return;
    clearTimeout(timer);timer=setTimeout(()=>requestSearch(false),prefs.pace);
  }
  function requestSearch(hint){
    if(busy||state.winner!==null||state.draw)return;
    const player=state.players[state.turn],legal=E.legalMoves(state.board,player,state.rules);
    if(!legal.length){toast('当前方无合法走法');return;}
    cancelSearch();const id=generation;busy=true;render();
    const options={level:hint?Math.max(config.level,3):levelFor(player),time:prefs.time||undefined,algorithm:prefs.algorithm,seed:(Number(prefs.seed)+state.ply)>>>0,repetitions:repetitions()};
    try{
      workerURL=URL.createObjectURL(new Blob([window.STARHOP_WORKER_SOURCE],{type:'application/javascript'}));worker=new Worker(workerURL);
      worker.onmessage=({data})=>{if(id!==generation)return;busy=false;worker.terminate();worker=null;URL.revokeObjectURL(workerURL);workerURL=null;
        if(data.error){toast('AI 搜索失败：'+data.error);paused=true;render();return;}
        lastSearch=data.result;if(!data.result.move){toast('没有合法走法');render();return;}
        if(hint){hintPath=data.result.move.path;selected=data.result.move.from;targets=E.pieceMoves(state.board,selected,state.rules);render();toast('建议 '+E.coord(data.result.move.from)+' → '+E.coord(data.result.move.to));}
        else playMove(data.result.move,data.result);
      };
      worker.onerror=()=>{if(id!==generation)return;cancelSearch();paused=true;render();toast('浏览器无法启动 AI 工作线程，请使用启动脚本打开');};
      worker.postMessage({id,state,options});
    }catch(error){cancelSearch();paused=true;render();toast('AI 工作线程不可用：'+error.message);}
  }
  function onCell(i){
    if(cursor<moves.length||busy||state.winner!==null||state.draw)return;
    const p=state.players[state.turn];if(!isHuman(p))return;
    if(state.board[i]===p){selected=selected===i?null:i;targets=selected===null?[]:E.pieceMoves(state.board,selected,state.rules);hintPath=null;drawBoard();return;}
    const move=targets.find(m=>m.to===i);if(move)playMove(move);else{selected=null;targets=[];hintPath=null;drawBoard();}
  }
  function undo(){
    if(!moves.length)return;cancelSearch();let cut=moves.length-1;
    if(config.mode!=='human'&&config.mode!=='ai-ai'){while(cut>0&&!isHuman(states[cut].players[states[cut].turn]))cut--;}
    states=states.slice(0,cut+1);moves=moves.slice(0,cut);state=states.at(-1);cursor=moves.length;selected=null;targets=[];hintPath=null;ended=false;lastSearch=null;currentSavedId=null;persistSession();render();schedule();
  }
  function review(to){cancelSearch();cursor=Math.max(0,Math.min(moves.length,to));selected=null;targets=[];hintPath=null;render();if(cursor===moves.length)schedule();}
  function showView(name){document.querySelectorAll('.view').forEach(e=>e.classList.toggle('active',e.id==='view-'+name));document.querySelectorAll('.nav-item').forEach(e=>e.classList.toggle('active',e.dataset.view===name));$('page-name').textContent=viewNames[name];if(name==='archive')renderArchive();window.location.hash=name;}
  function saveRecord(quiet=false){
    if(!moves.length){if(!quiet)toast('落子后即可保存棋谱');return;}
    const list=storageGet('starhop-archive',[]),item={...record(),id:currentSavedId||('game-'+Date.now()),savedAt:new Date().toISOString()};
    const index=list.findIndex(x=>x.id===item.id);if(index>=0)list[index]=item;else list.unshift(item);
    if(storageSet('starhop-archive',list.slice(0,100))){currentSavedId=item.id;if(!quiet)toast('已保存到“我的棋谱”');}
  }
  function download(content,filename,type='application/json'){const url=URL.createObjectURL(new Blob([typeof content==='string'?content:JSON.stringify(content,null,2)],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function renderArchive(){
    const list=storageGet('starhop-archive',[]);$('archive-list').replaceChildren();
    if(!list.length){const empty=document.createElement('section');empty.className='panel empty';empty.textContent='这里还没有棋谱。下完一局，点击“保存棋谱”，或导入已有对局。';$('archive-list').append(empty);return;}
    list.forEach(item=>{const card=document.createElement('section');card.className='panel archive-card';const tag=document.createElement('span');tag.className='eyebrow';tag.textContent=new Date(item.savedAt).toLocaleString('zh-CN');const title=document.createElement('h2');title.textContent=item.options.players+' 人 · '+(item.options.jump==='long'?'等距长跳':'相邻跳');const desc=document.createElement('p');desc.textContent=item.moves.length+' 手 · '+(item.result?.winner!==null&&item.result?.winner!==undefined?names[item.result.winner]+'胜':item.result?.draw||'未结束');const actions=document.createElement('div');actions.className='archive-actions';
      const open=document.createElement('button');open.textContent='打开复盘 →';open.onclick=()=>loadRecord(item);const exp=document.createElement('button');exp.textContent='导出';exp.onclick=()=>download(item,item.id+'.json');actions.append(open,exp);card.append(tag,title,desc,actions);$('archive-list').append(card);});
  }
  function loadRecord(item,quiet=false){
    const loaded=E.replay(item);cancelSearch();config={...config,...item.options,mode:['human-ai','human','ai-ai','mixed'].includes(item.options.mode)?item.options.mode:'human',humanSeat:Math.max(0,Math.min(loaded.state.players.length-1,Number(item.options.humanSeat)||0)),level:Math.max(0,Math.min(4,Number(item.options.level)||0)),secondLevel:Math.max(0,Math.min(4,Number(item.options.secondLevel)||0))};
    state=loaded.state;states=loaded.states;moves=loaded.moves;cursor=moves.length;selected=null;targets=[];hintPath=null;lastSearch=null;paused=true;ended=false;currentSavedId=item.id||null;historyStamp='';
    if(item.result?.draw&&state.winner===null)state.draw=String(item.result.draw).slice(0,80);render();if(!quiet){showView('play');toast('已载入棋谱 · 用复盘按钮逐手查看');}
  }
  function openDialog(forceMode){$('mode').value=forceMode||config.mode;$('player-count').value=config.players;$('jump-rule').value=config.jump;$('goal-lock').checked=config.goalLock;$('difficulty').value=config.level;$('difficulty-second').value=config.secondLevel;syncForm();$('human-seat').value=config.humanSeat;$('match-dialog').showModal();}
  function syncForm(){const seat=$('human-seat').value,mode=$('mode').value;if(mode==='human-ai')$('player-count').value='2';$('player-count').disabled=mode==='human-ai';const count=Number($('player-count').value);$('human-seat').replaceChildren();for(let i=0;i<count;i++){const opt=document.createElement('option');opt.value=i;opt.textContent=i===0?'先手座位':'第 '+(i+1)+' 座位';$('human-seat').append(opt);}$('human-seat').value=Math.min(Number(seat)||0,count-1);$('human-seat').disabled=mode==='ai-ai'||mode==='human';$('difficulty').disabled=mode==='human';$('second-level-label').hidden=mode!=='ai-ai';}
  function newGame(event){event.preventDefault();saveRecord(true);cancelSearch();config={players:Number($('player-count').value),mode:$('mode').value,humanSeat:Number($('human-seat').value),level:Number($('difficulty').value),secondLevel:Number($('difficulty-second').value),jump:$('jump-rule').value,goalLock:$('goal-lock').checked};state=E.createGame(config);states=[state];moves=[];cursor=0;selected=null;targets=[];hintPath=null;paused=false;ended=false;currentSavedId=null;lastSearch=null;$('match-dialog').close();persistSession();showView('play');render();schedule();}
  function playTone(){if(!sound)return;try{const audio=new(window.AudioContext||window.webkitAudioContext)(),osc=audio.createOscillator(),gain=audio.createGain();osc.connect(gain);gain.connect(audio.destination);osc.frequency.value=650;gain.gain.setValueAtTime(.06,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.11);osc.start();osc.stop(audio.currentTime+.12);osc.onended=()=>audio.close();}catch{}}
  function exportTraining(){const result=state.winner!==null?state.winner:state.draw?'draw':null;const rows=moves.map((move,i)=>{const s=states[i],p=s.players[s.turn];return {format:'starhop-training-v1',board:s.board,players:s.players,player:p,rules:s.rules,legal:E.legalMoves(s.board,p,s.rules).map(({from,to})=>({from,to})),policyMove:{from:move.from,to:move.to},outcome:result===null?null:result==='draw'?0:result===p?1:-1,engineVersion:'1.1.0'};});download(rows.map(x=>JSON.stringify(x)).join('\n'),'starhop-training-'+Date.now()+'.jsonl','application/x-ndjson');toast(rows.length+' 个局面已导出；未结束对局的结果标签为空');}
  A.LEVELS.forEach((level,i)=>{for(const id of ['difficulty','difficulty-second']){const opt=document.createElement('option');opt.value=i;opt.textContent=level.name+' · '+level.label+' ('+(level.time/1000)+'s)';$(id).append(opt);}});
  document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('quick-lab').onclick=()=>showView('lab');$('help').onclick=()=>showView('rules');$('new-game').onclick=()=>openDialog();$('lab-match').onclick=()=>openDialog('ai-ai');$('close-dialog').onclick=()=>$('match-dialog').close();$('mode').onchange=syncForm;$('player-count').onchange=syncForm;$('match-form').onsubmit=newGame;
  $('board').addEventListener('click',event=>{const cell=event.target.closest('[data-i]');if(cell)onCell(Number(cell.dataset.i));});$('board').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const cell=event.target.closest('[data-i]');if(cell){event.preventDefault();onCell(Number(cell.dataset.i));}}});
  $('coordinates').onclick=()=>{coords=!coords;$('coordinates').classList.toggle('active',coords);drawBoard();};$('flip').onclick=()=>{flipped=!flipped;drawBoard();};$('sound').onclick=()=>{sound=!sound;$('sound').classList.toggle('active',sound);$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');playTone();};
  $('undo').onclick=undo;$('hint').onclick=()=>requestSearch(true);$('pause').onclick=()=>{paused=!paused;if(paused)cancelSearch();render();schedule();};$('resign').onclick=()=>{cancelSearch();state={...state,draw:'手动结束'};states[states.length-1]=state;ended=true;saveRecord(true);persistSession();render();toast('对局已结束并保存棋谱');};
  $('replay-last').onclick=replayLast;
  $('save-game').onclick=()=>saveRecord();$('export-game').onclick=()=>download(record(),'starhop-'+Date.now()+'.json');$('first-move').onclick=()=>review(0);$('prev-move').onclick=()=>review(cursor-1);$('next-move').onclick=()=>review(cursor+1);$('last-move').onclick=()=>review(moves.length);$('return-live').onclick=()=>review(moves.length);$('move-list').onclick=event=>{const row=event.target.closest('[data-ply]');if(row)review(Number(row.dataset.ply));};
  $('algorithm').onchange=()=>{prefs.algorithm=$('algorithm').value;persistSession();};$('time-budget').onchange=()=>{prefs.time=Number($('time-budget').value);persistSession();};$('seed').onchange=()=>{prefs.seed=Number($('seed').value)>>>0;persistSession();};$('pace').onchange=()=>{prefs.pace=Number($('pace').value);persistSession();};$('export-training').onclick=exportTraining;
  $('import-game').onclick=()=>$('file-input').click();$('file-input').onchange=async()=>{const file=$('file-input').files[0];if(!file)return;try{if(file.size>3*1024*1024)throw new Error('棋谱文件超过 3 MB');const item=JSON.parse(await file.text());E.replay(item);saveRecord(true);loadRecord(item);saveRecord(true);persistSession();}catch(error){toast('导入失败：'+error.message);}$('file-input').value='';};
  const session=storageGet('starhop-session',null);if(session){try{Object.assign(prefs,session.preferences);loadRecord(session.record,true);$('algorithm').value=prefs.algorithm;$('time-budget').value=prefs.time;$('seed').value=prefs.seed;$('pace').value=prefs.pace;}catch{state=E.createGame(config);states=[state];moves=[];cursor=0;}}
  window.addEventListener('beforeunload',()=>cancelSearch());showView(viewNames[location.hash.slice(1)]?location.hash.slice(1):'play');render();
})();
