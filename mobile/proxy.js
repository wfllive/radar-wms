#!/usr/bin/env node
// proxy.js — CORS-прокси (dev-сервер)
// Релиз APK работает БЕЗ прокси — прямой fetch в WebView.

var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var PORT = 8015;
var TARGET = 'www.nowcast.ru';

var currentToken = null;
var tokenRetries = 0;
var MAX_RETRIES = 100;

function fetchToken() {
  var ts = new Date().toISOString().slice(11,19);
  process.stdout.write('['+ts+'] token... ');

  var chunks = [];
  https.get('https://'+TARGET+'/get_token', {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Referer': 'https://'+TARGET+'/demo/demo.html',
      'User-Agent': 'RadarProxy/1.0'
    }
  }, function(res) {
    var stream = res;
    var encoding = (res.headers['content-encoding'] || '').toLowerCase();
    if (encoding === 'gzip' || encoding === 'deflate') {
      stream = res.pipe(zlib.createUnzip());
    }

    var body = '';
    stream.on('data', function(c) { body += c; });
    stream.on('end', function() {
      tokenRetries++;
      if (res.statusCode !== 200) {
        process.stdout.write('HTTP '+res.statusCode+'\n');
        var preview = body.replace(/[\x00-\x1f\x7f-\x9f]/g,'').substring(0,80);
        console.log('       response: '+preview);
        return;
      }
      try {
        var d = JSON.parse(body);
        if (d.token) {
          currentToken = d.token;
          tokenRetries = 0;
          try {
            var b = Buffer.from(d.token.split('.')[1], 'base64').toString();
            var jwt = JSON.parse(b);
            console.log('ok, expires '+new Date(jwt.exp*1000).toLocaleString('ru-RU'));
          } catch(e) { console.log('ok'); }
        } else {
          console.log('no token field');
        }
      } catch(e) {
        console.log('not JSON ('+(res.statusCode)+')');
        var p = body.replace(/[\x00-\x1f\x7f-\x9f]/g,'').substring(0,120);
        console.log('       body: '+p);
      }
    });
  }).on('error', function(e) {
    console.log('connection error: '+e.message);
  }).setTimeout(15000, function() { this.destroy(); });
}

// ========== HTTP СЕРВЕР ==========
http.createServer(function(req, res) {
  var p = url.parse(req.url, true);

  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    return res.end();
  }

  var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*'
  };

  // /get_token
  if (p.pathname === '/get_token') {
    var r = Object.assign({}, CORS, { 'Content-Type': 'application/json' });
    if (!currentToken) {
      res.writeHead(503, r);
      return res.end(JSON.stringify({ error: 'token not ready yet, retry in 5s' }));
    }
    res.writeHead(200, r);
    return res.end(JSON.stringify({ token: currentToken }));
  }

  // WMS прокси
  if (p.pathname === '/baltrad_wsgi' || p.pathname === '/baltrad_tools_wsgi' || p.pathname === '/vector_wsgi') {
    var tp = req.url;
    if (currentToken && !p.query.token) {
      tp += (tp.indexOf('?') >= 0 ? '&' : '?') + 'token=' + currentToken;
    }

    var ts = new Date().toISOString().slice(11,19);
    process.stdout.write('['+ts+'] -> '+tp.substring(0,100)+'... ');

    https.request('https://'+TARGET+tp, {
      method: req.method,
      headers: {
        'User-Agent': 'RadarProxy/1.0',
        'Referer': 'https://'+TARGET+'/demo/demo.html',
        'Accept': '*/*'
      },
      timeout: 30000
    }, function(prx) {
      console.log(prx.statusCode);
      res.writeHead(prx.statusCode, Object.assign({}, CORS, {
        'Content-Type': prx.headers['content-type'] || 'image/png',
        'Cache-Control': 'public, max-age=60'
      }));
      prx.pipe(res);
    }).on('error', function(e) {
      console.log('err: '+e.message);
      if (!res.headersSent) {
        res.writeHead(502, Object.assign({}, CORS, { 'Content-Type': 'application/json' }));
        res.end(JSON.stringify({ error: e.message }));
      }
    }).on('timeout', function() { this.destroy(); }).end();
    return;
  }

  // Статика
  var fp = p.pathname === '/' ? '/index.html' : p.pathname;
  var full = path.join(__dirname, 'assets', fp);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    var ext = path.extname(full).slice(1);
    var mime = { html:'text/html', js:'application/javascript', css:'text/css', png:'image/png', jpg:'image/jpeg', json:'application/json' };
    res.writeHead(200, Object.assign({}, CORS, { 'Content-Type': mime[ext] || 'text/plain' }));
    return fs.createReadStream(full).pipe(res);
  }

  // Landing
  var tokColor = currentToken ? 'ok' : 'err';
  var tokText = currentToken ? 'received' : 'waiting...';
  res.writeHead(200, Object.assign({}, CORS, { 'Content-Type': 'text/html; charset=utf-8' }));
  res.end(
    '<!DOCTYPE html><html lang=en><head><meta charset=UTF-8><meta name=viewport content="width=device-width,initial-scale=1">'+
    '<title>Radar Proxy</title><style>body{background:#111;color:#eee;font-family:monospace;padding:30px}'+
    'a{color:#58a6ff}h2{color:#e94560}li{margin:4px 0}.ok{color:#3fb950}.err{color:#f85149}</style></head><body>'+
    '<h1>Radar Proxy</h1><p>Port '+PORT+' | token: <b class='+tokColor+'>'+tokText+'</b></p>'+
    '<h2>Links</h2><ul>'+
    '<li><a href=/get_token>/get_token</a></li>'+
    '<li><a href=/baltrad_wsgi?SERVICE=WMS&REQUEST=GetCapabilities>/baltrad_wsgi (GetCapabilities)</a></li>'+
    '<li><a href=/baltrad_wsgi?SERVICE=WMS&REQUEST=GetMap&LAYERS=bufr_phenomena&FORMAT=image/png&SRS=EPSG:4326&BBOX=30,50,45,60&WIDTH=600&HEIGHT=400>/baltrad_wsgi (GetMap test)</a></li>'+
    '</ul></body></html>'
  );

}).listen(PORT, function() {
  console.log('');
  console.log('=======================================');
  console.log('  NowCast Proxy   :'+PORT);
  console.log('  http://localhost:'+PORT);
  console.log('=======================================');
  console.log('');
  fetchToken();
  setInterval(fetchToken, 30000);
});
