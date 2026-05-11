import * as THREE from 'three';
import { Terrain } from './terrain';

export class Environment {
  constructor(_scene: THREE.Scene, _terrain: Terrain) {}

  checkCollision(_north: number, _east: number, _down: number): { pushNorth: number; pushEast: number } | null {
    return null;
  }
}
