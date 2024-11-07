import * as THREE from 'three';
const uap = new UAParser();

const getQueryParam = (paramName) => new URL(window.location.href).searchParams.get(paramName);
const PARTICLE_COUNT = ~~getQueryParam('count') || 1_000_000;
const WORKER_COUNT = uap.getResult().device.vendor === 'Apple' ? 4 : navigator.hardwareConcurrency - 1;
const WORKER_CHUNK_SIZE = Math.floor(PARTICLE_COUNT / WORKER_COUNT);
const workerPool = [];
let activeWorkers = 0;
let width = window.innerWidth;
let height = window.innerHeight;

const particleStride = 6; // 6 floats x,y,dx,dy,sx,sy;
const particleByteStride = particleStride * 4; // 4 bytes per float
const sabViewParticles = new Float32Array(new SharedArrayBuffer(PARTICLE_COUNT * particleByteStride));
const update = {
	delta: 0, width: 0, height: 0, touches: []
};

let particleGridA, particleGridB, activeParticleGrid;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 0.1, 100);
camera.position.set(width / 2, height / 2, 1);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

function resize() {
	width = window.innerWidth;
	height = window.innerHeight;
	// material.uniforms.resolution.value.set(width, height);
	update.width = width;
	update.height = height;
	renderer.setSize(width, height);
	camera.position.set(width / 2, height / 2, 10);
	camera.left = width / -2;
	camera.right = width / 2;
	camera.top = height / 2;
	camera.bottom = height / -2;
	camera.updateProjectionMatrix();

	particleGridA = new Uint8Array(new SharedArrayBuffer(width * height));
	particleGridB = new Uint8Array(new SharedArrayBuffer(width * height));
	activeParticleGrid = particleGridA;
}
resize();

let mouseDown = false;
window.addEventListener('resize', resize);
window.addEventListener('mousemove', e => {
	if (mouseDown) {
		update.touches = [{ x: e.clientX, y: height - e.clientY }];
	}
});
window.addEventListener('mousedown', e => {
	mouseDown = true;
	update.touches = [{ x: e.clientX, y: height - e.clientY }];
});
window.addEventListener('mouseup', e => {
	mouseDown = false;
	update.touches = [];
});
window.addEventListener('touchmove', e => {
	e.preventDefault();
	update.touches = [];
	for (let touch of e.targetTouches) {
		update.touches.push({ x: touch.clientX, y: height - touch.clientY });
	}
});
window.addEventListener('touchstart', e => {
	e.preventDefault();
	update.touches = [];
	for (let touch of e.targetTouches) {
		update.touches.push({ x: touch.clientX, y: height - touch.clientY });
	}
});
window.addEventListener('touchend', (e) => {
	e.preventDefault();
	update.touches = [];
});
window.addEventListener('touchcancel', (e) => {
	e.preventDefault();
	update.touches = [];
});

//setup workers
activeWorkers = WORKER_COUNT;
for (let i = 0; i < WORKER_COUNT; i++) {
	const worker = new Worker('./worker.js');
	worker.addEventListener('message', onWorkerMessage);
	workerPool.push(worker);
	worker.postMessage({
		sabViewParticles,
		particleOffsetStart: WORKER_CHUNK_SIZE * i,
		particleOffsetEnd: WORKER_CHUNK_SIZE * i + WORKER_CHUNK_SIZE,
		particleStride,
		particleGridA,
		particleGridB,
	});
}

//init particles
for (let i = 0; i < PARTICLE_COUNT; i++) {
	sabViewParticles[i * particleStride] = Math.random() * width;
	sabViewParticles[i * particleStride + 1] = Math.random() * height;
	sabViewParticles[i * particleStride + 2] = (Math.random() * 2 - 1) * 30;
	sabViewParticles[i * particleStride + 3] = (Math.random() * 2 - 1) * 30;
	sabViewParticles[i * particleStride + 4] = sabViewParticles[i * particleStride];
	sabViewParticles[i * particleStride + 5] = sabViewParticles[i * particleStride + 1];
}

function onWorkerMessage() {
	activeWorkers--;
	if (activeWorkers !== 0) {
		return;
	}
	requestAnimationFrame(runSimulation);
};

let lastTime = 1;
function runSimulation(currentTime) {
	const dt = Math.min(0.1, (currentTime - lastTime) / 1000);
	lastTime = currentTime;
	update.delta = dt;
	activeWorkers = WORKER_COUNT;
	workerPool.forEach((worker, i) => {
		worker.postMessage(update);
	});
	activeParticleGrid = activeParticleGrid === particleGridA ? particleGridB : particleGridA;
	render(activeParticleGrid);
}

let texture = new THREE.DataTexture(new Uint8Array(width * height), width, height, THREE.RedFormat, THREE.UnsignedByteType, THREE.UVMapping, THREE.ClampToEdge, THREE.ClampToEdge, THREE.NearestFilter, THREE.NearestFilter, 0);
const customMaterial = new THREE.ShaderMaterial({
	uniforms: {
		screen: { value: new THREE.Vector2(width, height) },
		uTexture: { value: texture }
	},
	vertexShader: `
	  varying vec2 vUv;
	  
	  void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	  }
  `,
	fragmentShader: `
	  uniform sampler2D uTexture;
	  uniform vec2 screen;
	  varying vec2 vUv;

	  void main() {
		float count = texture2D(uTexture, vUv).x;
		vec4 col = vec4(0,0,0,1);
		col.x = count * (5. + 20.*gl_FragCoord.x / screen.x);
		col.y = count * (5. + 20.*gl_FragCoord.y / screen.y);
		col.z = count * (5. + 20.*(1.-gl_FragCoord.y / screen.y));
		gl_FragColor = col;
	  }
  `,
	blending: THREE.AdditiveBlending,
	depthTest: false,
});

const geometry = new THREE.PlaneGeometry(width, height);
const quad = new THREE.Mesh(geometry, customMaterial);
quad.position.set(width / 2, height / 2, 0);
scene.add(quad);

function render(grid) {
	// const attrArray = geometry.getAttribute('position').array;
	// for(let i = 0; i < PARTICLE_COUNT;i++) {
	//   attrArray[i*2] = sabViewParticles[i*particleStride];
	//   attrArray[i*2+1] = sabViewParticles[i*particleStride+1];
	// }
	// geometry.getAttribute('position').needsUpdate = true;
	texture.image.data.set(grid);
	texture.needsUpdate = true;
	renderer.render(scene, camera);
	grid.fill(0);
}