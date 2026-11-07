(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let logLines = [];
  let unsubscribeMotion = null;

  function log(msg) {
    const t = new Date().toLocaleTimeString();
    logLines.unshift(`[${t}] ${msg}`);
    logLines = logLines.slice(0, 80);
    $("logOutput").textContent = logLines.join("\n");
  }

  // ===== Capability matrix =====
  function renderCapabilities() {
    const caps = window.Sensors.capabilities();
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const hasBattery = !!navigator.getBattery;
    const hasNetwork = !!navigator.connection;
    const hasMemory = !!navigator.deviceMemory;
    const hasBT = !!navigator.bluetooth;
    const hasNFC = window.Sensors.isNfcSupported();
    const hasUSB = !!navigator.usb;
    const hasSerial = !!navigator.serial;

    const rows = [
      ["Motion (accelerometer)", caps.hasMotion ? (caps.needsPermission ? "⚠️ permission" : "✅") : "❌"],
      ["Orientation (gyroscope)", "DeviceOrientationEvent" in window ? "✅" : "❌"],
      ["Touch input", hasTouch ? `✅ (${navigator.maxTouchPoints} pts)` : "❌"],
      ["Battery Status", hasBattery ? "✅" : "❌"],
      ["Network Info", hasNetwork ? "✅" : "❌"],
      ["Device Memory", hasMemory ? "✅" : "❌"],
      ["Bluetooth (BLE)", hasBT ? "✅" : "❌"],
      ["NFC", hasNFC ? "✅" : "❌"],
      ["WebUSB", hasUSB ? "✅" : "❌"],
      ["Web Serial", hasSerial ? "✅" : "❌"],
    ];

    const html = rows.map(([k, v]) => `<p>${k}: <strong>${v}</strong></p>`).join("");
    $("capabilities").innerHTML = html;

    if (!caps.hasMotion) {
      $("startMotion").disabled = true;
      $("motionHint").textContent = "No accelerometer (typical laptop). Open on Realme Narzo to test shaking.";
    } else if (!caps.isSecure) {
      $("startMotion").disabled = true;
      $("motionHint").textContent = "Sensors require HTTPS. Deploy via GitHub Pages.";
    } else {
      $("motionHint").textContent = "Tap Start, then shake the phone.";
    }
  }

  // ===== Motion (reuse existing logic) =====
  async function startMotion() {
    $("startMotion").disabled = true;
    $("stopMotion").disabled = false;
    const ok = await window.Sensors.start();
    if (!ok) {
      $("startMotion").disabled = false;
      $("stopMotion").disabled = true;
      log("Motion start failed.");
      return;
    }
    window.Sensors.reset();
    unsubscribeMotion = window.Sensors.onSample((s) => {
      $("accX").textContent = s.x.toFixed(2);
      $("accY").textContent = s.y.toFixed(2);
      $("accZ").textContent = s.z.toFixed(2);
      const pct = Math.min(100, (s.intensity / 20) * 100);
      $("meterFill").style.width = pct.toFixed(1) + "%";
      $("intensityValue").textContent = s.intensity.toFixed(2);
    });
    $("motionHint").textContent = "Reading… shake the phone.";
    log("Motion started.");
  }

  function stopMotion() {
    window.Sensors.stop();
    if (unsubscribeMotion) { unsubscribeMotion(); unsubscribeMotion = null; }
    $("startMotion").disabled = false;
    $("stopMotion").disabled = true;
    log("Motion stopped.");
  }

  function resetMotion() {
    window.Sensors.reset();
    ["accX","accY","accZ"].forEach(id => $(id).textContent = "—");
    $("intensityValue").textContent = "0.00";
    $("meterFill").style.width = "0%";
    log("Baseline reset.");
  }

  // ===== Orientation =====
  function initOrientation() {
    if (!("DeviceOrientationEvent" in window)) return;
    window.addEventListener("deviceorientation", (e) => {
      $("orientAlpha").textContent = e.alpha?.toFixed(1) ?? "—";
      $("orientBeta").textContent = e.beta?.toFixed(1) ?? "—";
      $("orientGamma").textContent = e.gamma?.toFixed(1) ?? "—";
      $("orientCompass").textContent = e.webkitCompassHeading?.toFixed(0) ?? "—";
    });
  }

  // ===== Battery =====
  async function loadBattery() {
    const info = await window.Sensors.getBatteryInfo();
    if (!info) {
      $("batteryHint").textContent = "Battery API not available (requires Chromium + HTTPS).";
      return;
    }
    $("batLevel").textContent = info.level + "%";
    $("batCharging").textContent = info.charging ? "Yes" : "No";
    $("batChargeTime").textContent = info.chargingTime;
    $("batDischargeTime").textContent = info.dischargingTime;
    $("batteryHint").textContent = "Live data loaded.";
    log("Battery: " + info.level + "%");
  }

  // ===== Network =====
  function loadNetwork() {
    const n = window.Sensors.getNetworkInfo();
    if (!n) return;
    $("netType").textContent = n.effectiveType;
    $("netDownlink").textContent = n.downlink;
    $("netRtt").textContent = n.rtt;
    $("netSaveData").textContent = n.saveData ? "Yes" : "No";
    log("Network: " + n.effectiveType);
  }

  // ===== Memory =====
  function loadMemory() {
    const m = window.Sensors.getDeviceMemory();
    if (m) $("devMemory").textContent = m + " GB";
    log("Memory: " + m);
  }

  // ===== Bluetooth =====
  async function btCheck() {
    const r = await window.Sensors.checkBluetooth();
    $("btStatus").textContent = !r.supported
      ? "❌ Web Bluetooth not supported in this browser."
      : r.available
        ? "✅ Bluetooth adapter available."
        : "⚠️ Adapter not available or blocked by policy.";
  }

  async function btRequest() {
    try {
      const dev = await window.Sensors.requestBluetoothDevice();
      $("btStatus").textContent = `✅ Paired: ${dev.name || dev.id}`;
      log("BT device: " + (dev.name || dev.id));
    } catch (e) {
      $("btStatus").textContent = "❌ " + e.message;
    }
  }

  // ===== NFC =====
  async function nfcScan() {
    if (!window.Sensors.isNfcSupported()) {
      $("nfcStatus").textContent = "❌ NFC not supported (needs Chrome on Android).";
      return;
    }
    $("nfcScan").disabled = true;
    $("nfcStop").disabled = false;
    try {
      await window.Sensors.startNfcScan(
        (data) => {
          $("nfcResult").textContent = `Serial: ${data.serialNumber}\n` +
            data.records.map(r => `${r.type}: ${r.data}`).join("\n");
          log("NFC tag: " + data.serialNumber);
        },
        (err) => { $("nfcStatus").textContent = "⚠️ " + err; }
      );
      $("nfcStatus").textContent = "📡 Scanning… bring tag near phone.";
    } catch (e) {
      $("nfcStatus").textContent = "❌ " + e.message;
      $("nfcScan").disabled = false;
      $("nfcStop").disabled = true;
    }
  }

  function nfcStop() {
    window.Sensors.stopNfcScan();
    $("nfcScan").disabled = false;
    $("nfcStop").disabled = true;
    $("nfcStatus").textContent = "Stopped.";
  }

  // ===== USB =====
  async function usbRequest() {
    try {
      const d = await window.Sensors.requestUsbDevice();
      $("usbStatus").textContent = `✅ ${d.productName || "Device"} (${d.vendorId})`;
      log("USB: " + (d.productName || "unknown"));
    } catch (e) {
      $("usbStatus").textContent = "❌ " + e.message;
    }
  }

  async function usbList() {
    try {
      const ds = await window.Sensors.listUsbDevices();
      $("usbStatus").textContent = ds.length
        ? ds.map(d => `• ${d.productName || d.vendorId}`).join("\n")
        : "No paired USB devices.";
    } catch (e) { $("usbStatus").textContent = "❌ " + e.message; }
  }

  // ===== Serial =====
  async function serialRequest() {
    try {
      const p = await window.Sensors.requestSerialPort();
      $("serialStatus").textContent = `✅ Port selected (${p.getInfo().usbVendorId || "unknown"})`;
      log("Serial port selected.");
    } catch (e) {
      $("serialStatus").textContent = "❌ " + e.message;
    }
  }

  async function serialList() {
    try {
      const ps = await window.Sensors.listSerialPorts();
      $("serialStatus").textContent = ps.length
        ? `Paired ports: ${ps.length}`
        : "No paired serial ports.";
    } catch (e) { $("serialStatus").textContent = "❌ " + e.message; }
  }

  // ===== Init =====
  function init() {
    renderCapabilities();
    initOrientation();
    loadBattery();
    loadNetwork();
    loadMemory();

    $("startMotion").addEventListener("click", startMotion);
    $("stopMotion").addEventListener("click", stopMotion);
    $("resetMotion").addEventListener("click", resetMotion);

    $("btCheck").addEventListener("click", btCheck);
    $("btRequest").addEventListener("click", btRequest);

    $("nfcScan").addEventListener("click", nfcScan);
    $("nfcStop").addEventListener("click", nfcStop);

    $("usbRequest").addEventListener("click", usbRequest);
    $("usbList").addEventListener("click", usbList);

    $("serialRequest").addEventListener("click", serialRequest);
    $("serialList").addEventListener("click", serialList);

    log("Page ready. All panels initialised.");
  }

  init();
})();