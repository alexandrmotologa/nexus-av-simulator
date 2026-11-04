# Nexus AV Simulator: Architectural Specification

This document details the mathematical models, coordinate reference frames, sensor algorithms, and learning pipelines implemented in the Nexus AV Simulator.

---

## 1. Coordinate Frames & Transformations

The simulator maintains two primary spatial representations:

### 1.1 Cartesian World Frame
Planar world coordinates are defined by 2D vectors:
$$\mathbf{p} = \begin{bmatrix} x \\ y \end{bmatrix} \in \mathbb{R}^2$$

Heading angle $\theta \in [-\pi, \pi]$ represents yaw with respect to the positive x-axis.

### 1.2 Frenet-Serret Road Frame
To decouple longitudinal progression along curved roads from lateral lane alignment, coordinates are transformed into a Frenet frame:
$$\mathbf{q}_{\text{frenet}} = \begin{bmatrix} s \\ d \end{bmatrix}$$

* $s \ge 0$: Longitudinal distance along the reference centerline spline.
* $d \in \mathbb{R}$: Signed orthogonal offset from the centerline (positive indicates left, negative indicates right).

#### Spline Interpolation & Projection
Track curves are synthesized using non-uniform Catmull-Rom splines with arc-length parametrization. For any Cartesian point $\mathbf{p}$, the Frenet projection finds the parameter $t^*$ minimizing Euclidean distance:
$$t^* = \arg\min_t \|\mathbf{r}(t) - \mathbf{p}\|_2$$

The tangent vector $\mathbf{t}$ and unit normal $\mathbf{n}$ define local road curvature:
$$\kappa(s) = \frac{x'(s)y''(s) - y'(s)x''(s)}{(x'(s)^2 + y'(s)^2)^{3/2}}$$

---

## 2. Vehicle Dynamics: Kinematic Bicycle Model

Vehicles are modeled as front-wheel steered kinematic bicycles operating on variable-friction surfaces.

### 2.1 State Vector
$$\mathbf{x} = \begin{bmatrix} x & y & \theta & v & \delta \end{bmatrix}^T$$

* $(x, y)$: Coordinates of the rear axle center.
* $\theta$: Vehicle yaw orientation.
* $v$: Longitudinal velocity.
* $\delta$: Front wheel steering angle ($|\delta| \le \delta_{\max} = 35^\circ$).

### 2.2 Equations of Motion
$$\begin{aligned}
\dot{x} &= v \cos(\theta + \beta) \\
\dot{y} &= v \sin(\theta + \beta) \\
\dot{\theta} &= \frac{v}{l_r} \sin(\beta) \\
\dot{v} &= a_{\text{long}} - \text{sign}(v) \cdot c_{\text{drag}} v^2 \\
\beta &= \arctan\left(\frac{l_r}{l_f + l_r} \tan(\delta)\right)
\end{aligned}$$

Where $l_f = 1.3\text{ m}$ is the distance from the center of gravity to the front axle, and $l_r = 1.5\text{ m}$ is the distance to the rear axle.

### 2.3 Tire Grip & Friction Circle Limits
Maximum lateral acceleration is bounded by tire-road friction coefficient $\mu$:
$$a_{\text{lat}} = v^2 \cdot \left| \frac{\sin(\beta)}{l_r} \right| \le \mu g$$

* In Dry mode, $\mu g \approx 8.5\text{ m/s}^2$.
* In Wet mode, $\mu g \approx 4.5\text{ m/s}^2$, inducing understeer and prolonged stopping distances.

---

## 3. Perception & Sensor Physics

### 3.1 360-Degree LiDAR Raycasting
The LiDAR emits $N = 24$ planar beams evenly distributed over $2\pi$ radians:
$$\theta_i = \theta + \frac{2\pi i}{N}, \quad i \in \{0, \dots, N-1\}$$

Each ray is tested against:
1. **Outer and Inner Track Polyline Segments**: Parametric line-segment intersection tests.
2. **Dynamic Vehicles**: Oriented bounding boxes (OBBs) tested via ray-OBB clipping.
3. **Circular Obstacles (Traffic Cones)**: Analytic ray-circle quadratic roots:
   $$\|\mathbf{p}_{\text{ray}}(t) - \mathbf{c}_{\text{cone}}\|^2 = r_{\text{cone}}^2$$

Ray distances are normalized into $[0, 1]$ and passed directly to neural and reinforcement learning controllers.

