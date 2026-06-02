import numpy as np
import scipy.io.wavfile as wav
from scipy.fft import fft, ifft


def deconvolver(original_sweep_path,recorded_sweep_path,output_ir_path,max_ir_seconds=1.5,lambda_factor=1e-3,pre_delay_ms=10,fade_in_ms=2,fade_out_ms=120):
    
    sr_x, sw_orig = wav.read(original_sweep_path)
    sr_y, sw_rec = wav.read(recorded_sweep_path)

    if sr_x != sr_y:
        raise ValueError("Sample rates must match")

    sw_orig = sw_orig.astype(np.float64)
    sw_rec = sw_rec.astype(np.float64)

    # Normalizació 
    sw_orig /= np.linalg.norm(sw_orig) + 1e-12
    # sw_rec /= np.linalg.norm(sw_rec) + 1e-12

    # Canals
    if sw_orig.ndim > 1:
        x_1, x_2 = sw_orig[:, 0], sw_orig[:, 1]
    else:
        x_1 = x_2 = sw_orig

    if sw_rec.ndim > 1:
        y_1, y_2 = sw_rec[:, 0], sw_rec[:, 1]
    else:
        y_1 = y_2 = sw_rec

    def ir(x, y):
        n_fft = len(x) + len(y) - 1  # evitar aliasing
        X = fft(x, n=n_fft)
        Y = fft(y, n=n_fft)
        H = (Y * np.conj(X)) / (np.abs(X) ** 2 + lambda_factor)
        ir = np.real(ifft(H))
        return ir

    ir_1 = ir(x_1, y_1)
    ir_2 = ir(x_2, y_2)

    
    def align_and_trim(ir, sr, max_seconds, pre_delay_samples):
        peak = np.argmax(np.abs(ir))
        
        ir = ir[peak:]
        max_samples = int(max_seconds * sr)
        ir = ir[:max_samples]
       
        if pre_delay_samples > 0:
            ir = np.concatenate([np.zeros(pre_delay_samples), ir])
            ir = ir[:max_samples]  
        return ir

    pre_delay_samples = int((pre_delay_ms / 1000) * sr_x)
    ir_1 = align_and_trim(ir_1, sr_x, max_ir_seconds, pre_delay_samples)
    ir_2 = align_and_trim(ir_2, sr_x, max_ir_seconds, pre_delay_samples)

    # Igualar longituds
    min_len = min(len(ir_1), len(ir_2))
    ir_1 = ir_1[:min_len]
    ir_2 = ir_2[:min_len]

    # Fade-in 
    fade_in_samples = int((fade_in_ms / 1000) * sr_x)
    if fade_in_samples > 0 and fade_in_samples < len(ir_1):
        fade_in_window = 0.5 * (1 - np.cos(np.linspace(0, np.pi, fade_in_samples)))
        ir_1[:fade_in_samples] *= fade_in_window
        ir_2[:fade_in_samples] *= fade_in_window

    # Fade-out (finestra)
    fade_out_samples = int((fade_out_ms / 1000) * sr_x)
    if fade_out_samples > 0 and fade_out_samples < len(ir_1):
        fade_out_window = 0.5 * (1 + np.cos(np.linspace(0, np.pi, fade_out_samples)))
        ir_1[-fade_out_samples:] *= fade_out_window
        ir_2[-fade_out_samples:] *= fade_out_window

    # Normalizació
    max_peak = max(np.max(np.abs(ir_1)), np.max(np.abs(ir_2))) + 1e-12
    if max_peak > 1.0:
        ir_1 /= max_peak
        ir_2 /= max_peak

    # Exportar la IR generada
    ir_stereo = np.stack([ir_1, ir_2], axis=-1).astype(np.float32)
    wav.write(output_ir_path, sr_x, ir_stereo)
    print(f"IR generada: {output_ir_path}")


if __name__ == "__main__":
    original_sweep = "Deconvolver/Sweep-REW.wav"
    recorded_sweep = f"./IRs/MONO-REAPER/MONO-CUT-025.wav"

    output_filename = f"./IRs/MONO-REAPER/IR_MONO-5F-5A.wav"

    deconvolver(original_sweep, recorded_sweep, output_filename, max_ir_seconds=1.5)
    
    # index = 1
    # for f in range(1, 6):
    #     for a in range(1, 6):

    #         recorded_sweep = f"./IRs/MONO-REAPER/MONO-CUT-{index:03d}.wav"
    #         print(recorded_sweep)

    #         output_filename = f"./IRs/MONO-REAPER/IR_MONO-{f}F-{a}A.wav"

    #         deconvolver(
    #             original_sweep,
    #             recorded_sweep,
    #             output_filename,
    #             max_ir_seconds=1.5
    #         )

    #         index += 1
