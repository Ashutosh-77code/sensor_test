# Sensor Test — Shake Intensity

A tiny, dependency-free project to test **motion sensors (accelerometer)**
in the browser. Designed to work on phones and **degrade gracefully** on
laptops without sensor hardware.

## What works where

| Feature | Realme Narzo (phone) | Your laptop (DESKTOP-AAO20DC) |
| :--- | :--- | :--- |
| Motion / shake intensity | ✅ (may prompt for permission) | ❌ no accelerometer hardware |
| Touch events | ✅ | ❌ display reports "No pen or touch" |
| Pointer events (mouse/touch) | ✅ | ✅ mouse only |
| Graceful fallback message | — | ✅ shows "no accelerometer" |

## Run it

Because `DeviceMotionEvent` requires a secure context, use one of:

- **GitHub Pages** (HTTPS) — recommended. Push and enable Pages in repo settings.
- **Local HTTPS server** — e.g. `npx serve --ssl` or any HTTPS dev server.
- `http://localhost` also counts as secure in most browsers, but **not** `http://192.168.x.x`. So to test on your phone over LAN you need HTTPS or an ngrok/tunnel.

## Structure
