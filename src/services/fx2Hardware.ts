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

const DEFAULT_BLE_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
const DEFAULT_BLE_CHARACTERISTIC_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";
const DEFAULT_UART_BAUD_RATE = 115200;

export const DEFAULT_HARDWARE_OPTIONS = {
  bluetooth: {
    serviceUuid: DEFAULT_BLE_SERVICE_UUID,
    characteristicUuid: DEFAULT_BLE_CHARACTERISTIC_UUID,
  },
  uart: {
    baudRate: DEFAULT_UART_BAUD_RATE,
  },
} as const;

export class Fx2HardwareService {
  private status: Fx2HardwareStatus = "idle";

  private detail = "";

  private listeners = new Set<(event: Fx2HardwareEvent) => void>();

  private bleDevice: BluetoothDevice | null = null;

  private bleCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  private serialPort: SerialPort | null = null;

  private serialReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  private serialAbort = false;

  private bleBuffer = "";

  private serialBuffer = "";

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
      this.setStatus("unsupported", "이 브라우저는 Web Bluetooth를 지원하지 않습니다.");
      return false;
    }

    try {
      this.setStatus("requesting", "Bluetooth 장치를 선택해 주세요.");

      const serviceUuid = options.serviceUuid ?? DEFAULT_BLE_SERVICE_UUID;
      const characteristicUuid =
        options.characteristicUuid ?? DEFAULT_BLE_CHARACTERISTIC_UUID;

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [serviceUuid],
      });

      this.bleDevice = device;
      this.setStatus(
        "connecting",
        `${device.name ?? "이름 없는 장치"} 연결 중`
      );

      device.addEventListener(
        "gattserverdisconnected",
        this.handleBluetoothDisconnect
      );

      const server = await device.gatt?.connect();

      if (!server) {
        throw new Error("GATT 서버 연결에 실패했습니다.");
      }

      const service = await server.getPrimaryService(serviceUuid);
      const characteristic = await service.getCharacteristic(characteristicUuid);
      this.bleCharacteristic = characteristic;

      characteristic.addEventListener(
        "characteristicvaluechanged",
        this.handleBluetoothNotification as EventListener
      );

      await characteristic.startNotifications();

      this.setStatus(
        "connected",
        `${device.name ?? "Bluetooth 장치"} 수신 중`
      );
      return true;
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Bluetooth 연결에 실패했습니다.";
      this.setStatus("error", detail);
      return false;
    }
  }

  async connectUart(options: UartConnectOptions = {}) {
    await this.disconnect();

    if (typeof navigator === "undefined" || !("serial" in navigator)) {
      this.setStatus("unsupported", "이 브라우저는 Web Serial을 지원하지 않습니다.");
      return false;
    }

    try {
      this.setStatus("requesting", "UART 포트를 선택해 주세요.");

      const port = await navigator.serial!.requestPort();
      const baudRate = options.baudRate ?? DEFAULT_UART_BAUD_RATE;

      this.setStatus("connecting", `UART ${baudRate}bps 연결 중`);
      await port.open({ baudRate });
      this.serialPort = port;
      this.serialAbort = false;
      void this.readSerialLoop();

      this.setStatus("connected", `UART ${baudRate}bps 수신 중`);
      return true;
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "UART 연결에 실패했습니다.";
      this.setStatus("error", detail);
      return false;
    }
  }

  async disconnect() {
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
      this.serialPort = null;
    }

    this.bleBuffer = "";
    this.serialBuffer = "";
    this.setStatus("idle");
  }

  private setStatus(status: Fx2HardwareStatus, detail = "") {
    this.status = status;
    this.detail = detail;
    this.emit({ type: "status", status, detail });
  }

  private emit(event: Fx2HardwareEvent) {
    this.listeners.forEach((listener) => listener(event));
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
    this.setStatus("idle", "Bluetooth 연결이 종료되었습니다.");
  };

  private handleBluetoothNotification = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null;
    const value = target?.value;

    if (!value) {
      return;
    }

    const chunk = new TextDecoder().decode(value.buffer);
    this.flushBuffer("bluetooth", chunk);
  };

  private async readSerialLoop() {
    if (!this.serialPort?.readable) {
      return;
    }

    this.serialReader = this.serialPort.readable.getReader();
    const decoder = new TextDecoder();

    try {
      while (!this.serialAbort) {
        const result = await this.serialReader.read();

        if (result.done) {
          break;
        }

        this.flushBuffer("uart", decoder.decode(result.value, { stream: true }));
      }
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "UART 수신 루프가 종료되었습니다.";
      this.setStatus("error", detail);
    } finally {
      if (this.serialReader) {
        this.serialReader.releaseLock();
        this.serialReader = null;
      }
    }
  }
}
