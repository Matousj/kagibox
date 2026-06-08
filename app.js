const state = {
    currentMode: 'random',
    memorableMode: false,
    isCopying: false,
    deviceOn: false,
    systemMuted: false,
    cableConnected: true,
    bufferNeedsPurge: false,
    lastGeneratedPassword: null,
    memorableSeparator: "-",
    reducedMotion: false,
    lastRandomSize: 20,
    lastMemorableWords: 3,
    lastPinSize: 6,
    batteryIdleTimeout: null,
    feedbackInterval: null,
    aboutOpenedFromSettings: false,
    confirmCallback: null,
    dictionaryType: 'BIP-39 EN',
    minEntropy: 'OFF',
    hexOnlyMode: false,
    audioSynthType: 'WOOD TAP',
    hapticForce: 'MEDIUM',
    oledContrast: 'HIGH',
    oledRenderMode: 'OFF',
    specularHover: false,
    bgStyle: 'DOTS'
};



function resetIdleTimer() {
    if (state.batteryIdleTimeout) {
        clearTimeout(state.batteryIdleTimeout);
        state.batteryIdleTimeout = null;
    }
    
    document.body.classList.remove('device-sleeping');
    
    // Only sleep on battery power after 15 seconds of inactivity
    if (!state.cableConnected && state.deviceOn) {
        state.batteryIdleTimeout = setTimeout(() => {
            if (state.deviceOn && !state.cableConnected) {
                document.body.classList.add('device-sleeping');
            }
        }, 15000);
    }
}

// Wake up or reset sleep timer on any physical user interaction
['pointerdown', 'keydown', 'input'].forEach(eventType => {
    window.addEventListener(eventType, () => {
        resetIdleTimer();
    });
});

function toggleCable() {
    const el = document.getElementById('cable-and-plug');
    if (!el) return;
    
    state.cableConnected = !state.cableConnected;
    
    if (!state.cableConnected) {
        document.body.classList.add('battery-mode');
        addPasswordToHistory("[PWR.BATT]: External grid lost. Switching to internal cells.");
    } else {
        document.body.classList.remove('battery-mode');
        addPasswordToHistory("[PWR.CHRG]: USB-C power source connected.");
    }

    if (!state.cableConnected) {
        el.classList.add('disconnected');
    } else {
        el.classList.remove('disconnected');
    }
    
    if (typeof audio !== 'undefined') {
        audio.playToggle();
    }
    
    if (typeof oledDisplay !== 'undefined' && oledDisplay) {
        oledDisplay.needsRedraw = true;
        if (!oledDisplay.isRunning) {
            oledDisplay.isRunning = true;
            oledDisplay.animate();
        }
    }
    
    resetIdleTimer();
}

// OLED CANVAS ANIMATION LOOP
class OLEDDisplay {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        
        this.time = 0;
        this.state = 'idle'; // 'idle', 'copied'
        this.entropyScore = 80;
        
        // Dynamic interpolations for smooth animations
        this.amplitude = 12;
        this.frequency = 0.05;
        this.noise = 0.1;
        this.harmonic = 2;
        
        this.targetAmplitude = 12;
        this.targetFrequency = 0.05;
        this.targetNoise = 0.08;
        this.targetHarmonic = 2;

        this.copiedAnimTimer = 0;
        this.isRunning = false;
        this.needsRedraw = true;
        
        this.resize();
        window.addEventListener('resize', () => { this.resize(); this.needsRedraw = true; this.start(); });
        
        this.animate = this.animate.bind(this);
        this.start();
    }
    
    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            requestAnimationFrame(this.animate);
        }
    }
    
    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        const cssWidth = Math.floor(rect.width);
        const cssHeight = Math.floor(rect.height);
        
        this.dpr = dpr;
        
        this.canvas.width = cssWidth * dpr;
        this.canvas.height = cssHeight * dpr;
        
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;
        
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // reset before scaling
        this.ctx.scale(dpr, dpr);
        
        this.width = cssWidth;
        this.height = cssHeight;
    }
    
    setStrength(score) {
        this.entropyScore = score;
        if (score < 30) {
            this.targetAmplitude = 4;
            this.targetFrequency = 0.01;
            this.targetNoise = 1.3;
            this.targetHarmonic = 1;
        } else if (score < 55) {
            this.targetAmplitude = 8;
            this.targetFrequency = 0.03;
            this.targetNoise = 0.55;
            this.targetHarmonic = 1;
        } else if (score < 75) {
            this.targetAmplitude = 12;
            this.targetFrequency = 0.055;
            this.targetNoise = 0.08;
            this.targetHarmonic = 2;
        } else if (score < 100) {
            this.targetAmplitude = 16;
            this.targetFrequency = 0.09;
            this.targetNoise = 0.01;
            this.targetHarmonic = 3;
        } else {
            this.targetAmplitude = 20;
            this.targetFrequency = 0.16;
            this.targetNoise = 0.0;
            this.targetHarmonic = 5;
        }
        this.needsRedraw = true;
        this.start();
    }
    
    triggerGenerate() {
        this.state = 'idle';
        this.amplitude = this.targetAmplitude + 10;
        this.noise = 0.45;
        this.updateDOM();
        this.needsRedraw = true;
        this.start();
    }
    
    triggerCopied() {
        this.state = 'copied';
        this.updateDOM();
        this.needsRedraw = true;
        this.start();
    }
    
    triggerPurged() {
        this.state = 'purged';
        this.updateDOM();
        this.needsRedraw = true;
        this.start();
    }
    
    triggerIdle() {
        this.state = 'idle';
        this.updateDOM();
        this.needsRedraw = true;
        this.start();
    }
    
    updateDOM() {
        const modeEl = document.getElementById('oled-mode');
        const entrEl = document.getElementById('oled-entr');
        const strengthWrapper = document.getElementById('strength-wrapper') || document.querySelector('.strength-wrapper');
        const successEl = document.getElementById('oled-success');
        
        if (successEl) {
            successEl.style.display = 'none';
        }
        
        if (modeEl) {
            const newMode = state.cableConnected ? "MODE: CHRG" : "MODE: BATT";
            if (modeEl.textContent !== newMode) modeEl.textContent = newMode;
            modeEl.style.opacity = '1';
        }
        if (entrEl) {
            let newEntr = "";
            if (this.state === 'copied' || this.state === 'purged') {
                newEntr = "CRYPTO: ---";
            } else {
                newEntr = "CRYPTO: " + Math.round(this.entropyScore) + "-BIT";
            }
            if (entrEl.textContent !== newEntr) entrEl.textContent = newEntr;
            entrEl.style.opacity = '1';
        }
        
        if (this.state === 'copied' || this.state === 'purged') {
            if (strengthWrapper) {
                strengthWrapper.style.opacity = '1'; // Keep visible to show the dashed separator line
                strengthWrapper.classList.add('copied-state');
            }
        } else {
            if (strengthWrapper) {
                strengthWrapper.style.opacity = '1';
                strengthWrapper.classList.remove('copied-state');
            }
        }
    }
    
    animate() {
        if (!this.canvas) return;
        
        const ctx = this.ctx;
        
        // Handle POWER OFF state
        if (!state.deviceOn) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, this.width, this.height);
            this.isRunning = false;
            return;
        }
        
        const renderMode = state.oledRenderMode || 'OFF';
        
        // Completely turn off effects if RENDER is OFF (default)
        if (renderMode === 'OFF') {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, this.width, this.height);
            this.updateDOM();
            this.isRunning = false;
            return;
        }
        
        // Slower time increment (0.015 instead of 0.05) for highly organic and smooth animation
        this.time += 0.015;
        
        // Linear interpolations toward targets
        this.amplitude += (this.targetAmplitude - this.amplitude) * 0.05;
        this.frequency += (this.targetFrequency - this.frequency) * 0.05;
        this.noise += (this.targetNoise - this.noise) * 0.04;
        this.harmonic += (this.targetHarmonic - this.harmonic) * 0.05;
        
        if (renderMode === 'HEX MATRIX') {
            ctx.fillStyle = 'rgba(10, 10, 10, 0.28)';
            ctx.fillRect(0, 0, this.width, this.height);
        } else {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, this.width, this.height);
        }
        
        // Update DOM corner technical statistics
        this.updateDOM();
        
        // DRAWING SEGMENT
        if (renderMode === 'OSCILLOSCOPE') {
            const midY = this.height / 2;
            
            // Wave 1: Dim background wave with organic drift
            ctx.strokeStyle = 'rgba(255, 79, 0, 0.22)';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            for (let x = 0; x < this.width; x++) {
                const angle = (x * this.frequency * 0.7) - this.time * 0.4;
                const drift = Math.sin(this.time * 0.15 + x * 0.005) * 8;
                const noiseOffset = (Math.random() - 0.5) * this.noise * 9;
                const y = midY + Math.sin(angle + drift * 0.05) * (this.amplitude * 0.5) + noiseOffset;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Wave 2: Active foreground wave with compound offsets for organic, non-periodic motion
            ctx.strokeStyle = '#ff4f00';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            for (let x = 0; x < this.width; x++) {
                const angle = (x * this.frequency) + this.time;
                const drift1 = Math.sin(this.time * 0.22 + x * 0.008) * 7;
                const drift2 = Math.cos(this.time * 0.09 - x * 0.003) * 5;
                const noiseOffset = (Math.random() - 0.5) * this.noise * 12;
                const y = midY + Math.sin(angle + drift1 * 0.04) * this.amplitude + Math.cos(angle * this.harmonic + drift2 * 0.04) * (this.amplitude / 3.2) + noiseOffset;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        } else if (renderMode === 'BARGRAPH') {
            const barCount = 24;
            const gap = 3;
            const totalGapWidth = gap * (barCount - 1);
            const barWidth = (this.width - totalGapWidth) / barCount;
            
            // Initialize height registers for slow interpolation
            if (!this.barHeights || this.barHeights.length !== barCount) {
                this.barHeights = Array(barCount).fill(0);
                this.barTargets = Array(barCount).fill(0);
                this.barNextChange = Array(barCount).fill(0);
            }
            
            ctx.fillStyle = '#ff4f00';
            const now = Date.now();
            for (let i = 0; i < barCount; i++) {
                // If it's time to choose a new target height
                if (!this.barNextChange[i] || now > this.barNextChange[i]) {
                    const maxH = 2 + (this.amplitude * 1.5) * (0.35 + Math.random() * 0.65);
                    this.barTargets[i] = Math.random() * maxH;
                    this.barNextChange[i] = now + 150 + Math.random() * 250;
                }
                
                // Interpolate height towards target slowly for natural bouncing
                const speed = 0.05 + (this.entropyScore / 1500);
                this.barHeights[i] += (this.barTargets[i] - this.barHeights[i]) * speed;
                
                const noiseVal = (Math.random() - 0.5) * (this.noise * 1.5);
                let height = this.barHeights[i] + noiseVal;
                if (height < 2) height = 2;
                if (height > this.height - 8) height = this.height - 8;
                
                const x = i * (barWidth + gap);
                const y = this.height - height;
                ctx.fillRect(x, y, barWidth, height);
                
                // Peak indicator dot
                ctx.fillStyle = 'rgba(255, 79, 0, 0.4)';
                ctx.fillRect(x, y - 4, barWidth, 1.5);
                ctx.fillStyle = '#ff4f00';
            }
        } else if (renderMode === 'HEX MATRIX') {
            const cols = Math.floor(this.width / 10); // Denser column placement
            if (!this.matrixY || this.matrixY.length !== cols) {
                this.matrixY = [];
                for (let i = 0; i < cols; i++) {
                    this.matrixY.push(Math.random() * -this.height);
                }
            }
            
            ctx.font = '700 9px "Fira Code", monospace';
            const chars = '0123456789ABCDEF';
            
            for (let i = 0; i < cols; i++) {
                const x = i * 10;
                const y = this.matrixY[i];
                
                // Draw a cascading trail of characters for rich glow contrails
                const trailLength = 6;
                for (let j = 0; j < trailLength; j++) {
                    const charY = y - (j * 11); // spacing between characters in trail
                    
                    // Don't draw outside visible bounds
                    if (charY < 0 || charY > this.height) continue;
                    
                    if (j === 0) {
                        // The leading character is bright, glowing white/light green
                        ctx.fillStyle = '#ffffff';
                    } else {
                        // Trail characters fade out into deep green contrails
                        const alpha = (1 - (j / trailLength)).toFixed(2);
                        ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
                    }
                    
                    // Use a stable random char for each step in the trail
                    const charIndex = (Math.floor(y / 11) - j + i) % chars.length;
                    const char = chars.charAt((charIndex >= 0 ? charIndex : chars.length + charIndex));
                    ctx.fillText(char, x, charY);
                }
                
                // Faster falling speed (0.8px to 2.2px per frame) depending on entropy
                const speed = 0.8 + (this.entropyScore / 100) * 1.0 + Math.random() * 0.4;
                this.matrixY[i] += speed;
                
                // Reset column if it falls below screen and the entire trail is gone
                if (this.matrixY[i] > this.height + (trailLength * 11)) {
                    this.matrixY[i] = Math.random() * -60;
                }
            }
        }
        
        requestAnimationFrame(this.animate);
    }
}

