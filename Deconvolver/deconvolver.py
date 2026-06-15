import numpy as np
import scipy.io.wavfile as wav
from scipy.fft import fft, ifft


def deconvolver(original_sweep_path, recorded_sweep_path, max_ir_seconds=1.5, lambda_factor=1e-3, pre_delay_ms=10):

    sr_x, sw_orig = wav.read(original_sweep_path)
    sr_y, sw_rec = wav.read(recorded_sweep_path)

    if sr_x != sr_y:
        raise ValueError("Sample rate not the same")

    sw_orig = sw_orig.astype(np.float32)
    sw_rec = sw_rec.astype(np.float32)

    sw_orig = sw_orig / (np.linalg.norm(sw_orig) + 1e-12)

    # Channel separation
    if len(sw_orig.shape) > 1:
        x_1 = sw_orig[:, 0]
        x_2 = sw_orig[:, 1]
    else:
        x_1 = sw_orig
        x_2 = sw_orig

    if len(sw_rec.shape) > 1:
        y_1 = sw_rec[:, 0]
        y_2 = sw_rec[:, 1]
    else:
        y_1 = sw_rec
        y_2 = sw_rec

    # FFT sizes
    n_fft_1 = max(len(x_1), len(y_1))
    n_fft_2 = max(len(x_2), len(y_2))

    X_1 = fft(x_1, n=n_fft_1)
    X_2 = fft(x_2, n=n_fft_2)
    Y_1 = fft(y_1, n=n_fft_1)
    Y_2 = fft(y_2, n=n_fft_2)

    # Deconvolution (Farina)
    H_1 = (Y_1 * np.conj(X_1)) / (np.abs(X_1) ** 2 + lambda_factor)
    H_2 = (Y_2 * np.conj(X_2)) / (np.abs(X_2) ** 2 + lambda_factor)

    ir_1 = np.real(ifft(H_1))
    ir_2 = np.real(ifft(H_2))

    # Peak alignment
    peak_1 = np.argmax(np.abs(ir_1))
    ir_1 = np.roll(ir_1, -peak_1)

    peak_2 = np.argmax(np.abs(ir_2))
    ir_2 = np.roll(ir_2, -peak_2)

    # Trimming
    max_samples = int(max_ir_seconds * sr_x)
    ir_1 = ir_1[:max_samples]
    ir_2 = ir_2[:max_samples]

    # Pre-delay
    pre_delay_samples = int((pre_delay_ms / 1000) * sr_x)

    if 0 < pre_delay_samples < len(ir_1):
        ir_1 = np.concatenate(
            (np.zeros(pre_delay_samples), ir_1[:-pre_delay_samples])
        )

    if 0 < pre_delay_samples < len(ir_2):
        ir_2 = np.concatenate(
            (np.zeros(pre_delay_samples), ir_2[:-pre_delay_samples])
        )

    # Fade out
    fade = int(0.12 * sr_x)

    if len(ir_1) > fade:
        window = np.ones(len(ir_1))
        window[-fade:] = 0.5 * (1 - np.cos(np.linspace(0, np.pi, fade)))
        ir_1 *= window

    if len(ir_2) > fade:
        window = np.ones(len(ir_2))
        window[-fade:] = 0.5 * (1 - np.cos(np.linspace(0, np.pi, fade)))
        ir_2 *= window

    ir_f = np.stack((ir_1, ir_2), axis=-1)

    return ir_f, sr_x


if __name__ == "__main__":

    original_sweep = "Deconvolver/Sweep-REW.wav"

    ir_list = []
    path_list = []
    sample_rate = None

    index = 1

    for f in range(1, 6):
        for a in range(1, 6):

            recorded_sweep = f"./IRs/STEREO-REAPER/STEREO-CUT-{index:03d}.wav"
            output_filename = f"./IRs/STEREO-REAPER/IR_STEREO-{f}F-{a}A.wav"

            ir_raw, sample_rate = deconvolver(original_sweep, recorded_sweep, max_ir_seconds=1.5)

            ir_list.append(ir_raw)
            path_list.append(output_filename)

            index += 1

    if sample_rate is None:
        raise ValueError("Sample rate not defined")

    global_peak = 0.0

    for ir in ir_list:
        if ir is not None and ir.size > 0:
            local_peak = np.max(np.abs(ir))
            global_peak = max(global_peak, local_peak)

    global_peak = max(global_peak, 1e-12)

    for i in range(len(ir_list)):

        ir_normalized = ir_list[i] / global_peak

        wav.write(
            path_list[i],
            sample_rate,
            ir_normalized.astype(np.float32)
        )

    print("\n IRs globally normalized")