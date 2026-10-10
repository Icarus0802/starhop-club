'use strict';
const fs=require('node:fs'),E=require('../js/engine.js');
const notation=`N8 M8,D5 E6,P7 L7,B6 F6,O6 K8,C8 G6,K8 J8,D6 F7,Q7 I9,A7 G8,N7 L6,B7 H6,P6 L8,C7 I6,O8 K6,F7 J9,O7 K7,H6 J5,L7 H5,I6 K5,N5 M6,D8 H6,N6 J6,E6 I6,M8 I8,H6 J7,L8 K8,D7 E7,K8 I7,C6 D6,J8 F8,D6 H4,I9 H8,G8 K10,I8 E6,G6 I5,E6 D6,J7 K8,L6 H6,J5 N5,M6 L6,E7 G6,L6 J7,K10 L9,K7 E8,H4 L6,I7 H7,G6 I7,H6 G6,F6 F5,J7 H6,I6 M6,H8 G8,F5 G5,J6 I6,I7 J7,G8 C6,G5 M10,K6 K7,J7 J6,I6 G7,J6 J4,K7 K6,L6 L4,K6 J5,I5 O6,J5 I6,J4 N6,H6 D8,M6 M5,I6 I7,O6 P6,I7 C8,K5 O7,C8 B7,L9 M9,H5 F6,J9 J8,G6 A7,J8 L7,F6 E6,K8 Q7,H7 B6,M5 O8,G7 G8,M10 M8,G8 C8,L7 P7,F8 D7,M8 N7,E6 D5,M9 N8,E8 C7`.split(',').map(x=>x.split(' '));
const at=new Map(E.cells.map((_,i)=>[E.coord(i),i]));
const record={format:'starhop-v1',options:{players:2,jump:'short',goalLock:false,mode:'human-ai',humanSeat:0,level:4,secondLevel:4},moves:notation.map(([from,to])=>({from:at.get(from),to:at.get(to)})),result:{winner:3,draw:null},metadata:{source:'Current local game DOM, 2026-10-10; second human loss report',budgetMs:350,algorithm:'auto'}};
const replay=E.replay(record);if(replay.state.winner!==3||replay.state.ply!==93)throw Error('Unexpected result');
fs.writeFileSync('tests/fixtures/user-loss-93.json',JSON.stringify(record,null,2));
console.log('Validated 93 plies, human winner, AI arrived '+E.progress(replay.state.board,0));
