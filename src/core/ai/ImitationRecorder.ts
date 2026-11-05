import { ContinuousActorCritic } from './ContinuousActorCritic';

export interface DemonstrationStep {
  state: number[];
  action: [number, number]; // [steer, throttle]
  timestamp: number;
}

export class ImitationRecorder {
  private static instance: ImitationRecorder;

  public isRecording: boolean = false;
  public dataset: DemonstrationStep[] = [];
  public maxSamples: number = 10000;

  public static getInstance(): ImitationRecorder {
    if (!ImitationRecorder.instance) {
      ImitationRecorder.instance = new ImitationRecorder();
    }
    return ImitationRecorder.instance;
  }

  public start(): void {
    this.isRecording = true;
  }

  public stop(): void {
    this.isRecording = false;
  }

  public clear(): void {
    this.dataset = [];
    this.isRecording = false;
  }

  public record(state: number[], action: [number, number]): void {
    if (!this.isRecording) return;
    if (this.dataset.length >= this.maxSamples) return;

    this.dataset.push({
      state: [...state],
      action: [parseFloat(action[0].toFixed(3)), parseFloat(action[1].toFixed(3))],
      timestamp: Date.now(),
    });
  }

  public trainActor(network: ContinuousActorCritic, epochs: number = 25): { finalLoss: number } {
    if (this.dataset.length === 0) return { finalLoss: 0 };
    return network.trainBehavioralCloning(this.dataset, epochs);
  }

  public exportJSON(): string {
    return JSON.stringify({
      version: '1.0',
      sampleCount: this.dataset.length,
      dataset: this.dataset,
    });
  }

  public importJSON(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && Array.isArray(parsed.dataset)) {
        this.dataset = parsed.dataset;
        return true;
      }
    } catch (e) {
      console.error('Failed to parse demonstration JSON', e);
    }
    return false;
  }
}
