import { useState, useEffect, useRef, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ===== HTML КАРТЫ (встроен в бандл) =====
const MAP_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Radar</title>
<style>
*{margin:0;padding:0}
body,html{width:100%;height:100%;overflow:hidden;background:#000}
#map{width:100%;height:100%}
#top{position:absolute;top:env(safe-area-inset-top,10px);left:8px;right:8px;z-index:1;display:flex;gap:4px}
#top select,#top button{padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.82);color:#fff;font-size:14px;backdrop-filter:blur(8px)}
#top button{cursor:pointer;font-weight:bold;min-width:44px}
#top button:active{background:rgba(255,255,255,.2)}
#st{font-size:11px;padding:10px 14px;border-radius:10px;background:rgba(0,0,0,.82);color:#888;white-space:nowrap}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.2.1/ol.css">
</head>
<body>
<div id="top">
  <select id="ly"><option value="bufr_phenomena">Явления</option><option value="bufr_dbz1">dBZ 1км</option><option value="bufr_height">ВГО</option><option value="bufr_zdr1">ZDR</option><option value="bufr_vel1">Доплер</option><option value="bufr_precip">Осадки</option><option value="bufr_summ12">Сумма 12ч</option><option value="nowcast">Наукастинг</option><option value="fmi_open_composite_dbz">FMI</option></select>
  <span id="st">ждём токен...</span>
</div>
<div id="map"></div>
<script src="https://cdn.jsdelivr.net/npm/ol@v10.2.1/dist/ol.js"></script>
<script>
var token='', layer=document.getElementById('ly').value;
var W='https://www.nowcast.ru/baltrad_wsgi';
var st=document.getElementById('st');
function S(t,c){st.textContent=t;st.style.color=c||'#888'}

var src=new ol.source.ImageWMS({url:W,params:{LAYERS:layer,FORMAT:'image/png',TRANSPARENT:'true'},ratio:1,
  imageLoadFunction:function(img,s){img.getImage().src=s+(token?'&token='+token:'')}});
var wms=new ol.layer.Image({opacity:.65,source:src});
new ol.Map({layers:[new ol.layer.Tile({source:new ol.source.OSM()}),wms],target:'map',
  view:new ol.View({center:ol.proj.fromLonLat([37.4,55.6]),zoom:6})}).addControl(new ol.control.ZoomSlider());

// Принять токен от React Native (postMessage)
function onMsg(e){
  try{var d=JSON.parse(e.data);if(d.token){
    token=d.token;localStorage.setItem('t',d.token);src.changed();
    S('ok '+(d.exp||''),'#3fb950');
  }}catch(err){}
}
window.addEventListener('message',onMsg);
document.addEventListener('message',onMsg);

document.getElementById('ly').onchange=function(){layer=this.value;src.updateParams({LAYERS:layer})};
</script>
</body></html>`;

// ===== КОМПОНЕНТ =====
export default function App() {
  const webRef = useRef(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // React Native fetch — БЕЗ CORS (нативный сетевой слой)
  const fetchToken = useCallback(async () => {
    try {
      const r = await fetch('https://www.nowcast.ru/get_token');
      const data = await r.json();
      if (data.token) return data.token;
    } catch (e) {
      console.log('token fetch:', e.message);
    }
    return null;
  }, []);

  // Старт: получить токен
  useEffect(() => {
    (async () => {
      let t = await fetchToken();
      if (!t) t = await AsyncStorage.getItem('t');
      if (t) setToken(t);
      setLoading(false);
    })();
    // автообновление каждые 60с
    const iv = setInterval(async () => {
      const t = await fetchToken();
      if (t) { setToken(t); await AsyncStorage.setItem('t', t); }
    }, 60000);
    return () => clearInterval(iv);
  }, []);

  // Впрыск токена в WebView
  useEffect(() => {
    if (!token || !webRef.current) return;
    let exp = '';
    try {
      const jwt = JSON.parse(atob(token.split('.')[1]));
      exp = new Date(jwt.exp * 1000).toLocaleTimeString('ru-RU');
    } catch (e) {}
    webRef.current.postMessage(JSON.stringify({ token, exp }));
  }, [token]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#e94560" />
          <Text style={styles.loadText}>токен...</Text>
        </View>
      )}
      <WebView
        ref={webRef}
        source={{ html: MAP_HTML }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        onMessage={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1 },
  loader: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  loadText: { color: '#888', marginTop: 12, fontSize: 14 },
});
