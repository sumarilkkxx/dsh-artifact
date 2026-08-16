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

    // Low-priority background prefetch of the most common engine, so the first
    // chart appears instantly: the download overlaps the model's thinking time.
    // Mermaid (3.5 MB, low frequency) and three stay lazy-loaded on demand.
    function prefetchAssets() {
      if (typeof document === 'undefined') return
      var link = document.createElement('link')
      link.rel = 'prefetch'
      link.as = 'script'
      link.href = assetUrl('echarts.min.js')
      document.head.appendChild(link)
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

    // ---------- engine renderers (each returns a disposer) ----------

    function renderEcharts(el, echarts, option) {
      if (!option || typeof option !== 'object') { el.innerHTML = errHtml('invalid echarts option'); return noop }
      var chart = echarts.init(el)
      chart.setOption(option)
      var ro = new ResizeObserver(function () { chart.resize() })
      ro.observe(el)
      return function () { ro.disconnect(); chart.dispose() }
    }

    function renderMermaid(el, mermaid, code) {
      if (typeof code !== 'string' || code.trim() === '') { el.innerHTML = errHtml('empty mermaid code'); return noop }
      try { mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' }) } catch (e) { /* ignore */ }
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

    function renderThree(el, THREE, spec) {
      var w = el.clientWidth || 400
      var h = el.clientHeight || 300
      var renderer = null
      var scene, camera, group
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(w, h)
        el.appendChild(renderer.domElement)

        scene = new THREE.Scene()
        scene.background = new THREE.Color(validColor(spec && spec.background) || 0x16213a)

        camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100)
        camera.position.set(3, 3, 6)
        camera.lookAt(0, 0, 0)

        scene.add(new THREE.AmbientLight(0xffffff, typeof spec.ambient === 'number' ? spec.ambient : 0.7))
        var dir = new THREE.DirectionalLight(0xffffff, 0.9)
        dir.position.set(5, 10, 7)
        scene.add(dir)

        group = new THREE.Group()
        var SHAPES = {
          box: function (s) { return new THREE.BoxGeometry(s, s, s) },
          sphere: function (s) { return new THREE.SphereGeometry(s / 2, 32, 16) },
          cone: function (s) { return new THREE.ConeGeometry(s / 2, s, 24) },
          cylinder: function (s) { return new THREE.CylinderGeometry(s / 2, s / 2, s, 24) },
          torus: function (s) { return new THREE.TorusGeometry(s / 2, s / 6, 16, 48) },
        }
        var meshes = spec && Array.isArray(spec.meshes) ? spec.meshes : []
        for (var i = 0; i < meshes.length; i++) {
          var m = meshes[i] || {}
          var shape = SHAPES[m.shape] ? m.shape : 'box'
          var size = typeof m.size === 'number' && m.size > 0 ? m.size : 1
          var mat = new THREE.MeshStandardMaterial({ color: validColor(m.color) || 0x4d6bfe, roughness: 0.5, metalness: 0.1 })
          var mesh = new THREE.Mesh(SHAPES[shape](size), mat)
          var pos = num3(m.position, [0, 0, 0])
          var rot = num3(m.rotation, [0, 0, 0])
          mesh.position.set(pos[0], pos[1], pos[2])
          mesh.rotation.set(rot[0], rot[1], rot[2])
          group.add(mesh)
        }
        scene.add(group)
      } catch (e) {
        el.innerHTML = errHtml('three render failed: ' + (e && e.message ? e.message : e))
        return function () { if (renderer) renderer.dispose() }
      }

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
        group.rotation.y += 0.005
        renderer.render(scene, camera)
      }
      animate()
      return function () {
        running = false
        if (raf) cancelAnimationFrame(raf)
        ro.disconnect()
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

    function ArtifactToolView(props) {
      var block = props.block
      var meta = block && 'meta' in block ? block.meta : undefined
      var containerRef = React.useRef(null)

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
          if (engine === 'mermaid') dispose = renderMermaid(el, api, meta.payload)
          else if (engine === 'three') dispose = renderThree(el, api, meta.payload)
          else dispose = renderEcharts(el, api, meta.payload)
        }).catch(function (err) {
          if (!cancelled) el.innerHTML = errHtml('engine load failed: ' + (err && err.message ? err.message : err))
        })

        return function () {
          cancelled = true
          dispose()
        }
      }, [meta, block && block.callId])

      if (!meta || !meta.payload) return toolFallback(TOOL_NAME)
      var height = typeof meta.height === 'number' && meta.height >= 120 ? meta.height : 360
      return React.createElement(
        'div',
        { 'data-artifact-tool': true },
        meta.title ? React.createElement('div', { style: { fontWeight: 600, marginBottom: 8, fontSize: 14 } }, meta.title) : null,
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
