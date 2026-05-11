// F450 quadcopter physical parameters - ported from accurate-drone-model/config.py

export const PHYSICS_HZ = 1000;
export const PHYSICS_DT = 1.0 / PHYSICS_HZ;
export const RENDER_FPS = 60;
export const STEPS_PER_FRAME = Math.floor(PHYSICS_HZ / RENDER_FPS);

// Frame geometry (X-frame, NED body frame: x-forward, y-right, z-down)
export const ARM_LENGTH = 0.159; // center to motor distance on each axis [m]

// Motor positions [x, y, z] in body frame (NED)
// ArduPilot motor ordering: 1=FR(CCW), 2=BL(CCW), 3=FL(CW), 4=BR(CW)
export const MOTOR_POSITIONS: [number, number, number][] = [
  [+ARM_LENGTH, +ARM_LENGTH, 0.0], // Motor 1: FR
  [-ARM_LENGTH, -ARM_LENGTH, 0.0], // Motor 2: BL
  [+ARM_LENGTH, -ARM_LENGTH, 0.0], // Motor 3: FL
  [-ARM_LENGTH, +ARM_LENGTH, 0.0], // Motor 4: BR
];

// +1 = CW, -1 = CCW. Motors 1,2 are CCW; Motors 3,4 are CW
export const MOTOR_DIRECTIONS = [-1, -1, +1, +1];

// Mass and inertia
export const MASS = 1.2; // [kg]
export const INERTIA = [0.010, 0.010, 0.018]; // diagonal inertia tensor [kg*m^2]

// Motor model
export const PWM_MIN = 1000.0; // [us]
export const PWM_MAX = 2000.0; // [us]
export const MOTOR_MAX_OMEGA = 785.0; // [rad/s] (~7500 RPM)

// Thrust: F = KT * omega^2
const PROP_DIAMETER = 0.2388; // [m]
const PROP_CT = 0.125;
export const MOTOR_KT = PROP_CT * 1.225 * Math.pow(PROP_DIAMETER, 4) / (4 * Math.PI * Math.PI);

// Torque: tau = KQ * omega^2
export const MOTOR_KQ = MOTOR_KT * 0.016;

// Motor response time constant
export const MOTOR_TAU = 0.05; // [s]

// Environment
export const GRAVITY = 9.81; // [m/s^2]
export const LINEAR_DRAG_COEFF = 0.15; // [N/(m/s)]
export const LANDING_GEAR_HEIGHT = 0.0; // [m] model origin is at bottom

// Initial conditions
export const INITIAL_ALTITUDE = 0.0; // [m] start on ground

// Home location (Canberra, same as ArduPilot default)
export const HOME_LAT = -35.363261;
export const HOME_LON = 149.165230;
export const HOME_ALT = 584.0;
export const HOME_YAW = 353.0;
