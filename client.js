// dsh-artifact — DeepSeek Harness browser half.
//
// Registers the keyed toolview for `render_artifact`: when a result settles,
// the host's `tool.call.toolview` hole dispatches by wire tool name, and this
// component reads the resolved option from the result meta and renders it with
// the real ECharts engine (lazy-loaded from the host half's asset route).
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
    var ASSET_DIR = '/plugins/' + PLUGIN_ID + '/assets'

    function assetUrl(file) {
      var rev
      var graph = window.__DSH_BOOT__
      if (graph && Array.isArray(graph.entries)) {
        for (var i = 0; i < graph.entries.length; i++) {
          if (graph.entries[i].id === PLUGIN_ID) {
            rev = graph.entries[i].rev
            break
          }
        }
      }
      return ASSET_DIR + '/' + file + (rev ? '?rev=' + rev : '')
    }

    var pendingEcharts = null
    function loadEcharts() {
      var existing = window.__ArtifactAssets__ && window.__ArtifactAssets__.echarts
      if (existing) return Promise.resolve(existing)
      if (pendingEcharts) return pendingEcharts
      pendingEcharts = new Promise(function (resolve, reject) {
        var script = document.createElement('script')
        script.src = assetUrl('echarts.min.js')
        script.async = true
        script.onload = function () {
          // echarts' UMD build registers the global `echarts`.
          var api = window.echarts || (window.__ArtifactAssets__ && window.__ArtifactAssets__.echarts)
          if (!api) {
            reject(new Error('[dsh-artifact] echarts asset loaded but registered no global'))
            return
          }
          window.__ArtifactAssets__ = window.__ArtifactAssets__ || {}
          window.__ArtifactAssets__.echarts = api
          resolve(api)
        }
        script.onerror = function () {
          reject(new Error('[dsh-artifact] echarts asset failed to load (host asset route missing?)'))
        }
        document.head.appendChild(script)
      })
      return pendingEcharts
    }

    function optionOf(meta) {
      if (!meta) return null
      var opt = meta.option
      if (typeof opt === 'string') {
        try {
          return JSON.parse(opt)
        } catch {
          return null
        }
      }
      return opt && typeof opt === 'object' && !Array.isArray(opt) ? opt : null
    }

    function ArtifactToolView(props) {
      var block = props.block
      var meta = block && 'meta' in block ? block.meta : undefined
      var containerRef = React.useRef(null)

      React.useEffect(
        function () {
          var el = containerRef.current
          var opt = optionOf(meta)
          if (!el || !meta || meta.engine !== 'echarts' || !opt) return undefined
          var cancelled = false
          var chart = null
          var ro = null
          loadEcharts()
            .then(function (echarts) {
              if (cancelled || !el) return
              chart = echarts.init(el)
              chart.setOption(opt)
              if (typeof ResizeObserver !== 'undefined') {
                ro = new ResizeObserver(function () {
                  if (chart) chart.resize()
                })
                ro.observe(el)
              }
            })
            .catch(function (err) {
              console.warn('[dsh-artifact] echarts render failed', err)
            })
          return function () {
            cancelled = true
            if (ro) ro.disconnect()
            if (chart) chart.dispose()
          }
        },
        [meta, block && block.callId],
      )

      if (!meta || meta.engine !== 'echarts' || !optionOf(meta)) {
        return React.createElement(
          'div',
          { className: 'artifact-fallback', 'data-artifact-tool': true, style: { color: 'var(--dsh-muted, #888)', padding: '8px 0', fontFamily: 'monospace', fontSize: '12px' } },
          TOOL_NAME,
        )
      }
      var height = typeof meta.height === 'number' && meta.height >= 120 ? meta.height : 360
      return React.createElement(
        'div',
        { className: 'artifact-chart', 'data-artifact-tool': true },
        meta.title
          ? React.createElement('div', { className: 'artifact-title', style: { fontWeight: 600, marginBottom: 8, fontSize: 14 } }, meta.title)
          : null,
        React.createElement('div', {
          ref: containerRef,
          style: { width: '100%', height: height + 'px', minHeight: '200px' },
        }),
      )
    }

    function apply(ctx) {
      ctx.slots.inject('tool.call.toolview', function () {
        return ctx.slots.register(
          { name: 'tool.call.toolview', key: TOOL_NAME },
          ArtifactToolView,
        )
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    exports.name = PLUGIN_ID
    return module.exports
  },
})
