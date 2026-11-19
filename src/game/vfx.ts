import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

export class VfxSystem {
  private readonly particles: Particle[] = [];
  private readonly tireMarks: THREE.InstancedMesh;
  private readonly markMatrix = new THREE.Matrix4();
  private readonly markQuaternion = new THREE.Quaternion();
  private cursor = 0;
  private markCursor = 0;

  constructor(scene: THREE.Scene, private readonly random: () => number, private readonly mobile = false) {
    const geometry = new THREE.TetrahedronGeometry(0.09, 0);
    for (let i = 0; i < 96; i += 1) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
    }
    const markGeometry = new THREE.PlaneGeometry(0.18, 0.72);
    markGeometry.rotateX(-Math.PI / 2);
    this.tireMarks = new THREE.InstancedMesh(
      markGeometry,
      new THREE.MeshBasicMaterial({ color: 0x17252a, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      180,
    );
    this.tireMarks.frustumCulled = false;
    for (let i = 0; i < 180; i += 1) {
      this.markMatrix.makeScale(0, 0, 0);
      this.tireMarks.setMatrixAt(i, this.markMatrix);
    }
    this.tireMarks.instanceMatrix.needsUpdate = true;
    scene.add(this.tireMarks);
  }

  burst(position: THREE.Vector3, color: string, count = 14): void {
    const emitCount = this.mobile ? Math.min(count, 2) : count;
    for (let i = 0; i < emitCount; i += 1) {
      const particle = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.particles.length;
      particle.mesh.position.copy(position);
      particle.mesh.position.y += 0.35;
      particle.mesh.visible = true;
      particle.mesh.scale.setScalar(0.7 + this.random() * 1.6);
      (particle.mesh.material as THREE.MeshBasicMaterial).color.set(color);
      (particle.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      const angle = this.random() * Math.PI * 2;
      const speed = 1.8 + this.random() * 3;
      particle.velocity.set(Math.cos(angle) * speed, 1.5 + this.random() * 3, Math.sin(angle) * speed);
      particle.life = 0.5 + this.random() * 0.35;
    }
  }

  tireMark(position: THREE.Vector3, yaw: number): void {
    this.markQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const markPosition = position.clone();
    markPosition.y += 0.028;
    this.markMatrix.compose(markPosition, this.markQuaternion, new THREE.Vector3(1, 1, 1));
    this.tireMarks.setMatrixAt(this.markCursor, this.markMatrix);
    this.markCursor = (this.markCursor + 1) % 180;
    this.tireMarks.instanceMatrix.needsUpdate = true;
  }

  update(delta: number): void {
    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      particle.life -= delta;
      particle.velocity.y -= 7 * delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.rotation.x += delta * 5;
      particle.mesh.rotation.y += delta * 7;
      (particle.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, particle.life * 1.7);
      if (particle.life <= 0) particle.mesh.visible = false;
    }
  }
}