// SYNTHESIZED PROCEDURAL SOUND GENERATOR (WEB AUDIO API)
class TEAudio {
    constructor() {
        this.ctx = null;
    }
    
    init() {
        this.initContext();
    }
    
    initContext() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    runWithActiveContext(callback) {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
            }
        }
        if (!this.ctx) return;

        if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                if (this.ctx.state === 'running') {
                    callback();
                }
            }).catch(e => {
                console.error("Audio resume failed:", e);
            });
        } else if (this.ctx.state === 'resuming') {
            setTimeout(() => {
                if (this.ctx.state === 'running') {
                    callback();
                }
            }, 30);
        } else {
            callback();
        }
    }
    
    playClick() {
        if (!state.deviceOn || state.systemMuted) return;
        this.runWithActiveContext(() => {
            const now = this.ctx.currentTime;
            const synthType = state.audioSynthType || 'WOOD TAP';

            if (synthType === 'NOISE POP') {
                // Procedural white noise pop
                const bufferSize = this.ctx.sampleRate * 0.02; // 20ms burst
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
                const noiseNode = this.ctx.createBufferSource();
                noiseNode.buffer = buffer;

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(1000, now);
                filter.Q.setValueAtTime(2.0, now);

                const gain = this.ctx.createGain();
                // Smooth attack envelope
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.12, now + 0.002);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

                noiseNode.connect(filter);
                filter.connect(gain);
                gain.connect(this.ctx.destination);

                noiseNode.start(now);
                noiseNode.stop(now + 0.025);
            } else {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                if (synthType === 'SINE CLICK') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(2200, now);
                    osc.frequency.exponentialRampToValueAtTime(1000, now + 0.015);
                    // Smooth attack envelope
                    gain.gain.setValueAtTime(0, now);
                    gain.gain.linearRampToValueAtTime(0.1, now + 0.002);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
                    osc.start(now);
                    osc.stop(now + 0.02);
                } else if (synthType === 'CHIPY BEEP') {
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(800, now);
                    osc.frequency.exponentialRampToValueAtTime(300, now + 0.06);
                    // Smooth attack envelope
                    gain.gain.setValueAtTime(0, now);
                    gain.gain.linearRampToValueAtTime(0.05, now + 0.002);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                    osc.start(now);
                    osc.stop(now + 0.07);
                } else {
                    // WOOD TAP (default)
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(400, now);
                    osc.frequency.exponentialRampToValueAtTime(60, now + 0.04);
                    // Smooth attack envelope
                    gain.gain.setValueAtTime(0, now);
                    gain.gain.linearRampToValueAtTime(0.18, now + 0.002);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
                    osc.start(now);
                    osc.stop(now + 0.05);
                }

                osc.connect(gain);
                gain.connect(this.ctx.destination);
            }
        });
    }
    
    playKnobTick() {
        if (!state.deviceOn || state.systemMuted) return;
        this.runWithActiveContext(() => {
            const now = this.ctx.currentTime;
            
            // Very short high frequency tick for slider
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(3000, now);
            osc.frequency.exponentialRampToValueAtTime(1500, now + 0.008);
            
            // Smooth attack envelope
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.001);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.008);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(now);
            osc.stop(now + 0.01);
        });
    }
    
    playSuccess(score) {
        if (!state.deviceOn || state.systemMuted) return;
        this.runWithActiveContext(() => {
            const now = this.ctx.currentTime;
            
            // Success melody chime that varies with password score
            const notes = [];
            if (score < 30) {
                // Sad beep (low strength)
                notes.push({ freq: 220, duration: 0.12, delay: 0 });
                notes.push({ freq: 180, duration: 0.2, delay: 0.14 });
            } else if (score < 55) {
                // Neutral beep (low-medium strength)
                notes.push({ freq: 330, duration: 0.1, delay: 0 });
                notes.push({ freq: 440, duration: 0.15, delay: 0.12 });
            } else if (score < 75) {
                // Good ascending melody (medium strength)
                notes.push({ freq: 523.25, duration: 0.08, delay: 0 }); // C5
                notes.push({ freq: 659.25, duration: 0.08, delay: 0.09 }); // E5
                notes.push({ freq: 783.99, duration: 0.15, delay: 0.18 }); // G5
            } else if (score < 100) {
                // High-security ascending chord
                notes.push({ freq: 587.33, duration: 0.07, delay: 0 }); // D5
                notes.push({ freq: 783.99, duration: 0.07, delay: 0.08 }); // G5
                notes.push({ freq: 987.77, duration: 0.07, delay: 0.16 }); // B5
                notes.push({ freq: 1174.66, duration: 0.15, delay: 0.24 }); // D6
            } else {
                // Max-security premium pentatonic chime
                notes.push({ freq: 523.25, duration: 0.06, delay: 0 }); // C5
                notes.push({ freq: 659.25, duration: 0.06, delay: 0.07 }); // E5
                notes.push({ freq: 783.99, duration: 0.06, delay: 0.14 }); // G5
                notes.push({ freq: 1046.50, duration: 0.06, delay: 0.21 }); // C6
                notes.push({ freq: 1318.51, duration: 0.2, delay: 0.28 }); // E6
            }
            
            notes.forEach(note => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(note.freq, now + note.delay);
                
                gain.gain.setValueAtTime(0.0, now + note.delay);
                gain.gain.linearRampToValueAtTime(0.08, now + note.delay + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.001, now + note.delay + note.duration);
                
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                
                osc.start(now + note.delay);
                osc.stop(now + note.delay + note.duration + 0.02);
            });
        });
    }
    
    playToggle() {
        if (state.systemMuted) return;
        this.runWithActiveContext(() => {
            const now = this.ctx.currentTime;
            
            // Mechanical slide contact clicks (double click-clack pop)
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(180, now);
            osc1.frequency.linearRampToValueAtTime(80, now + 0.015);
            
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(600, now + 0.012);
            osc2.frequency.linearRampToValueAtTime(200, now + 0.025);
            
            // Smooth transitions
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.002);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.011);
            gain.gain.linearRampToValueAtTime(0.15, now + 0.013);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
            
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc1.start(now);
            osc2.start(now + 0.012);
            
            osc1.stop(now + 0.04);
            osc2.stop(now + 0.04);
        });
    }
}

const audio = new TEAudio();
let oledDisplay;

// SYSTEM POWER CONTROLLER
function togglePower(onPowerUpCallback) {
    state.deviceOn = !state.deviceOn;
    
    const container = document.querySelector('.container');
    const knob = document.getElementById('power-knob');
    const powerSwitch = document.getElementById('device-power-switch');
    
    // Play hardware switch sound if audio system is ready
    try { audio.playToggle(); } catch(e){}
    
    if (powerSwitch) {
        powerSwitch.setAttribute('aria-pressed', state.deviceOn ? 'true' : 'false');
    }
    
    if (!state.deviceOn) {
        // Power Down
        addPasswordToHistory("[PWR.OFF]: System powered down. Standby mode active.");
        document.body.classList.add('power-off');
        container.classList.add('device-off');
        knob.classList.add('off');
        
        // Reset Strength fill
        document.getElementById("strength-fill").style.width = "0%";
        document.getElementById("strength-fill").setAttribute("aria-valuenow", "0");
        if (oledDisplay) { oledDisplay.needsRedraw = true; oledDisplay.start(); }

        // Clear battery idle sleep states on power down
        if (state.batteryIdleTimeout) {
            clearTimeout(state.batteryIdleTimeout);
            state.batteryIdleTimeout = null;
        }
        document.body.classList.remove('device-sleeping');
        
        if (state.feedbackInterval) {
            clearInterval(state.feedbackInterval);
            state.feedbackInterval = null;
        }
    } else {
        // Power Up (Boot)
        addPasswordToHistory("[PWR.ON]: System powered up. Ready.");
        document.body.classList.remove('power-off');
        document.body.classList.add('device-booting');
        container.classList.remove('device-off');
        knob.classList.remove('off');
        
        const miniBoot = document.getElementById('oled-mini-boot');
        const miniLog = document.getElementById('oled-mini-log');
        
        if (miniBoot && miniLog) {
            playMiniBoot(() => {
                document.body.classList.remove('device-booting');
                if (onPowerUpCallback && typeof onPowerUpCallback === 'function') onPowerUpCallback();
                else generatePassword(true);
                resetIdleTimer();
            });
        } else {
            document.body.classList.remove('device-booting');
            if (onPowerUpCallback && typeof onPowerUpCallback === 'function') onPowerUpCallback();
            else generatePassword(true);
            resetIdleTimer();
        }
    }
}

const randomBtn = document.getElementById("randomMode");
const memorableBtn = document.getElementById("memorableMode");
const pinBtn = document.getElementById("pinMode");

const faderLabel = document.getElementById("fader-label");
const lengthSlider = document.getElementById("length");

function updateCheckboxVisualState() {
    const checkboxes = document.querySelectorAll('.checkbox-grid .custom-checkbox');
    if (state.currentMode === 'numeric') {
        checkboxes.forEach(cb => {
            cb.style.opacity = '0.4';
            cb.style.pointerEvents = 'none';
        });
    } else {
        checkboxes.forEach(cb => {
            cb.style.opacity = '';
            cb.style.pointerEvents = '';
        });
    }
}

function saveActiveModeLength(prevMode) {
    if (prevMode === 'random') {
        state.lastRandomSize = parseInt(lengthSlider.value);
    } else if (prevMode === 'phonetic') {
        state.lastMemorableWords = parseInt(lengthSlider.value);
    } else if (prevMode === 'numeric') {
        state.lastPinSize = parseInt(lengthSlider.value);
    }
}

randomBtn.onclick = () => {
    const prev = state.currentMode;
    state.currentMode = 'random';
    state.memorableMode = false;
    
    randomBtn.classList.add("active");
    memorableBtn.classList.remove("active");
    pinBtn.classList.remove("active");
    
    saveActiveModeLength(prev);
    
    lengthSlider.min = 5;
    lengthSlider.max = 39;
    faderLabel.innerText = "Size";
    setSliderValue(state.lastRandomSize);
    updateCheckboxVisualState();
    
    generatePassword(false);
};

memorableBtn.onclick = () => {
    const prev = state.currentMode;
    state.currentMode = 'phonetic';
    state.memorableMode = true;
    
    memorableBtn.classList.add("active");
    randomBtn.classList.remove("active");
    pinBtn.classList.remove("active");
    
    saveActiveModeLength(prev);
    
    lengthSlider.min = 1;
    lengthSlider.max = 5;
    faderLabel.innerText = "Words";
    setSliderValue(state.lastMemorableWords);
    updateCheckboxVisualState();
    
    generatePassword(false);
};

pinBtn.onclick = () => {
    const prev = state.currentMode;
    state.currentMode = 'numeric';
    state.memorableMode = false;
    
    pinBtn.classList.add("active");
    randomBtn.classList.remove("active");
    memorableBtn.classList.remove("active");
    
    saveActiveModeLength(prev);
    
    lengthSlider.min = 4;
    lengthSlider.max = 12;
    faderLabel.innerText = "Digits";
    setSliderValue(state.lastPinSize);
    updateCheckboxVisualState();
    
    generatePassword(false);
};

