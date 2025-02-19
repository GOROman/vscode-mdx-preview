// You should compile wasm before build extension
import Module from "./decoder/wasm/decoder.js";
import { AnalyzeSettings } from "./analyzeSettings";
import Ooura from "ooura";

interface Status {
    status: number;
    error: string;
}

interface AudioInfoResult {
    status: Status;
    encoding: string;
    sampleRate: number;
    numChannels: number;
    duration: number;
    format: string;
}

interface Vector {
    size(): number;
    get(index: number): number;
    delete(): void;
}

interface DecodeAudioResult {
    status: Status;
    samples: Vector;
}

export default class documentData {
    private static _audioFilePath = "audio";

    private _module: any;

    private _fileSize: number; // byte
    public get fileSize() { return this._fileSize; }

    constructor (module: any, fileSize: number) {
        this._module = module;
        this._fileSize = fileSize;
    }

    public static async create(data: Uint8Array): Promise<documentData> {
        const module = await Module();
        module.FS.writeFile(documentData._audioFilePath, data);
        return new documentData(module, data.length);
    }

    private _encoding: string;
    public get encoding() { return this._encoding; }

    private _sampleRate: number;
    public get sampleRate() { return this._sampleRate; }

    private _numChannels: number;
    public get numChannels() { return this._numChannels; }
    
    private _duration: number;
    public get duration() { return this._duration; }
    
    private _format: string;
    public get format() { return this._format; }

    public readAudioInfo() {
        const { status, ...info }: AudioInfoResult = this._module.getAudioInfo(documentData._audioFilePath);
        if (status.status < 0) {
            throw new Error(`failed to get audio info: ${status.status}: ${status.error}`);
        }
        this._encoding = info.encoding;
        this._sampleRate = info.sampleRate;
        this._numChannels = info.numChannels;
        this._duration = info.duration;
        this._format = info.format;
    }

    private _length: number;
    public get length() { return this._length; }

    private _samples: Float32Array[];
    public get samples() { return this._samples; }

    public decode() {
        const { status, samples }: DecodeAudioResult = this._module.decodeAudio(documentData._audioFilePath);
        if (status.status < 0) {
            samples.delete();
            throw new Error(`failed to decode audio: ${status.status}: ${status.error}`);
        }

        this._length = samples.size() / this._numChannels;
        this._duration = this._length / this._sampleRate;

        this._samples = [];
        for (let i = 0; i < this._numChannels; i++) {
            this._samples[i] = new Float32Array(this._length);
        }

        for (let i = 0; i < this._length; i++) {
            for (let j = 0; j < this._numChannels; j++) {
                this._samples[j][i] = samples.get(i * this._numChannels + j);
            }
        }

        samples.delete();
    }

    // use number[] because this data is once stringified by postMessage() 
    // and TypedArray will be object like this: "{"0":"1.0106", "1":"0.0632", ...}"
    private _spectrogram: number[][][] = [];
    public get spectrogram() { return this._spectrogram; }

    public makeSpectrogram(ch: number, settings: AnalyzeSettings) {
        const windowSize = settings.windowSize;
        const window = new Float32Array(windowSize);
        for (let i = 0; i < windowSize; i++) {
            window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / windowSize);
        }

        const startIndex = Math.floor(settings.minTime * this._sampleRate);
        const endIndex = Math.floor(settings.maxTime * this._sampleRate);

        const df = this._sampleRate / settings.windowSize;
        const minFreqIndex = Math.floor(settings.minFrequency / df);
        const maxFreqIndex = Math.floor(settings.maxFrequency / df);

        const ooura = new Ooura(windowSize, { type: "real", radix: 4 });

        const data = this._samples[ch];
        let maxValue = Number.EPSILON;

        this._spectrogram[ch] = [];
        for (let i = startIndex; i < endIndex; i += settings.hopSize) {
            // i is center of the window
            const s = i - windowSize / 2, t = i + windowSize / 2;
            const ss = s > 0 ? s : 0, tt = t < data.length ? t : data.length;
            const d = ooura.scalarArrayFactory();
            for (let j = 0; j < d.length; j++) {
                if (s + j < ss) continue;
                if (tt < s + j) continue;
                d[j] = data[s + j] * window[j];
            }

            const re = ooura.vectorArrayFactory();
            const im = ooura.vectorArrayFactory();
            ooura.fft(d.buffer, re.buffer, im.buffer);

            const ps = [];
            for (let j = minFreqIndex; j < maxFreqIndex; j++) {
                const v = re[j] * re[j] + im[j] * im[j];
                ps.push(v);
                if (maxValue < v) maxValue = v;
            }

            this._spectrogram[ch].push(ps);
        }

        for (let i = 0; i < this._spectrogram[ch].length; i++) {
            for (let j = minFreqIndex; j < maxFreqIndex; j++) {
                this._spectrogram[ch][i][j] = 10 * Math.log10(this._spectrogram[ch][i][j] / maxValue);
            }
        }
    }

    public dispose() {
        this._module.FS.unlink(documentData._audioFilePath);
    }
}