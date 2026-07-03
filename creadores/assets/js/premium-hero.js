(function (global) {
  'use strict';

  var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var instances = [];

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
    this.active = false;
    this.rafId = null;
    this.observer = null;
    this.renderer = null;
    this.material = null;
    this.clock = null;
    this.staticMode = shouldUseStatic();
    this.isPage = heroEl.classList.contains('premium-hero--page');
    this.isControlled = heroEl.classList.contains('premium-hero--controlled');
    this._onResize = this.resize.bind(this);
  }

  PremiumHero.prototype.enableStatic = function () {
    this.staticMode = true;
    this.heroEl.classList.add('premium-hero--static', 'premium-hero--ready');
    this.stop();
    if (this.canvas) this.canvas.style.display = 'none';
  };

  PremiumHero.prototype.getSize = function () {
    if (this.isPage) {
      return { w: global.innerWidth, h: global.innerHeight };
    }
    return { w: this.heroEl.clientWidth, h: this.heroEl.clientHeight };
  };

  PremiumHero.prototype.resize = function () {
    if (!this.renderer || !this.material) return;
    var size = this.getSize();
    var w = size.w;
    var h = size.h;
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
    if (!this.heroEl.classList.contains('premium-hero--ready')) {
      this.heroEl.classList.add('premium-hero--ready');
    }
    this.rafId = global.requestAnimationFrame(this.tick.bind(this));
  };

  PremiumHero.prototype.start = function () {
    if (this.staticMode || this.running) return;
    if (this.isControlled && !this.active) return;
    if (this.heroEl.hasAttribute('hidden')) return;
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

  PremiumHero.prototype.setActive = function (active) {
    this.active = !!active;
    if (this.active) this.start();
    else this.stop();
  };

  PremiumHero.prototype.observe = function () {
    var self = this;
    if (self.isPage) {
      global.addEventListener('visibilitychange', function () {
        if (document.hidden) self.stop();
        else if (self.active || !self.isControlled) self.start();
      });
      if (!self.isControlled) self.start();
      return;
    }
    if (!('IntersectionObserver' in global)) {
      if (!self.isControlled) self.start();
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
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    this.resize();
    global.addEventListener('resize', this._onResize);
    this.observe();
    if (this.isControlled && this.active) this.start();
  };

  PremiumHero.prototype.destroy = function () {
    this.stop();
    global.removeEventListener('resize', this._onResize);
    if (this.observer) this.observer.disconnect();
    if (this.renderer) this.renderer.dispose();
  };

  function initPremiumHero(selector) {
    var heroEl = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;
    if (!heroEl || heroEl.getAttribute('data-premium-init') === '1') {
      return heroEl && heroEl._premiumHero ? heroEl._premiumHero : null;
    }

    heroEl.setAttribute('data-premium-init', '1');
    var instance = new PremiumHero(heroEl);
    heroEl._premiumHero = instance;
    instances.push(instance);

    if (instance.staticMode) {
      instance.enableStatic();
      return instance;
    }

    loadThree()
      .then(function (THREE) {
        try {
          instance.initShader(THREE);
        } catch (e) {
          instance.enableStatic();
        }
      })
      .catch(function () { instance.enableStatic(); });

    return instance;
  }

  function initAllPremiumHeroes(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll('.premium-hero:not([data-premium-init])');
    var list = [];
    nodes.forEach(function (el) {
      var inst = initPremiumHero(el);
      if (inst) list.push(inst);
    });
    return list;
  }

  function initPremiumPageBg() {
    var el = document.getElementById('ea-page-shader');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ea-page-shader';
      el.className = 'premium-hero premium-hero--page';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML =
        '<canvas class="premium-hero-canvas" aria-hidden="true"></canvas>' +
        '<div class="premium-hero-overlay premium-hero-overlay--page" aria-hidden="true"></div>';
      document.body.insertBefore(el, document.body.firstChild);
      document.body.classList.add('ea-shader-page');
    }
    return initPremiumHero(el);
  }

  global.initPremiumHero = initPremiumHero;
  global.initAllPremiumHeroes = initAllPremiumHeroes;
  global.initPremiumPageBg = initPremiumPageBg;
})(typeof window !== 'undefined' ? window : this);
