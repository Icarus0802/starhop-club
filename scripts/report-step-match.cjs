'use strict';

// Read-only result audit and Markdown report. It never loads an AI engine or
// starts searches. In-progress heldout files are excluded unless explicitly
// requested, and still require every expected game to be complete and stable.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const S=require('./step-match.cjs');
const E=require('../js/engine.js');
const ROOT=path.resolve(__dirname,'..');
const RUNS=[
  {id:'candidate-a-equal350',label:'A · 350ms验证',phase:'验证',games:8,time:350},
  {id:'candidate-b-screen100',label:'B · 100ms初筛',phase:'初筛',games:4,time:100},
  {id:'candidate-b-heldout350',label:'B · 350ms独立开局验证',phase:'独立验证',games:8,time:350,heldout:true},
  {id:'candidate-c-screen100',label:'C · 100ms初筛',phase:'初筛',games:4,time:100},
  {id:'candidate-c-heldout350',label:'C · 350ms独立开局验证',phase:'独立验证',games:8,time:350,heldout:true},
  {id:'candidate-d-screen100',label:'D · 100ms初筛',phase:'初筛',games:4,time:100},
  {id:'candidate-e-screen100',label:'E · 100ms初筛',phase:'初筛',games:4,time:100},
  {id:'candidate-e-confirm350',label:'E · 350ms独立开局复验',phase:'独立复验',games:8,time:350,heldout:true},
  {id:'candidate-h-screen100',label:'H · 100ms初筛',phase:'初筛',games:4,time:100},
  {id:'candidate-i-screen100',label:'I · 100ms学习权重初筛',phase:'初筛',games:4,time:100,learnedModel:'benchmarks/learned-value-v1.json'},
  {id:'candidate-i-confirm350',label:'I · 350ms学习权重独立复验',phase:'独立复验',games:8,time:350,heldout:true,learnedModel:'benchmarks/learned-value-v1.json'}
];
function sha(text){return createHash('sha256').update(text).digest('hex');}
function repositoryFile(relative){
  assert.equal(typeof relative,'string');assert.ok(!path.isAbsolute(relative),'Repository dependency must use a relative path');
  const filename=path.resolve(ROOT,relative);assert.ok(filename.startsWith(ROOT+path.sep),'Repository dependency escapes the checkout');return filename;
}
function stableJson(file){
  const before=fs.statSync(file),buffer=fs.readFileSync(file),after=fs.statSync(file);
  assert.equal(after.size,before.size,'File is being rewritten: '+file);
  assert.equal(after.mtimeMs,before.mtimeMs,'File is being rewritten: '+file);
  return {data:JSON.parse(buffer.toString('utf8')),sha256:sha(buffer),bytes:buffer.length,buffer,lastModifiedUtc:after.mtime.toISOString()};
}
function near(a,b,label){if(a===null||b===null)assert.equal(a,b,label);else assert.ok(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);}
function arithmeticGap(row,remaining){
  const loser=row.winner==='new'?'old':'new',totals={...row.ownTurnsAtTerminal};totals[loser]+=remaining;
  return totals.old-totals.new;
}
function frozenGapBounds(row,state){
  if(!['new','old'].includes(row.winner))return null;
  const loser=row.winner==='new'?'old':'new',seat=loser==='new'?row.newSeat:1-row.newSeat;
  const player=state.players[seat],outside=10-E.progress(state.board,player);
  // One turn moves exactly one piece. Each currently outside piece must move
  // at least once before all ten can fill the camp, even with continuous jumps.
  const bound=arithmeticGap(row,outside),direction=row.winner==='new'?'lower':'upper';
  if(Number.isFinite(row.exactFinishGap))assert.ok(direction==='lower'?row.exactFinishGap>=bound:row.exactFinishGap<=bound,'Exact gap violates the outside-piece lower bound');
  if(Number.isFinite(row.policyCompletion?.remainingOwnTurns))assert.ok(row.policyCompletion.remainingOwnTurns>=outside,'Policy completes below the outside-piece lower bound');
  return {loser,outside,remainingOwnTurnsLowerBound:outside,signedOwnTurnGapBound:bound,signedBoundDirection:direction};
}
function aggregateGapBounds(audit){
  const rows=audit.report.results,bounds=audit.gapBounds;
  const intervals=rows.map((row,i)=>{
    if(Number.isFinite(row.exactFinishGap))return {lower:row.exactFinishGap,upper:row.exactFinishGap};
    if(!bounds[i])return {lower:null,upper:null};
    const policy=Number.isFinite(row.policyFinishGap)?row.policyFinishGap:null,b=bounds[i].signedOwnTurnGapBound;
    // A verified policy route provides an upper bound on remaining turns. For
    // an old win the sign reverses, so it is the signed gap's lower bound.
    return row.winner==='new'?{lower:b,upper:policy}:{lower:policy,upper:b};
  });
  const clearNew=(row,i)=>row.winner==='new'&&intervals[i].lower!==null&&intervals[i].lower>2;
  const clearOld=(row,i)=>row.winner==='old'&&intervals[i].upper!==null&&intervals[i].upper<-2;
  return {intervals,newClearGapWins:rows.filter(clearNew).length,oldClearGapWins:rows.filter(clearOld).length,
    clearlyFavorNewPairs:rows.filter((_,i)=>i%2===0&&clearNew(rows[i],i)&&clearNew(rows[i+1],i+1)).length,
    meanLowerBound:intervals.every(x=>x.lower!==null)?intervals.reduce((sum,x)=>sum+x.lower,0)/rows.length:null};
}
function auditRun(spec){
  const localDirectory=path.join(ROOT,'arena-results',spec.id),publicDirectory=path.join(ROOT,'docs','benchmarks','2026-10-10',spec.id);
  // A fresh public clone has no ignored arena-results directory. Prefer an
  // existing local summary; never hide a partial local batch with older data.
  const directory=fs.existsSync(path.join(localDirectory,'summary.json'))?localDirectory:publicDirectory;
  const snapshot=stableJson(path.join(directory,'summary.json')),report=snapshot.data;
  if(report.results.length!==spec.games||report.options.games!==spec.games)return {spec,status:'pending',reason:'预期完整 '+spec.games+' 局，文件仍未形成完整批次'};
  assert.equal(report.format,'starhop-step-match-v1');assert.equal(report.options.time,spec.time);
  const pooled={new:[],old:[]},records=[],adapterChecks=[],gapBounds=[],evidenceSources=[{name:'summary.json',snapshot}];
  for(let i=0;i<spec.games;i++){
    const name='game-'+(i+1)+'.json',gameSnapshot=stableJson(path.join(directory,name));evidenceSources.push({name,snapshot:gameSnapshot});
    const row=report.results[i],record=gameSnapshot.data;records.push(record);
    assert.equal(row.game,i+1);assert.equal(row.newSeat,i%2);assert.equal(row.budgetMs,spec.time);
    assert.equal(row.openingSeed,report.options.seed+Math.floor(i/2)*10000);
    assert.deepEqual(record.benchmark,row);assert.equal(row.newLevel,row.oldLevel);
    const terminal=record.terminalState;assert.equal(terminal.players.length,2);assert.equal(terminal.board.length,121);
    for(const label of ['new','old']){
      const player=terminal.players[label==='new'?row.newSeat:1-row.newSeat];
      assert.equal(terminal.board.filter(p=>p===player).length,10,'Terminal must retain all ten pieces');
      assert.equal(row.unfinishedPiecesAtTerminal[label],10-E.progress(terminal.board,player),'Recorded unfinished count differs from the board');
    }
    if(row.winner){const winnerPlayer=terminal.players[row.winner==='new'?row.newSeat:1-row.newSeat];assert.equal(terminal.winner,winnerPlayer);assert.ok(E.isWinner(terminal.board,winnerPlayer));}
    gapBounds.push(frozenGapBounds(row,terminal));
    for(const sample of record.searchLog){assert.ok(Number.isFinite(sample.elapsedMs)&&sample.elapsedMs>=0);pooled[sample.engine].push(sample.elapsedMs);}
    const exact=record.exactFrozenCompletion,proven=!!(exact?.solved&&exact.proven);
    if(proven){
      assert.equal(row.exactCompletion.status,'proven-minimum');assert.equal(exact.steps,exact.plan.length);
      assert.equal(row.exactFinishGap,arithmeticGap(row,exact.steps));assert.equal(row.exactCompletion.turnIndexGap,2*exact.steps-1);
    }else assert.equal(row.exactFinishGap,null,'Unknown exact gap was changed to a number');
    const continuation=record.continuation;
    if(continuation){
      const loser=row.winner==='new'?'old':'new';
      assert.equal(continuation.adapter.sourceSha256,report.engines[loser].sourceSha256,'Policy continuation used another version');
      adapterChecks.push({game:i+1,sourceHashMatches:true,adapter:continuation.adapter.modules.find(m=>m.file===report.options[loser+'File'])?.adapter});
      const player=continuation.player,winner=continuation.frozenPlayer;
      assert.equal(winner,record.terminalState.winner);
      for(let cell=0;cell<121;cell++)if(record.terminalState.board[cell]!==player)assert.equal(continuation.finalBoard[cell]===winner,record.terminalState.board[cell]===winner,'Frozen winner changed');
      if(continuation.status==='complete'){
        assert.equal(continuation.remainingOwnTurns,continuation.moves.length);
        assert.equal(row.policyFinishGap,arithmeticGap(row,continuation.remainingOwnTurns));
      }else assert.equal(row.policyFinishGap,null,'Censored policy gap was changed to a number');
    }else assert.equal(row.policyFinishGap,null);
  }
  for(let i=0;i<spec.games;i+=2){
    assert.equal(report.results[i].openingSeed,report.results[i+1].openingSeed);
    const endpoint=m=>m.pass?{pass:true}:{from:m.from,to:m.to};
    assert.deepEqual(records[i].moves.slice(0,report.results[i].openingPlies).map(endpoint),records[i+1].moves.slice(0,report.results[i+1].openingPlies).map(endpoint),'Paired openings differ');
  }
  const recomputed=S.summarize(report.results);
  for(const key of ['games','newWins','oldWins','draws','provenExactGaps','unknownExactGaps','newClearGapWins','oldClearGapWins','allCompletedPairsClearlyFavorNew'])assert.equal(report.aggregate[key],recomputed[key]);
  near(report.aggregate.meanExactSignedOwnTurnGap,recomputed.meanExactSignedOwnTurnGap,'Exact mean excludes unknown');
  for(const label of ['new','old']){const measured=S.timing(pooled[label]);assert.equal(measured.searches,report.aggregate.timing[label].searches);for(const key of ['meanMs','p95Ms','maxMs'])near(measured[key],report.aggregate.timing[label][key],label+' pooled '+key);}
  const currentMatches={};for(const label of ['new','old'])currentMatches[label]=sha(fs.readFileSync(repositoryFile(report.options[label+'File']),'utf8'))===report.engines[label].sourceSha256;
  const audit={spec,status:'complete',report,summarySha256:snapshot.sha256,adapterChecks,currentMatches,gapBounds,evidenceSources};
  if(spec.learnedModel){
    const modelSnapshot=stableJson(repositoryFile(spec.learnedModel)),model=modelSnapshot.data;
    assert.equal(model.format,'starhop-linear-value-v1');assert.equal(model.trained,true);assert.equal(model.theta.length,12);
    const splitCounts={train:0,validation:0,test:0},groups=new Map();
    for(const game of model.provenance.games){
      assert.ok(Object.hasOwn(splitCounts,game.split));splitCounts[game.split]++;
      if(groups.has(game.group))assert.equal(groups.get(game.group),game.split,'One model opening group appears in multiple splits');else groups.set(game.group,game.split);
      for(const source of game.sources){assert.ok(!/user|human|fixture/i.test(source.file),'Human or fixture source in the model provenance');assert.equal(sha(fs.readFileSync(repositoryFile(source.file))),source.sha256,'Model source hash differs from the public game');}
    }
    assert.equal(model.training.uniqueGames,model.provenance.games.length);
    audit.learnedDependency={file:spec.learnedModel,sha256:modelSnapshot.sha256,bytes:modelSnapshot.bytes,lastModifiedUtc:modelSnapshot.lastModifiedUtc,
      inspectedAtUtc:new Date().toISOString(),parameters:model.theta.length,uniqueGames:model.training.uniqueGames,groups:groups.size,splitCounts,
      datasetSha256:model.provenance.datasetSha256,trainerSha256:model.provenance.trainerSha256,
      capturedByOriginalEngineMetadata:(report.engines.new.modules||[]).some(m=>m.file===spec.learnedModel&&m.sourceSha256===modelSnapshot.sha256),
      summaryGeneratedAtUtc:report.generatedAt,modelModifiedBeforeSummary:modelSnapshot.lastModifiedUtc<=report.generatedAt};
  }
  return audit;
}
const EVIDENCE_ROOT=path.join(ROOT,'docs','benchmarks','2026-10-10');
function attachExistingEvidence(audit){
  if(audit.status!=='complete')return false;
  const directory=path.join(EVIDENCE_ROOT,audit.spec.id);
  if(!audit.evidenceSources.every(({name,snapshot})=>fs.existsSync(path.join(directory,name))&&sha(fs.readFileSync(path.join(directory,name)))===snapshot.sha256))return false;
  audit.evidenceRelative='2026-10-10/'+audit.spec.id;return true;
}
function exportPublicEvidence(audits){
  const complete=audits.filter(a=>a.status==='complete'),files=[];
  for(const audit of complete){
    assert.equal(audit.evidenceSources.length,audit.spec.games+1,'Cannot export an incomplete run');
    const directory=path.join(EVIDENCE_ROOT,audit.spec.id);fs.mkdirSync(directory,{recursive:true});
    for(const {name,snapshot} of audit.evidenceSources){
      const target=path.join(directory,name);
      if(fs.existsSync(target))assert.equal(sha(fs.readFileSync(target)),snapshot.sha256,'Refusing to replace different public evidence: '+target);
      else fs.writeFileSync(target,snapshot.buffer);
      assert.equal(sha(fs.readFileSync(target)),snapshot.sha256,'Public evidence copy differs from the original');
      files.push({file:audit.spec.id+'/'+name,bytes:snapshot.bytes,sha256:snapshot.sha256});
    }
    assert.ok(attachExistingEvidence(audit));
  }
  const manifest={format:'starhop-public-selfplay-evidence-v1',date:'2026-10-10',
    note:'Complete original JSON files copied byte-for-byte. Includes failures, draws and unknown minimum gaps. No searches or game-record changes.',
    runs:complete.map(a=>({id:a.spec.id,games:a.spec.games,budgetMs:a.spec.time})),files,
    originalFileCount:files.length,originalBytes:files.reduce((sum,f)=>sum+f.bytes,0)};
  fs.mkdirSync(EVIDENCE_ROOT,{recursive:true});
  const manifestFile=path.join(EVIDENCE_ROOT,'manifest.json');fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  return {...manifest,manifestBytes:fs.statSync(manifestFile).size,exportedFiles:files.length+1,
    exportedBytes:manifest.originalBytes+fs.statSync(manifestFile).size};
}
function packageInventory(){
  // Mirrors package.py's reviewed roots and CRLF normalization without writing
  // or compressing an archive. It counts every existing evidence file.
  const files=['index.html','style.css','LICENSE','THIRD_PARTY.md','README.md','CHANGELOG.md','package.json','server.cjs','启动跳棋.cmd','启动服务.ps1','.nojekyll','.gitignore','.gitattributes'];
  function walk(relative){for(const entry of fs.readdirSync(path.join(ROOT,relative),{withFileTypes:true})){
    const next=relative+'/'+entry.name;assert.ok(!entry.isSymbolicLink(),'Package contains a symlink: '+next);if(entry.isDirectory()){if(entry.name!=='__pycache__')walk(next);}else if(entry.isFile())files.push(next);
  }}
  for(const directory of ['assets','js','tests','benchmarks','docs','scripts','vendor'])walk(directory);
  let rawBytes=0,normalizedBytes=0;
  for(const name of files){const filename=path.join(ROOT,name);assert.ok(!fs.lstatSync(filename).isSymbolicLink(),'Package contains a symlink');const buffer=fs.readFileSync(filename);rawBytes+=buffer.length;
    let removed=0;if(!/\.(?:png|jpg|jpeg|webp|gif|ico|woff|woff2)$/i.test(name))for(let i=0;i<buffer.length-1;i++)if(buffer[i]===13&&buffer[i+1]===10){removed++;i++;}
    normalizedBytes+=buffer.length-removed;
  }
  return {files:files.length,rawBytes,uncompressedBytes:normalizedBytes,fileLimit:256,byteLimit:5000000,withinLimits:files.length<256&&normalizedBytes<5000000};
}
function readV2Correction(){
  const modelFile='benchmarks/learned-value-v2.json',candidateFile='benchmarks/candidate-learned-j.cjs';
  if(!fs.existsSync(path.join(ROOT,modelFile))||!fs.existsSync(path.join(ROOT,candidateFile)))return null;
  const v1=stableJson(path.join(ROOT,'benchmarks/learned-value-v1.json')),snapshot=stableJson(path.join(ROOT,modelFile)),v2=snapshot.data;
  assert.equal(v2.trained,true);assert.deepEqual(v2.theta,v1.data.theta,'Frozen v2 correction unexpectedly changed strategy parameters');
  assert.equal(v2.training.bestEpoch,v1.data.training.bestEpoch);assert.equal(v2.training.excludedPositions,1);
  return {modelFile,candidateFile,modelSha256:snapshot.sha256,candidateSha256:sha(fs.readFileSync(path.join(ROOT,candidateFile))),
    sampleCounts:v2.training.sampleCounts,retainedGameCounts:v2.training.retainedGameCounts,uniqueGames:v2.training.uniqueGames,bestEpoch:v2.training.bestEpoch};
}
const fmt=(v,d=2)=>v===null||v===undefined?'未知':Number(v).toFixed(d);
const gap=v=>v===null?'未知':v>0?'+'+v:String(v);
const sourceLink=audit=>audit.evidenceRelative?'[原始summary]('+audit.evidenceRelative+'/summary.json)':'原始文件位于本地 `arena-results/'+audit.spec.id+'/`；尚未复制为公开证据';
function generateMarkdown(audits,{evidence=null,inventory=null,v2=null}={}){
  const lines=['# 2026-10-10 新旧 AI 等时自战审查','',
    '本报告区分候选筛选与独立开局验证。只纳入写入完整、预期局数一致、逐局记录齐全的批次；进行中的验证不提供胜率或步差结论。100ms与350ms结果分开列出，不合并成总胜率。','',
    '## 口径与限制','',
    '- 胜负来自正常双边对局。结束后冻结胜方的棋子，它们仍作为障碍和跳跃借力；这改变了后续对抗条件。冻结收官指标反映这个终盘的补齐成本，不能直接视为真实继续对抗的棋力差。',
    '- 精确步差 = 旧版完成总用回合 − 新版完成总用回合，正值有利新版。仅在收官求解器 `solved && proven` 时使用最短剩余回合；已知均值只对已证明样本计算，必须同时展示分母及未知数。',
    '- 策略续走使用落后版本、原思考预算与冻结规则适配器。它可能比最短方案多走，不能用它扩大“最短差距”的结论。正常对局不启用冻结适配器。',
    '- 相邻移动与一手连续多跳各计一个回合。合法强制pass按调度回合计；剩子数不能当作实测或最短剩余步数。每枚营外子至少要移动一次，因此营外子数可以给出独立的保守下界，必须与精确结果分栏。和局、超时、状态上限、未证明最短值保留为未知，不记0。真正的0表示双方补齐所用自身回合数相同，仍可能因先手时序产生一槽胜负。',
    '- 搜索耗时是同步 `engine.search` 的真实wall time；不含worker启动、模块加载、界面动画、开局生成及独立合法性核验。p95按整个批次的搜索样本重新计算，不能平均各局p95。',
    '- 当前验收要求为稳定领先旧版**至少5步**：每步相同思考预算、四个全新开局交换先后手，共8局独立验证；逐局检查新版获胜且已证明最短冻结gap≥+5，并检查完整配对。未知、未完成或未证明的最短值不能算通过，不能只用获胜子集均值验收。',
    '- 历史批次按当时“超过2步”的研究门槛记录，相关统计与下界不改写。营外子下界超过2可以证明历史阈值，但不能补写未知的最短值，也不能充当当前8局≥5的验收结论。小样本筛选不对应人类等级或冠军胜率。','',
    '## 完整批次总表','',
    '下表保留历史门槛“精确gap>2”的原始统计；当前发布验收已提高到≥5，另列于当前结论中。','',
    '| 批次 | 每方每步预算 | 局数 | 新胜 / 旧胜 / 和 | 最短gap已证明 / 未知 | 精确已知均值 | 新胜且精确gap>2 | 全部配对双局均新胜且精确gap>2 |',
    '| --- | ---: | ---: | --- | --- | ---: | ---: | --- |'];
  for(const a of audits){if(a.status!=='complete'){lines.push('| '+a.spec.label+' | '+a.spec.time+'ms | 待完整批次 | — | — | — | — | 未判断 |');continue;}
    const g=a.report.aggregate;lines.push('| '+a.spec.label+' | '+a.spec.time+'ms | '+g.games+' | '+g.newWins+' / '+g.oldWins+' / '+g.draws+' | '+g.provenExactGaps+' / '+g.unknownExactGaps+' | '+fmt(g.meanExactSignedOwnTurnGap)+' | '+g.newClearGapWins+' | '+(g.allCompletedPairsClearlyFavorNew?'是':'否')+' |');}
  lines.push('','A的350ms验证失败须保留：1胜4负3和，已证明5局精确均值−0.8，其中2局旧版领先超过2步。它没有达到升级标准。',
    '','B的100ms初筛为3胜1负；C的100ms初筛为2胜1负1和。C两盘胜局均为+4，但存在一次失利和一次重复和局；已知均值+2.67不是全4局平均，也不说明每个配对稳定领先。B与C都未满足全部配对双局领先超过2步。','',
    '## 搜索耗时（批次合并样本）','',
    '| 批次 | 新 mean / p95 / max (ms) | 旧 mean / p95 / max (ms) | 新 / 旧搜索次数 |',
    '| --- | --- | --- | ---: |');
  for(const a of audits.filter(a=>a.status==='complete')){const t=a.report.aggregate.timing;lines.push('| '+a.spec.label+' | '+fmt(t.new.meanMs)+' / '+fmt(t.new.p95Ms)+' / '+fmt(t.new.maxMs)+' | '+fmt(t.old.meanMs)+' / '+fmt(t.old.p95Ms)+' / '+fmt(t.old.maxMs)+' | '+t.new.searches+' / '+t.old.searches+' |');}
  lines.push('','双方收到相同预算参数，p95接近各自预算上限。它没有显示候选明显增加单步搜索时延；这不是整个网页响应时间的测试，也不能把少量亚毫秒差异解释为显著提速。','',
    '## 逐局记录','');
  for(const a of audits){lines.push('### '+a.spec.label,'');if(a.status!=='complete'){lines.push('计划'+a.spec.games+'局（'+a.spec.games/2+'个配对）。此时未纳入该批次，也未提供中途胜率。批次完成后运行报告命令加 `--include-heldout` 更新。','');continue;}
    const r=a.report;lines.push(sourceLink(a)+'。开局'+r.options.opening+'手；基础种子'+r.options.seed+'；双方难度'+r.options.newLevel+'；'+(r.options.jump==='short'?'相邻跳':'等距长跳')+'；'+(r.options.goalLock?'锁营开启':'锁营关闭')+'。','',
      '| 局 | 开局种子 | 新版执子 | 结果 | 终局总手 | 精确gap | 策略gap | 精确剩余己方回合 | 全局槽差 |',
      '| ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |');
    for(const row of r.results){const gameLink=a.evidenceRelative?'['+row.game+']('+a.evidenceRelative+'/game-'+row.game+'.json)':row.game;
      lines.push('| '+gameLink+' | '+row.openingSeed+' | '+(row.newSeat===0?'先手':'后手')+' | '+(row.winner==='new'?'新胜':row.winner==='old'?'旧胜':'和：'+row.draw)+' | '+row.terminalPly+' | '+gap(row.exactFinishGap)+' | '+gap(row.policyFinishGap)+' | '+(row.exactCompletion.remainingOwnTurns??'未知')+' | '+(row.exactCompletion.turnIndexGap??'未知')+' |');}
    lines.push('','配对结果（此处只计最短精确证明）：'+r.aggregate.pairs.map(p=>'P'+p.pair+' 新'+p.newWins+'胜/旧'+p.oldWins+'胜，双局>2='+ (p.bothNewLeadsGreaterThanTwo?'是':'否')).join('；')+'。','',
      '- 新版运行时SHA-256：`'+r.engines.new.sourceSha256+'`。',
      '- 旧版运行时SHA-256：`'+r.engines.old.sourceSha256+'`。',
      '- summary文件SHA-256：`'+a.summarySha256+'`。',
      '- 冻结策略适配校验：'+a.adapterChecks.length+'个有胜负终盘，续走源码哈希均与该落后方正常对局源码一致；Fast终局忽略与虚拟pass仅在收官测量中启用。','');
    if(!a.currentMatches.new)lines.push('运行时新版路径现已不是该SHA对应的文件。重跑须用保存的该候选快照；不能直接把当前生产文件路径当作同一个版本。','');
    if(a.learnedDependency){const m=a.learnedDependency;
      lines.push('模型显式依赖：[learned-value-v1.json](../../'+m.file+')，'+m.parameters+'参数线性模型，'+m.bytes+'字节；本次只读补充核验SHA-256为 `'+m.sha256+'`。文件最后修改时间UTC '+m.lastModifiedUtc+'，本次补充观察UTC '+m.inspectedAtUtc+'；本批summary记录时间UTC '+m.summaryGeneratedAtUtc+'。','',
        '原始`engines.new.modules`'+(m.capturedByOriginalEngineMetadata?'已包含该JSON哈希。':'只捕获候选CJS，没有捕获通过原生require加载的模型JSON。模型文件最后修改时间'+(m.modelModifiedBeforeSummary?'早于':'晚于')+'summary时间，但文件时间戳不能替代运行期字节哈希。此处只补充当前冻结模型的SHA，未改已跑脚本或原始records，也不追认“全部权重依赖当时均已捕获”。')+'','');
    }
  }
  const held=audits.find(a=>a.spec.id==='candidate-c-heldout350');
  lines.push('## 当前结论','');
  lines.push('当前门槛为等时、四个全新开局交换先后手的8局验证，稳定最短冻结gap≥+5。已完成批次均没有达到；以下单局计数保留全部失败、和局及未知，未将历史>2的通过次数换算成≥5。','',
    '| 批次 | 新胜且已证明最短gap≥5 / 全部局数 | 4个独立开局交换先后手的8局批次 | 全部配对双局均满足≥5 |',
    '| --- | ---: | --- | --- |');
  for(const a of audits.filter(a=>a.status==='complete')){
    const rows=a.report.results,qualified=rows.filter(row=>row.winner==='new'&&Number.isFinite(row.exactFinishGap)&&row.exactFinishGap>=5).length;
    const eight=!!a.spec.heldout&&rows.length===8&&new Set(rows.map(row=>row.openingSeed)).size===4;
    lines.push('| '+a.spec.label+' | '+qualified+' / '+rows.length+' | '+(eight?'是':'否')+' | '+(eight&&qualified===8?'是':'否')+' |');
  }
  lines.push('','统计只证明当前这些固定基线和预算下的结果；没有候选获得稳定≥5步的升级证据，生产AI内核继续保留原版。','');
  const iScreen=audits.find(a=>a.spec.id==='candidate-i-screen100'),iConfirm=audits.find(a=>a.spec.id==='candidate-i-confirm350');
  if(iScreen?.status==='complete'){
    const h=iScreen.report.aggregate,m=iScreen.learnedDependency;
    lines.push('### I：真实线性训练已完成，四局初筛不等于达标','',
      'I的100ms初筛'+h.newWins+'胜'+h.oldWins+'负'+h.draws+'和，最短冻结gap依次+3、+6、+2、+3，4局均已证明，均值'+fmt(h.meanExactSignedOwnTurnGap)+'。只有第2局达到≥5，另3局不足5；四局初筛不符合全新4开局交换先后手8局的验收。'+(iConfirm?.status==='complete'?'350ms完整复验结果如下，首筛4胜没有延续到正式验收。':'350ms独立验证尚未纳入，也不报告中途胜率。'),'',
      '策略续走第2局因重复局面截断，保持未知；其余'+h.measuredPolicyGaps+'局为+3、+2、+3，已知策略均值'+fmt(h.meanPolicySignedOwnTurnGap)+'。不能把未知续走记为0，也不能删除这个最短+6已证明而策略未完成的样本。','',
      '模型是实际训练出的12参数线性价值模型，采用整局结果监督学习，不是神经网络、AlphaZero自战网络或冠军模型。公开训练清单包含'+m.uniqueGames+'局、'+m.groups+'个开局组：训练'+m.splitCounts.train+'局、验证'+m.splitCounts.validation+'局、测试'+m.splitCounts.test+'局；整个开局组保持同一split。用户95手棋谱及其他人类/fixture记录排除在训练数据之外，冻结续走、步差和搜索评分未作为训练标签。用户与大师棋谱已用于诊断和特征设计，不能重新声称是从未接触的验收资料。','',
      '训练数据清单SHA-256：`'+m.datasetSha256+'`；训练器SHA-256：`'+m.trainerSha256+'`。学习管线7项检查及复训权重一致性已通过；本报告只核对已有模型元信息与公共源文件哈希，没有重训或运行新搜索。离线测试仅4局，不能把训练指标转换为人类棋力。模型依赖哈希缺口见本批次逐局记录后说明；补充的当前模型哈希不等于原比赛已记录所有依赖。','',
      '[独立审查](LEARNED_VALUE_REVIEW.md)发现v1抽样状态中有一组训练/验证完整局面重合：B350第5局总手107与B100第4局总手113，均为红方行棋且标签1；该验证样本参与checkpoint选择。按完整对局/开局分组仍未排除后续收官汇合，不能宣称“无泄漏”或验证完全独立。未证明删除该样本会改变权重、checkpoint或对局结果；v1/I保持冻结，清洗后的v2/J属于独立候选，不能用其修正追认v1。','');
    if(iConfirm?.status==='complete'){
      const c=iConfirm.report.aggregate;
      assert.equal(iScreen.report.engines.new.sourceSha256,iConfirm.report.engines.new.sourceSha256,'I screen/confirmation CJS changed');
      assert.equal(m.sha256,iConfirm.learnedDependency.sha256,'I screen/confirmation current frozen model differs');
      lines.push('350ms新开局完整8局为'+c.newWins+'胜'+c.oldWins+'负'+c.draws+'和。最短gap按局序为未知、−5、+2、−2、未知、未知、+1、−2；已证明'+c.provenExactGaps+'局均值'+fmt(c.meanExactSignedOwnTurnGap)+'，另'+c.unknownExactGaps+'局未知，不当作全8局均值。新版获胜的两盘已解算差距只有+2、+1，第三盘未知；没有一盘新胜已证明≥5，更没有稳定配对优势。','',
        '第1局达到测试400手上限（连公共开局总手408）记和。第5局虽在总手361获胜，旧版只剩一枚营外子，但最短求解time-limit、策略重复截断；不能把这一枚当成只需一手或某个确定步差。第6局旧版获胜的最短也因time-limit未知。第2、5、6局策略续走重复截断，连和局共'+c.unknownPolicyGaps+'个策略未知；已完成'+c.measuredPolicyGaps+'局策略均值'+fmt(c.meanPolicySignedOwnTurnGap)+'只反映这个子集。全部结果均保留。','',
        'I100与I350使用同一冻结CJS及当前只读核验的v1模型文件。100ms初筛4胜是筛选信号；350ms换开局后的3胜4负1和否定了稳定≥5的升级结论。模型JSON运行期哈希缺口仍保留，未修改这两批原始记录；后续对战工具将捕获JSON依赖，不能回填成I当时已捕获。','');
    }
  }
  if(v2)lines.push('### v2/J：清洗与契约修正，没有新增棋力证据','',
    'v2已移除审查发现的1个跨训练/验证重复局面。清洗后样本为训练'+v2.sampleCounts.train+'、验证'+v2.sampleCounts.validation+'、测试'+v2.sampleCounts.test+'；来源仍'+v2.uniqueGames+'局，保留训练'+v2.retainedGameCounts.train+'局、验证'+v2.retainedGameCounts.validation+'局、测试'+v2.retainedGameCounts.test+'局。重新拟合得到best checkpoint '+v2.bestEpoch+'，12个theta与冻结v1完全相同，不能把这次清洗包装为新策略变强。','',
    '[v2模型](../../'+v2.modelFile+') SHA-256：`'+v2.modelSha256+'`；[J候选](../../'+v2.candidateFile+') SHA-256：`'+v2.candidateSha256+'`。J补充模型契约校验，后续工具将记录JSON依赖；此处只确认真实数据清洗与正确性修正。J未自战，不追加胜率或步差，不复用I比赛冒充J已验证。原I/v1、训练/验证合流审查、旧模型依赖哈希缺口与全部失败棋谱保持原样；生产内核仍未更换。','');
  const bHeld=audits.find(a=>a.spec.id==='candidate-b-heldout350');
  if(bHeld?.status==='complete'){
    const h=bHeld.report.aggregate;
    lines.push('### B：初筛的优势没有通过独立验证','',
      'B在100ms初筛3胜1负，350ms独立开局验证却为'+h.newWins+'胜'+h.oldWins+'负'+h.draws+'和。最短gap已证明'+h.provenExactGaps+'局、未知'+h.unknownExactGaps+'局；已知均值'+fmt(h.meanExactSignedOwnTurnGap)+'，策略续走'+h.measuredPolicyGaps+'局均值'+fmt(h.meanPolicySignedOwnTurnGap,3)+'。只报告初筛会隐藏主要反证；两批预算与开局不同，不能把下滑单独归因于350ms预算。','',
      'B的第6局旧版获胜，最短求解因time-limit停止，精确gap仍未知；同版本策略gap为−9。新版当时46回合、3枚营外子，旧版47回合，由每子必须移动一次可知最短gap≤47−(46+3)=−2；无法将−9写成最短差距。该候选未通过历史>2步门槛，也没有当前稳定≥5步的验收证据。','');
  }
  const dScreen=audits.find(a=>a.spec.id==='candidate-d-screen100');
  if(dScreen?.status==='complete'){
    const h=dScreen.report.aggregate;
    lines.push('### D：降低入营奖励的单参数尝试失败','',
      'D相对C的可执行代码只把默认`done`入营奖励由7改为4，另修改了文件首行说明。100ms初筛为'+h.newWins+'胜'+h.oldWins+'负'+h.draws+'和；最短gap已证明'+h.provenExactGaps+'局、未知'+h.unknownExactGaps+'局（其中一局为重复和局），已知均值'+fmt(h.meanExactSignedOwnTurnGap)+'；策略续走'+h.measuredPolicyGaps+'局均值'+fmt(h.meanPolicySignedOwnTurnGap)+'。这次参数调整未通过初筛，小样本不能推出该参数在所有开局都更差。','');
  }
  const eScreen=audits.find(a=>a.spec.id==='candidate-e-screen100'),eConfirm=audits.find(a=>a.spec.id==='candidate-e-confirm350');
  if(eScreen?.status==='complete'&&eConfirm?.status==='complete'){
    const s=eScreen.report.aggregate,h=eConfirm.report.aggregate;
    lines.push('### E：初筛胜率没有延续到新开局复验','',
      'E的100ms初筛为'+s.newWins+'胜'+s.oldWins+'负'+s.draws+'和；最短gap已证明'+s.provenExactGaps+'局、未知'+s.unknownExactGaps+'局，已知均值'+fmt(s.meanExactSignedOwnTurnGap)+'；策略续走'+s.measuredPolicyGaps+'局均值'+fmt(s.meanPolicySignedOwnTurnGap)+'。第4局旧版获胜但最短求解超时，精确gap保持未知，策略gap−6不能当作最短差距。','',
      '350ms新开局复验为'+h.newWins+'胜'+h.oldWins+'负'+h.draws+'和，最短gap已证明'+h.provenExactGaps+'局、未知'+h.unknownExactGaps+'局；已知均值'+fmt(h.meanExactSignedOwnTurnGap,6)+'。5场失利的最短冻结gap分别为−4、−6、−3、−5、−4，都超过2步；两场胜局为+2、+5。这批次没有证明E比旧版更强。','',
      '第2局达到测试用手数上限，终局总手408（8手公共开局后测试400手），记为和局；精确和策略gap均为未知，不能计0或删掉。第3、8局的同版本冻结策略续走因重复局面截断，策略gap也保留未知；它们的最短求解已分别证明−6与−4，因此精确结果可以保留。策略已知'+h.measuredPolicyGaps+'局均值'+fmt(h.meanPolicySignedOwnTurnGap)+'仅对这'+h.measuredPolicyGaps+'局计算，不代表全8局。','',
      'E的两批使用同一源码SHA，复验换用了基础种子'+eConfirm.report.options.seed+'；预算与开局一起改变，不能把反转归因于单一因素，也不能只展示100ms初筛。','');
    assert.equal(eScreen.report.engines.new.sourceSha256,eConfirm.report.engines.new.sourceSha256,'E screen/confirmation snapshot changed');
  }
  const hScreen=audits.find(a=>a.spec.id==='candidate-h-screen100');
  if(hScreen?.status==='complete'){
    const h=hScreen.report.aggregate;
    lines.push('### H：单盘+5不能代替完整验收','',
      'H的100ms初筛为'+h.newWins+'胜'+h.oldWins+'负'+h.draws+'和。第1局最短gap+5，第3局旧版获胜且最短gap−6；已解算'+h.provenExactGaps+'局均值'+fmt(h.meanExactSignedOwnTurnGap)+'。第2局达到测试用手数上限记和；第4局虽为新版获胜，最短求解达到state-limit，仍未知。','',
      '第3、4局的同版本冻结策略续走均因重复局面截断，策略gap保持未知。因此策略已知仅'+h.measuredPolicyGaps+'局、均值'+fmt(h.meanPolicySignedOwnTurnGap)+'，不能称为4局平均差5。H只有4局初筛，并包含一场−6失利、一场上限和局和一场最短未知；没有满足四个全新开局交换先后手8局、稳定≥5步的验收。','');
  }
  if(held?.status==='complete'){
    const h=held.report.aggregate,b=aggregateGapBounds(held),rows=held.report.results;
    lines.push('### C：胜局有明确差距，配对仍不稳定','',
      '350ms独立开局验证已完成'+h.games+'局：新'+h.newWins+'胜、旧'+h.oldWins+'胜、和'+h.draws+'，新版胜率'+fmt(100*h.newWins/h.games,1)+'%。精确gap已证明'+h.provenExactGaps+'局，未知'+h.unknownExactGaps+'局；已解算均值'+fmt(h.meanExactSignedOwnTurnGap)+'仅针对这'+h.provenExactGaps+'局。未解算的3局全部是新版获胜，未知结果集中在胜局；不能用−0.6代表全8局均值或据此断言新版整体落后。','',
      '### 未解算胜局的独立下界','',
      '| 局 | 新 / 旧已走回合 | 旧版营外子 | 最短求解停止原因 | 冻结gap保守下界 | 策略gap（非最短） |',
      '| ---: | --- | ---: | --- | ---: | ---: |');
    for(let i=0;i<rows.length;i++){
      const row=rows[i],bound=held.gapBounds[i];if(row.exactFinishGap!==null||row.winner!=='new')continue;
      lines.push('| '+row.game+' | '+row.ownTurnsAtTerminal.new+' / '+row.ownTurnsAtTerminal.old+' | '+bound.outside+' | '+row.exactReason+' | ≥'+gap(bound.signedOwnTurnGapBound)+' | '+gap(row.policyFinishGap)+' |');
    }
    lines.push('','每个营外子至少要单独移动一回合，连续多跳也只能搬动一枚棋子。故第2局gap≥45+3−45=3；第3局gap≥55+4−56=3；第8局gap≥45+4−45=4。这是下界证明，三局的 `exactFinishGap` 仍为null；没有把剩子数当作最短收官答案。','',
      '新版'+b.newClearGapWins+'场胜局都已经证明冻结差距超过2步：'+h.newClearGapWins+'场最短精确证明，另'+(b.newClearGapWins-h.newClearGapWins)+'场靠上述保守下界。完整配对中只有'+b.clearlyFavorNewPairs+'/'+h.pairs.length+'个配对达到双局新胜且差距超过2。另有'+h.oldWins+'场失利，其中'+b.oldClearGapWins+'场旧版领先超过2步；本批次两场为−4，不能判断已经稳定升级。','');
    if(b.meanLowerBound!==null)lines.push('全8局已知值与下界合计：4+3+3−2+3−4−4+4=7，冻结最短gap全批次均值 **≥'+fmt(b.meanLowerBound,3)+'**。这只是均值下界，不是真实均值；具体最短值仍有3局未知。策略续走8局均值'+gap(h.meanPolicySignedOwnTurnGap)+'反映该版本实际续走，不能冒充最短均值。','');
    lines.push('上述终盘指标都以胜方冻结为条件。候选C在这批独立开局上赢得较多，但失利和配对反转仍明显，历史稳定>2门槛尚未满足，更没有达到当前稳定≥5步的要求；此结果不支持发布为已经显著变强的正式版。','');
    const screened=audits.find(a=>a.spec.id==='candidate-c-screen100');
    if(screened?.status==='complete'&&screened.report.engines.new.sourceSha256!==held.report.engines.new.sourceSha256)lines.push('C初筛与独立验证使用的新版源码SHA不同，属于不同候选快照；不能把差异仅归因于从100ms提高到350ms。','');
    else if(screened?.status==='complete')lines.push('C的100ms初筛与350ms独立验证使用同一源码SHA，但预算和开局种子不同。两批各自解释，不合并胜率，也不能把结果变化单独归因于增加思考预算。','');
  }else lines.push('C的350ms独立验证尚未纳入。现有结果不足以宣称达到当前稳定领先旧版至少5步的验收要求；历史超过2步的筛选信号也不能替代完整验证。','');
  if(evidence){
    lines.push('## 公开原始证据包','',
      '[SHA-256清单](2026-10-10/manifest.json)记录'+evidence.runs.length+'个完整批次，共'+evidence.originalFileCount+'个原始JSON（summary与逐局完整记录），'+evidence.originalBytes.toLocaleString('en-US')+'字节。连同清单为'+evidence.exportedFiles+'文件、'+evidence.exportedBytes.toLocaleString('en-US')+'字节。原始内容逐字节复制，没有删掉失败、和局、未知、搜索日志或续走记录；每份公开文件的SHA-256均与只读源一致。以上逐局编号与summary链接直接指向这份可纳入仓库的证据，不依赖被忽略的本地arena目录。','');
  }
  if(inventory)lines.push('按当前`package.py`的文件范围及CRLF规范化方式，证据加入后的源包为 **'+inventory.files+'文件、'+inventory.uncompressedBytes.toLocaleString('en-US')+'未压缩字节**（磁盘原始合计'+inventory.rawBytes.toLocaleString('en-US')+'字节）。'+(inventory.withinLimits?'符合文件数<256、未压缩体积<5,000,000字节的限制。':'超出限制，必须调整打包范围后重新核验，不能删除失败数据。')+'本次只检查范围与体积，没有生成或发布新版本。','');
  lines.push('## 审查说明','',
    '[STEP_ACCEPTANCE.md](STEP_ACCEPTANCE.md)、[USER_GAME_95.md](USER_GAME_95.md)与对局脚本的主要口径一致：第95手绿走48次、红走47次；红冻结最短剩5次，因此自身完成差4。严格交替的一基全局槽差是104−95=9，含4个绿方冻结空槽，不能与“红还需5次落子”混用。',
    '','早期A批次summary的英文timing说明曾称包含输入检查；实际计时代码在输入序列化之后启动，返回搜索结果时即停止，因此本报告统一采用“仅同步搜索wall time”的真实代码口径。数值未因文字修正而改写。',
    '','本报告只读取并核对现有结果、逐局字段、配对开局、收官证明标记、完成计数、冻结源码哈希及合并时延。没有运行新AI搜索；完整着法合法性由原对局脚本在每次落子及续走时独立核验。','',
    '更新命令：`node scripts/report-step-match.cjs --include-heldout --public-evidence`。优先读取存在的本地arena summary；没有时使用仓库内公开证据，源码与模型来源均按当前checkout的相对路径核验，公开clone不依赖原机器绝对路径。`--public-evidence`只复制RUNS中通过完整批次审查的summary与逐局JSON，不运行AI或修改源记录。未完成、正在写入或预期局数不一致的heldout只会显示待完整批次，不会转为胜率结论。','');
  return lines.join('\n');
}
function main(argv=process.argv.slice(2)){
  assert.ok(argv.every(arg=>['--include-heldout','--public-evidence','--help'].includes(arg)),'Only --include-heldout, --public-evidence and --help are accepted');
  if(argv.includes('--help')){console.log('node scripts/report-step-match.cjs [--include-heldout] [--public-evidence]\nReads complete specified RUNS only; writes docs/benchmarks/SELF_PLAY_2026_10_10.md. --public-evidence copies complete originals byte-for-byte to docs/benchmarks/2026-10-10/<run>/ and adds SHA-256 manifest and package-size check. No AI searches.');return;}
  const audits=[];for(const spec of RUNS){
    if(spec.heldout&&!argv.includes('--include-heldout')){audits.push({spec,status:'pending',reason:'正在独立验证，未读取'});continue;}
    try{audits.push(auditRun(spec));}catch(error){if(!spec.heldout)throw error;audits.push({spec,status:'pending',reason:String(error.message)});}
  }
  const evidence=argv.includes('--public-evidence')?exportPublicEvidence(audits):null;
  for(const audit of audits)attachExistingEvidence(audit);
  const target=path.join(ROOT,'docs','benchmarks','SELF_PLAY_2026_10_10.md'),v2=readV2Correction();let inventory=packageInventory();
  // The report contains the package's own byte count. Refresh until that count
  // includes the newly written report itself, with no archive generation.
  let settled=false;for(let pass=0;pass<4;pass++){
    fs.writeFileSync(target,generateMarkdown(audits,{evidence,inventory,v2}));const next=packageInventory();
    if(next.files===inventory.files&&next.rawBytes===inventory.rawBytes&&next.uncompressedBytes===inventory.uncompressedBytes){inventory=next;settled=true;break;}inventory=next;
  }
  assert.ok(settled,'Package byte count did not settle');
  if(argv.includes('--public-evidence'))assert.ok(inventory.withinLimits,'Evidence-inclusive source package exceeds the requested limits');
  console.log(JSON.stringify({file:target,runs:audits.map(a=>({run:a.spec.id,status:a.status,reason:a.reason??null})),
    evidence:evidence?{originalFiles:evidence.originalFileCount,originalBytes:evidence.originalBytes,exportedFiles:evidence.exportedFiles,exportedBytes:evidence.exportedBytes}:null,package:inventory}));
  return audits;
}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error);process.exitCode=1;}}
module.exports={RUNS,frozenGapBounds,aggregateGapBounds,auditRun,exportPublicEvidence,packageInventory,readV2Correction,generateMarkdown,main};
