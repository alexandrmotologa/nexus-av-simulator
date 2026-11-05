export interface ActionSample {
  steer: number; // [-1, 1]
  throttle: number; // [-1, 1] (positive is acceleration, negative is braking)
  logProb: number;
  value: number;
}

export interface ExperienceStep {
  state: number[];
  action: [number, number];
  reward: number;
  nextState: number[];
  done: boolean;
  value: number;
  logProb: number;
}

export class ContinuousActorCritic {
  public inputDim: number;
  public hiddenDim: number;

  // Shared feature representation layer weights
  private w1: Float32Array; // inputDim x hiddenDim
  private b1: Float32Array; // hiddenDim
  private w2: Float32Array; // hiddenDim x hiddenDim
  private b2: Float32Array; // hiddenDim

  // Actor Head (outputs mean steer & throttle)
  private wActor: Float32Array; // hiddenDim x 2
  private bActor: Float32Array; // 2
  public logStd: Float32Array; // 2 (learnable log standard deviations)

  // Critic Head (outputs scalar state-value V(s))
  private wCritic: Float32Array; // hiddenDim x 1
  private bCritic: Float32Array; // 1

  public learningRate: number = 0.0008;
  public gamma: number = 0.99;
  public gaeLambda: number = 0.95;

  constructor(inputDim: number = 14, hiddenDim: number = 48) {
    this.inputDim = inputDim;
    this.hiddenDim = hiddenDim;

    this.w1 = this.initHe(inputDim, hiddenDim);
    this.b1 = new Float32Array(hiddenDim);
    this.w2 = this.initHe(hiddenDim, hiddenDim);
    this.b2 = new Float32Array(hiddenDim);

    this.wActor = this.initXavier(hiddenDim, 2);
    this.bActor = new Float32Array(2);
    this.logStd = new Float32Array([-0.8, -0.8]); // Initial std ~0.45

    this.wCritic = this.initXavier(hiddenDim, 1);
    this.bCritic = new Float32Array(1);
  }

