export interface LayerGradients {
  weightGradients: Float32Array;
  biasGradients: Float32Array;
}

export class DenselyConnectedLayer {
  public inputsCount: number;
  public outputsCount: number;
  public weights: Float32Array;
  public biases: Float32Array;

  // Cached activations for backpropagation
  public lastInputs: Float32Array;
  public lastPreActivations: Float32Array;
  public lastOutputs: Float32Array;

  // Momentum accumulators for optimizer
  private weightMomentum: Float32Array;
  private biasMomentum: Float32Array;

  constructor(inputs: number, outputs: number) {
    this.inputsCount = inputs;
    this.outputsCount = outputs;
    this.weights = new Float32Array(inputs * outputs);
    this.biases = new Float32Array(outputs);

    this.lastInputs = new Float32Array(inputs);
    this.lastPreActivations = new Float32Array(outputs);
    this.lastOutputs = new Float32Array(outputs);

    this.weightMomentum = new Float32Array(inputs * outputs);
    this.biasMomentum = new Float32Array(outputs);

    this.initHe();
  }

  /** He initialization for Leaky ReLU activations */
  private initHe(): void {
    const stdDev = Math.sqrt(2.0 / this.inputsCount);
    for (let i = 0; i < this.weights.length; i++) {
      const u1 = Math.random();
      const u2 = Math.random();
      const randNorm = Math.sqrt(-2.0 * Math.log(u1 || 1e-7)) * Math.cos(2.0 * Math.PI * u2);
      this.weights[i] = randNorm * stdDev;
    }
    for (let j = 0; j < this.biases.length; j++) {
      this.biases[j] = 0.01;
    }
  }

  public forward(inputs: Float32Array, isOutputLayer: boolean = false): Float32Array {
    this.lastInputs.set(inputs);

    for (let o = 0; o < this.outputsCount; o++) {
      let sum = this.biases[o];
      const offset = o * this.inputsCount;
      for (let i = 0; i < this.inputsCount; i++) {
        sum += this.weights[offset + i] * inputs[i];
      }
      this.lastPreActivations[o] = sum;

      // Linear for output layer (Q-values), Leaky ReLU for hidden layers
      if (isOutputLayer) {
        this.lastOutputs[o] = sum;
      } else {
        this.lastOutputs[o] = sum > 0 ? sum : 0.05 * sum;
      }
    }

    return this.lastOutputs;
  }

  /**
   * Computes gradients with respect to weights, biases, and propagates delta to previous layer.
   * @param outputDeltas Gradient of loss w.r.t pre-activation of this layer: dL / dz
   * @param prevLayerDeltas Buffer to accumulate dL / dx for the previous layer
   */
  public backward(
    outputDeltas: Float32Array,
    prevLayerDeltas: Float32Array | null,
    learningRate: number,
    momentum: number = 0.9
  ): void {
    for (let o = 0; o < this.outputsCount; o++) {
      const delta = outputDeltas[o];
      const offset = o * this.inputsCount;

      // Update bias with momentum
      this.biasMomentum[o] = momentum * this.biasMomentum[o] + delta;
      this.biases[o] -= learningRate * this.biasMomentum[o];

      for (let i = 0; i < this.inputsCount; i++) {
        const grad = delta * this.lastInputs[i];
        const idx = offset + i;

        // Gradient clipping to prevent exploding gradients
        const clippedGrad = Math.max(-5.0, Math.min(5.0, grad));
        this.weightMomentum[idx] = momentum * this.weightMomentum[idx] + clippedGrad;
        this.weights[idx] -= learningRate * this.weightMomentum[idx];

        // Backpropagate to previous layer
        if (prevLayerDeltas) {
          prevLayerDeltas[i] += delta * this.weights[idx];
        }
      }
    }
  }

  public copyFrom(other: DenselyConnectedLayer): void {
    this.weights.set(other.weights);
    this.biases.set(other.biases);
  }
}

export class BackpropNetwork {
  public layers: DenselyConnectedLayer[] = [];

  constructor(topology: number[]) {
    for (let i = 0; i < topology.length - 1; i++) {
      this.layers.push(new DenselyConnectedLayer(topology[i], topology[i + 1]));
    }
  }

  public forward(inputs: Float32Array): Float32Array {
    let current = inputs;
    for (let i = 0; i < this.layers.length; i++) {
      const isOutput = i === this.layers.length - 1;
      current = this.layers[i].forward(current, isOutput);
    }
    return current;
  }

  /**
   * Backpropagates MSE loss for a target Q-value vector.
   * Only the chosen action index contributes to the loss gradient.
   */
  public trainStep(
    inputs: Float32Array,
    actionIndex: number,
    targetQ: number,
    learningRate: number = 0.001
  ): number {
    const outputs = this.forward(inputs);
    const predictedQ = outputs[actionIndex];
    const tdError = predictedQ - targetQ;
    const loss = 0.5 * tdError * tdError;

    // Output layer deltas (dL / dz)
    const lastLayer = this.layers[this.layers.length - 1];
    const outputDeltas = new Float32Array(lastLayer.outputsCount);
    // Huber loss or clipped delta for stability
    outputDeltas[actionIndex] = Math.max(-1.0, Math.min(1.0, tdError));

    // Propagate backward through layers
    let currentDeltas = outputDeltas;
    for (let l = this.layers.length - 1; l >= 0; l--) {
      const layer = this.layers[l];
      const hasPrev = l > 0;
      const prevDeltas = hasPrev ? new Float32Array(layer.inputsCount) : null;

      layer.backward(currentDeltas, prevDeltas, learningRate);

      if (hasPrev && prevDeltas) {
        // Apply derivative of activation function for previous layer
        const prevLayer = this.layers[l - 1];
        for (let i = 0; i < prevDeltas.length; i++) {
          const z = prevLayer.lastPreActivations[i];
          const actDerivative = z > 0 ? 1.0 : 0.05; // Leaky ReLU derivative
          prevDeltas[i] *= actDerivative;
        }
        currentDeltas = prevDeltas;
      }
    }

    return loss;
  }

  public copyFrom(other: BackpropNetwork): void {
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].copyFrom(other.layers[i]);
    }
  }

  public serialize(): { weights: number[][]; biases: number[][] } {
    return {
      weights: this.layers.map((l) => Array.from(l.weights)),
      biases: this.layers.map((l) => Array.from(l.biases)),
    };
  }

  public deserialize(data: { weights: number[][]; biases: number[][] }): void {
    if (!data || !data.weights || !data.biases) return;
    for (let i = 0; i < this.layers.length && i < data.weights.length; i++) {
      if (data.weights[i].length === this.layers[i].weights.length) {
        this.layers[i].weights.set(data.weights[i]);
      }
      if (data.biases[i].length === this.layers[i].biases.length) {
        this.layers[i].biases.set(data.biases[i]);
      }
    }
  }
}
