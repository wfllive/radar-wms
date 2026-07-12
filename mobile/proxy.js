#!/usr/bin/env node
// proxy.js — встроенный CORS-прокси (запускается вместе с Expo)

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 8015;
const TARGET = 'www.nowcast.ru';

let currentToken = null;

function fetchToken() {
  const ts = new Date().toISOString().slice(11,19);
  process.stdout.write(`[${ts}] token... `);

  https.get('https://'+TARGET+'/get_token',
    {headers:{'Referer':'https://'+TARGET+'/demo/demo.html'}},
    function(res){
      var body='';
      res.on('data',function(c){body+=c});
      res.on('end',function(){
        try{
          var d=JSON.parse(body);
          if(d.token){
            currentToken=d.token;
            var jwt=JSON.parse(Buffer.from(d.token.split('.')[1],'base64').toString());
            console.log('ok, expires '+new Date(jwt.exp*1000).toLocaleString('ru-RU'));
          } else console.log('no token field');
        } catch(e){console.log('parse error:',e.message)}
      });
    }
  ).on('error',function(e){console.log('error:',e.message)}).setTimeout(10000,function(){this.destroy()});
}

http.createServer(function(req,res){
  var p=url.parse(req.url,true);

  if(req.method==='OPTIONS'){
    res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'*'});
    return res.end();
  }

  if(p.pathname==='/get_token'){
    if(!currentToken){
      res.writeHead(503,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
      return res.end(JSON.stringify({error:'token not ready'}));
    }
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    return res.end(JSON.stringify({token:currentToken}));
  }

  if(p.pathname==='/baltrad_wsgi'||p.pathname==='/baltrad_tools_wsgi'||p.pathname==='/vector_wsgi'){
    var tp=req.url;
    if(currentToken&&!p.query.token) tp+=(tp.indexOf('?')>=0?'&':'?')+'token='+currentToken;

    var ts=new Date().toISOString().slice(11,19);
    process.stdout.write('['+ts+'] -> '+tp.substring(0,100)+'... ');

    https.request('https://'+TARGET+tp,{
      method:req.method,
      headers:{'User-Agent':'RadarProxy/1.0','Referer':'https://'+TARGET+'/demo/demo.html','Accept':'*/*'},
      timeout:30000
    },function(prx){
      console.log(prx.statusCode);
      res.writeHead(prx.statusCode,{
        'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'*',
        'Content-Type':prx.headers['content-type']||'image/png','Cache-Control':'public, max-age=30'
      });
      prx.pipe(res);
    }).on('error',function(e){console.log('err:',e.message);if(!res.headersSent){res.writeHead(502,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify({error:e.message}));}}).on('timeout',function(){this.destroy()}).end();
    return;
  }

  res.writeHead(404);res.end('404');
}).listen(PORT,function(){
  console.log('');
  console.log('  ====== PROXY :'+PORT+' ======');
  console.log('');
  fetchToken();
  setInterval(fetchToken,30000);
});
