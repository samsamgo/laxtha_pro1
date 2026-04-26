import type { DeviceMode } from "../types/fx2";

export type Fx2HardwareMode = Extract<DeviceMode, "bluetooth" | "uart">;

export type Fx2HardwareStatus =
  | "idle"
  | "requesting"
  | "connecting"
  | "connected"
  | "unsupported"
  | "error";

export type Fx2HardwareEvent =
  | { type: "status"; status: Fx2HardwareStatus; detail?: string }
  | { type: "packet"; mode: Fx2HardwareMode; raw: string };

interface BluetoothConnectOptions {
  serviceUuid?: BluetoothServiceUUID;
  characteristicUuid?: BluetoothCharacteristicUUID;
}

interface UartConnectOptions {
  baudRate?: number;
}

const DEFAULT_BLE_SERVICE_UUID = "12345678-1234-1234-1234-123456789abc";
const DEFAULT_BLE_CHARACTERISTIC_UUID = "12345678-1234-1234-1234-123456789abd";
const DEFAULT_UART_BAUD_RATE = 115200;
const DEFAULT_UART_FILTERS: SerialPortFilter[] = [
  {
    usbVendorId: 0x0f1f,
    usbProductId: 0x4e21,
  },
];

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

export const DEFAULT_HARDWARE_OPTIONS = {
  bluetooth: {
    serviceUuid: DEFAULT_BLE_SERVICE_UUID,
    characteristicUuid: DEFAULT_BLE_CHARACTERISTIC_UUID,
  },
  uart: {
    baudRate: DEFAULT_UART_BAUD_RATE,
    filters: DEFAULT_UART_FILTERS,
  },
} as const;

export class Fx2HardwareService {
  private status: Fx2HardwareStatus = "idle";

  private detail = "";

  private listeners = new Set<(event: Fx2HardwareEvent) => void>();

  private bleDevice: BluetoothDevice | null = null;

  private bleCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  private serialPort: SerialPort | null = null;

  private lastSerialPort: SerialPort | null = null;

  private serialReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  private serialAbort = false;

  private bleBuffer = "";

  private serialBuffer = "";

  private isIntentionalDisconnect = false;

  private reconnectTimeoutId: number | null = null;

  private lastBleServiceUuid: BluetoothServiceUUID = DEFAULT_BLE_SERVICE_UUID;

  private lastBleCharacteristicUuid: BluetoothCharacteristicUUID =
    DEFAULT_BLE_CHARACTERISTIC_UUID;

  private lastUartBaudRate = DEFAULT_UART_BAUD_RATE;

  private uartFilters: SerialPortFilter[] = DEFAULT_UART_FILTERS;

  private uartReconnectEnabled = false;

  private uartThrottleId: number | null = null;

  private pendingUartBytes: string[] = [];

  constructor() {
    if (typeof navigator !== "undefined" && navigator.serial) {
      navigator.serial.addEventListener("connect", this.handleSerialConnect);
      navigator.serial.addEventListener("disconnect", this.handleSerialDisconnect);
    }
  }

  subscribe(callback: (event: Fx2HardwareEvent) => void) {
    this.listeners.add(callback);
    callback({ type: "status", status: this.status, detail: this.detail });

    return () => {
      this.listeners.delete(callback);
    };
  }

  getStatus() {
    return this.status;
  }

  async connectBluetooth(options: BluetoothConnectOptions = {}) {
    await this.disconnect();

    if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      this.setStatus("unsupported", "This browser does not support Web Bluetooth.");
      return false;
    }

