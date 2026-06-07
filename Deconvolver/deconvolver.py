import numpy as np
import scipy.io.wavfile as wav
from scipy.fft import fft, ifft


def deconvolver(original_sweep_path,recorded_sweep_path,output_ir_path,max_ir_seconds=1.5,lambda_factor=1e-3,pre_delay_ms=10,fade_in_ms=2,fade_out_ms=120):
    
    sr_x, sw_orig = wav.read(original_sweep_path)
    sr_y, sw_rec = wav.read(recorded_sweep_path)

    if sr_x != sr_y:
        raise ValueError("Sample rate not the same")

    sw_orig = sw_orig.astype(np.float32)
    sw_rec = sw_rec.astype(np.float32)

    sw_orig = sw_orig / np.linalg.norm(sw_orig)
    # sw_rec = sw_rec / np.linalg.norm(sw_rec)

    if len(sw_orig.shape) > 1:
        x_1 = sw_orig[:, 0]
        x_2 = sw_orig[:,1]

    else:
        x_1 = sw_orig
        x_2 = sw_orig

    if len(sw_rec.shape) > 1:
        y_1 = sw_rec[:, 0]
        y_2 = sw_rec[:, 1]

    else:
        y_1 = sw_rec
        y_2 = sw_rec

    n_fft_1 = max(len(x_1), len(y_1))
    n_fft_2 = max(len(x_2), len(y_2))

    X_1= fft(x_1, n=n_fft_1)
    X_2= fft(x_2, n=n_fft_2)
    Y_1 = fft(y_1, n=n_fft_1)
    Y_2 = fft(y_2, n=n_fft_2)

    #Deconvolution (Farina)
    H_1= (Y_1 * np.conj(X_1)) / (np.abs(X_1)**2 + lambda_factor)
    H_2= (Y_2 * np.conj(X_2)) / (np.abs(X_2)**2 + lambda_factor)

    ir_1 = np.real(ifft(H_1))
    ir_2 = np.real(ifft(H_2))

    peak_1 = np.argmax(np.abs(ir_1))
    ir_1 = np.roll(ir_1, -peak_1)
    peak_2 = np.argmax(np.abs(ir_2))
    ir_2 = np.roll(ir_2, -peak_2)

    max_samples = int(max_ir_seconds * sr_x)
    ir_1 = ir_1[:max_samples]
    ir_2 = ir_2[:max_samples]

    pre_delay_samples = int((pre_delay_ms / 1000) * sr_x)
    if pre_delay_samples > 0 and pre_delay_samples < len(ir_1):
        ir_1 = np.concatenate(( np.zeros(pre_delay_samples, dtype=ir_1.dtype), ir_1[:-pre_delay_samples]))

    if pre_delay_samples > 0 and pre_delay_samples < len(ir_2):
        ir_2 = np.concatenate(( np.zeros(pre_delay_samples, dtype=ir_2.dtype), ir_2[:-pre_delay_samples]))

    fade = int(0.12 * sr_x)
    if len(ir_1) > fade:
        window = np.ones(len(ir_1))
        window[-fade:] = 0.5 * (1 - np.cos(np.linspace(0, np.pi, fade)))
        ir_1 *= window

    if len(ir_2) > fade:
        window = np.ones(len(ir_2))
        window[-fade:] = 0.5 * (1 - np.cos(np.linspace(0, np.pi, fade)))
        ir_2 *= window

    ir_1 = ir_1 / (np.max(np.abs(ir_1)) + 1e-12)
    ir_2 = ir_2 / (np.max(np.abs(ir_2)) + 1e-12)
    ir_f = np.stack((ir_1, ir_2), axis=-1)
    wav.write(output_ir_path, sr_x, ir_f.astype(np.float32))
    print("IR GENERATED")

if __name__ == "__main__":
    original_sweep = "Deconvolver/Sweep-REW.wav"
    # recorded_sweep = f"./IRs/MONO-REAPER/MONO-CUT-025.wav"

    # output_filename = f"./IRs/MONO-REAPER/IR_MONO-5F-5A.wav"

    # deconvolver(original_sweep, recorded_sweep, output_filename, max_ir_seconds=1.5)
    
    index = 1
    for f in range(1, 6):
        for a in range(1, 6):

            recorded_sweep = f"./IRs/BINAURAL-REAPER/BINAURAL-CUT-{index:03d}.wav"
            print(recorded_sweep)

            output_filename = f"./IRs/BINAURAL-REAPER/IR_BIN-{f}F-{a}A.wav"

            deconvolver(original_sweep,recorded_sweep,output_filename,max_ir_seconds=1.5)

            index += 1
