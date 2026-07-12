#!/usr/bin/env node
// start.js — запускает ПРОКСИ + EXPO вместе

const { spawn } = require('child_process');

console.log('');
console.log('═══════════════════════════════════');
console.log('  📡 NowCast Radar — всё в одном');
console.log('═══════════════════════════════════');
console.log('');

// 1) прокси
const proxy = spawn('node', ['proxy.js'], { stdio: 'inherit', cwd: __dirname });

proxy.on('error', function(e){ console.error('Proxy error:', e.message); });

// 2) expo
setTimeout(function(){
  const expo = spawn('npx', ['expo', 'start'], { stdio: 'inherit', cwd: __dirname, shell: true });

  expo.on('error', function(e){ console.error('Expo error:', e.message); });

  process.on('SIGINT', function(){
    expo.kill(); proxy.kill(); process.exit();
  });
}, 1500);