### 3.2 Doppler Radar
Long-range radar evaluates obstacles within a forward cone of aperture $\alpha = 40^\circ$ up to range $R_{\max} = 70\text{ m}$. Along with range $r$, it outputs closing velocity:
$$\Delta v = (\mathbf{v}_{\text{lead}} - \mathbf{v}_{\text{ego}}) \cdot \frac{\mathbf{p}_{\text{lead}} - \mathbf{p}_{\text{ego}}}{\|\mathbf{p}_{\text{lead}} - \mathbf{p}_{\text{ego}}\|}$$

---

## 4. Collision Detection: Separating Axis Theorem (SAT)

Bumper-to-bumper vehicle contacts and road boundary collisions use the Separating Axis Theorem for convex polygons.

For two oriented bounding boxes $A$ and $B$, four candidate separating axes are evaluated (the surface normals of both rectangles):
$$\mathbf{u}_1, \mathbf{u}_2 \in \text{Normals}(A), \quad \mathbf{u}_3, \mathbf{u}_4 \in \text{Normals}(B)$$

If for any axis $\mathbf{u}_k$, the projected intervals $[a_{\min}, a_{\max}]$ and $[b_{\min}, b_{\max}]$ do not overlap:
$$\max(a_{\min}, b_{\min}) > \min(a_{\max}, b_{\max})$$
the bodies are non-colliding. If all four axes overlap, an intersection is detected, triggering damage flags, skidmark generation, and learning penalties.

---

## 5. Traffic Behavioral Models

### 5.1 IDM (Intelligent Driver Model)
Longitudinal acceleration for NPC traffic is computed via:
$$a_{\text{IDM}} = a_{\max} \left[ 1 - \left(\frac{v}{v_0}\right)^\delta - \left(\frac{s^*(v, \Delta v)}{s}\right)^2 \right]$$

Where the desired dynamic gap $s^*$ is:
$$s^*(v, \Delta v) = s_0 + v T + \frac{v \Delta v}{2 \sqrt{a_{\max} b_{\text{comf}}}}$$

* $s_0 = 3.5\text{ m}$: Minimum standstill spacing.
* $T = 1.4\text{ s}$: Desired time headway.
* $a_{\max} = 3.0\text{ m/s}^2$: Maximum acceleration.
* $b_{\text{comf}} = 2.5\text{ m/s}^2$: Comfortable deceleration.

### 5.2 MOBIL Lane-Changing Model
An agent in lane $c$ considers changing to adjacent lane $t$ if:
$$a_t - a_c + p \cdot \left[ (a_{t, \text{new\_follower}} - a_{t, \text{old\_follower}}) + (a_{c, \text{new\_follower}} - a_{c, \text{old\_follower}}) \right] > \Delta a_{\text{th}}$$

Where $p = 0.2$ is the politeness factor, and $\Delta a_{\text{th}} = 0.35\text{ m/s}^2$ prevents oscillating lane switches.

---

## 6. Artificial Intelligence Architectures

### 6.1 Neuroevolution (Genetic Algorithm)
* **Architecture**: Fully-connected MLP with layer topology $[24, 18, 12, 3]$.
* **Activations**: Leaky ReLU on hidden layers ($\alpha = 0.05$), Tanh on output layer.
* **Outputs**:
  * Output 0: Throttle ($[0, 1]$ mapped from positive activations).
  * Output 1: Brake ($[0, 1]$ mapped from negative activations, ensuring uncoupled operation).
  * Output 2: Steering angle ($\delta \in [-1, 1]$).
* **Elitism and Crossover**: Top 10% individuals survive unmodified. Remaining candidates are created via uniform weight crossover and Gaussian mutation ($\sigma = 0.35$, rate $= 15\%$).

### 6.2 Deep Q-Learning with Prioritized Mistake Buffer
* **Network**: 4-layer Backpropagation MLP $[24, 32, 24, 7]$ with momentum gradient descent ($\beta = 0.9$).
* **Replay Sampling**:
  * General Memory buffer: Up to 5,000 transitions.
  * Mistake Memory buffer: Up to 1,500 critical failure transitions (collisions, grass incursions, wall scrapes).
  * Batch composition: 65% mistake transitions, 35% general transitions per training cycle.
* **Loss Function**: Smooth L1 (Huber) loss applied to Temporal Difference error:
  $$\delta_{\text{TD}} = r + \gamma \max_{a'} Q_{\text{target}}(s', a') - Q(s, a)$$
