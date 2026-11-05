/**
 * Zero-dependency Procedural Web Audio Engine for Autonomous Vehicle Simulation.
 * Synthesizes dynamic EV motor whine, indicator tick-tock clickers, and ADAS collision alert chimes.
 */
export class SoundEngine {
  private static instance: SoundEngine | null = null;
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;

  // Motor Whine Nodes
  private motorOsc: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private motorFilter: BiquadFilterNode | null = null;

  // Rumble Strip Audio Nodes (Low-frequency grooved tarmac buzz)
  private rumbleOsc: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;
  private rumbleFilter: BiquadFilterNode | null = null;

  // State Tracking
  private lastBlinkPhase: boolean = false;
  private lastAlertTime: number = 0;
  private isInitialized: boolean = false;

  public static getInstance(): SoundEngine {
    if (!SoundEngine.instance) {
      SoundEngine.instance = new SoundEngine();
    }
    return SoundEngine.instance;
  }

  constructor() {
    // Lazy AudioContext initialization on first user interaction
  }

  public init(): void {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Motor Synthesizer Setup
      this.motorOsc = this.ctx.createOscillator();
      this.motorOsc.type = 'triangle';
      this.motorOsc.frequency.setValueAtTime(60, this.ctx.currentTime);

      this.motorFilter = this.ctx.createBiquadFilter();
      this.motorFilter.type = 'lowpass';
      this.motorFilter.frequency.setValueAtTime(800, this.ctx.currentTime);

      this.motorGain = this.ctx.createGain();
      this.motorGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.motorOsc.connect(this.motorFilter);
      this.motorFilter.connect(this.motorGain);
      this.motorGain.connect(this.ctx.destination);

      this.motorOsc.start();

      // Master Rumble Strip Synthesizer Setup (Grooved kerb buzz)
      this.rumbleOsc = this.ctx.createOscillator();
      this.rumbleOsc.type = 'sawtooth';
      this.rumbleOsc.frequency.setValueAtTime(45, this.ctx.currentTime);

      this.rumbleFilter = this.ctx.createBiquadFilter();
      this.rumbleFilter.type = 'lowpass';
      this.rumbleFilter.frequency.setValueAtTime(160, this.ctx.currentTime);

      this.rumbleGain = this.ctx.createGain();
      this.rumbleGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.rumbleOsc.connect(this.rumbleFilter);
      this.rumbleFilter.connect(this.rumbleGain);
      this.rumbleGain.connect(this.ctx.destination);

      this.rumbleOsc.start();
      this.isInitialized = true;
    } catch {
      // Audio not supported in environment
    }
  }

  public toggleMute(): boolean {
    this.init();
    this.isMuted = !this.isMuted;
    if (this.isMuted && this.ctx) {
      if (this.motorGain) this.motorGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      if (this.rumbleGain) this.rumbleGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  /**
   * Main per-frame audio update loop
   */
  public update(
    speed: number, // m/s
    throttle: number, // 0 to 1
    isBlinking: boolean,
    blinkPhase: boolean,
    isAEBWarning: boolean,
    isOnRumble: boolean = false
  ): void {
    if (this.isMuted || !this.isInitialized || !this.ctx || !this.motorGain || !this.motorOsc) return;

    if (this.ctx.state === 'suspended') {
      return;
    }

    const now = this.ctx.currentTime;

    // 1. Dynamic Electric Motor Whine (Pitch proportional to speed, volume to throttle/speed)
    const targetFreq = Math.max(65, Math.min(850, 70 + Math.abs(speed) * 17.5));
    this.motorOsc.frequency.setTargetAtTime(targetFreq, now, 0.08);

    // Motor volume: gentle hum at standstill, swells with throttle and high speed
    const baseVolume = Math.abs(speed) > 0.5 ? 0.02 + throttle * 0.04 : 0.0;
    this.motorGain.gain.setTargetAtTime(Math.min(0.065, baseVolume), now, 0.08);

    // 2. Grooved Kerb / Rumble Strip Vibration Audio
    if (this.rumbleGain && this.rumbleOsc) {
      if (isOnRumble && Math.abs(speed) > 2.5) {
        const rumbleFreq = Math.max(38, Math.min(110, 35 + Math.abs(speed) * 2.2));
        this.rumbleOsc.frequency.setTargetAtTime(rumbleFreq, now, 0.03);
        this.rumbleGain.gain.setTargetAtTime(0.048, now, 0.03);
      } else {
        this.rumbleGain.gain.setTargetAtTime(0, now, 0.04);
      }
    }

    // 2. Turn Signal Indicator Clicker ("tic" / "tac" sound)
    if (isBlinking && blinkPhase !== this.lastBlinkPhase) {
      this.lastBlinkPhase = blinkPhase;
      this.playIndicatorClick(blinkPhase);
    }

    // 3. ADAS Emergency Collision Warning Chime (Two-tone alert)
    if (isAEBWarning && performance.now() - this.lastAlertTime > 650) {
      this.lastAlertTime = performance.now();
      this.playCollisionWarningChime();
    }
  }

  /**
   * Plays a subtle mechanical relay click for the turn signal (alternating tic vs tac)
   */
  private playIndicatorClick(isTic: boolean): void {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Higher frequency "tic", lower frequency "tac"
    osc.frequency.setValueAtTime(isTic ? 1150 : 820, now);
    osc.frequency.exponentialRampToValueAtTime(isTic ? 350 : 250, now + 0.018);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.02);
  }

  /**
   * Modern European ADAS Two-Tone Forward Collision Alert Chime (880 Hz + 1175 Hz)
   */
  public playCollisionWarningChime(): void {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const chimeOsc = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();

    chimeOsc.type = 'sine';
    chimeOsc.frequency.setValueAtTime(880, now);
    chimeOsc.frequency.setValueAtTime(1175, now + 0.08);

    chimeGain.gain.setValueAtTime(0.08, now);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    chimeOsc.connect(chimeGain);
    chimeGain.connect(this.ctx.destination);

    chimeOsc.start(now);
    chimeOsc.stop(now + 0.24);
  }
}
