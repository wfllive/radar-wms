#!/usr/bin/env node
// start.js — proxy + expo in one command
// npm start       → proxy + expo (QR)
// npm run web     → proxy + expo --web
// npm run android → proxy + expo --android
// npm run ios     → proxy + expo --ios
// For release APK: proxy NOT needed, WebView allows cross-origin fetch.

var spawn = require('child_process').spawn;
var http = require('http');

var mode = process.argv[2] || '';

console.log('');
console.log('===================================');
console.log('  NowCast Radar');
console.log('  proxy :8015 + expo'+(mode?' --'+mode:''));
console.log('===================================');
console.log('');

var proxy = spawn('node', ['proxy.js'], { stdio: 'inherit', cwd: __dirname });
proxy.on('error', function(e){ console.error('Proxy error:', e.message); });

function startExpo(){
  var args = mode ? ['expo', 'start', '--'+mode] : ['expo', 'start'];
  var expo = spawn('npx', args, { stdio: 'inherit', cwd: __dirname, shell: true });
  expo.on('error', function(e){ console.error('Expo error:', e.message); });
  process.on('SIGINT', function(){ expo.kill(); proxy.kill(); process.exit(); });
}

function wait(retries){
  http.get('http://localhost:8015/get_token', function(){
    console.log('');
    console.log('  Proxy ready. Expo...');
    console.log('');
    startExpo();
  }).on('error', function(){
    if(retries>0) setTimeout(function(){ wait(retries-1); }, 500);
    else { console.log('  Proxy timeout, Expo anyway...'); startExpo(); }
  });
}

setTimeout(function(){ wait(10); }, 1500);
