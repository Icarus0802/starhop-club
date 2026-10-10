'use strict';
const fs=require('node:fs'),E=require('../js/engine.js');
const notation=`N8 M8,D6 E6,P7 L7,B7 F5,O6 K8,C6 G6,K8 J8,G6 H5,Q7 I9,E6 I6,I9 H8,A7 I7,O8 G8,D7 E8,N7 L6,C8 I5,L6 K7,B6 J6,P6 H6,I7 O8,N5 J7,C7 C6,J7 I7,D8 F7,N6 M7,C6 G6,G8 E9,I5 J5,M7 E7,J5 P6,O7 N7,H5 H7,N7 J7,E8 G7,K7 G9,G7 K7,M8 M7,K7 M6,M7 G8,D5 E6,L7 K7,E6 I8,E7 D6,J6 K6,G8 C6,H7 L7,I7 E7,M6 N6,J8 B6,G6 Q7,K7 J6,K6 O6,J6 D5,I8 M8,J7 I7,F5 G6,H6 F5,F7 F6,I7 H7,F6 J6,H7 F8,J6 K6,D6 C7,G6 H6,H8 B7,H6 N7,G9 E8,L7 P7,F8 D7,I6 J6,E7 A7,J6 K7,E8 D8,K6 J6,E9 C8,M8 N8,F5 E6,J6 L7,E6 D6`.split(',').map(x=>x.split(' '));
const at=new Map(E.cells.map((_,i)=>[E.coord(i),i]));
const record={format:'starhop-v1',options:{players:2,jump:'short',goalLock:false,mode:'human-ai',humanSeat:0,level:4,secondLevel:4},moves:notation.map(([from,to])=>({from:at.get(from),to:at.get(to)})),result:{winner:3,draw:null},metadata:{source:'Current local game DOM, 2026-10-10; human reports a three-move win over corridor version',budgetMs:350,algorithm:'auto'}};
const replay=E.replay(record);if(replay.state.winner!==3||replay.state.ply!==79)throw Error('Unexpected result');
fs.writeFileSync('tests/fixtures/user-loss-79.json',JSON.stringify(record,null,2));
console.log('Validated 79 plies, human winner, AI arrived '+E.progress(replay.state.board,0));