function updateLengthSlider(val) {
    document.getElementById("length-num").textContent = val;
}

function setSliderValue(val) {
    const fader = document.getElementById("length");
    if (!fader) return;
    fader.value = val;
    fader.dataset.lastVal = val;
    updateLengthSlider(val);
    
    // Synchronize mode specific state memories in real-time
    if (state.currentMode === 'random') {
        state.lastRandomSize = val;
    } else if (state.memorableMode) {
        state.lastMemorableWords = val;
    } else if (state.currentMode === 'numeric') {
        state.lastPinSize = val;
    }
}

// SETUP MECHANICAL FADER SLIDER CONTROL
function setupFader() {
    const fader = document.getElementById('length');
    if (!fader) return;

    fader.dataset.lastVal = fader.value;
    let debounceTimer = null;

    fader.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        const lastVal = parseInt(fader.dataset.lastVal || 0);
        if (val !== lastVal) {
            fader.dataset.lastVal = val;
            updateLengthSlider(val);
            audio.playKnobTick();
            clearActivePresets();
            
            // Keep state memories in sync
            if (state.currentMode === 'random') {
                state.lastRandomSize = val;
            } else if (state.memorableMode) {
                state.lastMemorableWords = val;
            } else if (state.currentMode === 'numeric') {
                state.lastPinSize = val;
            }
            saveSettings();
            
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                generatePassword(false);
            }, 60);
        }
    });

    fader.addEventListener('mousedown', () => audio.init());
    fader.addEventListener('touchstart', () => audio.init());
}

