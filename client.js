// dsh-artifact — DeepSeek Harness browser half (v0.2).
//
// Registers two keyed toolviews:
//   - `render_artifact` — dispatches on meta.engine (echarts | mermaid | three)
//     and lazy-loads the matching engine asset from the host half's route.
//   - `render_html` — renders model-written HTML/CSS/JS in a sandboxed iframe
//     (opaque origin + CSP: no network, no top navigation, no form submission).
//
// Hand-written in the lazy-CJS bundle protocol (`window.__ModuleLoader__.load`
// with a factory returning cordis-plugin exports) — no build step, no imports
// from dsh client packages; `react` comes from the loader's module table.
window.__ModuleLoader__.load({
  id: 'dsh-artifact',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var PLUGIN_ID = 'dsh-artifact'
    var TOOL_NAME = 'render_artifact'
    var HTML_TOOL_NAME = 'render_html'
    var ASSET_DIR = '/plugins/' + PLUGIN_ID + '/assets'

    // ---------- asset loader ----------

    function assetUrl(file) {
      var rev
      var graph = window.__DSH_BOOT__
      if (graph && Array.isArray(graph.entries)) {
        for (var i = 0; i < graph.entries.length; i++) {
          if (graph.entries[i].id === PLUGIN_ID) { rev = graph.entries[i].rev; break }
        }
      }
      return ASSET_DIR + '/' + file + (rev ? '?rev=' + rev : '')
    }

    var pending = {}
    function loadAsset(file, globalName) {
      var existing = window.__ArtifactAssets__ && window.__ArtifactAssets__[globalName]
      if (existing) return Promise.resolve(existing)
      if (pending[file]) return pending[file]
      pending[file] = new Promise(function (resolve, reject) {
        var script = document.createElement('script')
        script.src = assetUrl(file)
        script.async = true
        script.onload = function () {
          var api = window[globalName] || (window.__ArtifactAssets__ && window.__ArtifactAssets__[globalName])
          if (!api) { reject(new Error('[dsh-artifact] ' + file + ' loaded but registered no global ' + globalName)); return }
          window.__ArtifactAssets__ = window.__ArtifactAssets__ || {}
          window.__ArtifactAssets__[globalName] = api
          resolve(api)
        }
        script.onerror = function () { reject(new Error('[dsh-artifact] ' + file + ' failed to load (host asset route missing?)')) }
        document.head.appendChild(script)
      })
      return pending[file]
    }

    // Low-priority background prefetch of the most common engines, so the first
    // chart/3D appears instantly: the download overlaps the model's thinking.
    // Mermaid (3.5 MB, low frequency) stays lazy-loaded on demand.
    function prefetchAssets() {
      if (typeof document === 'undefined') return
      ;['echarts.min.js', 'three.min.js'].forEach(function (file) {
        var link = document.createElement('link')
        link.rel = 'prefetch'
        link.as = 'script'
        link.href = assetUrl(file)
        document.head.appendChild(link)
      })
    }

    // ---------- helpers ----------

    function escapeHtml(s) {
      return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] })
    }
    function errHtml(msg) {
      return '<div style="color:#f87171;padding:8px 0;font-size:12px">' + escapeHtml(msg) + '</div>'
    }
    function noop() {}
    function num3(v, def) {
      var out = [def[0], def[1], def[2]]
      if (Array.isArray(v)) {
        out[0] = typeof v[0] === 'number' ? v[0] : out[0]
        out[1] = typeof v[1] === 'number' ? v[1] : out[1]
        out[2] = typeof v[2] === 'number' ? v[2] : out[2]
      }
      return out
    }
    function validColor(c) {
      return typeof c === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c) ? c : null
    }

    // ---------- themes ----------

    // Tasteful, professional palettes inspired by ECharts / Chart.js / AntV
    // default dark & light themes. `auto` keeps the payload's own colors;
    // every other theme overrides background + series/mesh palette + text
    // color for a cohesive look.
    var THEMES = [
      { id: 'auto', label: '默认', swatch: 'linear-gradient(135deg,#cbd5e1,#64748b)', background: null, palette: null, text: null, dark: false },
      { id: 'tech-blue', label: '科技蓝', swatch: 'linear-gradient(135deg,#0f172a,#3b82f6)', background: '#0f172a', palette: ['#3b82f6', '#38bdf8', '#818cf8', '#22d3ee', '#60a5fa', '#a78bfa'], text: '#e2e8f0', dark: true },
      { id: 'minimal', label: '极简白', swatch: 'linear-gradient(135deg,#f8fafc,#0ea5e9)', background: '#f8fafc', palette: ['#0ea5e9', '#475569', '#64748b', '#38bdf8', '#94a3b8', '#1e293b'], text: '#1e293b', dark: false },
      { id: 'night-purple', label: '暗夜紫', swatch: 'linear-gradient(135deg,#1a1333,#8b5cf6)', background: '#1a1333', palette: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#6d28d9', '#f472b6', '#60a5fa'], text: '#ede9fe', dark: true },
      { id: 'forest', label: '墨绿', swatch: 'linear-gradient(135deg,#0f1f1a,#34d399)', background: '#0f1f1a', palette: ['#34d399', '#2dd4bf', '#10b981', '#4ade80', '#a3e635', '#14b8a6'], text: '#ecfdf5', dark: true },
      { id: 'amber', label: '暖橙', swatch: 'linear-gradient(135deg,#1c1917,#f59e0b)', background: '#1c1917', palette: ['#f59e0b', '#fb923c', '#fbbf24', '#f97316', '#fca5a5', '#fcd34d'], text: '#fef3c7', dark: true },
    ]

    function themeById(id) {
      for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]
      return THEMES[0]
    }

    // ---------- engine renderers (each returns a disposer) ----------

    function renderEcharts(el, echarts, option, theme) {
      if (!option || typeof option !== 'object') { el.innerHTML = errHtml('invalid echarts option'); return noop }
      var themed = option
      if (theme && theme.id !== 'auto') {
        themed = Object.assign({}, option, {
          backgroundColor: theme.background,
          color: theme.palette,
          textStyle: { color: theme.text },
        })
      }
      var chart = echarts.init(el)
      chart.setOption(themed)
      var ro = new ResizeObserver(function () { chart.resize() })
      ro.observe(el)
      return function () { ro.disconnect(); chart.dispose() }
    }

    function renderMermaid(el, mermaid, code, theme) {
      if (typeof code !== 'string' || code.trim() === '') { el.innerHTML = errHtml('empty mermaid code'); return noop }
      var mmdTheme = theme && theme.dark ? 'dark' : 'default'
      try { mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: mmdTheme }) } catch (e) { /* ignore */ }
      var id = 'dsh-mm-' + Math.random().toString(36).slice(2, 10)
      var cancelled = false
      mermaid.render(id, code).then(function (r) {
        if (cancelled) return
        el.innerHTML = r.svg
        el.style.overflow = 'auto'
        el.style.display = 'flex'
        el.style.justifyContent = 'center'
      }).catch(function (e) {
        if (!cancelled) el.innerHTML = errHtml('mermaid render failed: ' + (e && e.message ? e.message : e))
      })
      return function () { cancelled = true; el.innerHTML = '' }
    }

    function renderThree(el, THREE, spec, theme) {
      var w = el.clientWidth || 400
      var h = el.clientHeight || 300
      var renderer = null
      var scene, camera, group
      var materials = {}
      var center = new THREE.Vector3(0, 0, 0)
      var radius = 1
      var dist = 3
      var theta = 0.7
      var phi = 1.0
      var dragging = false
      var lastX = 0
      var lastY = 0

      try {
        renderer = new THREE.WebGLRenderer({ antialias: true })
        // Cap at 2x for sharpness on high-DPI without over-spending the GPU.
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.setSize(w, h)
        el.appendChild(renderer.domElement)

        scene = new THREE.Scene()
        var bg = theme && theme.background ? theme.background : (validColor(spec && spec.background) || 0x16213a)
        scene.background = new THREE.Color(bg)

        camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200)

        scene.add(new THREE.AmbientLight(0xffffff, typeof spec.ambient === 'number' ? spec.ambient : 0.7))
        var dirLight = new THREE.DirectionalLight(0xffffff, 0.9)
        dirLight.position.set(5, 10, 7)
        scene.add(dirLight)

        // Share one material per color so an N-particle scene compiles ~one
        // shader per color instead of one per mesh.
        function materialFor(color) {
          var c = color || 0x4d6bfe
          if (!materials[c]) materials[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.1 })
          return materials[c]
        }

        group = new THREE.Group()
        // Reduced segment counts: small primitives look identical with far
        // fewer triangles.
        var SHAPES = {
          box: function (s) { return new THREE.BoxGeometry(s, s, s) },
          sphere: function (s) { return new THREE.SphereGeometry(s / 2, 16, 8) },
          cone: function (s) { return new THREE.ConeGeometry(s / 2, s, 16) },
          cylinder: function (s) { return new THREE.CylinderGeometry(s / 2, s / 2, s, 16) },
          torus: function (s) { return new THREE.TorusGeometry(s / 2, s / 6, 12, 32) },
        }
        var meshes = spec && Array.isArray(spec.meshes) ? spec.meshes : []
        for (var i = 0; i < meshes.length; i++) {
          var m = meshes[i] || {}
          var shape = SHAPES[m.shape] ? m.shape : 'box'
          var size = typeof m.size === 'number' && m.size > 0 ? m.size : 1
          var meshColor = (theme && theme.id !== 'auto') ? theme.palette[i % theme.palette.length] : validColor(m.color)
          var mesh = new THREE.Mesh(SHAPES[shape](size), materialFor(meshColor))
          var pos = num3(m.position, [0, 0, 0])
          var rot = num3(m.rotation, [0, 0, 0])
          mesh.position.set(pos[0], pos[1], pos[2])
          mesh.rotation.set(rot[0], rot[1], rot[2])
          group.add(mesh)
        }
        scene.add(group)

        // Auto-frame: fit the camera to the mesh bounding sphere so scattered
        // scenes are centered and never clipped.
        var sphere = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere())
        center.copy(sphere.center)
        radius = Math.max(sphere.radius, 0.5)
        dist = Math.max(radius * 3, 3)
      } catch (e) {
        el.innerHTML = errHtml('three render failed: ' + (e && e.message ? e.message : e))
        return function () { if (renderer) renderer.dispose() }
      }

      function updateCamera() {
        camera.position.set(
          center.x + dist * Math.sin(phi) * Math.sin(theta),
          center.y + dist * Math.cos(phi),
          center.z + dist * Math.sin(phi) * Math.cos(theta),
        )
        camera.lookAt(center)
      }
      updateCamera()

      // Manual orbit: drag to rotate, wheel to zoom.
      function onMouseDown(e) { dragging = true; lastX = e.clientX; lastY = e.clientY }
      function onMouseMove(e) {
        if (!dragging) return
        var dx = e.clientX - lastX
        var dy = e.clientY - lastY
        lastX = e.clientX
        lastY = e.clientY
        theta -= dx * 0.005
        phi -= dy * 0.005
        phi = Math.max(0.2, Math.min(Math.PI - 0.2, phi))
      }
      function onMouseUp() { dragging = false }
      function onWheel(e) {
        e.preventDefault()
        dist *= (e.deltaY > 0 ? 1.1 : 0.9)
        dist = Math.max(radius * 0.6, Math.min(radius * 8, dist))
      }
      renderer.domElement.addEventListener('mousedown', onMouseDown)
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

      var running = true
      var raf
      var ro = new ResizeObserver(function () {
        var nw = el.clientWidth || 400
        var nh = el.clientHeight || 300
        renderer.setSize(nw, nh)
        camera.aspect = nw / nh
        camera.updateProjectionMatrix()
      })
      ro.observe(el)
      function animate() {
        if (!running) return
        raf = requestAnimationFrame(animate)
        if (!dragging) theta += 0.004 // slow auto-orbit when not interacting
        updateCamera()
        renderer.render(scene, camera)
      }
      animate()
      return function () {
        running = false
        if (raf) cancelAnimationFrame(raf)
        ro.disconnect()
        renderer.domElement.removeEventListener('mousedown', onMouseDown)
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        renderer.domElement.removeEventListener('wheel', onWheel)
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement)
        }
        for (var k in materials) materials[k].dispose()
        renderer.dispose()
      }
    }

    // ---------- render_html sandbox ----------

    // Opaque-origin iframe + CSP: no network, no navigation, no forms; inline
    // scripts/styles are allowed so model-written widgets stay interactive.
    var HTML_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"

    function wrapHtml(html) {
      var meta = '<meta http-equiv="Content-Security-Policy" content="' + HTML_CSP + '">'
      if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head([^>]*)>/i, '<head$1>' + meta)
      }
      if (/<html[^>]*>/i.test(html)) {
        return html.replace(/<html([^>]*)>/i, '<html$1><head><meta charset="utf-8">' + meta + '</head>')
      }
      return '<!DOCTYPE html><html><head><meta charset="utf-8">' + meta + '</head><body>' + html + '</body></html>'
    }

    // ---------- toolview components ----------

    function toolFallback(title) {
      return React.createElement('div', { 'data-artifact-tool': true, style: { color: 'var(--dsh-muted, #888)', padding: '8px 0', fontFamily: 'monospace', fontSize: '12px' } }, title)
    }

    function ThemeBar(props) {
      return React.createElement(
        'div',
        { style: { display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' } },
        props.themes.map(function (t) {
          var active = t.id === props.active
          return React.createElement(
            'button',
            {
              key: t.id,
              type: 'button',
              title: t.label,
              onClick: function (e) {
                // Don't let the click bubble to the tool card's own handlers
                // (which open the trajectory/inspect view).
                if (e && e.stopPropagation) e.stopPropagation()
                if (e && e.preventDefault) e.preventDefault()
                props.onSelect(t.id)
              },
              style: {
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
                fontSize: 12, lineHeight: '18px',
                border: active ? '1px solid #4d6bfe' : '1px solid var(--dsh-border, rgba(0,0,0,0.14))',
                background: active ? 'rgba(77,107,254,0.08)' : 'transparent',
                color: active ? '#4d6bfe' : 'var(--dsh-muted, #666)',
              },
            },
            React.createElement('span', { style: { width: 12, height: 12, borderRadius: '50%', background: t.swatch } }),
            t.label,
          )
        }),
      )
    }

    function ArtifactToolView(props) {
      var block = props.block
      var meta = block && 'meta' in block ? block.meta : undefined
      var containerRef = React.useRef(null)
      var themeState = React.useState(meta && typeof meta.theme === 'string' ? themeById(meta.theme) : THEMES[0])
      var theme = themeState[0]
      var setTheme = themeState[1]

      // Reset the theme when a new result arrives (user selection is per-chart).
      React.useEffect(function () {
        setTheme(meta && typeof meta.theme === 'string' ? themeById(meta.theme) : THEMES[0])
      }, [meta])

      React.useEffect(function () {
        var el = containerRef.current
        if (!el || !meta) return undefined
        var engine = meta.engine === 'mermaid' || meta.engine === 'three' ? meta.engine : 'echarts'
        var cancelled = false
        var dispose = noop
        var promise
        if (engine === 'mermaid') promise = loadAsset('mermaid.min.js', 'mermaid')
        else if (engine === 'three') promise = loadAsset('three.min.js', 'THREE')
        else promise = loadAsset('echarts.min.js', 'echarts')

        promise.then(function (api) {
          if (cancelled || !el) return
          if (engine === 'mermaid') dispose = renderMermaid(el, api, meta.payload, theme)
          else if (engine === 'three') dispose = renderThree(el, api, meta.payload, theme)
          else dispose = renderEcharts(el, api, meta.payload, theme)
        }).catch(function (err) {
          if (!cancelled) el.innerHTML = errHtml('engine load failed: ' + (err && err.message ? err.message : err))
        })

        return function () {
          cancelled = true
          dispose()
        }
      }, [meta, theme, block && block.callId])

      if (!meta || !meta.payload) return toolFallback(TOOL_NAME)
      var height = typeof meta.height === 'number' && meta.height >= 120 ? meta.height : 360
      return React.createElement(
        'div',
        { 'data-artifact-tool': true },
        meta.title ? React.createElement('div', { style: { fontWeight: 600, marginBottom: 8, fontSize: 14 } }, meta.title) : null,
        React.createElement(ThemeBar, { themes: THEMES, active: theme.id, onSelect: function (id) { setTheme(themeById(id)) } }),
        React.createElement('div', { ref: containerRef, style: { width: '100%', height: height + 'px', minHeight: '200px' } }),
      )
    }

    function HtmlToolView(props) {
      var block = props.block
      var meta = block && 'meta' in block ? block.meta : undefined
      var html = meta && typeof meta.html === 'string' ? meta.html : undefined
      if (!html || html.trim() === '') return toolFallback(HTML_TOOL_NAME)
      var height = typeof meta.height === 'number' && meta.height >= 120 ? meta.height : 400
      return React.createElement(
        'div',
        { 'data-artifact-tool': true },
        meta.title ? React.createElement('div', { style: { fontWeight: 600, marginBottom: 8, fontSize: 14 } }, meta.title) : null,
        React.createElement('iframe', {
          sandbox: 'allow-scripts',
          srcDoc: wrapHtml(html),
          title: meta.title || 'render_html',
          style: { width: '100%', height: height + 'px', minHeight: '200px', border: '1px solid var(--dsh-border, rgba(0,0,0,0.12))', borderRadius: 8, background: '#fff' },
        }),
      )
    }

    function apply(ctx) {
      prefetchAssets()
      ctx.slots.inject('tool.call.toolview', function () {
        return ctx.slots.register({ name: 'tool.call.toolview', key: TOOL_NAME }, ArtifactToolView)
      })
      ctx.slots.inject('tool.call.toolview', function () {
        return ctx.slots.register({ name: 'tool.call.toolview', key: HTML_TOOL_NAME }, HtmlToolView)
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    exports.name = PLUGIN_ID
    return module.exports
  },
})
