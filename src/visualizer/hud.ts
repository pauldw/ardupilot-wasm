export class HUD {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.getElementById('hud') as HTMLDivElement;
  }

  update(data: {
    altitude: number;
    speed: number;
    roll: number;
    pitch: number;
    yaw: number;
    motorPwm: number[];
    mode: string;
    armed: boolean;
    simTime: number;
  }): void {
    const { altitude, speed, roll, pitch, yaw, motorPwm, mode, armed, simTime } = data;
    this.el.innerHTML = `
      <div class="hud-row"><span>Alt:</span> ${altitude.toFixed(1)} m</div>
      <div class="hud-row"><span>Spd:</span> ${speed.toFixed(1)} m/s</div>
      <div class="hud-row"><span>R/P/Y:</span> ${roll.toFixed(1)}° / ${pitch.toFixed(1)}° / ${yaw.toFixed(1)}°</div>
      <div class="hud-row"><span>Mode:</span> ${mode}</div>
      <div class="hud-row"><span>Armed:</span> ${armed ? 'YES' : 'NO'}</div>
      <div class="hud-row"><span>PWM:</span> ${motorPwm.map(v => v.toFixed(0)).join(' / ')}</div>
      <div class="hud-row"><span>Time:</span> ${simTime.toFixed(1)}s</div>
    `;
  }
}
