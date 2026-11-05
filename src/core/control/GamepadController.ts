import { ControlInput } from '../physics/VehicleState';

export interface GamepadState {
  connected: boolean;
  id: string;
  steer: number;
  throttle: number;
  brake: number;
  resetPressed: boolean;
  handbrakePressed: boolean;
}

export class GamepadController {
  private static instance: GamepadController | null = null;
  public isConnected: boolean = false;
  public gamepadId: string = '';
  private deadzone: number = 0.08;
  private lastResetState: boolean = false;

  public static getInstance(): GamepadController {
    if (!GamepadController.instance) {
      GamepadController.instance = new GamepadController();
    }
    return GamepadController.instance;
  }

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
        this.isConnected = true;
        this.gamepadId = e.gamepad.id;
        console.log(`[Gamepad] Connected: ${e.gamepad.id}`);
      });

      window.addEventListener('gamepaddisconnected', () => {
        this.isConnected = false;
        this.gamepadId = '';
        console.log('[Gamepad] Disconnected');
      });
    }
  }

  /**
   * Polls connected gamepads and returns normalized driving control inputs.
   */
  public poll(): { input: ControlInput; reset: boolean; handbrake: boolean } | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) {
      return null;
    }

    const gamepads = navigator.getGamepads();
    let activePad: Gamepad | null = null;

    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] && gamepads[i]!.connected) {
        activePad = gamepads[i];
        break;
      }
    }

    if (!activePad) {
      this.isConnected = false;
      return null;
    }

    this.isConnected = true;
    this.gamepadId = activePad.id;

    // 1. Steering from Left Thumbstick (Axis 0)
    let rawSteer = activePad.axes[0] || 0;
    if (Math.abs(rawSteer) < this.deadzone) {
      rawSteer = 0;
    } else {
      // Smooth cubic curve for precision steering near center
      rawSteer = Math.sign(rawSteer) * Math.pow((Math.abs(rawSteer) - this.deadzone) / (1 - this.deadzone), 1.5);
    }

    // 2. Throttle: Right Trigger (Button 7 on standard mapping) or Up on D-pad
    const rt = activePad.buttons[7] ? activePad.buttons[7].value : 0;
    const btnA = activePad.buttons[0] ? (activePad.buttons[0].pressed ? 1 : 0) : 0;
    const throttle = Math.max(rt, btnA);

    // 3. Brake: Left Trigger (Button 6 on standard mapping) or Down on D-pad
    const lt = activePad.buttons[6] ? activePad.buttons[6].value : 0;
    const btnX = activePad.buttons[2] ? (activePad.buttons[2].pressed ? 1 : 0) : 0;
    const brake = Math.max(lt, btnX);

    // 4. Reset Car: Button Y / Triangle (Button 3) or Back/Select (Button 8)
    const resetBtn = Boolean(
      (activePad.buttons[3] && activePad.buttons[3].pressed) ||
      (activePad.buttons[8] && activePad.buttons[8].pressed)
    );
    const triggerReset = resetBtn && !this.lastResetState;
    this.lastResetState = resetBtn;

    // 5. Handbrake: Button B / Circle (Button 1)
    const handbrake = Boolean(activePad.buttons[1] && activePad.buttons[1].pressed);

    return {
      input: {
        steer: Math.max(-1, Math.min(1, rawSteer)),
        throttle: Math.max(0, Math.min(1, throttle)),
        brake: Math.max(0, Math.min(1, brake)),
      },
      reset: triggerReset,
      handbrake,
    };
  }

  /**
   * Triggers controller rumble / haptics (e.g. for rumble strips, ABS, or collisions).
   */
  public vibrate(weakMagnitude: number = 0.3, strongMagnitude: number = 0.5, durationMs: number = 100): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      const pad = gamepads[i];
      if (pad && pad.vibrationActuator && typeof pad.vibrationActuator.playEffect === 'function') {
        pad.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: Math.min(1.0, weakMagnitude),
          strongMagnitude: Math.min(1.0, strongMagnitude),
        }).catch(() => {});
      }
    }
  }
}
