#!/usr/bin/env node
// proxy.js — CORS-прокси + раздача HTML (dev-сервер, всё в одном)
// Релиз (APK/IPA) работает БЕЗ прокси — токен через прямой fetch в WebView.

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = 8015;
const TARGET = 'www.nowcast.ru';

let currentToken = null;

function fetchToken() {
  const ts = new Date().toISOString().slice(11,19);
  process.stdout.write(`[${ts}] token... `);
  https.get('https://'+TARGET+'/get_token',
    {headers:{'Referer':'https://'+TARGET+'/demo/demo.html'}},
    function(res){
      var body=''; res.on('data',function(c){body+=c}); res.on('end',function(){
        try{
          var d=JSON.parse(body);
          if(d.token){
            currentToken=d.token;
            var jwt=JSON.parse(Buffer.from(d.token.split('.')[1],'base64').toString());
            console.log('ok, expires '+new Date(jwt.exp*1000).toLocaleString('ru-RU'));
          } else console.log('no token');
        } catch(e){console.log('parse err:',e.message)}
      });
    }
  ).on('error',function(e){console.log('err:',e.message)}).setTimeout(10000,function(){this.destroy()});
}

http.createServer(function(req,res){
  var p=url.parse(req.url,true);

  // CORS
  if(req.method==='OPTIONS'){
    res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'*'});
    return res.end();
  }

  var hdrs={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'*'};

  // /get_token
  if(p.pathname==='/get_token'){
    if(!currentToken) return res.writeHead(503,Object.assign({},hdrs,{'Content-Type':'application/json'}))&&res.end(JSON.stringify({error:'not ready'}));
    return res.writeHead(200,Object.assign({},hdrs,{'Content-Type':'application/json'}))&&res.end(JSON.stringify({token:currentToken}));
  }

  // WMS
  if(p.pathname==='/baltrad_wsgi'||p.pathname==='/baltrad_tools_wsgi'||p.pathname==='/vector_wsgi'){
    var tp=req.url;
    if(currentToken&&!p.query.token) tp+=(tp.indexOf('?')>=0?'&':'?')+'token='+currentToken;

    var ts=new Date().toISOString().slice(11,19);
    process.stdout.write('['+ts+'] -> '+tp.substring(0,90)+'... ');

    https.request('https://'+TARGET+tp,{
      method:req.method,
      headers:{'User-Agent':'RadarProxy/1.0','Referer':'https://'+TARGET+'/demo/demo.html','Accept':'*/*'},
      timeout:30000
    },function(prx){
      console.log(prx.statusCode);
      res.writeHead(prx.statusCode,Object.assign({},hdrs,{
        'Content-Type':prx.headers['content-type']||'image/png','Cache-Control':'public, max-age=30'
      }));
      prx.pipe(res);
    }).on('error',function(e){console.log('err:',e.message);if(!res.headersSent){res.writeHead(502,Object.assign({},hdrs,{'Content-Type':'application/json'}));res.end(JSON.stringify({error:e.message}));}}).on('timeout',function(){this.destroy()}).end();
    return;
  }

  // HTML (раздача статики)
  var filePath=p.pathname==='/'?'/index.html':p.pathname;
  var fullPath=path.join(__dirname,'assets',filePath);
  if(fs.existsSync(fullPath)&&fs.statSync(fullPath).isFile()){
    var ext=path.extname(fullPath);
    var mime={'html':'text/html','js':'application/javascript','css':'text/css','png':'image/png','jpg':'image/jpeg','json':'application/json'};
    res.writeHead(200,Object.assign({},hdrs,{'Content-Type':mime[ext.slice(1)]||'text/plain'}));
    return fs.createReadStream(fullPath).pipe(res);
  }

  res.writeHead(200,Object.assign({},hdrs,{'Content-Type':'text/html'}));
  res.end(
    '<!DOCTYPE html><html lang=ru><head><meta charset=UTF-8><meta name=viewport content="width=device-width,initial-scale=1">'+
    '<title>Radar Proxy</title><style>body{background:#111;color:#eee;font-family:monospace;padding:30px}'+
    'a{color:#58a6ff}h2{color:#e94560}li{margin:4px 0}</style></head><body>'+
    '<h1>📡 NowCast Radar Proxy</h1><p>Порт '+PORT+' | токен: '+(currentToken?'✅':'⏳')+'</p>'+
    '<h2>Ссылки</h2><ul>'+
    '<li><a href=/get_token>/get_token</a> — токен (JSON)</li>'+
    '<li><a href=/baltrad_wsgi?SERVICE=WMS&REQUEST=GetCapabilities>/baltrad_wsgi (GetCapabilities)</a></li>'+
    '<li><a href=/baltrad_wsgi?SERVICE=WMS&REQUEST=GetMap&LAYERS=bufr_phenomena&FORMAT=image/png&SRS=EPSG:4326&BBOX=30,50,45,60&WIDTH=600&HEIGHT=400>/baltrad_wsgi (GetMap test)</a></li>'+
    '</ul></body></html>'
  );

}).listen(PORT,function(){
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  📡 NowCast Proxy   :'+PORT);
  console.log('  http://localhost:'+PORT);
  console.log('═══════════════════════════════════════');
  console.log('');
  fetchToken();
  setInterval(fetchToken,30000);
});