function getRandomInt(max) {
    if (max <= 0) return 0;
    const limit = 4294967296 - (4294967296 % max);
    const randomBuffer = new Uint32Array(1);
    while (true) {
        window.crypto.getRandomValues(randomBuffer);
        const val = randomBuffer[0];
        if (val < limit) {
            return val % max;
        }
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = getRandomInt(i + 1);
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

function getRandomChar(chars) {
    if (!chars || chars.length === 0) return "";
    return chars[getRandomInt(chars.length)];
}

function getRandomRoll() {
    return getRandomInt(100);
}

// RESTORE INITIAL PRESETS ON INPUT CHANGE
function clearActivePresets() {
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    updatePresetDescriptions();
}

function updatePresetDescriptions() {
    const descDefault = document.getElementById("desc-default");
    const descSecurity = document.getElementById("desc-security");
    const descCompat = document.getElementById("desc-compat");
    const descCustom = document.getElementById("desc-custom");
    if (!descDefault || !descSecurity || !descCompat || !descCustom) return;

    descDefault.style.display = "none";
    descSecurity.style.display = "none";
    descCompat.style.display = "none";
    descCustom.style.display = "none";

    if (document.getElementById("preset-default")?.classList.contains("active")) {
        descDefault.style.display = "flex";
    } else if (document.getElementById("preset-security")?.classList.contains("active")) {
        descSecurity.style.display = "flex";
    } else if (document.getElementById("preset-compat")?.classList.contains("active")) {
        descCompat.style.display = "flex";
    } else {
        descCustom.style.display = "flex";
    }
}

function applyPreset(type) {
    const btnId = 'preset-' + (type === 'default' ? 'default' : (type === 'security' ? 'security' : 'compat'));
    const btn = document.getElementById(btnId);
    if (btn && btn.classList.contains('active')) {
        btn.classList.remove('active');
        updatePresetDescriptions();
        return;
    }

    const excludeAmbiguous = document.getElementById("excludeAmbiguous");
    const noDuplicates = document.getElementById("noDuplicates");
    const excludedChars = document.getElementById("excludedChars");
    const lowercase = document.getElementById("lowercase");
    const uppercase = document.getElementById("uppercase");
    const numbers = document.getElementById("numbers");
    const symbols = document.getElementById("symbols");
    const lengthInput = document.getElementById("length");

    clearActivePresets();

    const hexOnlyModeCheckbox = document.getElementById("hexOnlyMode");
    if (hexOnlyModeCheckbox) {
        hexOnlyModeCheckbox.checked = false;
        state.hexOnlyMode = false;
        updateHexOnlyUI();
    }

    if (state.currentMode === 'numeric') {
        state.currentMode = 'random';
        state.memorableMode = false;
        const randomBtn = document.getElementById("randomMode");
        const pinBtn = document.getElementById("pinMode");
        const faderLabel = document.getElementById("fader-label");
        if (randomBtn) randomBtn.classList.add("active");
        if (pinBtn) pinBtn.classList.remove("active");
        if (lengthInput) {
            lengthInput.min = 5;
            lengthInput.max = 39;
        }
        if (faderLabel) faderLabel.innerText = "Size";
        updateCheckboxVisualState();
    }

    if (type === 'default') {
        excludeAmbiguous.checked = true;
        noDuplicates.checked = false;
        excludedChars.value = "";
        lowercase.checked = true;
        uppercase.checked = true;
        numbers.checked = true;
        symbols.checked = true;
        let val = state.memorableMode ? 3 : 20;
        setSliderValue(val);
        document.getElementById('preset-default').classList.add('active');
    }
    else if (type === 'security') {
        excludeAmbiguous.checked = false;
        noDuplicates.checked = false;
        excludedChars.value = "";
        lowercase.checked = true;
        uppercase.checked = true;
        numbers.checked = true;
        symbols.checked = true;
        let val = state.memorableMode ? 5 : 24;
        setSliderValue(val);
        document.getElementById('preset-security').classList.add('active');
    }
    else if (type === 'compat') {
        excludeAmbiguous.checked = true;
        noDuplicates.checked = true;
        excludedChars.value = "'\"`´, ._&*<>=";
        lowercase.checked = true;
        uppercase.checked = true;
        numbers.checked = true;
        symbols.checked = false;
        let val = state.memorableMode ? 3 : 20;
        setSliderValue(val);
        document.getElementById('preset-compat').classList.add('active');
    }
    
    generatePassword(false);
    updatePresetDescriptions();
}

function saveSettings() {
    try {
        const settings = {
            version: 2,
            mode: state.currentMode,
            length: document.getElementById("length").value,
            uppercase: document.getElementById("uppercase").checked,
            lowercase: document.getElementById("lowercase").checked,
            numbers: document.getElementById("numbers").checked,
            symbols: document.getElementById("symbols").checked,
            excludeAmbiguous: document.getElementById("excludeAmbiguous").checked,
            noDuplicates: document.getElementById("noDuplicates").checked,
            excludedChars: document.getElementById("excludedChars").value,
            darkMode: document.getElementById("darkMode").checked,
            muteAudio: document.getElementById("muteAudio").checked,
            memorableSeparator: state.memorableSeparator,
            dictionaryType: state.dictionaryType,
            minEntropy: state.minEntropy,
            hexOnlyMode: document.getElementById("hexOnlyMode").checked,
            audioSynthType: state.audioSynthType,
            hapticForce: state.hapticForce,
            oledContrast: state.oledContrast,
            oledRenderMode: state.oledRenderMode,
            specularHover: document.getElementById("specularHover") ? document.getElementById("specularHover").checked : false,
            bgStyle: state.bgStyle
        };
        localStorage.setItem("kb_settings", JSON.stringify(settings));
    } catch (e) {
        console.error("Failed to save settings to localStorage:", e);
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem("kb_settings");
        if (!saved) {
            // Check device/OS dark mode preference, fallback to light mode
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.getElementById("darkMode").checked = prefersDark;
            if (prefersDark) {
                document.documentElement.classList.add("dark-theme");
                document.body.classList.add("dark-theme");
            } else {
                document.documentElement.classList.remove("dark-theme");
                document.body.classList.remove("dark-theme");
            }
            updateThemeColorMeta(prefersDark);
            
            state.specularHover = false;
            const specHoverCheckbox = document.getElementById("specularHover");
            if (specHoverCheckbox) {
                specHoverCheckbox.checked = false;
            }
            updateSpecularHoverClass();
            
            state.bgStyle = 'DOTS';
            applyBgStyle();
            
            updateCyclerButtonsUI();
            applyOledContrast();
            updateHexOnlyUI();
            return false;
        }
        const settings = JSON.parse(saved);
        
        // Version Check
        if (!settings || !settings.version || settings.version < 2) {
            localStorage.removeItem('kb_settings');
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.getElementById("darkMode").checked = prefersDark;
            if (prefersDark) {
                document.documentElement.classList.add("dark-theme");
                document.body.classList.add("dark-theme");
            } else {
                document.documentElement.classList.remove("dark-theme");
                document.body.classList.remove("dark-theme");
            }
            updateThemeColorMeta(prefersDark);
            
            state.specularHover = false;
            const specHoverCheckbox = document.getElementById("specularHover");
            if (specHoverCheckbox) {
                specHoverCheckbox.checked = false;
            }
            updateSpecularHoverClass();
            
            state.bgStyle = 'DOTS';
            applyBgStyle();
            
            updateCyclerButtonsUI();
            applyOledContrast();
            updateHexOnlyUI();
            return false;
        }
        
        const lengthInput = document.getElementById("length");
        let loadedLength = settings.length;
        document.getElementById("uppercase").checked = settings.uppercase !== false;
        document.getElementById("lowercase").checked = settings.lowercase !== false;
        document.getElementById("numbers").checked = settings.numbers !== false;
        document.getElementById("symbols").checked = settings.symbols !== false;
        
        document.getElementById("excludeAmbiguous").checked = settings.excludeAmbiguous !== false;
        document.getElementById("noDuplicates").checked = settings.noDuplicates === true;
        document.getElementById("excludedChars").value = settings.excludedChars || "";
        
        const darkActive = settings.darkMode === true;
        document.getElementById("darkMode").checked = darkActive;
        
        state.systemMuted = settings.muteAudio === true;
        document.getElementById("muteAudio").checked = state.systemMuted;
        if (darkActive) {
            document.documentElement.classList.add("dark-theme");
            document.body.classList.add("dark-theme");
        } else {
            document.documentElement.classList.remove("dark-theme");
            document.body.classList.remove("dark-theme");
        }
        updateThemeColorMeta(darkActive);
        
        state.memorableSeparator = settings.memorableSeparator || "-";
        updateSeparatorButtonsUI();
        
        // Load new settings parameters
        state.dictionaryType = settings.dictionaryType || 'BIP-39 EN';
        state.minEntropy = settings.minEntropy || 'OFF';
        state.hexOnlyMode = settings.hexOnlyMode === true;
        document.getElementById("hexOnlyMode").checked = state.hexOnlyMode;
        
        state.audioSynthType = settings.audioSynthType || 'WOOD TAP';
        state.hapticForce = settings.hapticForce || 'MEDIUM';
        state.oledContrast = settings.oledContrast || 'HIGH';
        state.oledRenderMode = settings.oledRenderMode || 'OFF';
        state.specularHover = settings.specularHover === true;
        state.bgStyle = settings.bgStyle || 'DOTS';
        applyBgStyle();
        const specHoverCheckbox = document.getElementById("specularHover");
        if (specHoverCheckbox) {
            specHoverCheckbox.checked = state.specularHover;
        }
        updateSpecularHoverClass();
        
        state.currentMode = settings.mode || 'random';
        state.memorableMode = (state.currentMode === 'phonetic');
        
        const randomBtn = document.getElementById("randomMode");
        const memorableBtn = document.getElementById("memorableMode");
        const pinBtn = document.getElementById("pinMode");
        const faderLabel = document.getElementById("fader-label");
        
        randomBtn.classList.remove("active");
        memorableBtn.classList.remove("active");
        pinBtn.classList.remove("active");
        
        if (state.currentMode === 'phonetic') {
            memorableBtn.classList.add("active");
            lengthInput.min = 1;
            lengthInput.max = 5;
            faderLabel.innerText = "Words";
            setSliderValue(loadedLength || 3);
        } else if (state.currentMode === 'numeric') {
            pinBtn.classList.add("active");
            lengthInput.min = 4;
            lengthInput.max = 12;
            faderLabel.innerText = "Digits";
            setSliderValue(loadedLength || 6);
        } else {
            randomBtn.classList.add("active");
            lengthInput.min = 5;
            lengthInput.max = 39;
            faderLabel.innerText = "Size";
            setSliderValue(loadedLength || 20);
        }
        updateCheckboxVisualState();
        
        updateCyclerButtonsUI();
        applyOledContrast();
        updateHexOnlyUI();
        return true;
    } catch (e) {
        console.error("Failed to load settings from localStorage:", e);
        return false;
    }
}

function updateThemeColorMeta(isDark) {
    const themeColor = isDark ? '#0a0b0d' : '#d3d1cb';
    const metaTag = document.getElementById("theme-color-meta");
    if (metaTag) {
        metaTag.setAttribute("content", themeColor);
    }
}

function updateSpecularHoverClass() {
    if (state.specularHover) {
        document.body.classList.add("has-specular-hover");
    } else {
        document.body.classList.remove("has-specular-hover");
    }
}

function applyBgStyle() {
    document.body.classList.remove('bg-grid', 'bg-solid');
    if (state.bgStyle === 'GRID') {
        document.body.classList.add('bg-grid');
    } else if (state.bgStyle === 'SOLID') {
        document.body.classList.add('bg-solid');
    }
}

function updateSeparatorButtonsUI() {
    document.querySelectorAll('.separator-btn').forEach(btn => {
        if (btn.getAttribute('data-sep') === state.memorableSeparator) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function updateCyclerButtonsUI() {
    const dictBtn = document.getElementById("btn-cycle-dictionary");
    if (dictBtn) dictBtn.textContent = `DICT: ${state.dictionaryType}`;

    const entropyBtn = document.getElementById("btn-cycle-entropy");
    if (entropyBtn) entropyBtn.textContent = `MIN. ENTROPY: ${state.minEntropy}`;

    const synthBtn = document.getElementById("btn-cycle-synth");
    if (synthBtn) synthBtn.textContent = `SYNTH: ${state.audioSynthType}`;

    const hapticBtn = document.getElementById("btn-cycle-haptic");
    if (hapticBtn) hapticBtn.textContent = `HAPTIC: ${state.hapticForce}`;

    const contrastBtn = document.getElementById("btn-cycle-contrast");
    if (contrastBtn) contrastBtn.textContent = `CONTRAST: ${state.oledContrast}`;

    const renderBtn = document.getElementById("btn-cycle-render");
    if (renderBtn) renderBtn.textContent = `RENDER: ${state.oledRenderMode}`;

    const bgStyleBtn = document.getElementById("btn-cycle-bgstyle");
    if (bgStyleBtn) bgStyleBtn.textContent = `BG: ${state.bgStyle}`;
}

function applyOledContrast() {
    const canvas = document.getElementById("oled-canvas");
    if (!canvas) return;
    const contrast = state.oledContrast || 'HIGH';
    let opacity = 0.22;
    if (contrast === 'ECO') opacity = 0.05;
    else if (contrast === 'MED') opacity = 0.12;
    canvas.style.opacity = opacity;
}

function updateHexOnlyUI() {
    const hexActive = document.getElementById("hexOnlyMode") ? document.getElementById("hexOnlyMode").checked : false;
    
    const cbUppercase = document.getElementById("uppercase");
    const cbLowercase = document.getElementById("lowercase");
    const cbNumbers = document.getElementById("numbers");
    const cbSymbols = document.getElementById("symbols");
    
    if (cbUppercase && cbLowercase && cbNumbers && cbSymbols) {
        if (hexActive) {
            cbUppercase.disabled = true;
            cbLowercase.disabled = true;
            cbNumbers.disabled = true;
            cbSymbols.disabled = true;
            
            cbUppercase.closest('label').classList.add('disabled-toggle');
            cbLowercase.closest('label').classList.add('disabled-toggle');
            cbNumbers.closest('label').classList.add('disabled-toggle');
            cbSymbols.closest('label').classList.add('disabled-toggle');
        } else {
            cbUppercase.disabled = false;
            cbLowercase.disabled = false;
            cbNumbers.disabled = false;
            cbSymbols.disabled = false;
            
            cbUppercase.closest('label').classList.remove('disabled-toggle');
            cbLowercase.closest('label').classList.remove('disabled-toggle');
            cbNumbers.closest('label').classList.remove('disabled-toggle');
            cbSymbols.closest('label').classList.remove('disabled-toggle');
        }
    }
}
function setupOptionCyclers() {
    const cycleChoices = {
        dictionaryType: ['BIP-39 EN', 'EFF SHORT'],
        minEntropy: ['OFF', '60 BITS', '80 BITS', '128 BITS'],
        audioSynthType: ['WOOD TAP', 'SINE CLICK', 'CHIPY BEEP', 'NOISE POP'],
        hapticForce: ['OFF', 'SOFT', 'MEDIUM', 'STRONG'],
        oledContrast: ['ECO', 'MED', 'HIGH'],
        oledRenderMode: ['OFF', 'OSCILLOSCOPE', 'BARGRAPH', 'HEX MATRIX'],
        bgStyle: ['DOTS', 'GRID', 'SOLID']
    };

    document.querySelectorAll('.te-cycle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const prop = btn.getAttribute('data-prop');
            if (!prop || !cycleChoices[prop]) return;

            const choices = cycleChoices[prop];
            const currentVal = state[prop];
            let idx = choices.indexOf(currentVal);
            if (idx === -1) idx = choices.indexOf(choices[0]);

            const nextIdx = (idx + 1) % choices.length;
            const nextVal = choices[nextIdx];
            state[prop] = nextVal;

            // Trigger audio and haptic manually
            audio.playClick();
            triggerHaptic(12);

            // Update label
            updateCyclerButtonsUI();

            // Handle side effects
            if (prop === 'oledContrast') {
                applyOledContrast();
            } else if (prop === 'oledRenderMode') {
                if (oledDisplay) {
                    oledDisplay.needsRedraw = true;
                    oledDisplay.start();
                }
            } else if (prop === 'bgStyle') {
                applyBgStyle();
            }

            saveSettings();
            generatePassword(false);
        });
    });
}

function showConfirm(callback) {
    state.confirmCallback = callback;
    const confirmModal = document.getElementById('confirm-popup');
    if (confirmModal) {
        confirmModal.classList.add('active');
        document.body.classList.add('modal-open');
        try { audio.playClick(); } catch(e){}
    }
}

function hideConfirm() {
    const confirmModal = document.getElementById('confirm-popup');
    if (confirmModal) {
        confirmModal.classList.add('closing');
        confirmModal.classList.remove('active');
        setTimeout(() => {
            confirmModal.classList.remove('closing');
        }, 200);
        
        setTimeout(() => {
            if (!document.querySelector('.modal-overlay.active')) {
                document.body.classList.remove('modal-open');
            }
        }, 200);
    }
}

function resetToFactoryDefaults() {
    showConfirm(() => {
        try {
            localStorage.removeItem("kb_settings");
        } catch (e) {
            console.error(e);
        }
        
        try {
            sessionStorage.removeItem("kb_tempPass");
            sessionStorage.removeItem("kb_skipBoot");
        } catch (e) {}
        
        // Reload completely to wipe all state
        window.location.reload();
    });
}

function updateSessionHistoryUI() {
    const container = document.getElementById("session-log-container");
    if (!container) return;
    
    let history = [];
    try {
        const saved = sessionStorage.getItem("kb_history");
        if (saved) {
            history = JSON.parse(saved);
        }
    } catch (e) {
        console.error("Failed to parse session history:", e);
    }
    
    container.innerHTML = "";
    
    if (history.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.style.color = "var(--text-muted)";
        emptyDiv.style.fontStyle = "italic";
        emptyDiv.textContent = "No keys logged in session";
        container.appendChild(emptyDiv);
        return;
    }
    
    history.forEach(pwd => {
        const entryDiv = document.createElement("div");
        entryDiv.className = "session-log-entry";
        entryDiv.style.display = "flex";
        entryDiv.style.justifyContent = "space-between";
        entryDiv.style.alignItems = "center";
        entryDiv.style.padding = "4px 0";
        entryDiv.style.borderBottom = "1px dashed rgba(255,255,255,0.05)";
        
        const isEvent = pwd.startsWith('[');
        
        const textSpan = document.createElement("span");
        textSpan.style.fontFamily = "'Fira Code', monospace";
        textSpan.style.fontSize = "0.72rem";
        
        if (isEvent) {
            textSpan.textContent = pwd;
            if (pwd.includes("[SYS.WARN]")) {
                textSpan.className = "log-warn";
            } else if (pwd.includes("[SYS.SAFE]") || pwd.includes("[SYS.BOOT]")) {
                textSpan.className = "log-success";
            } else if (pwd.includes("[PWR.ON]")) {
                textSpan.className = "log-pwr-on";
            } else if (pwd.includes("[PWR.OFF]")) {
                textSpan.className = "log-pwr-off";
            } else if (pwd.includes("[PWR.")) {
                textSpan.className = "log-info";
            } else {
                textSpan.style.color = "var(--text-muted)";
            }
            entryDiv.appendChild(textSpan);
        } else {
            const truncated = pwd.length > 24 ? pwd.substring(0, 24) + "..." : pwd;
            textSpan.style.color = "var(--text-main)";
            textSpan.textContent = `> ${truncated}`;
            
            const copyBtn = document.createElement("button");
            copyBtn.type = "button";
            copyBtn.className = "te-btn-outline";
            copyBtn.style.padding = "2px 6px";
            copyBtn.style.fontSize = "0.65rem";
            copyBtn.style.fontFamily = "'Fira Code', monospace";
            copyBtn.textContent = "[CP]";
            
            copyBtn.addEventListener("click", () => {
                try {
                    if (copyBtn.textContent === "[CLR]") {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText("").catch(err => {
                                console.error("History clipboard clear error:", err);
                            });
                        } else {
                            const textArea = document.createElement("textarea");
                            textArea.value = "";
                            textArea.style.position = "fixed";
                            textArea.style.left = "-9999px";
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                        }
                        copyBtn.textContent = "[CP]";
                        copyBtn.classList.remove("copied-active");
                        audio.playClick();
                    } else {
                        // Revert any other copy button in the log back to [CP]
                        container.querySelectorAll("button.te-btn-outline").forEach(btn => {
                            if (btn !== copyBtn && btn.textContent === "[CLR]") {
                                btn.textContent = "[CP]";
                                btn.classList.remove("copied-active");
                            }
                        });

                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(pwd).catch(err => {
                                                            console.error("History clipboard write error:", err);
                                                        });
                        } else {
                            const textArea = document.createElement("textarea");
                            textArea.value = pwd;
                            textArea.style.position = "fixed";
                            textArea.style.left = "-9999px";
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                        }
                        copyBtn.textContent = "[CLR]";
                        copyBtn.classList.add("copied-active");
                        audio.playClick();
                    }
                } catch (err) {
                    console.error("History copy error:", err);
                }
            });
            
            entryDiv.appendChild(textSpan);
            entryDiv.appendChild(copyBtn);
        }
        container.appendChild(entryDiv);
    });
}

function addPasswordToHistory(pwd) {
    if (!pwd || pwd === "Initialize" || pwd === "Null matrix" || pwd === "Pool Error" || pwd === "COPIED" || pwd === "BUFFER PURGED") return;
    let history = [];
    try {
        const saved = sessionStorage.getItem("kb_history");
        if (saved) {
            history = JSON.parse(saved);
        }
    } catch (e) {}
    
    history.unshift(pwd);
    if (history.length > 10) {
        history = history.slice(0, 10);
    }
    
    try {
        sessionStorage.setItem("kb_history", JSON.stringify(history));
    } catch (e) {}
    
    updateSessionHistoryUI();
}

