export interface ComfortEnergyStatus {
  jerkTotal: number; // m/s³ combined jerk
  comfortScore: number; // 0% to 100%
  comfortRating: 'ULTRA LUXURY' | 'COMFORTABLE' | 'DYNAMIC' | 'ROUGH';
  energyKwhPer100Km: number; // kWh/100km virtual consumption
  regenPowerKw: number; // instantaneous regenerative braking power kW
}

export class ComfortEnergyMetrics {
  private prevLongAcc: number = 0;
  private prevLatAcc: number = 0;
  private rollingJerk: number = 0;
  private totalEnergyJoules: number = 0;
  private totalDistanceMeters: number = 0;

  public update(
    dt: number,
    speedMps: number,
    longitudinalAcc: number,
    lateralAcc: number,
    isBraking: boolean,
    vehicleMass: number = 1500
  ): ComfortEnergyStatus {
    if (dt <= 0) {
      return {
        jerkTotal: 0,
        comfortScore: 98,
        comfortRating: 'ULTRA LUXURY',
        energyKwhPer100Km: 18.2,
        regenPowerKw: 0,
      };
    }

    // 1. Jerk Rate Calculation: da/dt in m/s³
    const dLong = (longitudinalAcc - this.prevLongAcc) / dt;
    const dLat = (lateralAcc - this.prevLatAcc) / dt;
    this.prevLongAcc = longitudinalAcc;
    this.prevLatAcc = lateralAcc;

    const instantJerk = Math.sqrt(dLong * dLong + dLat * dLat);
    // Smooth with exponential filter (tau ~ 0.3s)
    this.rollingJerk = this.rollingJerk * 0.88 + instantJerk * 0.12;

    // 2. ISO 2631 Comfort Rating Index (0% to 100%)
    // Under 0.8 m/s³ is chauffeur-grade smoothness; > 3.0 m/s³ is nausea-inducing
    let comfortScore = Math.max(10, Math.min(100, Math.round(100 - this.rollingJerk * 24)));
    let comfortRating: 'ULTRA LUXURY' | 'COMFORTABLE' | 'DYNAMIC' | 'ROUGH' = 'ULTRA LUXURY';

    if (this.rollingJerk < 0.75) {
      comfortRating = 'ULTRA LUXURY';
    } else if (this.rollingJerk < 1.6) {
      comfortRating = 'COMFORTABLE';
    } else if (this.rollingJerk < 2.6) {
      comfortRating = 'DYNAMIC';
    } else {
      comfortRating = 'ROUGH';
    }

    // 3. Virtual EV Energy Model
    const distanceDelta = Math.abs(speedMps * dt);
    this.totalDistanceMeters += distanceDelta;

    let regenKw = 0;
    const dragForce = 0.5 * 1.225 * 0.28 * 2.2 * speedMps * speedMps; // Air drag 0.5 * rho * Cd * A * v^2
    const rollingResistance = vehicleMass * 9.81 * 0.015; // Crr ~ 0.015

    if (longitudinalAcc >= 0) {
      // Traction power demand: (m*a + drag + roll) * v + 1.2 kW base avionics/HVAC
      const tractionForce = vehicleMass * longitudinalAcc + dragForce + rollingResistance;
      const powerWatts = Math.max(0, tractionForce * speedMps) + 1200;
      this.totalEnergyJoules += powerWatts * dt;
    } else {
      // Deceleration: Regenerative Braking recuperates up to 72% of kinetic energy
      const brakingForce = Math.abs(vehicleMass * longitudinalAcc);
      const grossRecupWatts = brakingForce * speedMps * 0.72;
      regenKw = parseFloat((grossRecupWatts / 1000).toFixed(1));
      // Base avionics still consumes energy
      const netWatts = 1200 - grossRecupWatts;
      this.totalEnergyJoules += netWatts * dt;
    }

    // Convert total energy (Joules) to kWh per 100 km
    let kwhPer100Km = 17.5; // Nominal EV baseline
    if (this.totalDistanceMeters > 30) {
      const totalKwh = this.totalEnergyJoules / 3.6e6;
      const totalKm = this.totalDistanceMeters / 1000;
      kwhPer100Km = Math.max(8.0, Math.min(48.0, (totalKwh / totalKm) * 100));
    }

    return {
      jerkTotal: parseFloat(this.rollingJerk.toFixed(2)),
      comfortScore,
      comfortRating,
      energyKwhPer100Km: parseFloat(kwhPer100Km.toFixed(1)),
      regenPowerKw: regenKw,
    };
  }

  public reset(): void {
    this.prevLongAcc = 0;
    this.prevLatAcc = 0;
    this.rollingJerk = 0;
    this.totalEnergyJoules = 0;
    this.totalDistanceMeters = 0;
  }
}
