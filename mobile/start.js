#!/usr/bin/env node
// start.js — proxy + expo together (dev mode)

var spawn = require('child_process').spawn;
var http = require('http');

console.log('');
console.log('===================================');
console.log('  NowCast Radar — dev mode');
console.log('===================================');
console.log('');

var proxy = spawn('node', ['proxy.js'], { stdio: 'inherit', cwd: __dirname });
proxy.on('error', function(e){ console.error('Proxy error:', e.message); });

function startExpo(){
  var expo = spawn('npx', ['expo', 'start'], { stdio: 'inherit', cwd: __dirname, shell: true });
  expo.on('error', function(e){ console.error('Expo error:', e.message); });
  process.on('SIGINT', function(){ expo.kill(); proxy.kill(); process.exit(); });
}

function waitForProxy(retries){
  http.get('http://localhost:8015/get_token', function(){
    console.log('');
    console.log('  Proxy ready. Starting Expo...');
    console.log('');
    startExpo();
  }).on('error', function(){
    if(retries>0) setTimeout(function(){ waitForProxy(retries-1); }, 500);
    else { console.log('  Proxy not responding, starting Expo anyway...'); startExpo(); }
  });
}

setTimeout(function(){ waitForProxy(10); }, 1500);