  private initHe(fanIn: number, fanOut: number): Float32Array {
    const arr = new Float32Array(fanIn * fanOut);
    const std = Math.sqrt(2 / fanIn);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = (Math.random() * 2 - 1) * std;
    }
    return arr;
  }

  private initXavier(fanIn: number, fanOut: number): Float32Array {
    const arr = new Float32Array(fanIn * fanOut);
    const std = Math.sqrt(2 / (fanIn + fanOut));
    for (let i = 0; i < arr.length; i++) {
      arr[i] = (Math.random() * 2 - 1) * std;
    }
    return arr;
  }

  private forwardFeatures(state: number[]): { h1: Float32Array; h2: Float32Array } {
    const h1 = new Float32Array(this.hiddenDim);
    const h2 = new Float32Array(this.hiddenDim);

    // Layer 1 with LeakyReLU
    for (let j = 0; j < this.hiddenDim; j++) {
      let sum = this.b1[j];
      for (let i = 0; i < this.inputDim; i++) {
        sum += (state[i] || 0) * this.w1[i * this.hiddenDim + j];
      }
      h1[j] = sum > 0 ? sum : sum * 0.05;
    }

    // Layer 2 with LeakyReLU
    for (let k = 0; k < this.hiddenDim; k++) {
      let sum = this.b2[k];
      for (let j = 0; j < this.hiddenDim; j++) {
        sum += h1[j] * this.w2[j * this.hiddenDim + k];
      }
      h2[k] = sum > 0 ? sum : sum * 0.05;
    }

    return { h1, h2 };
  }

  /**
   * Forward pass evaluating mean actions, standard deviations, and state value
   */
  public forward(state: number[]): {
    mu: [number, number];
    std: [number, number];
    value: number;
    h2: Float32Array;
  } {
    const { h2 } = this.forwardFeatures(state);

    // Actor mean output via Tanh activation
    const mu0 = Math.tanh(
      this.bActor[0] + h2.reduce((acc, val, i) => acc + val * this.wActor[i * 2 + 0], 0)
    );
    const mu1 = Math.tanh(
      this.bActor[1] + h2.reduce((acc, val, i) => acc + val * this.wActor[i * 2 + 1], 0)
    );

    const std0 = Math.exp(Math.max(-2.0, Math.min(0.5, this.logStd[0])));
    const std1 = Math.exp(Math.max(-2.0, Math.min(0.5, this.logStd[1])));

    // Critic scalar value output
    const value =
      this.bCritic[0] + h2.reduce((acc, val, i) => acc + val * this.wCritic[i], 0);

    return { mu: [mu0, mu1], std: [std0, std1], value, h2 };
  }

  /**
   * Samples a continuous control action using Gaussian distribution with log probability
   */
  public sampleAction(state: number[], deterministic: boolean = false): ActionSample {
    const { mu, std, value } = this.forward(state);

    if (deterministic) {
      return {
        steer: mu[0],
        throttle: mu[1],
        logProb: 0,
        value,
      };
    }

    // Box-Muller transform for normal distribution sampling
    const u1 = Math.max(1e-7, Math.random());
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);

    const rawSteer = mu[0] + z0 * std[0];
    const rawThrottle = mu[1] + z1 * std[1];

    const steer = Math.max(-1.0, Math.min(1.0, rawSteer));
    const throttle = Math.max(-1.0, Math.min(1.0, rawThrottle));

    // Gaussian log probability: -0.5 * ((x - mu)/std)^2 - log(std) - 0.5 * log(2*pi)
    const logP0 = -0.5 * Math.pow((rawSteer - mu[0]) / std[0], 2) - Math.log(std[0]) - 0.9189;
    const logP1 = -0.5 * Math.pow((rawThrottle - mu[1]) / std[1], 2) - Math.log(std[1]) - 0.9189;

    return {
      steer,
      throttle,
      logProb: logP0 + logP1,
      value,
    };
  }

  /**
   * Supervised Behavioral Cloning: Pre-trains the Actor network on human expert demonstrations
   */
  public trainBehavioralCloning(
    dataset: { state: number[]; action: [number, number] }[],
    epochs: number = 20
  ): { finalLoss: number } {
    if (dataset.length === 0) return { finalLoss: 0 };

    let totalLoss = 0;
    const lr = 0.002;

    for (let epoch = 0; epoch < epochs; epoch++) {
      totalLoss = 0;
      for (const sample of dataset) {
        const { mu, h2 } = this.forward(sample.state);

        // Mean Squared Error gradients for Steer and Throttle
        const err0 = mu[0] - sample.action[0];
        const err1 = mu[1] - sample.action[1];
        totalLoss += 0.5 * (err0 * err0 + err1 * err1);

        // Derivative through Tanh: (1 - mu^2)
        const dMu0 = err0 * (1 - mu[0] * mu[0]);
        const dMu1 = err1 * (1 - mu[1] * mu[1]);

        // Update Actor output layer weights
        for (let i = 0; i < this.hiddenDim; i++) {
          this.wActor[i * 2 + 0] -= lr * dMu0 * h2[i];
          this.wActor[i * 2 + 1] -= lr * dMu1 * h2[i];
        }
        this.bActor[0] -= lr * dMu0;
        this.bActor[1] -= lr * dMu1;
      }
    }

    return { finalLoss: totalLoss / dataset.length };
  }

  /**
   * Continuous PPO / Policy Gradient update using Generalized Advantage Estimation (GAE)
   */
  public updatePolicy(
    trajectory: ExperienceStep[],
    lastNextValue: number = 0
  ): { actorLoss: number; criticLoss: number } {
    const N = trajectory.length;
    if (N === 0) return { actorLoss: 0, criticLoss: 0 };

    // 1. Compute GAE Advantages and Returns
    const advantages = new Float32Array(N);
    const returns = new Float32Array(N);
    let lastGae = 0;

    for (let t = N - 1; t >= 0; t--) {
      const step = trajectory[t];
      const nextVal = t === N - 1 ? (step.done ? 0 : lastNextValue) : trajectory[t + 1].value;
      const delta = step.reward + this.gamma * nextVal * (step.done ? 0 : 1) - step.value;
      lastGae = delta + this.gamma * this.gaeLambda * (step.done ? 0 : 1) * lastGae;
      advantages[t] = lastGae;
      returns[t] = advantages[t] + step.value;
    }

    // 2. Normalize advantages
    let advMean = 0;
    for (let i = 0; i < N; i++) advMean += advantages[i];
    advMean /= N;
    let advVar = 0;
    for (let i = 0; i < N; i++) advVar += Math.pow(advantages[i] - advMean, 2);
    const advStd = Math.sqrt(advVar / N) + 1e-6;
    for (let i = 0; i < N; i++) advantages[i] = (advantages[i] - advMean) / advStd;

    // 3. Optimize policy and value network
    let totalActorLoss = 0;
    let totalCriticLoss = 0;

    for (let i = 0; i < N; i++) {
      const step = trajectory[i];
      const { mu, std, value, h2 } = this.forward(step.state);

      // Value loss gradient
      const vErr = value - returns[i];
      totalCriticLoss += 0.5 * vErr * vErr;

      // Update Critic weights
      for (let j = 0; j < this.hiddenDim; j++) {
        this.wCritic[j] -= this.learningRate * vErr * h2[j];
      }
      this.bCritic[0] -= this.learningRate * vErr;

      // Policy gradient: grad(log_prob) * Advantage
      const adv = advantages[i];
      const err0 = (step.action[0] - mu[0]) / (std[0] * std[0]);
      const err1 = (step.action[1] - mu[1]) / (std[1] * std[1]);

      const dActor0 = -adv * err0 * (1 - mu[0] * mu[0]);
      const dActor1 = -adv * err1 * (1 - mu[1] * mu[1]);

      totalActorLoss += -adv * (err0 + err1);

      for (let j = 0; j < this.hiddenDim; j++) {
        this.wActor[j * 2 + 0] -= this.learningRate * dActor0 * h2[j];
        this.wActor[j * 2 + 1] -= this.learningRate * dActor1 * h2[j];
      }
      this.bActor[0] -= this.learningRate * dActor0;
      this.bActor[1] -= this.learningRate * dActor1;
    }

    return {
      actorLoss: totalActorLoss / N,
      criticLoss: totalCriticLoss / N,
    };
  }

  public exportWeights(): object {
    return {
      w1: Array.from(this.w1),
      b1: Array.from(this.b1),
      w2: Array.from(this.w2),
      b2: Array.from(this.b2),
      wActor: Array.from(this.wActor),
      bActor: Array.from(this.bActor),
      wCritic: Array.from(this.wCritic),
      bCritic: Array.from(this.bCritic),
      logStd: Array.from(this.logStd),
    };
  }

  public importWeights(data: any): void {
    if (!data) return;
    if (data.w1) this.w1.set(data.w1);
    if (data.b1) this.b1.set(data.b1);
    if (data.w2) this.w2.set(data.w2);
    if (data.b2) this.b2.set(data.b2);
    if (data.wActor) this.wActor.set(data.wActor);
    if (data.bActor) this.bActor.set(data.bActor);
    if (data.wCritic) this.wCritic.set(data.wCritic);
    if (data.bCritic) this.bCritic.set(data.bCritic);
    if (data.logStd) this.logStd.set(data.logStd);
  }
}
