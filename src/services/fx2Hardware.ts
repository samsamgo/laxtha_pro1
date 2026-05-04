import type { Fx2BinaryFrame } from "../types/fx2";


export type Fx2HardwareStatus =
  | "idle"
  | "requesting"
  | "connecting"
  | "connected"
  | "unsupported"
  | "error";

export type Fx2HardwareEvent =
  | { type: "status"; status: Fx2HardwareStatus; detail?: string }
  | { type: "packet"; mode: "serial"; frame: Fx2BinaryFrame };

interface UartConnectOptions {
  baudRate?: number;
  forcePrompt?: boolean;
}

const DEFAULT_UART_BAUD_RATE = 115200;
// Empty filters = show all available ports (Bluetooth SPP COM ports have no USB VID/PID)
const DEFAULT_UART_FILTERS: SerialPortFilter[] = [];


export const DEFAULT_HARDWARE_OPTIONS = {
  uart: {
    baudRate: DEFAULT_UART_BAUD_RATE,
    filters: DEFAULT_UART_FILTERS,
  },
} as const;

export class Fx2HardwareService {
  private status: Fx2HardwareStatus = "idle";

  private detail = "";

  private listeners = new Set<(event: Fx2HardwareEvent) => void>();

  private serialPort: SerialPort | null = null;

  private lastSerialPort: SerialPort | null = null;

  private serialReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  private serialAbort = false;

  private isIntentionalDisconnect = false;

  private lastUartBaudRate = DEFAULT_UART_BAUD_RATE;

  private uartFilters: SerialPortFilter[] = DEFAULT_UART_FILTERS;

  private uartReconnectEnabled = false;

  private binaryBuffer: number[] = [];

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

  async connectSerial() {
    return this.connectUart({ forcePrompt: true });
  }

  private async connectUart(options: UartConnectOptions = {}) {
    if (typeof navigator === "undefined" || !("serial" in navigator)) {
      this.setStatus("unsupported", "This browser does not support Web Serial.");
      return false;
    }

    try {
      const baudRate = options.baudRate ?? DEFAULT_UART_BAUD_RATE;
      this.lastUartBaudRate = baudRate;

      // Disconnect first to ensure clean state before prompting for a port
      await this.disconnect();
      this.setStatus("requesting", "Web Serial 장치를 선택해 주세요.");
      const port = await this.resolveUartPort(Boolean(options.forcePrompt));

      this.uartReconnectEnabled = true;
      await this.openSerialPort(port, baudRate);

      const info = port.getInfo();
      const portLabel = info.usbVendorId
        ? `USB VID:${info.usbVendorId.toString(16).toUpperCase()}`
        : "SPP/COM";
      this.setStatus("connected", `Web Serial (${portLabel}) ${baudRate}bps`);
      return true;
    } catch (error) {
      this.uartReconnectEnabled = false;
      const detail =
        error instanceof Error ? error.message : "Web Serial 연결에 실패했습니다.";
      this.setStatus("error", detail);
      return false;
    }
  }

  async disconnect() {
    this.isIntentionalDisconnect = true;
    this.serialAbort = true;

    if (this.serialReader) {
      const reader = this.serialReader;
      this.serialReader = null; // clear before cancel so readSerialLoop.finally skips it
      try {
        await reader.cancel();
      } catch {
        // Reader cancellation can fail if the stream is already closed.
      }
      try {
        reader.releaseLock();
      } catch {
        // Already released by readSerialLoop's finally block.
      }
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

    this.binaryBuffer = [];
    this.uartReconnectEnabled = false;
    this.isIntentionalDisconnect = false;
    this.setStatus("idle");
  }

  private parseBinaryFrame(bytes: number[]): Fx2BinaryFrame {
    // bytes[0]=0xFF, bytes[1]=0xFE (sync, already verified by processBinaryBuffer)
    const readRaw = (hi: number, lo: number) => (hi & 0x7f) * 256 + lo;
    return {
      ppd: bytes[2] === 1,
      pud0: bytes[3],
      pc: bytes[4],
      bpm: bytes[5],
      pcd: bytes[6],
      electrodeStatus: bytes[7],
      ch1Raw: readRaw(bytes[8], bytes[9]),
      ch2Raw: readRaw(bytes[10], bytes[11]),
      ch3Raw: readRaw(bytes[12], bytes[13]),
      ch4Raw: readRaw(bytes[14], bytes[15]),
      ch5Raw: readRaw(bytes[16], bytes[17]),
      ch6Raw: readRaw(bytes[18], bytes[19]),
    };
  }

  private processBinaryBuffer(): void {
    while (this.binaryBuffer.length >= 20) {
      const syncIdx = this.binaryBuffer.indexOf(0xff);
      if (syncIdx === -1) {
        this.binaryBuffer = [];
        return;
      }
      if (syncIdx > 0) {
        this.binaryBuffer.splice(0, syncIdx);
      }
      if (this.binaryBuffer.length < 20) break;
      if (this.binaryBuffer[1] !== 0xfe) {
        // Not a valid frame start — skip one byte and retry
        this.binaryBuffer.splice(0, 1);
        continue;
      }
      const frameBytes = this.binaryBuffer.splice(0, 20);
      this.emit({ type: "packet", mode: "serial", frame: this.parseBinaryFrame(frameBytes) });
    }
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
    if (this.uartFilters.length === 0) {
      return true;
    }

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

  private async resolveUartPort(forcePrompt = false) {
    if (!forcePrompt && this.lastSerialPort) {
      return this.lastSerialPort;
    }

    if (forcePrompt) {
      this.setStatus("requesting", "Web Serial 장치를 선택해 주세요.");
      return navigator.serial!.requestPort({ filters: this.uartFilters });
    }

    const grantedPorts = await this.getGrantedTargetPorts();

    if (grantedPorts.length > 0) {
      return grantedPorts[0];
    }

    this.setStatus("requesting", "Web Serial 장치를 선택해 주세요.");
    return navigator.serial!.requestPort({ filters: this.uartFilters });
  }

  private async openSerialPort(port: SerialPort, baudRate: number) {
    this.setStatus("connecting", `Web Serial ${baudRate}bps 연결 중`);
    await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: "none" });
    this.serialPort = port;
    this.lastSerialPort = port;
    this.serialAbort = false;
    void this.readSerialLoop();
  }

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
    this.setStatus("idle", "Web Serial 연결이 끊어졌습니다.");
  };

  private async tryReconnectUart() {
    try {
      const grantedPorts = await this.getGrantedTargetPorts();
      const port = grantedPorts[0];

      if (!port || this.serialPort || this.isIntentionalDisconnect) {
        return;
      }

      await this.openSerialPort(port, this.lastUartBaudRate);
      this.setStatus("connected", `Web Serial ${this.lastUartBaudRate}bps`);
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
          this.binaryBuffer.push(byteValue);
        }
        this.processBinaryBuffer();
      }
    } catch (error) {
      // serialAbort=true means we cancelled intentionally — not an error
      if (!this.serialAbort) {
        const detail =
          error instanceof Error ? error.message : "UART read loop stopped.";
        this.setStatus("error", detail);
      }
    } finally {
      if (this.serialReader) {
        try { this.serialReader.releaseLock(); } catch { /* ignore */ }
        this.serialReader = null;
      }

      this.serialPort = null;
    }
  }
}
