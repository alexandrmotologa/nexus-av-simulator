export type ActivationType = 'relu' | 'tanh' | 'sigmoid' | 'linear';

export interface LayerJSON {
  inputs: number;
  outputs: number;
  weights: number[][];
  biases: number[];
  activation: ActivationType;
}

export interface NetworkJSON {
  layers: LayerJSON[];
  fitness: number;
  generation: number;
}

export class NeuralLayer {
  public inputsCount: number;
  public outputsCount: number;
  public weights: Float32Array; // Flattened [outputsCount * inputsCount]
  public biases: Float32Array;  // [outputsCount]
  public lastInputs: Float32Array;
  public lastOutputs: Float32Array;
  public activation: ActivationType;

  constructor(inputs: number, outputs: number, activation: ActivationType = 'tanh') {
    this.inputsCount = inputs;
    this.outputsCount = outputs;
    this.activation = activation;
    this.weights = new Float32Array(outputs * inputs);
    this.biases = new Float32Array(outputs);
    this.lastInputs = new Float32Array(inputs);
    this.lastOutputs = new Float32Array(outputs);
    this.randomizeXavier();
  }

  /** Xavier / Glorot weight initialization */
  public randomizeXavier(): void {
    const scale = Math.sqrt(2.0 / (this.inputsCount + this.outputsCount));
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = (Math.random() * 2 - 1) * scale;
    }
    for (let j = 0; j < this.biases.length; j++) {
      this.biases[j] = (Math.random() * 2 - 1) * 0.1;
    }
  }

  public feedForward(inputs: Float32Array | number[]): Float32Array {
    for (let i = 0; i < this.inputsCount; i++) {
      this.lastInputs[i] = inputs[i];
    }

    for (let o = 0; o < this.outputsCount; o++) {
      let sum = this.biases[o];
      const weightRowOffset = o * this.inputsCount;
      for (let i = 0; i < this.inputsCount; i++) {
        sum += this.weights[weightRowOffset + i] * inputs[i];
      }
      this.lastOutputs[o] = this.applyActivation(sum);
    }

    return this.lastOutputs;
  }

  private applyActivation(x: number): number {
    switch (this.activation) {
      case 'relu':
        return Math.max(0, x);
      case 'tanh':
        return Math.tanh(x);
      case 'sigmoid':
        return 1.0 / (1.0 + Math.exp(-x));
      case 'linear':
      default:
        return x;
    }
  }

  public clone(): NeuralLayer {
    const copy = new NeuralLayer(this.inputsCount, this.outputsCount, this.activation);
    copy.weights.set(this.weights);
    copy.biases.set(this.biases);
    return copy;
  }

  public mutate(mutationRate: number, mutationStrength: number): void {
    for (let i = 0; i < this.weights.length; i++) {
      if (Math.random() < mutationRate) {
        // Gaussian perturbation
        const u1 = Math.random();
        const u2 = Math.random();
        const normalRand = Math.sqrt(-2.0 * Math.log(u1 || 1e-7)) * Math.cos(2.0 * Math.PI * u2);
        this.weights[i] += normalRand * mutationStrength;
      }
    }
    for (let j = 0; j < this.biases.length; j++) {
      if (Math.random() < mutationRate) {
        this.biases[j] += (Math.random() * 2 - 1) * mutationStrength;
      }
    }
  }

  public toJSON(): LayerJSON {
    const weights2D: number[][] = [];
    for (let o = 0; o < this.outputsCount; o++) {
      const row: number[] = [];
      const offset = o * this.inputsCount;
      for (let i = 0; i < this.inputsCount; i++) {
        row.push(this.weights[offset + i]);
      }
      weights2D.push(row);
    }
    return {
      inputs: this.inputsCount,
      outputs: this.outputsCount,
      weights: weights2D,
      biases: Array.from(this.biases),
      activation: this.activation,
    };
  }

  public fromJSON(json: LayerJSON): void {
    this.inputsCount = json.inputs;
    this.outputsCount = json.outputs;
    this.activation = json.activation;
    for (let o = 0; o < json.outputs; o++) {
      const offset = o * json.inputs;
      for (let i = 0; i < json.inputs; i++) {
        this.weights[offset + i] = json.weights[o][i];
      }
    }
    this.biases.set(json.biases);
  }
}

export class NeuralNetwork {
  public layers: NeuralLayer[] = [];
  public fitness: number = 0;
  public generation: number = 0;

  constructor(topology: { inputs: number; outputs: number; activation: ActivationType }[] = []) {
    for (const spec of topology) {
      this.layers.push(new NeuralLayer(spec.inputs, spec.outputs, spec.activation));
    }
  }

  public addLayer(inputs: number, outputs: number, activation: ActivationType = 'tanh'): this {
    this.layers.push(new NeuralLayer(inputs, outputs, activation));
    return this;
  }

  public feedForward(inputs: number[] | Float32Array): Float32Array {
    let current = inputs instanceof Float32Array ? inputs : new Float32Array(inputs);
    for (const layer of this.layers) {
      current = layer.feedForward(current);
    }
    return current;
  }

  public clone(): NeuralNetwork {
    const copy = new NeuralNetwork();
    copy.fitness = this.fitness;
    copy.generation = this.generation;
    for (const layer of this.layers) {
      copy.layers.push(layer.clone());
    }
    return copy;
  }

  public mutate(rate: number = 0.15, strength: number = 0.3): void {
    for (const layer of this.layers) {
      layer.mutate(rate, strength);
    }
  }

  public static crossover(parentA: NeuralNetwork, parentB: NeuralNetwork): NeuralNetwork {
    const child = parentA.clone();
    for (let l = 0; l < child.layers.length; l++) {
      const layerC = child.layers[l];
      const layerB = parentB.layers[l];
      for (let w = 0; w < layerC.weights.length; w++) {
        if (Math.random() < 0.5) {
          layerC.weights[w] = layerB.weights[w];
        }
      }
      for (let b = 0; b < layerC.biases.length; b++) {
        if (Math.random() < 0.5) {
          layerC.biases[b] = layerB.biases[b];
        }
      }
    }
    return child;
  }

  public toJSON(): NetworkJSON {
    return {
      layers: this.layers.map((l) => l.toJSON()),
      fitness: this.fitness,
      generation: this.generation,
    };
  }

  public static fromJSON(json: NetworkJSON): NeuralNetwork {
    const net = new NeuralNetwork();
    net.fitness = json.fitness;
    net.generation = json.generation;
    for (const layerJson of json.layers) {
      const layer = new NeuralLayer(layerJson.inputs, layerJson.outputs, layerJson.activation);
      layer.fromJSON(layerJson);
      net.layers.push(layer);
    }
    return net;
  }
}
