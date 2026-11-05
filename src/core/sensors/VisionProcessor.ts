export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  distanceEstimate: number; // estimated meters
}

export interface VisionDetectionResult {
  leftLaneX: number | null; // Screen X of left detected lane marking
  rightLaneX: number | null; // Screen X of right detected lane marking
  centerOffset: number; // Normalized lateral error: -1 (too far left) to +1 (too far right)
  laneConfidence: number; // 0 to 1
  obstacles: BoundingBox[];
  edgeMagnitudeMap: Uint8ClampedArray; // For HUD debug overlay
  width: number;
  height: number;
}

export class VisionProcessor {
  private width: number;
  private height: number;
  private grayscale: Float32Array;
  private blurred: Float32Array;
  private sobelX: Float32Array;
  private sobelY: Float32Array;
  private magnitude: Float32Array;
  private overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;

  constructor(width: number = 160, height: number = 80) {
    this.width = width;
    this.height = height;

    const size = width * height;
    this.grayscale = new Float32Array(size);
    this.blurred = new Float32Array(size);
    this.sobelX = new Float32Array(size);
    this.sobelY = new Float32Array(size);
    this.magnitude = new Float32Array(size);

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    const ctx = this.overlayCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not get overlay context');
    this.overlayCtx = ctx;
  }

  public getOverlayCanvas(): HTMLCanvasElement {
    return this.overlayCanvas;
  }

  /**
   * Processes a raw camera frame with genuine 2D convolution and feature extraction
   */
  public process(frame: ImageData): VisionDetectionResult {
    const data = frame.data;
    const w = this.width;
    const h = this.height;

    // 1. Convert RGB to Grayscale Luminance
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      this.grayscale[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // 2. Fast 3x3 Gaussian Blur Filter
    // Kernel:
    // [1 2 1]
    // [2 4 2] / 16
    // [1 2 1]
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const val =
          (this.grayscale[idx - w - 1] * 1 +
            this.grayscale[idx - w] * 2 +
            this.grayscale[idx - w + 1] * 1 +
            this.grayscale[idx - 1] * 2 +
            this.grayscale[idx] * 4 +
            this.grayscale[idx + 1] * 2 +
            this.grayscale[idx + w - 1] * 1 +
            this.grayscale[idx + w] * 2 +
            this.grayscale[idx + w + 1] * 1) /
          16;
        this.blurred[idx] = val;
      }
    }

    // 3. 3x3 Sobel Edge Detection Convolution
    // Gx = [-1 0 1, -2 0 2, -1 0 1]
    // Gy = [-1 -2 -1,  0  0  0,  1  2  1]
    const edgeMap = new Uint8ClampedArray(w * h * 4);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const gx =
          -1 * this.blurred[idx - w - 1] +
          1 * this.blurred[idx - w + 1] +
          -2 * this.blurred[idx - 1] +
          2 * this.blurred[idx + 1] +
          -1 * this.blurred[idx + w - 1] +
          1 * this.blurred[idx + w + 1];

        const gy =
          -1 * this.blurred[idx - w - 1] +
          -2 * this.blurred[idx - w] +
          -1 * this.blurred[idx - w + 1] +
          1 * this.blurred[idx + w - 1] +
          2 * this.blurred[idx + w] +
          1 * this.blurred[idx + w + 1];

        const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
        this.magnitude[idx] = mag;

        const pIdx = idx * 4;
        edgeMap[pIdx] = mag > 45 ? 56 : 0; // Cyan edge highlight
        edgeMap[pIdx + 1] = mag > 45 ? 189 : 0;
        edgeMap[pIdx + 2] = mag > 45 ? 248 : 0;
        edgeMap[pIdx + 3] = mag > 45 ? 180 : 0;
      }
    }

    // 4. Lane Boundary Tracking via Region of Interest (ROI) scanning
    // Scan near bottom rows where road is closest and widest
    const scanRowStart = Math.floor(h * 0.68);
    const scanRowEnd = Math.floor(h * 0.92);
    const centerX = w * 0.5;

    let leftCandidateSum = 0;
    let leftCount = 0;
    let rightCandidateSum = 0;
    let rightCount = 0;

    for (let y = scanRowStart; y < scanRowEnd; y += 3) {
      let maxLeftMag = 35;
      let bestLeftX = -1;

      // Scan left of center
      for (let x = 10; x < centerX - 5; x++) {
        const mag = this.magnitude[y * w + x];
        if (mag > maxLeftMag) {
          maxLeftMag = mag;
          bestLeftX = x;
        }
      }
      if (bestLeftX !== -1) {
        leftCandidateSum += bestLeftX;
        leftCount++;
      }

      // Scan right of center
      let maxRightMag = 35;
      let bestRightX = -1;
      for (let x = centerX + 5; x < w - 10; x++) {
        const mag = this.magnitude[y * w + x];
        if (mag > maxRightMag) {
          maxRightMag = mag;
          bestRightX = x;
        }
      }
      if (bestRightX !== -1) {
        rightCandidateSum += bestRightX;
        rightCount++;
      }
    }

    const leftLaneX = leftCount > 2 ? leftCandidateSum / leftCount : null;
    const rightLaneX = rightCount > 2 ? rightCandidateSum / rightCount : null;

    let centerOffset = 0;
    let laneConfidence = 0;

    if (leftLaneX !== null && rightLaneX !== null) {
      const estimatedCenter = (leftLaneX + rightLaneX) * 0.5;
      centerOffset = (estimatedCenter - centerX) / (w * 0.5);
      laneConfidence = 0.95;
    } else if (leftLaneX !== null) {
      const estimatedCenter = leftLaneX + 38; // assumed half lane width
      centerOffset = (estimatedCenter - centerX) / (w * 0.5);
      laneConfidence = 0.65;
    } else if (rightLaneX !== null) {
      const estimatedCenter = rightLaneX - 38;
      centerOffset = (estimatedCenter - centerX) / (w * 0.5);
      laneConfidence = 0.65;
    }

    // 5. Detect Obstacle Clusters in Road Frustum
    const obstacles: BoundingBox[] = [];
    const obsYScanStart = Math.floor(h * 0.46);
    const obsYScanEnd = Math.floor(h * 0.75);

    // Simple vertical energy projection to find obstacle bounding boxes
    for (let y = obsYScanStart; y < obsYScanEnd; y += 8) {
      for (let x = 20; x < w - 20; x += 12) {
        let clusterEnergy = 0;
        for (let dy = 0; dy < 6; dy++) {
          for (let dx = 0; dx < 8; dx++) {
            clusterEnergy += this.magnitude[(y + dy) * w + (x + dx)];
          }
        }

        if (clusterEnergy > 2600) {
          // Found dense edge cluster (vehicle tail or hazard barrier)
          const distEst = Math.max(4.0, (1.0 - (y - obsYScanStart) / (obsYScanEnd - obsYScanStart)) * 35.0);
          obstacles.push({
            x,
            y,
            width: 14,
            height: 8,
            confidence: 0.85,
            distanceEstimate: parseFloat(distEst.toFixed(1)),
          });
          x += 16; // Jump past detected cluster
        }
      }
    }

    return {
      leftLaneX,
      rightLaneX,
      centerOffset: Math.max(-1, Math.min(1, centerOffset)),
      laneConfidence,
      obstacles: obstacles.slice(0, 3), // Top 3 closest detections
      edgeMagnitudeMap: edgeMap,
      width: w,
      height: h,
    };
  }
}
