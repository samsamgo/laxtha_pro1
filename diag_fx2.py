"""FX2 real-device diagnostic -- reads 10s of frames and reports key metrics."""
import sys
import time
import serial

BAUD = 115200
READ_SECONDS = 10
SYNC_A, SYNC_B = 0xFF, 0xFE

def read_raw(hi, lo):
    return (hi & 0x7F) * 256 + lo

def try_port(port_name):
    print("")
    print("=" * 60)
    print("  PORT: %s  (%d baud, 8N1)" % (port_name, BAUD))
    print("=" * 60)
    try:
        ser = serial.Serial(port_name, BAUD, bytesize=8, stopbits=1,
                            parity='N', timeout=2)
    except serial.SerialException as e:
        print("  [FAIL] %s" % str(e)[:80])
        return False

    buf = []
    frame_count = 0
    ppd1_count = 0
    fft_trigger_count = 0
    fft_trigger_frames = []

    fft_active = False
    fft_bins_ch1 = []
    fft_bins_ch2 = []
    fft_n = 0
    completed_epochs = []

    ppg_raws = []
    bpm_vals = []
    electrode_statuses = []
    pud0_vals = []

    print("  >> Reading for %d seconds..." % READ_SECONDS)

    start = time.time()
    try:
        while time.time() - start < READ_SECONDS:
            chunk = ser.read(64)
            for b in chunk:
                buf.append(b)

            while len(buf) >= 20:
                if buf[0] != SYNC_A:
                    buf.pop(0)
                    continue
                if buf[1] != SYNC_B:
                    buf.pop(0)
                    continue
                if len(buf) < 20:
                    break

                raw = buf[:20]
                del buf[:20]
                frame_count += 1

                ppd   = raw[2] == 1
                pud0  = raw[3]
                pc    = raw[4] & 0x1F
                bpm   = raw[5]
                elec  = raw[7]
                ch1r  = read_raw(raw[8],  raw[9])
                ch2r  = read_raw(raw[10], raw[11])
                ch3r  = read_raw(raw[12], raw[13])
                ch4r  = read_raw(raw[14], raw[15])
                ch5r  = read_raw(raw[16], raw[17])
                ch6r  = read_raw(raw[18], raw[19])

                if ppd:
                    ppd1_count += 1

                pud0_vals.append(pud0)
                bpm_vals.append(bpm)
                ppg_raws.append(ch4r)
                electrode_statuses.append(elec)

                # FFT epoch assembly
                pud0_bit0 = bool(pud0 & 0x01)
                if pud0_bit0:
                    fft_trigger_count += 1
                    fft_trigger_frames.append(frame_count)
                    if fft_active and len(fft_bins_ch1) > 0:
                        completed_epochs.append({
                            'ch1': fft_bins_ch1[:],
                            'ch2': fft_bins_ch2[:],
                            'total_n': fft_n,
                        })
                    fft_active = True
                    fft_n = 0
                    fft_bins_ch1 = []
                    fft_bins_ch2 = []

                if fft_active:
                    power = ch3r / 10.0
                    if fft_n <= 103:
                        fft_bins_ch1.append(power)
                    elif fft_n <= 208:
                        fft_bins_ch2.append(power)

                    if fft_n == 208:
                        completed_epochs.append({
                            'ch1': fft_bins_ch1[:],
                            'ch2': fft_bins_ch2[:],
                            'total_n': fft_n + 1,
                        })
                        fft_active = False
                        fft_n = 0
                        fft_bins_ch1 = []
                        fft_bins_ch2 = []
                    else:
                        fft_n += 1

    except KeyboardInterrupt:
        pass
    finally:
        ser.close()

    elapsed = time.time() - start
    print("")
    print("-" * 60)
    print("  FRAMES : %d  (%.1f fps, expected ~250)" % (frame_count, frame_count / elapsed))
    print("  PPD=1  : %d / %d  (%.1f%%)" % (ppd1_count, frame_count, ppd1_count / max(frame_count,1) * 100))

    # pud0 bit analysis
    if pud0_vals:
        bit0_count = sum(1 for v in pud0_vals if v & 0x01)
        bit6_count = sum(1 for v in pud0_vals if v & 0x40)
        bit7_count = sum(1 for v in pud0_vals if v & 0x80)
        print("  PUD0   : bit0(FFT)=%d  bit6(wear)=%d  bit7(hb)=%d" % (bit0_count, bit6_count, bit7_count))

    # BPM
    valid_bpm = [b for b in bpm_vals if 30 < b < 200]
    if valid_bpm:
        avg_bpm = sum(valid_bpm) / len(valid_bpm)
        print("")
        print("  [BPM]  avg=%.1f  min=%d  max=%d  (valid samples: %d)" % (
            avg_bpm, min(valid_bpm), max(valid_bpm), len(valid_bpm)))

    # PPG
    if ppg_raws:
        mn, mx = min(ppg_raws), max(ppg_raws)
        avg = sum(ppg_raws) / len(ppg_raws)
        c_mn, c_mx = mn - 16384, mx - 16384
        c_avg = avg - 16384
        print("")
        print("  [PPG raw]      min=%d  max=%d  avg=%.0f" % (mn, mx, avg))
        print("  [PPG centered] min=%d  max=%d  avg=%.0f  (raw-16384)" % (c_mn, c_mx, c_avg))
        if mn > 500 or mx > 500:
            print("  -> raw values are large positive -> centering by (raw-16384) is CORRECT")
        else:
            print("  -> raw values near zero -> check centering logic")

    # Electrode status
    if electrode_statuses:
        last_elec = electrode_statuses[-1]
        ref  = "ON" if last_elec & 0x08 else "OFF"
        eeg1 = "ON" if last_elec & 0x20 else "OFF"
        eeg2 = "ON" if last_elec & 0x10 else "OFF"
        print("")
        print("  [ELECTRODE] REF=%s  EEG1(Fp1)=%s  EEG2(Fp2)=%s  (raw=0x%02X)" % (
            ref, eeg1, eeg2, last_elec))

    # FFT
    print("")
    print("  [FFT] PUD0.bit0 triggers: %d" % fft_trigger_count)
    if fft_trigger_frames:
        print("        First trigger at frame: %d" % fft_trigger_frames[0])
        if len(fft_trigger_frames) > 1:
            gaps = [fft_trigger_frames[i+1] - fft_trigger_frames[i]
                    for i in range(len(fft_trigger_frames) - 1)]
            avg_gap = sum(gaps) / len(gaps)
            print("        Avg gap between triggers: %.1f frames (expected ~512)" % avg_gap)
    else:
        print("        [!] No bit0 trigger seen -> fallback auto-start mode needed")

    print("  [FFT] Completed epochs: %d" % len(completed_epochs))
    for i, ep in enumerate(completed_epochs[:3]):
        ch1c = len(ep['ch1'])
        ch2c = len(ep['ch2'])
        total = ep['total_n']
        ok = "OK" if ch1c == 104 and ch2c == 105 else "MISMATCH"
        print("    Epoch #%d: CH1=%d bins  CH2=%d bins  total=%d  [%s]" % (
            i+1, ch1c, ch2c, total, ok))
        print("    (expected: CH1=104, CH2=105, total=209)")
        if ch1c >= 82:
            theta = sum(ep['ch1'][9:17])
            alpha = sum(ep['ch1'][17:25])
            lbeta = sum(ep['ch1'][25:31])
            mbeta = sum(ep['ch1'][31:41])
            hbeta = sum(ep['ch1'][41:62])
            gamma = sum(ep['ch1'][62:83])
            total_band = theta + alpha + lbeta + mbeta + hbeta
            if total_band > 0:
                print("    CH1 bands: theta=%.1f(%.0f%%)  alpha=%.1f(%.0f%%)  beta=%.1f(%.0f%%)" % (
                    theta, theta/total_band*100,
                    alpha, alpha/total_band*100,
                    (lbeta+mbeta+hbeta), (lbeta+mbeta+hbeta)/total_band*100))

    print("")
    print("=" * 60)
    return True


if __name__ == "__main__":
    ports_to_try = ["COM9", "COM7"]
    if len(sys.argv) > 1:
        ports_to_try = sys.argv[1:]

    for port in ports_to_try:
        ok = try_port(port)
        if ok:
            break
        print("  -> %s failed, trying next..." % port)
