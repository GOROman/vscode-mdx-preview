interface AnalyzeSettings {
    windowSize: number,
    minFrequency: number,
    maxFrequency: number,
    minTime: number,
    maxTime: number,
    analyzeID: number
}

export default class Analyzer {
    audioBuffer: AudioBuffer;
    analyzeSettingButton: HTMLButtonElement;
    analyzeButton: HTMLButtonElement;
    analyzeResultBox: HTMLElement;
    spectrogramCanvasList: HTMLCanvasElement[] = [];
    spectrogramCanvasContexts: CanvasRenderingContext2D[] = [];
    latestAnalyzeID: number = 0;
    registerSeekbar: Function;
    postMessage: Function;

    constructor (ab: AudioBuffer, registerSeekbar: Function, postMessage: Function) {
        this.audioBuffer = ab;
        this.registerSeekbar = registerSeekbar;
        this.postMessage = postMessage;

        this.analyzeSettingButton = <HTMLButtonElement>document.getElementById("analyze-setting-button");
        this.analyzeSettingButton.style.display = "none";
        this.analyzeSettingButton.onclick = () => {
            const settings = document.getElementById("analyze-setting");
            if (settings.style.display !== "block") {
                settings.style.display = "block";
                this.analyzeSettingButton.textContent = "▲settings";
            } else {
                settings.style.display = "none";
                this.analyzeSettingButton.textContent = "▼settings";
            }
        };

        this.analyzeButton = <HTMLButtonElement>document.getElementById("analyze-button");
        this.analyzeButton.style.display = "none";
        this.analyzeButton.onclick = () => { this.analyze() };

        this.analyzeResultBox = document.getElementById("analyze-result-box");
    }

    clearAnalyzeResult() {
        for (const c of Array.from(this.analyzeResultBox.children)) {
            this.analyzeResultBox.removeChild(c);
        }
        this.spectrogramCanvasList = [];
        this.spectrogramCanvasContexts = [];
    }

    enable(autoAnalyze: boolean) {
        this.analyzeSettingButton.style.display = "block";
        this.analyzeButton.style.display = "block";
        if (autoAnalyze) {
            this.analyzeButton.click();
        }
    }

    analyzeSettings(): AnalyzeSettings {
        const windowSizeSelect = <HTMLSelectElement>document.getElementById("analyze-window-size");
        const windowSize = parseInt(windowSizeSelect.value, 10);
        windowSizeSelect.value = `${windowSize}`;

        const minFreqInput = <HTMLInputElement>document.getElementById("analyze-min-frequency");
        let minFrequency = parseInt(minFreqInput.value, 10);
        if (isNaN(minFrequency) || minFrequency < 0) minFrequency = 0;

        const maxFreqInput = <HTMLInputElement>document.getElementById("analyze-max-frequency");
        let maxFrequency = parseInt(maxFreqInput.value, 10);
        const maxf = this.audioBuffer.sampleRate / 2;

        if (isNaN(maxFrequency) || maxf < maxFrequency) maxFrequency = maxf;
        if (maxFrequency <= minFrequency) {
            minFrequency = 0;
            maxFrequency = maxf;
        }
        minFreqInput.value = `${minFrequency}`;
        maxFreqInput.value = `${maxFrequency}`;

        const minTimeInput = <HTMLInputElement>document.getElementById("analyze-min-time");
        let minTime = parseFloat(minTimeInput.value);
        if (isNaN(minTime) || minTime < 0) minTime = 0;

        const maxTimeInput = <HTMLInputElement>document.getElementById("analyze-max-time");
        let maxTime = parseFloat(maxTimeInput.value);
        if (isNaN(maxTime) || this.audioBuffer.duration < maxTime) maxTime = this.audioBuffer.duration;

        if (maxTime <= minTime) {
            minTime = 0;
            maxTime = this.audioBuffer.duration;
        }
        minTimeInput.value = `${minTime}`;
        maxTimeInput.value = `${maxTime}`;

        return {
            windowSize,
            minFrequency,
            maxFrequency,
            minTime,
            maxTime,
            analyzeID: ++this.latestAnalyzeID
        };
    }

    analyze() {
        this.analyzeButton.style.display = "none";
        this.clearAnalyzeResult();

        const settings = this.analyzeSettings();

        for (let ch = 0; ch < this.audioBuffer.numberOfChannels; ch++) {
            this.showWaveForm(ch, settings);
            this.showSpectrogram(ch, settings);
        }

        // register seekbar on figures
        const visibleBar = document.createElement("div");
        visibleBar.className = "seek-div";
        this.analyzeResultBox.appendChild(visibleBar);

        const inputSeekbar = document.createElement("input");
        inputSeekbar.type = "range";
        inputSeekbar.className = "input-seek-bar";
        inputSeekbar.step = "0.00001"
        this.analyzeResultBox.appendChild(inputSeekbar);

        this.registerSeekbar(
            "analyze-result-seekbar",
            inputSeekbar,
            (value) => {
                const t = value * this.audioBuffer.duration / 100;
                const v = ((t - settings.minTime) / (settings.maxTime - settings.minTime)) * 100;
                const vv = v < 0 ? 0 : 100 < v ? 100 : v;
                visibleBar.style.width = `${vv}%`;
                return 100 < v;
            },
            (e) => {
                const rv = e.target.value;
                const nv = ((rv / 100 * (settings.maxTime - settings.minTime) + settings.minTime) / this.audioBuffer.duration) * 100;
                e.target.value = nv;
                return e;
            }
        );

        this.analyzeButton.style.display = "block";
    }

