# DEV ⇄ RELEASE

## Одна команда (всегда)

```bash
npm start        # proxy :8015 + expo (QR код)
npm run web      # proxy :8015 + expo --web
npm run android  # proxy :8015 + expo --android
npm run ios      # proxy :8015 + expo --ios
```

**Прокси и Expo запускаются вместе.** Не нужно два терминала.

---

## Dev (компьютер)

```
Браузер / Expo Web
  │
  ├─ fetch(localhost:8015/get_token) → токен (прокси обходит CORS)
  ├─ <img src=nowcast.ru/...>        → радар (CORS не нужен)
  │
  └─ Прокси :8015 делает запросы с Referer: nowcast.ru
```

Нужен **только для dev** — в браузере CORS блокирует `fetch(get_token)`.

---

## Release (APK на телефоне)

```
Приложение (APK)
  └─ WebView
       ├─ fetch(nowcast.ru/get_token) → ✅ работает (WebView ≠ браузер)
       └─ <img src=nowcast.ru/...>    → ✅ всегда
```

**Прокси НЕ НУЖЕН.** WebView на телефоне не блокирует кросс-доменные запросы.

Если авто-токен не сработал → экран ввода токена. Вставил один раз — сохранился навсегда.

---

## Сборка APK

```bash
cd radar-wms/mobile
npm install
npx expo run:android          # локальная сборка
npx eas build --platform android  # APK для установки
```

---

## Как работает map.html (без сервера)

```
1. Пытается fetch(nowcast.ru/get_token)   ← авто
2. Если не вышло → localStorage           ← сохранённый
3. Если нет → экран ввода токена          ← ручной
```

WMS-картинки всегда через `<img>` — без fetch, без CORS, без прокси.

Прокси (`proxy.js`) — опция, только для удобства в dev-браузере.
