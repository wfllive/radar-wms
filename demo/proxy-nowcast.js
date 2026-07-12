#!/usr/bin/env node
// proxy-nowcast.js — локальный CORS-прокси для nowcast.ru
// АВТОМАТИЧЕСКИ получает токен и впрыскивает во все WMS-запросы.
// HTML-странице не нужен JavaScript.

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 8015;
const TARGET = 'www.nowcast.ru';

// ----- авто-токен -----
let currentToken = null;
let tokenRefreshTimer = null;

function fetchToken() {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] 🔑 запрос токена...`);

  const req = https.get(
    `https://${TARGET}/get_token`,
    { headers: { 'Referer': `https://${TARGET}/demo/demo.html` } },
    function (res) {
      let body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        try {
          const data = JSON.parse(body);
          if (data.token) {
            currentToken = data.token;
            const jwt = JSON.parse(Buffer.from(data.token.split('.')[1], 'base64').toString());
            const exp = new Date(jwt.exp * 1000);
            console.log(`[${ts}] ✅ токен получен, истекает: ${exp.toLocaleString('ru-RU')}`);
          } else {
            console.error(`[${ts}] ❌ нет поля token:`, body.slice(0, 100));
          }
        } catch (e) {
          console.error(`[${ts}] ❌ ошибка парсинга:`, e.message);
        }
      });
    }
  );
  req.on('error', function (e) { console.error(`[${ts}] ❌ ${e.message}`); });
  req.setTimeout(10000, function () { req.destroy(); });
}

function startTokenRefresh() {
  fetchToken();
  tokenRefreshTimer = setInterval(fetchToken, 30000);
}

// ----- сервер -----
const server = http.createServer(function (req, res) {
  const parsed = url.parse(req.url, true);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  const pathname = parsed.pathname;

  // /get_token — отдаём кешированный токен
  if (pathname === '/get_token') {
    if (!currentToken) {
      // попытка получить синхронно (на старте)
      res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Токен ещё не получен. Повторите через пару секунд.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ token: currentToken }));
    return;
  }

  // Проксируем WMS
  if (pathname === '/baltrad_wsgi' || pathname === '/baltrad_tools_wsgi' || pathname === '/vector_wsgi') {
    // Впрыскиваем токен в query если есть
    let targetPath = req.url;
    if (currentToken && !parsed.query.token) {
      const sep = targetPath.indexOf('?') >= 0 ? '&' : '?';
      targetPath = targetPath + sep + 'token=' + encodeURIComponent(currentToken);
    }

    const targetUrl = 'https://' + TARGET + targetPath;
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] → ${targetUrl.substring(0, 130)}...`);

    const proxyReq = https.request(
      targetUrl,
      {
        method: req.method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RadarProxy/1.0)',
          'Referer': 'https://www.nowcast.ru/demo/demo.html',
          'Accept': '*/*',
        },
        timeout: 30000,
      },
      function (proxyRes) {
        res.writeHead(proxyRes.statusCode, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=30',
        });
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', function (e) {
      console.error(`[${ts}] ❌`, e.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });

    proxyReq.on('timeout', function () {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Gateway timeout' }));
      }
    });

    req.pipe(proxyReq);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found. /baltrad_wsgi | /get_token | /vector_wsgi');
});

server.listen(PORT, function () {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  📡 NowCast Proxy + АВТО-ТОКЕН');
  console.log('  http://localhost:' + PORT);
  console.log('══════════════════════════════════════════');
  console.log('');
  console.log('  Токен получается автоматически при старте');
  console.log('  и впрыскивается во все WMS-запросы.');
  console.log('  HTML-странице НЕ НУЖЕН JavaScript!');
  console.log('');
  startTokenRefresh();
});