    showWaveForm(ch: number, settings: AnalyzeSettings) {
        const width = 1000;
        const height = 200;

        const canvasBox = document.createElement("div");
        canvasBox.className = "canvas-box";

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "rgb(91,252,91)";
        canvasBox.appendChild(canvas);

        const axisCanvas = document.createElement("canvas");
        axisCanvas.className = "axis-canvas";
        axisCanvas.width = width;
        axisCanvas.height = height;
        const axisContext = axisCanvas.getContext("2d");
        axisContext.font = `10px Arial`;
        for (let i = 0; i < 10; i++) {
            const x = Math.round(i * width / 10);
            const t = i * (settings.maxTime - settings.minTime) / 10 + settings.minTime;
            const y = Math.round(i * height / 10);

            axisContext.fillStyle = "white";
            axisContext.fillText(`${(t).toFixed(1)}`, x, 10);

            axisContext.fillStyle = "rgb(80,80,80)";
            for (let j = 0; j < height; j++) axisContext.fillRect(x, j, 1, 1);
            for (let j = 0; j < width; j++) axisContext.fillRect(j, y, 1, 1);
        }
        canvasBox.appendChild(axisCanvas);

        this.analyzeResultBox.appendChild(canvasBox);

        const startIndex = Math.floor(settings.minTime * this.audioBuffer.sampleRate);
        const endIndex = Math.floor(settings.maxTime * this.audioBuffer.sampleRate);
        const data = this.audioBuffer.getChannelData(ch).slice(startIndex, endIndex);
        let maxValue = 0, minValue = Number.MAX_SAFE_INTEGER;
        for (let i = 0; i < data.length; i++) {
            if (maxValue < data[i]) maxValue = data[i];
            if (data[i] < minValue) minValue = data[i];
        }
        for (let i = 0; i < data.length; i++) {
            data[i] = (data[i] - minValue) / (maxValue - minValue); // normalize to [0,1]
        }

        // call draw in requestAnimationFrame not to block ui
        requestAnimationFrame(() => this.drawWaveForm(data, context, 0, 10000, width, height, settings.analyzeID));
    }

    drawWaveForm(data, context, start, count, width, height, analyzeID) {
        for (let i = 0; i < count; i++) {
            const x = Math.round(((start + i) / data.length) * width);
            const y = Math.round(height * (1 - data[start + i]));
            context.fillRect(x, y, 1, 1);
        }

        if (start + count < this.audioBuffer.length && analyzeID === this.latestAnalyzeID) {
            // call draw in requestAnimationFrame not to block ui
            requestAnimationFrame(() => this.drawWaveForm(data, context, start + count, count, width, height, analyzeID));
        }
    }

    showSpectrogram(ch: number, settings: AnalyzeSettings) {
        const width = 1800;
        const height = 600;

        const canvasBox = document.createElement("div");
        canvasBox.className = "canvas-box";

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        canvasBox.appendChild(canvas);
        this.spectrogramCanvasList.push(canvas);
        this.spectrogramCanvasContexts.push(context);

        const axisCanvas = document.createElement("canvas");
        axisCanvas.className = "axis-canvas";
        axisCanvas.width = width;
        axisCanvas.height = height;
        const axisContext = axisCanvas.getContext("2d");
        axisContext.font = `18px Arial`;
        for (let i = 0; i < 10; i++) {
            axisContext.fillStyle = "white";
            const x = Math.round(i * width / 10);
            const t = i * (settings.maxTime - settings.minTime) / 10 + settings.minTime;
            axisContext.fillText(`${(t).toFixed(1)}`, x, 18);
            const y = Math.round(i * height / 10);
            const f = (10 - i) * (settings.maxFrequency - settings.minFrequency) / 10 + settings.minFrequency;
            axisContext.fillText(`${(f / 1000).toFixed(1)}k`, 4, y - 4);

            axisContext.fillStyle = "rgb(80,80,80)";
            for (let j = 0; j < height; j++) axisContext.fillRect(x, j, 1, 1);
            for (let j = 0; j < width; j++) axisContext.fillRect(j, y, 1, 1);
        }

        canvasBox.appendChild(axisCanvas);

        this.analyzeResultBox.appendChild(canvasBox);

        const startIndex = Math.round(settings.minTime * this.audioBuffer.sampleRate);
        const endIndex = Math.round(settings.maxTime * this.audioBuffer.sampleRate);
        const end = startIndex + 10000 < endIndex ? startIndex + 10000 : endIndex;
        this.postMessage({ type: "spectrogram", channel: ch, start: startIndex, end, settings });
    }

    drawSpectrogram(data) {
        const ch = data.channel;
        const canvas = this.spectrogramCanvasList[ch];
        const context = this.spectrogramCanvasContexts[ch];
        if (!canvas || !context) return;

        const width = canvas.width;
        const height = canvas.height;
        const spectrogram = data.spectrogram;
        const wholeSampleNum = (data.settings.maxTime - data.settings.minTime) * this.audioBuffer.sampleRate;
        const blockSize = data.end - data.start;
        const blockStart = data.start - data.settings.minTime * this.audioBuffer.sampleRate;
        const hopSize = data.settings.windowSize / 2;
        const rectWidth = width * (hopSize / blockSize);

        for (let i = 0; i < spectrogram.length; i++) {
            const x = width * ((i * hopSize + blockStart) / wholeSampleNum);
            const rectHeight = height / spectrogram[i].length;
            for (let j = 0; j < spectrogram[i].length; j++) {
                const y = height * (1 - (j / spectrogram[i].length));

                const value = spectrogram[i][j];
                if (value < 0.001) {
                    continue;
                } else if (value < 0.7) {
                    context.fillStyle = `rgb(0,0,${Math.floor(value * 255)})`;
                } else {
                    context.fillStyle = `rgb(0,${Math.floor(value * 255)},255)`;
                }

                context.fillRect(x, y, rectWidth, rectHeight);
            }
        }
    }
}