function generateNumeric(length, noDuplicates, excludeAmbiguous, excludedCharsInput) {
    let numericPool = "0123456789";
    if (excludeAmbiguous) {
        const ambiguous = "ilI1Lo0O";
        numericPool = numericPool.split("").filter(c => !ambiguous.includes(c)).join("");
    }
    if (excludedCharsInput) {
        numericPool = numericPool.split("").filter(c => !excludedCharsInput.includes(c)).join("");
    }
    if (numericPool.length === 0) {
        numericPool = "0123456789";
    }
    
    let pinArray = [];
    for (let i = 0; i < length; i++) {
        pinArray.push(getRandomChar(numericPool));
    }
    
    if (noDuplicates && numericPool.length > 1) {
        let attempts = 0;
        const maxAttempts = 100;
        const hasAdjacentDuplicates = (arr) => {
            for (let i = 0; i < arr.length - 1; i++) {
                if (arr[i] === arr[i + 1]) return true;
            }
            return false;
        };
        while (attempts < maxAttempts) {
            pinArray = [];
            for (let i = 0; i < length; i++) {
                pinArray.push(getRandomChar(numericPool));
            }
            if (!hasAdjacentDuplicates(pinArray)) {
                break;
            }
            attempts++;
        }
    }
    
    return pinArray.join("");
}

function generateHex(length, noDuplicates) {
    const hexChars = "0123456789abcdef";
    let passwordArray = [];
    let attempts = 0;
    const maxAttempts = 100;

    const hasAdjacentDuplicates = (arr) => {
        for (let i = 0; i < arr.length - 1; i++) {
            if (arr[i] === arr[i + 1]) return true;
        }
        return false;
    };

    while (attempts < maxAttempts) {
        passwordArray = [];
        for (let i = 0; i < length; i++) {
            passwordArray.push(getRandomChar(hexChars));
        }
        if (!noDuplicates || !hasAdjacentDuplicates(passwordArray)) {
            break;
        }
        attempts++;
    }
    return passwordArray.join("");
}

function calculateEntropy(password) {
    if (!password || password === "Null matrix" || password === "Pool Error" || password === "Initialize") return 0;
    let poolSize = 0;
    if (/[a-z]/.test(password)) poolSize += 26;
    if (/[A-Z]/.test(password)) poolSize += 26;
    if (/[0-9]/.test(password)) poolSize += 10;
    if (/[^A-Za-z0-9]/.test(password)) poolSize += 33;
    if (poolSize === 0) poolSize = 1;
    return Math.round(password.length * Math.log2(poolSize));
}

function generatePhonetic(length, includeUppercase, includeLowercase, includeNumbers, numberChars) {
    let wordCount = length;
    let chosenWords = [];
    const wordlist = (state.dictionaryType === 'EFF SHORT' && typeof effShortWords !== 'undefined') ? effShortWords : bip39Words;
    for (let i = 0; i < wordCount; i++) {
        chosenWords.push(wordlist[getRandomInt(wordlist.length)]);
    }

    // Apply formatting (CamelCase, lowercase)
    if (includeUppercase && includeLowercase) {
        for (let i = 0; i < chosenWords.length; i++) {
            chosenWords[i] = chosenWords[i].charAt(0).toUpperCase() + chosenWords[i].slice(1).toLowerCase();
        }
    } else if (includeUppercase && !includeLowercase) {
        for (let i = 0; i < chosenWords.length; i++) {
            chosenWords[i] = chosenWords[i].toUpperCase();
        }
    } else if (includeLowercase && !includeUppercase) {
        for (let i = 0; i < chosenWords.length; i++) {
            chosenWords[i] = chosenWords[i].toLowerCase();
        }
    }

    let sep = state.memorableSeparator === "none" ? "" : state.memorableSeparator;
    let baseWord = chosenWords.join(sep);

    // We do not filter characters out of real words in memorable mode
    // because it ruins the words (e.g. "ability" -> "abty" if 'i' and 'l' are filtered)
    // Append numbers if needed and not present
    if (includeNumbers && numberChars.length > 0 && !(/[0-9]/.test(baseWord))) {
        baseWord += getRandomChar(numberChars) + getRandomChar(numberChars);
    }

    return baseWord;
}

function generateRandom(length, lowercaseChars, uppercaseChars, numberChars, symbolChars, noDuplicates, includeLowercase, includeUppercase, includeNumbers, includeSymbols) {
    const activePools = [];
    if (includeLowercase && lowercaseChars.length > 0) activePools.push(lowercaseChars);
    if (includeUppercase && uppercaseChars.length > 0) activePools.push(uppercaseChars);
    if (includeNumbers && numberChars.length > 0) activePools.push(numberChars);
    if (includeSymbols && symbolChars.length > 0) activePools.push(symbolChars);

    if (activePools.length === 0) {
        return "Pool Error";
    }

    const combinedPool = activePools.join("");
    let passwordArray = [];

    const hasAdjacentDuplicates = (arr) => {
        for (let i = 0; i < arr.length - 1; i++) {
            if (arr[i] === arr[i + 1]) return true;
        }
        return false;
    };

    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
        passwordArray = [];
        
        // 1. Add one character from each active pool to guarantee presence
        for (let i = 0; i < activePools.length && passwordArray.length < length; i++) {
            passwordArray.push(getRandomChar(activePools[i]));
        }
        
        // 2. Fill the rest of the password length from the combined pool
        while (passwordArray.length < length) {
            passwordArray.push(getRandomChar(combinedPool));
        }
        
        // 3. Shuffle the array to distribute the guaranteed characters randomly
        shuffleArray(passwordArray);
        
        // 4. If we don't care about adjacent duplicates, or if there are none, we are done
        if (!noDuplicates || !hasAdjacentDuplicates(passwordArray) || combinedPool.length <= 1) {
            break;
        }
        
        attempts++;
    }
    
    return passwordArray.join("");
}

function enforceMinEntropyConstraints() {
    const lengthInput = document.getElementById("length");
    if (!lengthInput) return;

    let threshold = 0;
    if (state.minEntropy === "60 BITS") threshold = 60;
    else if (state.minEntropy === "80 BITS") threshold = 80;
    else if (state.minEntropy === "128 BITS") threshold = 128;

    let defaultMin = 5;
    if (state.currentMode === 'numeric') defaultMin = 4;
    else if (state.memorableMode) defaultMin = 1;

    let defaultMax = 39;
    if (state.currentMode === 'numeric') defaultMax = 12;
    else if (state.memorableMode) defaultMax = 5;

    if (threshold === 0) {
        // Restore defaults
        lengthInput.min = defaultMin;
        lengthInput.max = defaultMax;
        return;
    }

    const excludeAmbiguous = document.getElementById("excludeAmbiguous")?.checked;
    const excludedCharsInput = document.getElementById("excludedChars")?.value;

    // Calculate pool size based on current configuration
    let poolSize = 0;
    if (state.hexOnlyMode) {
        poolSize = 16;
    } else if (state.currentMode === 'numeric') {
        let numericPool = "0123456789";
        if (excludeAmbiguous) {
            const ambiguous = "ilI1Lo0O";
            numericPool = numericPool.split("").filter(c => !ambiguous.includes(c)).join("");
        }
        if (excludedCharsInput) {
            numericPool = numericPool.split("").filter(c => !excludedCharsInput.includes(c)).join("");
        }
        poolSize = numericPool.length || 10;
    } else if (state.memorableMode) {
        const list = (state.dictionaryType === 'EFF SHORT' && typeof effShortWords !== 'undefined') ? effShortWords : bip39Words;
        poolSize = list.length;
    } else {
        // Random mode pool size
        let lowercaseChars = "abcdefghijklmnopqrstuvwxyz";
        let uppercaseChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let numberChars = "0123456789";
        let symbolChars = "!@#$%^&*";

        if (excludeAmbiguous) {
            const ambiguous = "ilI1Lo0O";
            const filterAmbiguous = (str) => str.split("").filter(c => !ambiguous.includes(c)).join("");
            lowercaseChars = filterAmbiguous(lowercaseChars);
            uppercaseChars = filterAmbiguous(uppercaseChars);
            numberChars = filterAmbiguous(numberChars);
            symbolChars = filterAmbiguous(symbolChars);
        }

        if (excludedCharsInput) {
            const filterCustom = (str) => str.split("").filter(c => !excludedCharsInput.includes(c)).join("");
            lowercaseChars = filterCustom(lowercaseChars);
            uppercaseChars = filterCustom(uppercaseChars);
            numberChars = filterCustom(numberChars);
            symbolChars = filterCustom(symbolChars);
        }

        const includeLowercase = document.getElementById("lowercase")?.checked;
        const includeUppercase = document.getElementById("uppercase")?.checked;
        const includeNumbers = document.getElementById("numbers")?.checked;
        const includeSymbols = document.getElementById("symbols")?.checked;

        let pool = "";
        if (includeLowercase) pool += lowercaseChars;
        if (includeUppercase) pool += uppercaseChars;
        if (includeNumbers) pool += numberChars;
        if (includeSymbols) pool += symbolChars;
        poolSize = pool.length;
    }

    if (poolSize > 1) {
        let requiredLength = Math.ceil(threshold / Math.log2(poolSize));
        
        // Read current value BEFORE changing bounds
        let currentVal = parseInt(lengthInput.value);
        
        // Enforce the required minimum length on the slider
        lengthInput.min = requiredLength;
        // If the required minimum exceeds the current max, dynamically raise the max
        if (requiredLength > parseInt(lengthInput.max)) {
            lengthInput.max = requiredLength;
        } else {
            // Restore normal max bounds if requiredLength is less than defaultMax
            lengthInput.max = Math.max(defaultMax, requiredLength);
        }

        // If the current value is less than the new minimum, adjust it
        if (currentVal < requiredLength) {
            setSliderValue(requiredLength);
            saveSettings();
        }
    }
}

function generatePassword(shouldPlaySuccess = false) {
    if (!state.deviceOn) return;
    if (state.isCopying) return;

    enforceMinEntropyConstraints();

    if (state.feedbackInterval) {
        clearInterval(state.feedbackInterval);
        state.feedbackInterval = null;
    }

    if (oledDisplay) {
        oledDisplay.triggerGenerate();
    }

    let lowercaseChars = "abcdefghijklmnopqrstuvwxyz";
    let uppercaseChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let numberChars = "0123456789";
    let symbolChars = "!@#$%^&*";

    const length = parseInt(document.getElementById("length").value);

    const includeLowercase = document.getElementById("lowercase").checked;
    const includeUppercase = document.getElementById("uppercase").checked;
    const includeNumbers = document.getElementById("numbers").checked;
    const includeSymbols = document.getElementById("symbols").checked;

    const excludeAmbiguous = document.getElementById("excludeAmbiguous").checked;
    const noDuplicates = document.getElementById("noDuplicates").checked;
    const excludedCharsInput = document.getElementById("excludedChars").value;

    if (excludeAmbiguous) {
        const ambiguous = "ilI1Lo0O";
        const filterAmbiguous = (str) => str.split("").filter(c => !ambiguous.includes(c)).join("");
        lowercaseChars = filterAmbiguous(lowercaseChars);
        uppercaseChars = filterAmbiguous(uppercaseChars);
        numberChars = filterAmbiguous(numberChars);
        symbolChars = filterAmbiguous(symbolChars);
    }

    if (excludedCharsInput) {
        const filterCustom = (str) => str.split("").filter(c => !excludedCharsInput.includes(c)).join("");
        lowercaseChars = filterCustom(lowercaseChars);
        uppercaseChars = filterCustom(uppercaseChars);
        numberChars = filterCustom(numberChars);
        symbolChars = filterCustom(symbolChars);
    }

    if (!state.hexOnlyMode && state.currentMode !== 'numeric' && !includeLowercase && !includeUppercase && !includeNumbers && !includeSymbols) {
        document.getElementById("generated-password").innerText = "Null matrix";
        document.getElementById("strength-fill").style.width = "0%";
        document.getElementById("strength-fill").setAttribute("aria-valuenow", "0");
        document.getElementById("strength-text").textContent = "-";
        document.getElementById("strength-feedback").textContent = "";
        if (oledDisplay) oledDisplay.setStrength(0);
        return;
    }

    let password = "";
    let threshold = 0;
    if (state.minEntropy === "60 BITS") threshold = 60;
    else if (state.minEntropy === "80 BITS") threshold = 80;
    else if (state.minEntropy === "128 BITS") threshold = 128;

    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
        if (state.hexOnlyMode) {
            password = generateHex(length, noDuplicates);
        } else if (state.currentMode === 'numeric') {
            password = generateNumeric(length, noDuplicates, excludeAmbiguous, excludedCharsInput);
        } else if (state.memorableMode) {
            password = generatePhonetic(length, includeUppercase, includeLowercase, includeNumbers, numberChars);
        } else {
            password = generateRandom(length, lowercaseChars, uppercaseChars, numberChars, symbolChars, noDuplicates, includeLowercase, includeUppercase, includeNumbers, includeSymbols);
        }

        if (password === "Pool Error") {
            break;
        }

        if (threshold === 0 || calculateEntropy(password) >= threshold) {
            break;
        }
        attempts++;
    }

    if (password === "Pool Error") {
        document.getElementById("generated-password").innerText = "Pool Error";
        return;
    }

    state.lastGeneratedPassword = password;
    addPasswordToHistory(password);
    updateStrength(password, shouldPlaySuccess);
    saveSettings();
    
    const displayEl = document.getElementById("generated-password");
    if (window.scrambleInterval) clearInterval(window.scrambleInterval);
    displayEl.classList.remove("copied-state");
    
    const strengthWrapper = document.querySelector('.strength-wrapper');
    if (strengthWrapper) {
        strengthWrapper.style.transition = 'opacity 0.1s ease';
        strengthWrapper.style.opacity = '1';
    }
    
    if (state.reducedMotion) {
        adjustPasswordFontSize(password);
        displayEl.innerText = password;
    } else {
        const scrambleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        let step = 0;
        const maxSteps = 8;
        
        window.scrambleInterval = setInterval(() => {
            step++;
            if (step >= maxSteps) {
                clearInterval(window.scrambleInterval);
                adjustPasswordFontSize(password);
                displayEl.innerText = password;
            } else {
                let tempStr = "";
                for (let i = 0; i < password.length; i++) {
                    if (Math.random() < step / maxSteps) {
                        tempStr += password[i];
                    } else {
                        tempStr += scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
                    }
                }
                adjustPasswordFontSize(tempStr);
                displayEl.innerText = tempStr;
            }
        }, 30);
    }
}

