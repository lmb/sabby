import * as THREE from 'three';
const uap = new UAParser();

class Renderer {
	constructor(container, width, height) {
		this.scene = new THREE.Scene();
		this.camera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 0.1, 100);
		this.camera.position.set(width / 2, height / 2, 1);

		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setSize(width, height);

		this.texture = new THREE.DataTexture(new Uint8Array(width * height), width, height, THREE.RedFormat, THREE.UnsignedByteType, THREE.UVMapping, THREE.ClampToEdge, THREE.ClampToEdge, THREE.NearestFilter, THREE.NearestFilter, 0);
		this.material = new THREE.ShaderMaterial({
			uniforms: {
				screen: { value: new THREE.Vector2(width, height) },
				uTexture: { value: this.texture }
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
		this.quad = new THREE.Mesh(geometry, this.material);
		this.quad.position.set(width / 2, height / 2, 0);
		this.scene.add(this.quad);

		container.appendChild(this.renderer.domElement);
	}

	resize(width, height) {
		this.renderer.setSize(width, height);
		this.camera.position.set(width / 2, height / 2, 1);
		this.camera.left = width / -2;
		this.camera.right = width / 2;
		this.camera.top = height / 2;
		this.camera.bottom = height / -2;
		this.camera.updateProjectionMatrix();

		this.quad.geometry.dispose();
		this.quad.geometry = new THREE.PlaneGeometry(width, height);
		this.quad.position.set(width / 2, height / 2, 0);

		this.texture.dispose();
		this.texture = new THREE.DataTexture(new Uint8Array(width * height), width, height, THREE.RedFormat, THREE.UnsignedByteType, THREE.UVMapping, THREE.ClampToEdge, THREE.ClampToEdge, THREE.NearestFilter, THREE.NearestFilter, 0);
		this.texture.needsUpdate = true;
		this.material.uniforms.screen.value.set(width, height);
		this.material.uniforms.uTexture.value = this.texture;
		this.material.needsUpdate = true;
	}

	render(grid) {
		this.texture.image.data.set(grid);
		this.texture.needsUpdate = true;
		this.renderer.render(this.scene, this.camera);
		grid.fill(0);
	}
}

const getQueryParam = (paramName) => new URL(window.location.href).searchParams.get(paramName);
const PARTICLE_COUNT = ~~getQueryParam('count') || 1_000_000;
const WORKER_COUNT = uap.getResult().device.vendor === 'Apple' ? 4 : navigator.hardwareConcurrency - 1;
const WORKER_CHUNK_SIZE = Math.floor(PARTICLE_COUNT / WORKER_COUNT);
const workerPool = [];
let activeWorkers = 0;

const particleStride = 6; // 6 floats x,y,dx,dy,sx,sy;
const particleByteStride = particleStride * 4; // 4 bytes per float
const sabViewParticles = new Float32Array(new SharedArrayBuffer(PARTICLE_COUNT * particleByteStride));
let touches = [];

let mouseDown = false;
window.addEventListener('mousemove', e => {
	if (mouseDown) {
		touches = [{ x: e.clientX, y: window.innerHeight - e.clientY }];
	}
});
window.addEventListener('mousedown', e => {
	mouseDown = true;
	touches = [{ x: e.clientX, y: window.innerHeight - e.clientY }];
});
window.addEventListener('mouseup', e => {
	mouseDown = false;
	touches = [];
});
window.addEventListener('touchmove', e => {
	e.preventDefault();
	touches = [];
	for (let touch of e.targetTouches) {
		touches.push({ x: touch.clientX, y: window.innerHeight - touch.clientY });
	}
});
window.addEventListener('touchstart', e => {
	e.preventDefault();
	touches = [];
	for (let touch of e.targetTouches) {
		touches.push({ x: touch.clientX, y: window.innerHeight - touch.clientY });
	}
});
window.addEventListener('touchend', (e) => {
	e.preventDefault();
	touches = [];
});
window.addEventListener('touchcancel', (e) => {
	e.preventDefault();
	touches = [];
});


let currentParticleGrid, particleGridA, particleGridB;
let renderer = new Renderer(document.body, window.innerWidth, window.innerHeight);

function init(width, height) {
	//init particles
	for (let i = 0; i < PARTICLE_COUNT; i++) {
		sabViewParticles[i * particleStride] = Math.random() * width;
		sabViewParticles[i * particleStride + 1] = Math.random() * height;
		sabViewParticles[i * particleStride + 2] = (Math.random() * 2 - 1) * 30;
		sabViewParticles[i * particleStride + 3] = (Math.random() * 2 - 1) * 30;
		sabViewParticles[i * particleStride + 4] = sabViewParticles[i * particleStride];
		sabViewParticles[i * particleStride + 5] = sabViewParticles[i * particleStride + 1];
	}

	particleGridA = new Uint8Array(new SharedArrayBuffer(width * height));
	particleGridB = new Uint8Array(new SharedArrayBuffer(width * height));
	currentParticleGrid = particleGridA;

	renderer.resize(width, height);
}

window.addEventListener('resize', () => {
	init(window.innerWidth, window.innerHeight);
	touches = [];
});

let lastTime = 1;
function runSimulation(currentTime) {
	const delta = Math.min(0.1, (currentTime - lastTime) / 1000);
	lastTime = currentTime;
	const nextParticleGrid = currentParticleGrid === particleGridA ? particleGridB : particleGridA;
	const update = {
		delta,
		width: window.innerWidth,
		height: window.innerHeight,
		touches,
		particleGrid: nextParticleGrid,
	};

	activeWorkers = WORKER_COUNT;
	workerPool.forEach((worker, i) => {
		worker.postMessage(update);
	});

	renderer.render(currentParticleGrid);
	currentParticleGrid = nextParticleGrid;
}

init(window.innerWidth, window.innerHeight);

//setup workers
activeWorkers = WORKER_COUNT;
for (let i = 0; i < WORKER_COUNT; i++) {
	const worker = new Worker('./worker.js');
	worker.addEventListener('message', () => {
		activeWorkers--;
		if (activeWorkers !== 0) {
			return;
		}
		requestAnimationFrame(runSimulation);
	});
	workerPool.push(worker);
	worker.postMessage({
		sabViewParticles,
		particleOffsetStart: WORKER_CHUNK_SIZE * i,
		particleOffsetEnd: WORKER_CHUNK_SIZE * i + WORKER_CHUNK_SIZE,
		particleStride,
	});
}

