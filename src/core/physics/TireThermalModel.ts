export class TireThermalModel {
  public temperature: number = 30.0; // Ambient start: 30°C
  public ambientTemp: number = 24.0;
  public optimalTempMin: number = 70.0;
  public optimalTempMax: number = 95.0;

  /**
   * Advances tire thermodynamic state over timestep dt
   */
  public update(
    dt: number,
    speed: number,
    isSkidding: boolean,
    isBraking: boolean,
    lateralG: number
  ): void {
    const absSpeed = Math.abs(speed);

    // 1. Heat generation sources
    let heatRate = 0;

    // Rolling friction heat
    if (absSpeed > 2.0) {
      heatRate += absSpeed * 0.25;
    }

    // Heavy braking friction
    if (isBraking && absSpeed > 4.0) {
      heatRate += 22.0;
    }

    // Lateral tire scrubbing and drift
    if (isSkidding) {
      heatRate += 45.0 + Math.min(60.0, lateralG * 35.0);
    } else if (lateralG > 0.6) {
      heatRate += lateralG * 12.0;
    }

    // 2. Airflow convective cooling
    // Higher road speeds increase convective dissipation
    const coolingFactor = 0.08 + (absSpeed / 40.0) * 0.12;
    const deltaToAmbient = this.temperature - this.ambientTemp;
    const coolingRate = deltaToAmbient * coolingFactor;

    // Net thermal integration
    this.temperature += (heatRate - coolingRate) * dt;
    this.temperature = Math.max(this.ambientTemp, Math.min(135.0, this.temperature));
  }

  /**
   * Grip efficiency curve relative to tire compound temperature:
   * Cold (< 55°C): 88% - 94%
   * Optimal (70°C - 95°C): 100% peak mechanical adhesion
   * Overheated (> 100°C): drops to 76% due to compound blistering
   */
  public getGripMultiplier(): number {
    if (this.temperature < this.optimalTempMin) {
      // Warmup zone
      const ratio = (this.temperature - this.ambientTemp) / (this.optimalTempMin - this.ambientTemp);
      return 0.88 + Math.max(0, ratio) * 0.12;
    } else if (this.temperature <= this.optimalTempMax) {
      // Peak operating window
      return 1.0;
    } else {
      // Overheating degradation
      const overheat = this.temperature - this.optimalTempMax;
      return Math.max(0.74, 1.0 - (overheat / 40.0) * 0.26);
    }
  }

  public getStatus(): 'COLD' | 'OPTIMAL' | 'OVERHEATED' {
    if (this.temperature < this.optimalTempMin) return 'COLD';
    if (this.temperature > this.optimalTempMax) return 'OVERHEATED';
    return 'OPTIMAL';
  }

  public reset(): void {
    this.temperature = 30.0;
  }
}