function copyToClipboard(){
    if (!state.deviceOn) return;
    if (state.lastGeneratedPassword === null || state.lastGeneratedPassword === undefined || state.lastGeneratedPassword === "") {
        return;
    }
    const displayEl = document.getElementById("generated-password");
    const currentPassword = state.lastGeneratedPassword || displayEl.innerText;

    if(!currentPassword || currentPassword === "Initialize" || currentPassword === "COPIED"){
        return;
    }

    if (state.isCopying) return;
    state.isCopying = true;

    const finalizeCopy = () => {
        // If there is an active scramble interval, clear it so we don't overwrite "COPIED"
        if (window.scrambleInterval) {
            clearInterval(window.scrambleInterval);
            window.scrambleInterval = null;
        }
        
        displayEl.classList.remove("copied-state");
        void displayEl.offsetWidth; // Trigger DOM reflow to restart CSS animation
        displayEl.style.fontSize = "1.3rem"; // Reset for COPIED text
        displayEl.style.lineHeight = "";
        displayEl.innerText = "COPIED";
        displayEl.classList.add("copied-state");
        
        state.bufferNeedsPurge = true;
        const btn = document.getElementById('btn-generate');
        if (btn) {
            btn.innerText = "PURGE BUFFER";
            btn.classList.add("btn-purge");
        }
        
        audio.playClick();
        if (oledDisplay) oledDisplay.triggerCopied();

        const led = document.getElementById("ambient-led");
        if (led) {
            const currentSpeed = led.style.getPropertyValue("--led-blink-speed") || "1.6s";
            led.style.setProperty("--led-blink-speed", "0.08s");
            setTimeout(() => {
                led.style.setProperty("--led-blink-speed", currentSpeed);
            }, 1000);
        }

        addPasswordToHistory("[SYS.WARN]: Memory buffer compromised. Purge sequence required.");
        state.isCopying = false;
    };

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(currentPassword)
                .then(finalizeCopy)
                .catch(err => {
                    console.error("Clipboard write error:", err);
                    state.isCopying = false;
                });
        } else {
            // Fallback for non-secure contexts (e.g. local file:// without clipboard API)
            const textArea = document.createElement("textarea");
            textArea.value = currentPassword;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                finalizeCopy();
            } catch (err) {
                console.error("Fallback clipboard error:", err);
                state.isCopying = false;
            }
            document.body.removeChild(textArea);
        }
    } catch (err) {
        console.error("Sync clipboard error:", err);
        state.isCopying = false;
    }
}

function openAdvancedSettings(){
    if (!state.deviceOn) return;
    // Delay opening the modal by 120ms to allow Web Audio click playback to complete cleanly before heavy modal layout calculations
    setTimeout(() => {
        document.getElementById("advanced-popup").classList.add("active");
        document.body.classList.add("modal-open");
    }, 120);
}

function closeAdvancedSettings() {
    const popup = document.getElementById("advanced-popup");
    if (popup) {
        popup.classList.add("closing");
        popup.classList.remove("active");
        setTimeout(() => {
            popup.classList.remove("closing");
        }, 200);
    }
    document.body.classList.remove("modal-open");
    generatePassword(false); // Generate with new settings
}

function restoreDefaults() {
    localStorage.removeItem("pgSettings");
    window.location.reload();
}


function handleMainAction(event) {
    if (event) event.preventDefault();
    if (!state.deviceOn) return;
    
    if (state.bufferNeedsPurge) {
        purgeBuffer();
    } else {
        generatePassword(true);
    }
}

function purgeBuffer() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(' ').catch(()=>{});
    }
    
    // Reset all copy buttons in the session log
    const logContainer = document.getElementById("session-log-container");
    if (logContainer) {
        logContainer.querySelectorAll("button.te-btn-outline").forEach(btn => {
            if (btn.textContent === "[CLR]") {
                btn.textContent = "[CP]";
                btn.classList.remove("copied-active");
            }
        });
    }
    
    state.bufferNeedsPurge = false;
    const btn = document.getElementById('btn-generate');
    if (btn) {
        btn.innerText = "Run Generation";
        btn.classList.remove("btn-purge");
    }
    
    // Change the main password display text to BUFFER PURGED
    const displayEl = document.getElementById('generated-password');
    if (displayEl) {
        displayEl.classList.remove("copied-state");
        void displayEl.offsetWidth; // Trigger DOM reflow to restart CSS animation
        displayEl.style.fontSize = "1.2rem";
        displayEl.style.lineHeight = "";
        displayEl.innerText = "BUFFER PURGED";
        displayEl.classList.add("copied-state"); // keep orange highlight style
    }
    
    audio.playClick();
    if (oledDisplay) {
        oledDisplay.triggerPurged();
    }

    const led = document.getElementById("ambient-led");
    if (led) {
        led.style.setProperty("--led-blink-speed", "3.2s");
    }
    
    addPasswordToHistory("[SYS.SAFE]: Volatile memory zeroized.");
    
    // Auto-generate new password after 1.5s
    setTimeout(() => {
        generatePassword(false);
    }, 1500);
}

function openAboutSettings(event, fromSettings = true) {
    if (!state.deviceOn) return;
    if (event) event.preventDefault();
    state.aboutOpenedFromSettings = fromSettings;
    if (fromSettings) {
        document.getElementById("advanced-popup").classList.remove("active");
    }
    document.getElementById("about-popup").classList.add("active");
    document.body.classList.add("modal-open");
}

function closeAboutSettings() {
    const about = document.getElementById("about-popup");
    if (about) {
        about.classList.add("closing");
        about.classList.remove("active");
        setTimeout(() => {
            about.classList.remove("closing");
        }, 200);
    }
    if (state.aboutOpenedFromSettings) {
        document.getElementById("advanced-popup").classList.add("active");
        document.body.classList.add("modal-open");
    } else {
        document.body.classList.remove("modal-open");
    }
}

function updateStrength(password, shouldPlaySuccess = false){
    if (!password || password === "Initialize") return;

    let poolSize = 0;
    if (/[a-z]/.test(password)) poolSize += 26;
    if (/[A-Z]/.test(password)) poolSize += 26;
    if (/[0-9]/.test(password)) poolSize += 10;
    if (/[^A-Za-z0-9]/.test(password)) poolSize += 33;
    if (poolSize === 0) poolSize = 1;

    // True mathematical entropy formula: E = L * log2(R)
    let trueEntropy = password.length * Math.log2(poolSize);

    let score = Math.round(trueEntropy);
    if (score < 0) score = 0;
    if (score > 256) score = 256;

    const fill = document.getElementById("strength-fill");
    const text = document.getElementById("strength-text");
    const feedback = document.getElementById("strength-feedback");
    
    // Crack time estimation (Assuming 100 Billion guesses/sec)
    const guessesPerSecond = 100e9;
    const combinations = Math.pow(poolSize, password.length);
    const secondsToCrack = combinations / guessesPerSecond;
    
    let timeStr = "";
    if (secondsToCrack < 1) timeStr = "Instant";
    else if (secondsToCrack < 60) timeStr = `${Math.round(secondsToCrack)} seconds`;
    else if (secondsToCrack < 3600) timeStr = `${Math.round(secondsToCrack / 60)} minutes`;
    else if (secondsToCrack < 86400) timeStr = `${Math.round(secondsToCrack / 3600)} hours`;
    else if (secondsToCrack < 31536000) timeStr = `${Math.round(secondsToCrack / 86400)} days`;
    else if (secondsToCrack < 3153600000) timeStr = `${Math.round(secondsToCrack / 31536000)} years`;
    else if (secondsToCrack < 3153600000000) timeStr = `${Math.round(secondsToCrack / 3153600000)} millennia`;
    else timeStr = "Eternity (Millions of years)";
    
    const tooltip = document.getElementById("crack-time-tooltip");
    if (tooltip) {
        tooltip.textContent = `Est. Crack Time: ${timeStr}`;
    }

    // Sync audio sequence and oled display parameters based on strength
    let finalScore = score;
    let feedbackText = "";
    
    if (password.length < 8) {
        fill.style.width = "15%";
        fill.setAttribute("aria-valuenow", "15");
        text.textContent = "Rejected";
        feedbackText = "Length sub-optimal. Vulnerable to brute force.";
        finalScore = 15;
    } else if (score < 60) {
        fill.style.width = "35%";
        fill.setAttribute("aria-valuenow", "35");
        text.textContent = "Low Entropy";
        feedbackText = "Susceptible to hardware dictionary attacks.";
    }
    else if (score < 100) {
        fill.style.width = "60%";
        fill.setAttribute("aria-valuenow", "60");
        text.textContent = "Moderate";
        feedbackText = "Adequate for standard verification loops.";
    }
    else if (score < 160) {
        fill.style.width = "85%";
        fill.setAttribute("aria-valuenow", "85");
        text.textContent = "High Security";
        feedbackText = "Satisfies default cryptographic standards.";
    }
    else {
        fill.style.width = "100%";
        fill.setAttribute("aria-valuenow", "100");
        text.textContent = "Absolute";
        feedbackText = "Maximum complexity vector achieved.";
    }

    const isTouch = window.matchMedia('(hover: none)').matches;
    if (isTouch) {
        if (state.feedbackInterval) {
            clearInterval(state.feedbackInterval);
            state.feedbackInterval = null;
        }
        if (feedback.transitionTimeout) {
            clearTimeout(feedback.transitionTimeout);
            feedback.transitionTimeout = null;
            feedback.classList.remove("fade-out");
        }
        
        const crackTimeText = `Est. crack: ${timeStr}`;
        const mainFeedbackText = feedbackText;
        
        let showCrackTime = false;
        
        const changeFeedbackTextWithAnimation = (el, newText) => {
            if (el.transitionTimeout) {
                clearTimeout(el.transitionTimeout);
            }
            el.classList.add("fade-out");
            el.transitionTimeout = setTimeout(() => {
                el.textContent = newText;
                el.classList.remove("fade-out");
                el.transitionTimeout = null;
            }, 200);
        };
        
        // Animates initial change to new password feedback text
        changeFeedbackTextWithAnimation(feedback, mainFeedbackText);
        
        state.feedbackInterval = setInterval(() => {
            showCrackTime = !showCrackTime;
            const targetText = showCrackTime ? crackTimeText : mainFeedbackText;
            changeFeedbackTextWithAnimation(feedback, targetText);
        }, 2500);
    } else {
        feedback.textContent = feedbackText;
    }

    const led = document.getElementById("ambient-led");
    if (led) {
        let blinkSpeed = "1.6s";
        if (password.length < 8) {
            blinkSpeed = "3.2s";
        } else if (score < 60) {
            blinkSpeed = "2.4s";
        } else if (score < 100) {
            blinkSpeed = "1.6s";
        } else if (score < 160) {
            blinkSpeed = "0.8s";
        } else {
            blinkSpeed = "0.4s";
        }
        led.style.setProperty("--led-blink-speed", blinkSpeed);
    }

    if (oledDisplay) {
        oledDisplay.setStrength(finalScore);
    }
    if (shouldPlaySuccess) {
        audio.playSuccess(finalScore);
    }
}

