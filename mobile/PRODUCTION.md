# Релиз (Production) — как это работает

## 3 способа запуска

| Способ | Команда | Прокси | Токен |
|--------|---------|--------|-------|
| **Dev** | `npm start` | ✅ proxy.js на :8015 | авто через прокси |
| **Dev web** | `npm run web` | ✅ proxy.js отдельно | авто через прокси |
| **Релиз APK** | `eas build` | ❌ нет | авто через WebView |

---

## Релиз (APK / IPA) — прокси НЕ нужен

В собранном `.apk`/`.ipa` файле:

```
Приложение (APK)
  └─ WebView
       └─ map.html (из бандла)
            ├─ fetch(nowcast.ru/get_token)  ← ПРЯМО, без прокси
            └─ <img src=nowcast.ru/baltrad_wsgi?...>  ← ПРЯМО
```

**Почему работает без прокси:**
- `<img>` теги грузят картинки БЕЗ CORS — всегда
- `fetch()` в WebView на мобильном устройстве — CORS либо отсутствует, либо мы передаём `allowUniversalAccessFromFileURLs`
- WebView — это не браузер, политики CORS там мягче
- Если fetch всё же заблокирован → fallback на ручной токен (сохраняется в localStorage)

**Цепочка получения токена в релизе:**
```
1. fetch(https://www.nowcast.ru/get_token) → ✅ работает в WebView
2. localStorage резерв
```

---

## Сборка релиза

```bash
cd radar-wms/mobile
npm install
npx eas build --platform android   # APK
npx eas build --platform ios       # IPA (нужен Mac)
```

Или для предпросмотра:
```bash
npx expo run:android   # локальная сборка на эмуляторе
npx expo run:ios       # локальная сборка на симуляторе
```

---

## Dev-режим (с прокси)

```bash
cd radar-wms/mobile
npm start                # proxy + expo вместе
```

Или отдельно:
```bash
npm run proxy            # только прокси :8015
npm run web              # только expo web
```

Прокси открывает http://localhost:8015 — там index-страница со ссылками.

---

## Структура

```
mobile/
├── App.js          ← WebView с map.html
├── assets/map.html ← карта (OSM + WMS + авто-токен)
├── proxy.js        ← dev-прокси (CORS + токен + раздача статики)
├── start.js        ← запуск proxy + expo вместе
├── app.json        ← конфиг Expo
└── package.json
```
