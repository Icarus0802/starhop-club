'use strict';
const fs=require('node:fs'),path=require('node:path'),E=require('../js/engine.js');
const runs=['corridor-lateral-350','corridor-holdout-350'],output=path.join(__dirname,'../docs/benchmarks/corridor');
const totals={A:{wins:0,moves:0,sideLandings:0,sideOccupancy:0,ms:0},B:{wins:0,moves:0,sideLandings:0,sideOccupancy:0,ms:0}},games=[];
for(const run of runs){
  const source=path.join(__dirname,'../arena-results',run),summary=JSON.parse(fs.readFileSync(path.join(source,'summary.json')));
  const destination=path.join(output,run);fs.mkdirSync(destination,{recursive:true});
  fs.copyFileSync(path.join(source,'summary.json'),path.join(destination,'summary.json'));
  for(const row of summary.results){
    const file='game-'+row.game+'.json',record=JSON.parse(fs.readFileSync(path.join(source,file))),replay=E.replay(record);
    fs.copyFileSync(path.join(source,file),path.join(destination,file));
    if(row.winner)totals[row.winner].wins++;
    for(let n=row.openingPlies;n<replay.moves.length;n++){
      const previous=replay.states[n],current=replay.states[n+1],actor=previous.players[previous.turn],which=previous.turn===row.sideA?'A':'B',m=replay.moves[n],side=i=>E.zoneOf[i]>=0&&E.zoneOf[i]!==actor&&E.zoneOf[i]!==((actor+3)%6);
      totals[which].moves++;if(!m.pass&&side(m.to))totals[which].sideLandings++;
      totals[which].sideOccupancy+=current.board.filter((p,i)=>p===actor&&side(i)).length;
    }
    for(const which of ['A','B'])totals[which].ms+=row.stats[which].meanMs*row.stats[which].moves;
    games.push({run,game:row.game,winner:row.winner,plies:row.plies,budget:row.budgetMs});
  }
}
for(const t of Object.values(totals)){t.meanMs=t.ms/t.moves;t.meanSideOccupancy=t.sideOccupancy/t.moves;delete t.ms;}
const report={note:'A is corridor evaluation; B is previous rear-support evaluation. Six paired internal games, not a human rating. Timing depends on machine load.',games,totals};
fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
