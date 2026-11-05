import { BlackBoxRecorder, FlightTelemetryFrame } from './BlackBoxRecorder';

export class TelemetryExporter {
  /**
   * Generates and triggers download of CSV telemetry stream
   */
  public static downloadCSV(): void {
    const recorder = BlackBoxRecorder.getInstance();
    const frames: FlightTelemetryFrame[] = recorder.getHistory();

    if (frames.length === 0) {
      alert('No telemetry data recorded yet. Let the vehicle drive for a few moments first.');
      return;
    }

    const headers = [
      'timestamp_ms',
      'speed_kmh',
      'steer_angle_deg',
      'lateral_g',
      'longitudinal_g',
      'throttle',
      'brake',
      'is_damaged',
      'closest_distance_m',
      'closing_speed_kmh',
      'pos_x',
      'pos_y',
      'heading_rad',
    ];

    const rows = frames.map((f) => [
      f.timestamp.toFixed(0),
      f.speedKmH,
      f.steerAngleDeg,
      f.lateralG,
      f.longitudinalG,
      f.throttle,
      f.brake,
      f.isDamaged ? 1 : 0,
      f.closestDistance,
      f.closingSpeed,
      f.position.x.toFixed(2),
      f.position.y.toFixed(2),
      f.heading.toFixed(3),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexus_av_telemetry_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Generates and triggers download of comprehensive JSON diagnostic package
   */
  public static downloadJSON(): void {
    const recorder = BlackBoxRecorder.getInstance();
    const frames = recorder.getHistory();
    const incident = recorder.activeIncident;

    const payload = {
      app: 'Nexus AV Simulator',
      exportedAt: new Date().toISOString(),
      frameCount: frames.length,
      activeIncident: incident || null,
      telemetryFrames: frames,
    };

    const jsonContent = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexus_av_blackbox_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