// ATTACH MECHANICAL SYNTH CLICK TO PHYSICAL UI ELEMENTS
function attachMechanicalClickSounds() {
    document.querySelectorAll('button, .custom-checkbox, .mode-btn, .preset-btn, .te-toggle').forEach(el => {
        // Filter out power switch since it has its own mechanical sound
        if (el.id === 'device-power-switch' || el.closest('#device-power-switch')) return;
        
        el.addEventListener('click', (e) => {
            if (state.deviceOn) {
                // If this is a label wrapping a checkbox input, click event will fire twice (once for label, once bubbled from input).
                // We only play the click sound when the event targets or bubbles from the input itself.
                const input = el.querySelector('input[type="checkbox"]');
                if (input && e.target !== input) {
                    return;
                }
                audio.playClick();
            }
        });
    });
}

// TE HAPTIC ENGINE
function triggerHaptic(duration = 10) {
    if (!navigator.vibrate) return;
    const force = state.hapticForce || 'MEDIUM';
    if (force === 'OFF') return;
    let multiplier = 1.0;
    if (force === 'SOFT') multiplier = 0.5;
    else if (force === 'STRONG') multiplier = 1.5;
    navigator.vibrate(Math.round(duration * multiplier));
}

// OLED MINI BOOT ANIMATION
function playMiniBoot(callback) {
    if (state.reducedMotion) {
        const miniBoot = document.getElementById('oled-mini-boot');
        if (miniBoot) miniBoot.style.display = 'none';
        if (callback) callback();
        return;
    }

    const miniBoot = document.getElementById('oled-mini-boot');
    const miniLog = document.getElementById('oled-mini-log');
    
    if (sessionStorage.getItem('kb_skipBoot') === 'true') {
        if (callback) callback();
        return;
    }
    
    if (!miniBoot || !miniLog) {
        if (callback) callback();
        return;
    }

    miniBoot.style.display = 'flex';
    miniBoot.style.animation = 'none';
    miniLog.innerHTML = "";
    
    const logs = [
        "BOOT_SEQ: INIT v2.4",
        "CHK_MEM: OK",
        "LD_MODULE: CRYPTO",
        "SYS: READY."
    ];
    
    let i = 0;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    
    function printMini() {
        if (i < logs.length) {
            const line = document.createElement("div");
            miniLog.appendChild(line);
            const target = "> " + logs[i];
            
            let iterations = 0;
            const scrambleInterval = setInterval(() => {
                let current = "";
                for(let j=0; j<target.length; j++) {
                    current += (target[j] === " " || Math.random() > 0.5) ? target[j] : chars[Math.floor(Math.random() * chars.length)];
                }
                line.textContent = current;
                
                iterations++;
                if (iterations >= 5) {
                    clearInterval(scrambleInterval);
                    line.textContent = target;
                    i++;
                    setTimeout(printMini, 60);
                }
            }, 25);
        } else {
            setTimeout(() => {
                miniBoot.style.animation = 'crtPowerOn 0.3s cubic-bezier(0.85, 0, 0.15, 1) forwards';
                triggerHaptic(15);
                setTimeout(() => {
                    miniBoot.style.display = 'none';
                    if (callback) callback();
                }, 300);
            }, 150);
        }
    }
    setTimeout(printMini, 50);
}

// BOOT LOADER PROGRESS BAR INTERACTION
function simulateLoading(callback) {
    if (state.reducedMotion) {
        const loader = document.getElementById('loader-screen');
        if (loader) loader.style.display = 'none';
        if (callback) callback();
        return;
    }

    const fill = document.getElementById('loader-fill');
    const percent = document.getElementById('loader-percent');
    const log = document.getElementById('boot-log');
    const loader = document.getElementById('loader-screen');
    
    // Skip loading animation if reloading due to theme change
    if (sessionStorage.getItem('kb_skipBoot') === 'true') {
        loader.style.display = 'none';
        if(callback) callback();
        return;
    }
    
    if (!fill || !percent || !log || !loader) {
        if(callback) callback();
        return;
    }

    const logs = [
        { progress: 0, text: "INIT K.B. II PROTOCOL..." },
        { progress: 15, text: "CONNECTING CRYPTO CORE..." },
        { progress: 35, text: "CACHING ENGINE SAMPLES..." },
        { progress: 55, text: "CALIBRATING OLED MATRIX..." },
        { progress: 75, text: "TUNING DAMPING FILTERS..." },
        { progress: 90, text: "MOUNTING MECHANICAL SLIDER..." },
        { progress: 100, text: "SYSTEM READY." }
    ];

    let currentProgress = 0;
    
    const interval = setInterval(() => {
        currentProgress += Math.floor(Math.random() * 4) + 2;
        if (currentProgress >= 100) {
            currentProgress = 100;
            clearInterval(interval);
            
            fill.style.width = "100%";
            percent.textContent = "100%";
            log.textContent = "SYSTEM READY.";
            
            setTimeout(() => {
                triggerHaptic(20);
                loader.classList.add('loaded');
                setTimeout(() => {
                    loader.style.display = 'none';
                    if (callback) callback();
                }, 400); // Shutter transition duration
            }, 300);
        } else {
            fill.style.width = currentProgress + "%";
            percent.textContent = String(currentProgress).padStart(2, '0') + "%";
            
            // Update boot logs matching progress
            const activeLog = logs.reduce((acc, curr) => {
                if (currentProgress >= curr.progress) return curr.text;
                return acc;
            }, logs[0].text);
            
            // TE-style mechanical scrambling for intermediate frames
            if (Math.random() > 0.7) {
                const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
                const scrambled = activeLog.split('').map(c => 
                    (c === ' ' || Math.random() > 0.5) ? c : chars[Math.floor(Math.random() * chars.length)]
                ).join('');
                log.textContent = scrambled;
            } else {
                log.textContent = activeLog;
            }
        }
    }, 30);
}

// Global password font resizer function to dynamically adapt font size and weight to viewport width and text length
function adjustPasswordFontSize(text) {
    const displayEl = document.getElementById("generated-password");
    if (!displayEl) return;
    
    // Fallback to current text if no argument is passed
    const activeText = (text !== undefined) ? text : (state.lastGeneratedPassword || displayEl.innerText);
    
    // Check if the current screen state is one of the special text messages
    if (activeText === "COPIED") {
        displayEl.style.fontSize = window.innerWidth <= 360 ? "1.0rem" : (window.innerWidth <= 480 ? "1.1rem" : "1.3rem");
        displayEl.style.lineHeight = "";
        displayEl.style.fontWeight = "";
        return;
    }
    if (activeText === "BUFFER PURGED") {
        displayEl.style.fontSize = window.innerWidth <= 360 ? "0.9rem" : (window.innerWidth <= 480 ? "1.0rem" : "1.2rem");
        displayEl.style.lineHeight = "";
        displayEl.style.fontWeight = "";
        return;
    }
    if (!activeText || activeText === "Initialize") {
        displayEl.style.fontSize = "";
        displayEl.style.lineHeight = "";
        displayEl.style.fontWeight = "";
        return;
    }
    
    const len = activeText.length;
    const winW = window.innerWidth;
    const isMobile = winW <= 480;
    const isTiny = winW <= 360;
    
    if (len > 32) {
        displayEl.style.fontSize = isTiny ? "0.6rem" : (isMobile ? "0.72rem" : "0.95rem");
        displayEl.style.lineHeight = "1.2";
        displayEl.style.fontWeight = "700"; /* High weight to keep readability at small scale */
    } else if (len > 24) {
        displayEl.style.fontSize = isTiny ? "0.72rem" : (isMobile ? "0.85rem" : "1.1rem");
        displayEl.style.lineHeight = "1.25";
        displayEl.style.fontWeight = "700";
    } else if (len > 16) {
        displayEl.style.fontSize = isTiny ? "0.85rem" : (isMobile ? "0.95rem" : "1.2rem");
        displayEl.style.lineHeight = "1.3";
        displayEl.style.fontWeight = "600";
    } else {
        displayEl.style.fontSize = "";
        displayEl.style.lineHeight = "";
        displayEl.style.fontWeight = "";
    }
}

