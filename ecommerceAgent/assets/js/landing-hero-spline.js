(function (global) {
  'use strict';

  var SPLINE_SCENE = 'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode';
  var SPLINE_SCRIPT = 'https://unpkg.com/@splinetool/viewer@1.9.48/build/spline-viewer.js';
  var MOBILE_MAX = 767;
  var LOAD_TIMEOUT_MS = 18000;

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isMobileViewport() {
    return global.innerWidth <= MOBILE_MAX;
  }

  function shouldLoadRobot() {
    return !isMobileViewport() && !prefersReducedMotion();
  }

  function $(id) {
    return document.getElementById(id);
  }

  function showFallback() {
    var wrap = $('landing-robot-wrap');
    var fb = $('landing-hero-fallback');
    if (wrap) wrap.hidden = true;
    if (fb) {
      fb.hidden = false;
      fb.classList.remove('is-hidden-by-robot');
    }
  }

  function showRobotShell() {
    var wrap = $('landing-robot-wrap');
    var fb = $('landing-hero-fallback');
    if (wrap) wrap.hidden = false;
    if (fb) {
      fb.hidden = true;
      fb.classList.add('is-hidden-by-robot');
    }
  }

  function hideLoader() {
    var loader = $('landing-robot-loader');
    if (loader) loader.classList.add('is-hidden');
  }

  function loadSplineScript() {
    if (global.customElements && global.customElements.get('spline-viewer')) {
      return Promise.resolve();
    }
    var existing = document.querySelector('script[data-spline-viewer]');
    if (existing) {
      return global.customElements.whenDefined('spline-viewer');
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.type = 'module';
      s.src = SPLINE_SCRIPT;
      s.setAttribute('data-spline-viewer', '1');
      s.onload = function () {
        global.customElements.whenDefined('spline-viewer').then(resolve).catch(reject);
      };
      s.onerror = function () { reject(new Error('Spline script failed')); };
      document.head.appendChild(s);
    });
  }

  function mountSplineViewer() {
    var stage = $('landing-robot-stage');
    if (!stage || stage.querySelector('spline-viewer')) return;

    var viewer = document.createElement('spline-viewer');
    viewer.setAttribute('url', SPLINE_SCENE);
    viewer.setAttribute('events-target', 'global');
    viewer.className = 'landing-spline-viewer';

    var settled = false;
    function finish(ok) {
      if (settled) return;
      settled = true;
      if (ok) {
        hideLoader();
        stage.classList.add('is-ready');
      } else {
        showFallback();
      }
    }

    var timeout = global.setTimeout(function () { finish(false); }, LOAD_TIMEOUT_MS);

    viewer.addEventListener('load', function () {
      global.clearTimeout(timeout);
      finish(true);
    });

    viewer.addEventListener('error', function () {
      global.clearTimeout(timeout);
      finish(false);
    });

    stage.appendChild(viewer);
  }

  function loadRobot() {
    if (!shouldLoadRobot()) {
      showFallback();
      return;
    }

    showRobotShell();

    loadSplineScript()
      .then(mountSplineViewer)
      .catch(function () { showFallback(); });
  }

  function initRobotLazy() {
    if (!shouldLoadRobot()) {
      showFallback();
      return;
    }

    showRobotShell();

    var hero = $('landing-top');
    if (!hero) return;

    if ('IntersectionObserver' in global) {
      var started = false;
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !started) {
            started = true;
            loadRobot();
            obs.disconnect();
          }
        });
      }, { threshold: 0.12, rootMargin: '80px 0px' });
      obs.observe(hero);
    } else {
      loadRobot();
    }
  }

  function initSpotlight() {
    if (prefersReducedMotion()) return;

    var hero = $('landing-top');
    var spot = $('landing-hero-spotlight');
    if (!hero || !spot) return;

    var tx = 62;
    var ty = 42;
    var cx = tx;
    var cy = ty;
    var rafId = null;

    function tick() {
      cx += (tx - cx) * 0.09;
      cy += (ty - cy) * 0.09;
      spot.style.setProperty('--spot-x', cx + '%');
      spot.style.setProperty('--spot-y', cy + '%');
      rafId = global.requestAnimationFrame(tick);
    }

    hero.addEventListener('mousemove', function (e) {
      var rect = hero.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      tx = ((e.clientX - rect.left) / rect.width) * 100;
      ty = ((e.clientY - rect.top) / rect.height) * 100;
      if (!rafId) rafId = global.requestAnimationFrame(tick);
    });

    hero.addEventListener('mouseleave', function () {
      tx = 62;
      ty = 42;
    });

    rafId = global.requestAnimationFrame(tick);
  }

  function init() {
    initSpotlight();
    initRobotLazy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
