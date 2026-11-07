/**
 * sensors.js
 * Lightweight motion-sensor helper with capability detection.
 * Works on phones (DeviceMotion) and degrades gracefully on laptops.
 *
 * Public API (attached to window.Sensors):
 *   Sensors.capabilities()  -> { hasMotion, needsPermission, isSecure }
 *   Sensors.onSample(fn)    -> subscribe to acceleration samples
 *   Sensors.offSample(fn)   -> unsubscribe
 *   Sensors.start()         -> Promise<boolean>  (may prompt permission)
 *   Sensors.stop()          -> void
 *   Sensors.reset()         -> void
 */
(function (global) {
  "use strict";

  const listeners = new Set();

  let running = false;
  let handler = null;

  // Rolling baseline so we can compute "intensity" relative to rest.
  const baseline = { x: 0, y: 0, z: 0, samples: 0 };
  const BASELINE_WARMUP = 10; // ignore first N samples when calibrating

  function capabilities() {
    const hasMotion = typeof global.DeviceMotionEvent !== "undefined";
    const needsPermission =
      hasMotion &&
      typeof global.DeviceMotionEvent.requestPermission === "function";
    const isSecure =
      typeof global.isSecureContext !== "undefined"
        ? global.isSecureContext
        : global.location.protocol === "https:";
    return { hasMotion, needsPermission, isSecure };
  }

  function emit(sample) {
    listeners.forEach((fn) => {
      try {
        fn(sample);
      } catch (e) {
        console.error("Sensor listener error:", e);
      }
    });
  }

  function handleMotion(event) {
    const raw = event.accelerationIncludingGravity;
    if (!raw || raw.x == null) return;

    const x = raw.x;
    const y = raw.y;
    const z = raw.z;

    // Calibrate baseline for the first few frames (device likely at rest).
    if (baseline.samples < BASELINE_WARMUP) {
      baseline.x = (baseline.x * baseline.samples + x) / (baseline.samples + 1);
      baseline.y = (baseline.y * baseline.samples + y) / (baseline.samples + 1);
      baseline.z = (baseline.z * baseline.samples + z) / (baseline.samples + 1);
      baseline.samples++;
    }

    // Intensity = magnitude of deviation from the resting baseline.
    const dx = x - baseline.x;
    const dy = y - baseline.y;
    const dz = z - baseline.z;
    const intensity = Math.sqrt(dx * dx + dy * dy + dz * dz);

    emit({
      x,
      y,
      z,
      intensity,
      baseline: { ...baseline },
      timestamp: event.timeStamp || performance.now(),
    });
  }

  async function start() {
    if (running) return true;

    const caps = capabilities();
    if (!caps.hasMotion) {
      console.warn("DeviceMotion not supported on this device.");
      return false;
    }
    if (!caps.isSecure) {
      console.warn("DeviceMotion requires HTTPS (or localhost).");
      return false;
    }

    // iOS 13+ requires a user-gesture-triggered permission prompt.
    if (caps.needsPermission) {
      try {
        const permission = await global.DeviceMotionEvent.requestPermission();
        if (permission !== "granted") {
          console.warn("Motion permission denied.");
          return false;
        }
      } catch (err) {
        console.error("Motion permission request failed:", err);
        return false;
      }
    }

    handler = handleMotion;
    global.addEventListener("devicemotion", handler, { passive: true });
    running = true;
    return true;
  }

  function stop() {
    if (!running) return;
    if (handler) {
      global.removeEventListener("devicemotion", handler);
      handler = null;
    }
    running = false;
  }

  function reset() {
    baseline.x = baseline.y = baseline.z = 0;
    baseline.samples = 0;
  }

  function onSample(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function offSample(fn) {
    listeners.delete(fn);
  }

  global.Sensors = {
    capabilities,
    start,
    stop,
    reset,
    onSample,
    offSample,
  };
})(window);
/* ===== Battery ===== */
async function getBatteryInfo() {
  if (!navigator.getBattery) return null;
  try {
    const bm = await navigator.getBattery();
    return {
      level: (bm.level * 100).toFixed(1),
      charging: bm.charging,
      chargingTime: bm.chargingTime === Infinity ? "∞" : bm.chargingTime,
      dischargingTime: bm.dischargingTime === Infinity ? "∞" : bm.dischargingTime,
    };
  } catch { return null; }
}

/* ===== Network ===== */
function getNetworkInfo() {
  const c = navigator.connection;
  if (!c) return null;
  return {
    effectiveType: c.effectiveType || "unknown",
    downlink: c.downlink ?? "—",
    rtt: c.rtt ?? "—",
    saveData: c.saveData ?? false,
  };
}

/* ===== Memory ===== */
function getDeviceMemory() {
  return navigator.deviceMemory ?? null;
}

/* ===== Bluetooth ===== */
async function checkBluetooth() {
  if (!navigator.bluetooth) return { supported: false, available: false };
  try {
    const available = await navigator.bluetooth.getAvailability();
    return { supported: true, available };
  } catch { return { supported: true, available: false }; }
}

async function requestBluetoothDevice() {
  if (!navigator.bluetooth) throw new Error("Bluetooth not supported");
  return navigator.bluetooth.requestDevice({ acceptAllDevices: true });
}

/* ===== NFC ===== */
function isNfcSupported() {
  return "NDEFReader" in window;
}

let nfcAbort = null;

async function startNfcScan(onReading, onError) {
  if (!isNfcSupported()) throw new Error("NFC not supported");
  const ndef = new window.NDEFReader();
  await ndef.scan();
  nfcAbort = ndef;
  ndef.onreading = (event) => {
    const records = [];
    for (const r of event.message.records) {
      records.push({
        type: r.recordType,
        data: r.data ? new TextDecoder().decode(r.data) : "(binary)",
      });
    }
    onReading({ serialNumber: event.serialNumber, records });
  };
  ndef.onreadingerror = () => onError?.("Cannot read NFC tag");
}

function stopNfcScan() {
  if (nfcAbort) { nfcAbort.onreading = null; nfcAbort = null; }
}

/* ===== USB ===== */
async function requestUsbDevice() {
  if (!navigator.usb) throw new Error("WebUSB not supported");
  return navigator.usb.requestDevice({ filters: [] });
}

async function listUsbDevices() {
  if (!navigator.usb) throw new Error("WebUSB not supported");
  return navigator.usb.getDevices();
}

/* ===== Serial ===== */
async function requestSerialPort() {
  if (!navigator.serial) throw new Error("Web Serial not supported");
  return navigator.serial.requestPort();
}

async function listSerialPorts() {
  if (!navigator.serial) throw new Error("Web Serial not supported");
  return navigator.serial.getPorts();
}

// Export additions
Object.assign(global.Sensors, {
  getBatteryInfo, getNetworkInfo, getDeviceMemory,
  checkBluetooth, requestBluetoothDevice,
  isNfcSupported, startNfcScan, stopNfcScan,
  requestUsbDevice, listUsbDevices,
  requestSerialPort, listSerialPorts,
});