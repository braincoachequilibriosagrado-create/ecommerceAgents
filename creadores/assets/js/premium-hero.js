(function (global) {
  'use strict';

  var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isMobileViewport() {
    return global.innerWidth < 768 || (global.matchMedia && global.matchMedia('(max-width: 767px)').matches);
  }

  function shouldUseStatic() {
    return prefersReducedMotion() || isMobileViewport();
  }

  function loadThree() {
    if (global.THREE) return Promise.resolve(global.THREE);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = THREE_CDN;
      s.async = true;
      s.onload = function () { resolve(global.THREE); };
      s.onerror = function () { reject(new Error('No se pudo cargar Three.js')); };
      document.head.appendChild(s);
    });
  }

  var VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform float uTime;',
    'uniform vec2 uResolution;',
    'varying vec2 vUv;',
    'const vec3 cBlue = vec3(0.169, 0.227, 0.961);',
    'const vec3 cPurple = vec3(0.545, 0.184, 0.839);',
    'const vec3 cOrange = vec3(1.0, 0.416, 0.239);',
    'void main() {',
    '  vec2 uv = vUv;',
    '  vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);',
    '  float t = uTime * 0.18;',
    '  vec3 col = vec3(0.02, 0.024, 0.059);',
    '  float acc = 0.0;',
    '  for (int i = 0; i < 6; i++) {',
    '    float fi = float(i);',
    '    float ang = 0.55 + fi * 0.16;',
    '    vec2 dir = vec2(cos(ang), sin(ang));',
    '    float w = dot(p, dir) * 2.2 + t * (0.35 + fi * 0.06);',
    '    w += sin(p.y * 2.8 + t * 1.2 + fi * 1.7) * 0.12;',
    '    w += cos(p.x * 2.2 - t * 0.9 + fi) * 0.08;',
    '    float band = abs(fract(w) - 0.5);',
    '    float line = exp(-band * band * 180.0);',
    '    float mixA = fract(fi * 0.27 + p.x * 0.15 + t * 0.08);',
    '    vec3 ray = mix(cBlue, cPurple, smoothstep(0.0, 0.55, mixA));',
    '    ray = mix(ray, cOrange, smoothstep(0.55, 1.0, mixA));',
    '    acc += line * (0.14 + fi * 0.025);',
    '    col += ray * line * (0.22 + fi * 0.04);',
    '  }',
    '  col += vec3(0.03, 0.02, 0.06) * smoothstep(0.2, 0.9, uv.y);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function PremiumHero(heroEl) {
    this.heroEl = heroEl;
    this.canvas = heroEl.querySelector('.premium-hero-canvas');
    this.running = false;
    this.rafId = null;
    this.observer = null;
    this.renderer = null;
    this.material = null;
    this.clock = null;
    this.staticMode = shouldUseStatic();
  }

  PremiumHero.prototype.enableStatic = function () {
    this.staticMode = true;
    this.heroEl.classList.add('premium-hero--static');
    this.stop();
    if (this.canvas) this.canvas.style.display = 'none';
  };

  PremiumHero.prototype.resize = function () {
    if (!this.renderer || !this.material) return;
    var w = this.heroEl.clientWidth;
    var h = this.heroEl.clientHeight;
    if (w < 1 || h < 1) return;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(dpr);
    this.material.uniforms.uResolution.value.set(w * dpr, h * dpr);
  };

  PremiumHero.prototype.tick = function () {
    if (!this.running || !this.renderer || !this.material) return;
    this.material.uniforms.uTime.value = this.clock.getElapsedTime();
    this.renderer.render(this.scene, this.camera);
    this.rafId = global.requestAnimationFrame(this.tick.bind(this));
  };

  PremiumHero.prototype.start = function () {
    if (this.staticMode || this.running) return;
    this.running = true;
    this.resize();
    this.tick();
  };

  PremiumHero.prototype.stop = function () {
    this.running = false;
    if (this.rafId) {
      global.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  };

  PremiumHero.prototype.observe = function () {
    var self = this;
    if (!('IntersectionObserver' in global)) {
      self.start();
      return;
    }
    self.observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) self.start();
        else self.stop();
      });
    }, { threshold: 0.05 });
    self.observer.observe(self.heroEl);
  };

  PremiumHero.prototype.initShader = function (THREE) {
    if (!this.canvas) return;
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) }
      },
      vertexShader: VERT,
      fragmentShader: FRAG
    });
    var geo = new THREE.PlaneGeometry(2, 2);
    this.scene.add(new THREE.Mesh(geo, this.material));
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    this.resize();
    global.addEventListener('resize', this.resize.bind(this));
    this.observe();
  };

  PremiumHero.prototype.destroy = function () {
    this.stop();
    if (this.observer) this.observer.disconnect();
    if (this.renderer) this.renderer.dispose();
  };

  function initPremiumHero(selector) {
    var heroEl = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;
    if (!heroEl || heroEl.getAttribute('data-premium-init') === '1') return null;

    heroEl.setAttribute('data-premium-init', '1');
    var instance = new PremiumHero(heroEl);

    if (instance.staticMode) {
      instance.enableStatic();
      return instance;
    }

    loadThree()
      .then(function (THREE) { instance.initShader(THREE); })
      .catch(function () { instance.enableStatic(); });

    return instance;
  }

  global.initPremiumHero = initPremiumHero;
})(typeof window !== 'undefined' ? window : this);
