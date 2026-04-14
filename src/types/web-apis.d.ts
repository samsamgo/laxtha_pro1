type BluetoothServiceUUID = string | number;

type BluetoothCharacteristicUUID = string | number;

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value: DataView | null;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(
    characteristic: BluetoothCharacteristicUUID
  ): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(
    service: BluetoothServiceUUID
  ): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDeviceRequestOptions {
  acceptAllDevices?: boolean;
  optionalServices?: BluetoothServiceUUID[];
}

interface BluetoothDevice extends EventTarget {
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface Bluetooth {
  requestDevice(options: BluetoothDeviceRequestOptions): Promise<BluetoothDevice>;
}

interface SerialPortRequestOptions {
  filters?: Array<Record<string, unknown>>;
}

interface SerialOptions {
  baudRate: number;
  bufferSize?: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  flowControl?: "none" | "hardware";
}

interface SerialPort {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
}

interface Serial {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
}

interface Navigator {
  bluetooth: Bluetooth;
  serial?: Serial;
}