    try {
      this.setStatus("requesting", "Select a Bluetooth device.");

      const serviceUuid = options.serviceUuid ?? DEFAULT_BLE_SERVICE_UUID;
      const characteristicUuid =
        options.characteristicUuid ?? DEFAULT_BLE_CHARACTERISTIC_UUID;

      this.lastBleServiceUuid = serviceUuid;
      this.lastBleCharacteristicUuid = characteristicUuid;
      this.isIntentionalDisconnect = false;

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [serviceUuid],
      });

      this.bleDevice = device;
      this.setStatus("connecting", `${device.name ?? "Bluetooth device"} connecting`);

      device.addEventListener(
        "gattserverdisconnected",
        this.handleBluetoothDisconnect
      );

      const server = await device.gatt?.connect();

      if (!server) {
        throw new Error("Failed to connect to the GATT server.");
      }

      const service = await server.getPrimaryService(serviceUuid);
      const characteristic = await service.getCharacteristic(characteristicUuid);
      this.bleCharacteristic = characteristic;

      characteristic.addEventListener(
        "characteristicvaluechanged",
        this.handleBluetoothNotification as EventListener
      );

      await characteristic.startNotifications();

      this.setStatus("connected", `${device.name ?? "Bluetooth device"} streaming`);
      return true;
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Bluetooth connection failed.";
      this.setStatus("error", detail);
      return false;
    }
  }

  async connectUart(options: UartConnectOptions = {}) {
    await this.disconnect();

    if (typeof navigator === "undefined" || !("serial" in navigator)) {
      this.setStatus("unsupported", "This browser does not support Web Serial.");
      return false;
    }

    try {
      this.setStatus("requesting", "Select a UART port.");

      const baudRate = options.baudRate ?? DEFAULT_UART_BAUD_RATE;
      this.lastUartBaudRate = baudRate;
      this.uartReconnectEnabled = true;

      const port = await this.resolveUartPort();
      await this.openSerialPort(port, baudRate);

      this.setStatus("connected", `UART ${baudRate}bps streaming`);
      return true;
    } catch (error) {
      this.uartReconnectEnabled = false;
      const detail =
        error instanceof Error ? error.message : "UART connection failed.";
      this.setStatus("error", detail);
      return false;
    }
  }

  async disconnect() {
    this.isIntentionalDisconnect = true;

    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.bleCharacteristic) {
      this.bleCharacteristic.removeEventListener(
        "characteristicvaluechanged",
        this.handleBluetoothNotification as EventListener
      );
      this.bleCharacteristic = null;
    }

    if (this.bleDevice) {
      this.bleDevice.removeEventListener(
        "gattserverdisconnected",
        this.handleBluetoothDisconnect
      );

      if (this.bleDevice.gatt?.connected) {
        this.bleDevice.gatt.disconnect();
      }

      this.bleDevice = null;
    }

    this.serialAbort = true;

    if (this.serialReader) {
      try {
        await this.serialReader.cancel();
      } catch {
        // Reader cancellation can fail if the stream is already closed.
      }
      this.serialReader.releaseLock();
      this.serialReader = null;
    }

    if (this.serialPort) {
      try {
        await this.serialPort.close();
      } catch {
        // Port closing can fail if the device was removed.
      }
      this.lastSerialPort = this.serialPort;
      this.serialPort = null;
    }

    if (this.uartThrottleId !== null) {
      clearTimeout(this.uartThrottleId);
      this.uartThrottleId = null;
    }

    this.pendingUartBytes = [];
    this.bleBuffer = "";
    this.serialBuffer = "";
    this.uartReconnectEnabled = false;
    this.isIntentionalDisconnect = false;
    this.setStatus("idle");
  }

  private scheduleUartFlush() {
    if (this.uartThrottleId !== null) return;
    this.uartThrottleId = window.setTimeout(() => {
      this.uartThrottleId = null;
      const bytes = this.pendingUartBytes.splice(0);
      for (const raw of bytes) {
        this.emit({ type: "packet", mode: "uart", raw });
      }
    }, 16);
  }

  private setStatus(status: Fx2HardwareStatus, detail = "") {
    this.status = status;
    this.detail = detail;
    this.emit({ type: "status", status, detail });
  }

  private emit(event: Fx2HardwareEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  private matchesUartFilter(port: SerialPort) {
    const info = port.getInfo();

    return this.uartFilters.some((filter) => {
      const vendorMatches =
        filter.usbVendorId === undefined || info.usbVendorId === filter.usbVendorId;
      const productMatches =
        filter.usbProductId === undefined ||
        info.usbProductId === filter.usbProductId;

      return vendorMatches && productMatches;
    });
  }

  private async getGrantedTargetPorts() {
    if (!navigator.serial) {
      return [];
    }

    const ports = await navigator.serial.getPorts();
    return ports.filter((port) => this.matchesUartFilter(port));
  }

  private async resolveUartPort() {
    if (this.lastSerialPort) {
      return this.lastSerialPort;
    }

    const grantedPorts = await this.getGrantedTargetPorts();

    if (grantedPorts.length > 0) {
      return grantedPorts[0];
    }

    return navigator.serial!.requestPort({ filters: this.uartFilters });
  }

  private async openSerialPort(port: SerialPort, baudRate: number) {
    this.setStatus("connecting", `UART ${baudRate}bps connecting`);
    await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: "none" });
    this.serialPort = port;
    this.lastSerialPort = port;
    this.serialAbort = false;
    void this.readSerialLoop();
  }

  private flushBuffer(mode: Fx2HardwareMode, chunk: string) {
    const currentBuffer = mode === "bluetooth" ? this.bleBuffer : this.serialBuffer;
    const nextBuffer = `${currentBuffer}${chunk}`;
    const lines = nextBuffer.split(/\r?\n/);
    const remainder = lines.pop() ?? "";

    if (mode === "bluetooth") {
      this.bleBuffer = remainder;
    } else {
      this.serialBuffer = remainder;
    }

    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        this.emit({ type: "packet", mode, raw: line });
      });
  }

  private handleBluetoothDisconnect = () => {
    if (this.isIntentionalDisconnect) {
      this.setStatus("idle", "Bluetooth disconnected.");
      return;
    }

    this.bleDevice?.removeEventListener(
      "gattserverdisconnected",
      this.handleBluetoothDisconnect
    );

    this.scheduleReconnect(1);
  };

  private scheduleReconnect(attempt: number): void {
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      this.setStatus("error", "Reconnect failed. Check the device.");
      return;
    }

    this.setStatus("connecting", `Reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}`);

    this.reconnectTimeoutId = window.setTimeout(() => {
      void this.attemptReconnect(attempt);
    }, RECONNECT_DELAY_MS);
  }

  private async attemptReconnect(attempt: number): Promise<void> {
    this.reconnectTimeoutId = null;

    if (this.isIntentionalDisconnect || !this.bleDevice) {
      return;
    }

    if (this.bleCharacteristic) {
      this.bleCharacteristic.removeEventListener(
        "characteristicvaluechanged",
        this.handleBluetoothNotification as EventListener
      );
      this.bleCharacteristic = null;
    }

    try {
      const server = await this.bleDevice.gatt?.connect();

      if (this.isIntentionalDisconnect) {
        return;
      }

      if (!server) {
        throw new Error("GATT reconnect failed.");
      }

      const service = await server.getPrimaryService(this.lastBleServiceUuid);
      const characteristic = await service.getCharacteristic(
        this.lastBleCharacteristicUuid
      );
      this.bleCharacteristic = characteristic;

      characteristic.addEventListener(
        "characteristicvaluechanged",
        this.handleBluetoothNotification as EventListener
      );

      await characteristic.startNotifications();
      this.bleBuffer = "";

      this.bleDevice.addEventListener(
        "gattserverdisconnected",
        this.handleBluetoothDisconnect
      );

      this.setStatus(
        "connected",
        `${this.bleDevice.name ?? "Bluetooth device"} reconnected`
      );
    } catch {
      this.scheduleReconnect(attempt + 1);
    }
  }

  private handleBluetoothNotification = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null;
    const value = target?.value;

    if (!value) {
      return;
    }

    const chunk = new TextDecoder().decode(value.buffer);
    this.flushBuffer("bluetooth", chunk);
  };

  private handleSerialConnect = () => {
    if (!this.uartReconnectEnabled || this.serialPort || this.isIntentionalDisconnect) {
      return;
    }

    void this.tryReconnectUart();
  };

  private handleSerialDisconnect = () => {
    if (!this.serialPort) {
      return;
    }

    this.serialAbort = true;
    this.serialPort = null;
    this.setStatus("idle", "UART disconnected.");
  };

  private async tryReconnectUart() {
    try {
      const grantedPorts = await this.getGrantedTargetPorts();
      const port = grantedPorts[0];

      if (!port || this.serialPort || this.isIntentionalDisconnect) {
        return;
      }

      await this.openSerialPort(port, this.lastUartBaudRate);
      this.setStatus("connected", `UART ${this.lastUartBaudRate}bps streaming`);
    } catch {
      // Ignore transient failures and wait for the next connect event.
    }
  }

  private async readSerialLoop() {
    if (!this.serialPort?.readable) {
      return;
    }

    this.serialReader = this.serialPort.readable.getReader();

    try {
      while (!this.serialAbort) {
        const result = await this.serialReader.read();

        if (result.done) {
          break;
        }

        for (const byteValue of result.value) {
          this.pendingUartBytes.push(String(byteValue));
        }
        this.scheduleUartFlush();
      }
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "UART read loop stopped.";
      this.setStatus("error", detail);
    } finally {
      if (this.serialReader) {
        this.serialReader.releaseLock();
        this.serialReader = null;
      }

      this.serialPort = null;
    }
  }
}