function setupSettingsTabs() {
    const tabButtons = document.querySelectorAll('#advanced-popup .tab-btn');
    const tabContents = document.querySelectorAll('#advanced-popup .tab-content');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetContent = document.getElementById(`tab-${targetTab}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            
            if (state.deviceOn) {
                audio.playClick();
                triggerHaptic(10);
            }
        });
    });
}

function setupCollapsibleSections() {
    document.querySelectorAll('.collapsible-title').forEach(title => {
        title.addEventListener('click', () => {
            const nextGroup = title.nextElementSibling;
            if (nextGroup && nextGroup.classList.contains('advanced-group')) {
                const isCollapsed = nextGroup.classList.toggle('collapsed');
                const indicator = title.querySelector('.toggle-indicator');
                if (indicator) {
                    indicator.innerText = isCollapsed ? '[+]' : '[-]';
                }
                if (state.deviceOn) {
                    audio.playClick();
                    triggerHaptic(10);
                }
            }
        });
    });
}

function setupCursorShadowAnimation() {
    const buttons = document.querySelectorAll(
        '.btn-primary, .btn-secondary, .te-btn-hazard, .te-btn-commit, .te-btn-donate, ' +
        '.mode-btn, .custom-checkbox, .preset-btn'
    );
    
    buttons.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const dx = e.clientX - centerX;
            const dy = e.clientY - centerY;
            
            const normX = dx / (rect.width / 2);
            const normY = dy / (rect.height / 2);
            
            let maxOffset = 3;
            if (btn.classList.contains('btn-primary') || btn.classList.contains('te-btn-hazard') || btn.classList.contains('te-btn-donate')) {
                maxOffset = 4.5;
            } else if (btn.classList.contains('mode-btn') || btn.classList.contains('preset-btn')) {
                maxOffset = 2.5;
            }
            
            const shadowX = -normX * maxOffset;
            const shadowY = -normY * maxOffset;
            
            // Percentage coordinates for spotlight glow position
            const xPercent = ((dx + rect.width / 2) / rect.width) * 100;
            const yPercent = ((dy + rect.height / 2) / rect.height) * 100;
            
            btn.style.setProperty('--shadow-x', `${shadowX.toFixed(2)}px`);
            btn.style.setProperty('--shadow-y', `${shadowY.toFixed(2)}px`);
            btn.style.setProperty('--mouse-x', `${xPercent.toFixed(1)}%`);
            btn.style.setProperty('--mouse-y', `${yPercent.toFixed(1)}%`);
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.removeProperty('--shadow-x');
            btn.style.removeProperty('--shadow-y');
            btn.style.removeProperty('--mouse-x');
            btn.style.removeProperty('--mouse-y');
        });
    });
}

window.onload = () => {
    // Check prefers-reduced-motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        state.reducedMotion = true;
    }

    // Setup OLED display
    oledDisplay = new OLEDDisplay('oled-canvas');

    // Pre-initialize and decode audio immediately
    audio.initContext();

    // Auto-resume audio context on first user gesture anywhere
    const resumeAudio = () => {
        audio.initContext();
        window.removeEventListener('click', resumeAudio);
        window.removeEventListener('keydown', resumeAudio);
        window.removeEventListener('touchstart', resumeAudio);
        window.removeEventListener('pointerdown', resumeAudio);
        window.removeEventListener('mousedown', resumeAudio);
    };
    window.addEventListener('click', resumeAudio, { once: true });
    window.addEventListener('keydown', resumeAudio, { once: true });
    window.addEventListener('touchstart', resumeAudio, { once: true });
    window.addEventListener('pointerdown', resumeAudio, { once: true });
    window.addEventListener('mousedown', resumeAudio, { once: true });

    // Setup fader slider control
    setupFader();

    // Content Security Policy (CSP) dynamic event bindings
    document.getElementById('cable-and-plug')?.addEventListener('click', toggleCable);
    document.getElementById('device-power-switch')?.addEventListener('click', togglePower);
    document.getElementById('password-display-container')?.addEventListener('click', copyToClipboard);
    document.getElementById('password-form')?.addEventListener('submit', (e) => e.preventDefault());
    document.getElementById('btn-generate')?.addEventListener('click', handleMainAction);
    document.getElementById('btn-open-settings')?.addEventListener('click', openAdvancedSettings);
    
    // Modal controls
    document.getElementById('btn-close-settings-x')?.addEventListener('click', closeAdvancedSettings);
    document.getElementById('btn-commit-settings')?.addEventListener('click', closeAdvancedSettings);
    document.getElementById('btn-close-about-x')?.addEventListener('click', closeAboutSettings);
    document.getElementById('btn-close-about-bottom')?.addEventListener('click', closeAboutSettings);
    
    // Preset macro listeners
    document.getElementById('preset-default')?.addEventListener('click', () => applyPreset('default'));
    document.getElementById('preset-security')?.addEventListener('click', () => applyPreset('security'));
    document.getElementById('preset-compat')?.addEventListener('click', () => applyPreset('compat'));
    
    // Recovery trigger & Spec sheet link
    document.getElementById('btn-reset-defaults')?.addEventListener('click', resetToFactoryDefaults);
    document.getElementById('btn-confirm-cancel')?.addEventListener('click', () => {
        try { audio.playClick(); } catch(e){}
        hideConfirm();
    });
    document.getElementById('btn-confirm-reset')?.addEventListener('click', () => {
        try { audio.playClick(); } catch(e){}
        hideConfirm();
        if (state.confirmCallback) {
            state.confirmCallback();
        }
    });
    document.getElementById('link-open-about')?.addEventListener('click', (e) => openAboutSettings(e, true));
    document.getElementById('btn-open-about-direct')?.addEventListener('click', (e) => openAboutSettings(e, false));
    document.getElementById('brand-title')?.addEventListener('click', (e) => openAboutSettings(e, false));
    document.getElementById('brand-desc')?.addEventListener('click', (e) => openAboutSettings(e, false));

    // Setup dark mode trigger
    const darkModeCheckbox = document.getElementById("darkMode");
    if (darkModeCheckbox) {
        darkModeCheckbox.addEventListener('change', (e) => {
            saveSettings();
            sessionStorage.setItem('kb_skipBoot', 'true');
            if (state.lastGeneratedPassword) {
                sessionStorage.setItem('kb_tempPass', state.lastGeneratedPassword);
            }
            window.location.reload();
        });
    }

    const muteAudioCheckbox = document.getElementById("muteAudio");
    if (muteAudioCheckbox) {
        muteAudioCheckbox.addEventListener('change', (e) => {
            state.systemMuted = e.target.checked;
            saveSettings();
        });
    }

    const specularHoverCheckbox = document.getElementById("specularHover");
    if (specularHoverCheckbox) {
        specularHoverCheckbox.addEventListener('change', (e) => {
            state.specularHover = e.target.checked;
            updateSpecularHoverClass();
            saveSettings();
        });
    }

    const hexOnlyModeCheckbox = document.getElementById("hexOnlyMode");
    if (hexOnlyModeCheckbox) {
        hexOnlyModeCheckbox.addEventListener('change', (e) => {
            state.hexOnlyMode = e.target.checked;
            updateHexOnlyUI();
            saveSettings();
            generatePassword(false);
        });
    }

    setupOptionCyclers();

    const inputsToWatch = [
        'uppercase', 'lowercase', 'numbers', 'symbols',
        'excludeAmbiguous', 'noDuplicates', 'excludedChars'
    ];
    
    inputsToWatch.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                clearActivePresets();
                generatePassword(false);
            });
            el.addEventListener('change', () => {
                clearActivePresets();
                generatePassword(false);
            });
        }
    });

    // Word separator presets listener
    document.querySelectorAll('.separator-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            state.memorableSeparator = btn.getAttribute('data-sep');
            updateSeparatorButtonsUI();
            saveSettings();
            generatePassword(false);
        });
    });

    // Export current password listener
    const exportBtn = document.getElementById("btn-export-txt");
    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            const pwd = state.lastGeneratedPassword;
            if (!pwd) return;
            
            try {
                const blob = new Blob([pwd], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "kagibox-key.txt";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                audio.playClick();
            } catch (e) {
                console.error("Failed to export password file:", e);
            }
        });
    }

    // Attach sound click triggers to UI
    attachMechanicalClickSounds();
    setupCollapsibleSections();
    setupSettingsTabs();
    setupCursorShadowAnimation();
    
    // Attach haptic feedback to mechanical elements
    document.querySelectorAll('button, .custom-checkbox, .mode-btn, .power-switch-chassis').forEach(el => {
        el.addEventListener('pointerdown', () => {
            if (state.deviceOn || el.classList.contains('power-switch-chassis') || el.id === 'device-power-switch') {
                triggerHaptic(12);
            }
        });
    });

    // Load settings from memory or fallback to defaults
    const loaded = loadSettings();
    if (!loaded) {
        document.getElementById('preset-default').classList.add('active');
        state.currentMode = 'random';
        state.memorableMode = false;
        state.memorableSeparator = "-";
        updateSeparatorButtonsUI();
        updateCheckboxVisualState();
    }
    
    // Initialize session history UI
    updateSessionHistoryUI();
    updatePresetDescriptions();
    
    // Run boot loader and generate password on completion
    simulateLoading(() => {
        // Trigger the physical switch sequence programmatically
        togglePower(finishBoot);
        
        function finishBoot() {
            addPasswordToHistory("[SYS.BOOT]: Entropy node initialized with 256-bit CSPRNG.");
            const savedPass = sessionStorage.getItem('kb_tempPass');
            if (savedPass) {
                const displayEl = document.getElementById("generated-password");
                displayEl.innerText = savedPass;
                state.lastGeneratedPassword = savedPass;
                updateStrength(savedPass, false);
            } else {
                generatePassword(false);
            }
            sessionStorage.removeItem('kb_skipBoot');
            sessionStorage.removeItem('kb_tempPass');
        }
    });

    // Close modals on click outside or ESC key
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                if (overlay.id === 'advanced-popup') generatePassword(false);
                
                // If no overlays are active, remove lock
                if (!document.querySelector('.modal-overlay.active')) {
                    document.body.classList.remove('modal-open');
                }
            }
        });
    });

    window.addEventListener('keydown', (e) => {
        // Ignore keydown shortcuts when focused on text input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }

        // Arrow navigation between settings tabs/sections on PC
        const advanced = document.getElementById('advanced-popup');
        const isAdvancedActive = advanced && advanced.classList.contains('active');
        const about = document.getElementById('about-popup');
        const isAboutActive = about && about.classList.contains('active');

        if (isAdvancedActive) {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const tabs = ['presets', 'filters', 'system', 'logs'];
                const activeTabBtn = document.querySelector('#advanced-popup .tab-btn.active');
                if (activeTabBtn) {
                    const currentTab = activeTabBtn.getAttribute('data-tab');
                    const currentIndex = tabs.indexOf(currentTab);
                    if (currentIndex !== -1) {
                        let newIndex = currentIndex;
                        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                            newIndex = (currentIndex + 1) % tabs.length;
                            e.preventDefault();
                        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                            newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                            e.preventDefault();
                        }
                        if (newIndex !== currentIndex) {
                            const nextTabName = tabs[newIndex];
                            const nextTabBtn = document.querySelector(`#advanced-popup .tab-btn[data-tab="${nextTabName}"]`);
                            if (nextTabBtn) {
                                nextTabBtn.click();
                            }
                        }
                    }
                }
            }
        } else if (!isAboutActive) {
            // Main screen controls: adjust size fader slider value with arrow keys
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const fader = document.getElementById('length');
                if (fader) {
                    const min = parseInt(fader.min || 5);
                    const max = parseInt(fader.max || 39);
                    const currentVal = parseInt(fader.value);
                    let newVal = currentVal;
                    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                        newVal = Math.min(max, currentVal + 1);
                        e.preventDefault();
                    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                        newVal = Math.max(min, currentVal - 1);
                        e.preventDefault();
                    }
                    if (newVal !== currentVal) {
                        setSliderValue(newVal);
                        audio.playKnobTick();
                        clearActivePresets();
                        saveSettings();
                        generatePassword(false);
                    }
                }
            }
        }

        // ESC key logic (close modals)
        if (e.key === 'Escape') {
            const advanced = document.getElementById('advanced-popup');
            const about = document.getElementById('about-popup');
            const confirmPopup = document.getElementById('confirm-popup');
            let closedAny = false;
            
            if (confirmPopup && confirmPopup.classList.contains('active')) {
                confirmPopup.classList.add('closing');
                confirmPopup.classList.remove('active');
                const tempConfirm = confirmPopup;
                setTimeout(() => {
                    tempConfirm.classList.remove('closing');
                }, 200);
                closedAny = true;
            }
            if (about && about.classList.contains('active')) {
                about.classList.add('closing');
                about.classList.remove('active');
                const tempAbout = about;
                setTimeout(() => {
                    tempAbout.classList.remove('closing');
                }, 200);
                closedAny = true;
            }
            if (advanced && advanced.classList.contains('active')) {
                advanced.classList.add('closing');
                advanced.classList.remove('active');
                const tempAdvanced = advanced;
                setTimeout(() => {
                    tempAdvanced.classList.remove('closing');
                }, 200);
                generatePassword(false);
                closedAny = true;
            }
            if (closedAny) {
                // Remove body lock if no overlays are active
                setTimeout(() => {
                    if (!document.querySelector('.modal-overlay.active')) {
                        document.body.classList.remove('modal-open');
                    }
                }, 200);
            }
            return;
        }

        // Prevent shortcuts if device is OFF
        if (!state.deviceOn) return;

        // Space key logic (generate or purge)
        if (e.code === 'Space') {
            e.preventDefault();
            if (state.bufferNeedsPurge) {
                purgeBuffer();
            } else {
                generatePassword(true);
            }
        }

        // C key logic (copy to clipboard)
        if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            copyToClipboard();
        }

        // P key logic (purge buffer)
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            if (state.bufferNeedsPurge) {
                purgeBuffer();
            }
        }

        // M key logic (cycle modes)
        if (e.key === 'm' || e.key === 'M') {
            e.preventDefault();
            if (state.currentMode === 'random') {
                if (memorableBtn) memorableBtn.click();
            } else if (state.currentMode === 'phonetic') {
                if (pinBtn) pinBtn.click();
            } else {
                if (randomBtn) randomBtn.click();
            }
        }
    });

    // Handle screen resize/rotate to scale the password font dynamically using ResizeObserver
    const displayContainer = document.getElementById("password-display-container");
    if (displayContainer) {
        const resizeObserver = new ResizeObserver(() => {
            adjustPasswordFontSize();
        });
        resizeObserver.observe(displayContainer);
    }

    // Stripe Donate Redirect Control
    const donateBtn = document.getElementById("btn-stripe-donate");
    if (donateBtn) {
        donateBtn.addEventListener("click", () => {
            if (!state.deviceOn) return; // Unpowered device nemůže vysílat síťové požadavky
            
            // Bezpečný zápis do tvého hardwarového Anti-Tamper logu relace
            addPasswordToHistory("[SYS.NET]: Initializing external payment gateway...");
            
            // Krátká latence 400ms, aby uživatel stihl vnímat log a haptiku
            setTimeout(() => {
                // Otevře Stripe v nové záložce a zamezí zneužití window.opener (bezpečnostní standard)
                window.open("https://buy.stripe.com/00w5kvdJ25qQ8pl2bYgjC00", "_blank", "noopener,noreferrer");
            }, 400);
        });
    }
};
