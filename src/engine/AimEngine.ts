import * as THREE from 'three';
import {
  angularDistance,
  Measurement,
  snapPosition,
  trackingHit,
  trackingPosition,
} from '../core/motion';
import type { Setup, TrialMetrics, TrialTask } from '../core/types';

export class AimEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private target: THREE.Group;
  private ring: THREE.Mesh;
  private frame = 0;
  private observer: ResizeObserver;
  private yaw = 0;
  private pitch = 0;
  private measurement = new Measurement();
  private start = 0;
  private lastTime = 0;
  private targetIndex = 0;
  private targetSpawn = 0;
  private targetPosition = { yaw: 0, pitch: 0 };
  private running = false;
  private disposed = false;
  private orientations: { time: number; yaw: number; pitch: number }[] = [
    { time: 0, yaw: 0, pitch: 0 },
  ];
  constructor(
    private container: HTMLElement,
    private task: TrialTask,
    private setup: Setup,
    private onTick: (remaining: number, metrics: TrialMetrics, hit: boolean) => void,
    private onComplete: (metrics: TrialMetrics) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor('#0c151b');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 150);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.y = 1.6;
    this.scene.fog = new THREE.Fog('#0c151b', 18, 65);
    this.scene.add(new THREE.HemisphereLight('#b7e5ee', '#17222c', 2));
    const light = new THREE.DirectionalLight('#d4faff', 2);
    light.position.set(2, 6, 2);
    this.scene.add(light);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: '#15222b', roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(140, 70, '#31505b', '#20323c');
    grid.position.y = -2.998;
    this.scene.add(grid);
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 40),
      new THREE.MeshStandardMaterial({ color: '#14232d', roughness: 1 }),
    );
    back.position.set(0, 15, -40);
    this.scene.add(back);
    for (let i = -6; i <= 6; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 30, 0.03),
        new THREE.MeshBasicMaterial({ color: i % 3 ? '#20333d' : '#2a4852' }),
      );
      bar.position.set(i * 5, 12, -39.9);
      this.scene.add(bar);
    }
    this.target = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: '#66e4d5',
      emissive: '#2b756e',
      emissiveIntensity: 0.35,
      metalness: 0.15,
      roughness: 0.45,
    });
    const geometry =
      task.drill === 'snap'
        ? new THREE.SphereGeometry(0.52, 32, 24)
        : new THREE.CapsuleGeometry(0.52, 1.4, 12, 24);
    this.target.add(new THREE.Mesh(geometry, material));
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.73, 0.75, 64),
      new THREE.MeshBasicMaterial({
        color: '#65dacd',
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      }),
    );
    if (task.drill === 'snap') this.target.add(this.ring);
    this.scene.add(this.target);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.positionTarget(0);
    this.render();
  }
  private resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    const horizontal = this.task.drill === 'ads' ? this.setup.adsFov : this.setup.hipFov;
    const vertical = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(horizontal) / 2) / (16 / 9));
    this.camera.fov = THREE.MathUtils.radToDeg(vertical);
    this.camera.updateProjectionMatrix();
  }
  private positionTarget(time: number) {
    this.targetPosition =
      this.task.drill === 'snap'
        ? snapPosition(this.targetIndex, this.task.seed)
        : trackingPosition(time, this.task.seed);
    const yaw = THREE.MathUtils.degToRad(this.targetPosition.yaw),
      pitch = THREE.MathUtils.degToRad(this.targetPosition.pitch);
    this.target.position.set(
      Math.sin(yaw) * Math.cos(pitch) * 20,
      1.6 + Math.sin(pitch) * 20,
      -Math.cos(yaw) * Math.cos(pitch) * 20,
    );
    this.target.lookAt(this.camera.position);
  }
  startTrial() {
    this.running = true;
    this.start = performance.now();
    this.lastTime = 0;
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mousedown', this.onClick);
  }
  private orientationAt(time: number) {
    let i = this.orientations.length - 1;
    while (i > 0 && this.orientations[i].time > time) i--;
    return this.orientations[i];
  }
  private measureUntil(time: number) {
    const sample = (until: number) =>
      this.measurement.sampleUntil(until, (at) => {
        const camera = this.orientationAt(at);
        const target =
          this.task.drill === 'snap' ? this.targetPosition : trackingPosition(at, this.task.seed);
        return {
          hit:
            this.task.drill === 'snap'
              ? angularDistance(camera, target) <= 1.49
              : trackingHit(camera, target),
          error: angularDistance(camera, target),
        };
      });
    if (this.task.drill === 'snap') {
      while (time >= this.targetSpawn + 2.5) {
        sample(this.targetSpawn + 2.5);
        this.targetSpawn += 2.5;
        this.targetIndex++;
        this.positionTarget(this.targetSpawn);
      }
    }
    sample(time);
    const keep = this.orientations.filter((o) => o.time >= time);
    const last = this.orientationAt(time);
    this.orientations = [last, ...keep];
  }
  private onMove = (event: MouseEvent) => {
    if (!this.running) return;
    const scale = this.task.angular * (this.task.drill === 'ads' ? this.setup.adsMultiplier : 1);
    const time = (performance.now() - this.start) / 1000;
    if (time >= this.task.duration) return;
    this.yaw += event.movementX * scale;
    this.pitch = Math.max(-85, Math.min(85, this.pitch - event.movementY * scale));
    this.orientations.push({ time, yaw: this.yaw, pitch: this.pitch });
  };
  private onClick = (event: MouseEvent) => {
    if (!this.running || this.task.drill !== 'snap' || event.button !== 0) return;
    const time = (performance.now() - this.start) / 1000;
    if (time >= this.task.duration) return;
    this.measureUntil(time);
    this.measurement.shots++;
    if (angularDistance({ yaw: this.yaw, pitch: this.pitch }, this.targetPosition) <= 1.49) {
      this.measurement.hits++;
      this.measurement.acquisitionTimes.push(time - this.targetSpawn);
      this.targetSpawn = time;
      this.targetIndex++;
      this.positionTarget(time);
    }
  };
  private render = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.render);
    const time = this.running
      ? Math.min(this.task.duration, (performance.now() - this.start) / 1000)
      : 0;
    if (this.running) {
      // Never count a suspended renderer as player performance.
      if (time - this.lastTime > 0.5 && this.lastTime > 0) {
        this.stop();
        this.container.dispatchEvent(new CustomEvent('trainer-stalled'));
        return;
      }
      this.measureUntil(time);
      this.positionTarget(time);
      this.lastTime = time;
      const hit =
        this.task.drill === 'snap'
          ? angularDistance({ yaw: this.yaw, pitch: this.pitch }, this.targetPosition) <= 1.49
          : trackingHit({ yaw: this.yaw, pitch: this.pitch }, this.targetPosition);
      const metrics = this.measurement.finish(this.task.drill, Math.max(time, 0.001));
      this.onTick(this.task.duration - time, metrics, hit);
      if (time >= this.task.duration) {
        this.stop();
        this.onComplete(this.measurement.finish(this.task.drill, this.task.duration));
      }
    }
    this.camera.rotation.y = -THREE.MathUtils.degToRad(this.yaw);
    this.camera.rotation.x = THREE.MathUtils.degToRad(this.pitch);
    this.renderer.render(this.scene, this.camera);
  };
  stop() {
    this.running = false;
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mousedown', this.onClick);
  }
  dispose() {
    this.stop();
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
