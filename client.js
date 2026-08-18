// dsh-artifact — DeepSeek Harness browser half (v0.2).
//
// Registers two keyed toolviews:
//   - `render_artifact` — dispatches on meta.engine (echarts | mermaid), with
//     ECharts-GL loaded on demand for official ECharts 3D option types.
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
    var echartsGlPending = null
    // Mermaid keeps its configuration globally. Rendering cards with different
    // light/dark palettes concurrently can otherwise make one card inherit
    // another card's theme, so each initialize → parse → render transaction is
    // serialized while ECharts cards remain fully concurrent.
    var mermaidRenderTail = Promise.resolve()
    function enqueueMermaidRender(task) {
      var run = mermaidRenderTail.then(task, task)
      mermaidRenderTail = run.catch(function () {})
      return run
    }
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

    // echarts-gl is a side-effect UMD extension: it augments the already-loaded
    // `echarts` global and deliberately exports no API that the tool needs.
    // It therefore cannot use loadAsset's global-name cache shortcut.
    function loadEchartsGl() {
      if (echartsGlPending) return echartsGlPending
      echartsGlPending = new Promise(function (resolve, reject) {
        var script = document.createElement('script')
        script.src = assetUrl('echarts-gl.min.js')
        script.async = true
        script.onload = function () { resolve() }
        script.onerror = function () { reject(new Error('[dsh-artifact] echarts-gl.min.js failed to load')) }
        document.head.appendChild(script)
      })
      return echartsGlPending
    }

    var ECHARTS_GL_SERIES = {
      bar3D: true, line3D: true, lines3D: true, scatter3D: true, surface: true,
      map3D: true, polygons3D: true, graphGL: true, flowGL: true,
      scatterGL: true, linesGL: true,
    }
    function usesEchartsGl(option) {
      if (!option || typeof option !== 'object') return false
      var series = Array.isArray(option.series) ? option.series : [option.series]
      for (var i = 0; i < series.length; i++) {
        if (series[i] && ECHARTS_GL_SERIES[series[i].type]) return true
      }
      return !!(option.grid3D || option.xAxis3D || option.yAxis3D || option.zAxis3D || option.geo3D || option.globe)
    }
    function hasGlobeScene(option) {
      // Globe's default/offline renderer is intentionally photorealistic.
      // Its satellite texture is not a data palette and must not be recolored
      // by the presentation menu.
      return !!(option && typeof option === 'object' && option.globe !== undefined)
    }

    // Low-priority background prefetch of the most common engines, so the first
    // Charts appear instantly: the download overlaps the model's thinking.
    // Mermaid (3.5 MB, low frequency) stays lazy-loaded on demand.
    function prefetchAssets() {
      if (typeof document === 'undefined') return
      ;['echarts.min.js'].forEach(function (file) {
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
    // ---------- themes ----------

    // ECharts 5 palettes and official theme palettes, each tuned against the
    // official light/default and dark surface tokens below.
    var THEMES = [
      { id: 'auto', label: '默认', swatch: 'linear-gradient(135deg,#cbd5e1,#64748b)', palette: null },
      { id: 'tech-blue', label: 'ECharts 5', swatch: 'linear-gradient(135deg,#5470c6 0 20%,#91cc75 20% 40%,#fac858 40% 60%,#ee6666 60% 80%,#73c0de 80%)', light: ['#5470C6', '#91CC75', '#FAC858', '#EE6666', '#73C0DE', '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC'], dark: ['#4992FF', '#7CFFB2', '#FDDD60', '#FF6E76', '#58D9F9', '#05C091', '#FF8A45', '#8D48E3', '#DD79FF'] },
      { id: 'minimal', label: 'Vintage', swatch: 'linear-gradient(135deg,#d87c7c 0 25%,#919e8b 25% 50%,#d7ab82 50% 75%,#61a0a8 75%)', light: ['#D87C7C', '#919E8B', '#D7AB82', '#6E7074', '#61A0A8', '#EFA18D', '#787464', '#CC7E63', '#724E58', '#4B565B'], dark: ['#F29B9B', '#B8C7AE', '#E8C49A', '#B9B8CE', '#7FC4CC', '#FFB69F', '#AAA795', '#F0A080', '#BE7486', '#7F9AA0'] },
      { id: 'night-purple', label: 'Macarons', swatch: 'linear-gradient(135deg,#2ec7c9 0 25%,#b6a2de 25% 50%,#5ab1ef 50% 75%,#ffb980 75%)', light: ['#2EC7C9', '#B6A2DE', '#5AB1EF', '#FFB980', '#D87A80', '#8D98B3', '#E5CF0D', '#97B552', '#DC69AA'], dark: ['#55D6D8', '#C9B7F4', '#7CC4FF', '#FFD0A5', '#F09AA0', '#AAB5CC', '#F5E55E', '#B5D17A', '#F08BC0'] },
      { id: 'forest', label: 'Shine', swatch: 'linear-gradient(135deg,#c12e34 0 25%,#e6b600 25% 50%,#0098d9 50% 75%,#2b821d 75%)', light: ['#C12E34', '#E6B600', '#0098D9', '#2B821D', '#005EAA', '#339CA8', '#CDA819', '#32A487'], dark: ['#FF7479', '#FDDD60', '#58D9F9', '#7CFFB2', '#4992FF', '#55C4D1', '#F5D05A', '#66C7A9'] },
      { id: 'amber', label: 'Roma', swatch: 'linear-gradient(135deg,#e01f54 0 25%,#001852 25% 50%,#b8d2c7 50% 75%,#d3758f 75%)', light: ['#E01F54', '#001852', '#B8D2C7', '#C6B38E', '#A4D8C2', '#F3D999', '#D3758F', '#2E4783', '#82B6E9'], dark: ['#FF6B95', '#7FA8FF', '#BEE6D7', '#E3CCA0', '#A4E6CB', '#F5D96B', '#F0A3B5', '#8FAEFF', '#8ED0FF'] },
    ]

    // 3D surfaces need calmer visual hierarchy than a categorical 2D chart.
    // These monochromatic ramps retain enough luminance steps for multiple
    // series, without fighting the depth, lighting and material cues.
    var GL_THEMES = [
      { id: 'gl-azure', label: '深海蓝', swatch: '#2F7DE1', light: ['#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD'], dark: ['#60A5FA', '#7DB7FF', '#9CCBFF', '#B9DCFF', '#D5ECFF'] },
      { id: 'gl-emerald', label: '翡翠绿', swatch: '#059669', light: ['#047857', '#059669', '#10B981', '#34D399', '#6EE7B7'], dark: ['#34D399', '#5EEAC0', '#86F1D3', '#A9F5E1', '#C9FAEB'] },
      { id: 'gl-amber', label: '琥珀金', swatch: '#D97706', light: ['#B45309', '#D97706', '#F59E0B', '#FBBF24', '#FCD34D'], dark: ['#FBBF24', '#FCD76A', '#FDE59A', '#FEEDBC', '#FFF4D6'] },
      { id: 'gl-rose', label: '洋红紫', swatch: '#C026D3', light: ['#A21CAF', '#C026D3', '#D946EF', '#E879F9', '#F0ABFC'], dark: ['#E879F9', '#EE9CFA', '#F3B7FC', '#F8CEFD', '#FCE3FE'] },
      { id: 'gl-slate', label: '石墨灰', swatch: '#475569', light: ['#334155', '#475569', '#64748B', '#94A3B8', '#CBD5E1'], dark: ['#94A3B8', '#AAB7C8', '#BEC9D7', '#D0D9E4', '#E2E8F0'] },
    ]

    var MODES = [
      { id: 'auto', label: '跟随系统' },
      { id: 'light', label: '浅色' },
      { id: 'dark', label: '深色' },
    ]
    var SURFACES = {
      // ECharts 5 default component colors.
      light: { background: '#FFFFFF', panel: '#FFFFFF', text: '#464646', title: '#464646', muted: '#6E7079', border: '#D9DDE5', axis: '#6E7079', grid: '#E0E6F1', minorGrid: '#F3F5F8', tooltip: '#FFFFFF', tooltipBorder: '#D9DDE5', pointer: '#6E7079', selected: 'rgba(84,112,198,0.10)' },
      // The host app's dark canvas is rgb(4, 8, 16). Keep ECharts dark's
      // text/grid tokens, but use a nearby blue-black panel for readable UI.
      dark: { background: '#040810', panel: '#0B1220', text: '#B9B8CE', title: '#EEF1FA', muted: '#B9B8CE', border: '#484753', axis: '#B9B8CE', grid: '#484753', minorGrid: '#20203B', tooltip: '#0B1220', tooltipBorder: '#484753', pointer: '#817F91', selected: 'rgba(73,146,255,0.16)' },
    }

    function themeById(id, themes) {
      themes = themes || THEMES
      for (var i = 0; i < themes.length; i++) if (themes[i].id === id) return themes[i]
      return themes[0]
    }
    function modeById(id) {
      for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i]
      return MODES[0]
    }
    function resolvedMode(mode) {
      if (mode && mode.id === 'dark') return 'dark'
      if (mode && mode.id === 'light') return 'light'
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    function surfaceFor(mode) {
      return SURFACES[resolvedMode(mode)]
    }
    function paletteFor(theme, mode) {
      if (!theme || theme.id === 'auto') return null
      return resolvedMode(mode) === 'dark' ? theme.dark : theme.light
    }

    // Mermaid is a diagram language rather than a data chart. Keep it on a
    // deliberately neutral, mode-only skin so ECharts' multi-series palettes
    // do not unexpectedly recolor authored diagram semantics.
    function mermaidThemeVariables(mode) {
      var dark = resolvedMode(mode) === 'dark'
      if (dark) return {
        background: '#040810', primaryColor: '#18263A', primaryTextColor: '#F3F6FB', primaryBorderColor: '#8FA6C4',
        secondaryColor: '#132238', secondaryTextColor: '#F3F6FB', tertiaryColor: '#0B1220', tertiaryTextColor: '#F3F6FB',
        lineColor: '#B2C0D2', textColor: '#F3F6FB', mainBkg: '#18263A', nodeBorder: '#8FA6C4',
        clusterBkg: '#0B1220', clusterBorder: '#647995', noteBkgColor: '#243550', noteTextColor: '#F3F6FB', noteBorderColor: '#8FA6C4',
        edgeLabelBackground: '#040810', titleColor: '#F3F6FB', actorTextColor: '#F3F6FB', actorBkg: '#18263A', actorBorder: '#8FA6C4',
      }
      return {
        background: '#FFFFFF', primaryColor: '#F5F8FC', primaryTextColor: '#172033', primaryBorderColor: '#58708F',
        secondaryColor: '#EEF4FB', secondaryTextColor: '#172033', tertiaryColor: '#F9FAFC', tertiaryTextColor: '#172033',
        lineColor: '#52667D', textColor: '#172033', mainBkg: '#F5F8FC', nodeBorder: '#58708F',
        clusterBkg: '#F9FAFC', clusterBorder: '#B7C4D4', noteBkgColor: '#FFF9E7', noteTextColor: '#172033', noteBorderColor: '#B58B2E',
        edgeLabelBackground: '#FFFFFF', titleColor: '#172033', actorTextColor: '#172033', actorBkg: '#F5F8FC', actorBorder: '#58708F',
      }
    }

    // ECharts applies a registered theme before the user option. This matters:
    // every built-in coordinate system and component (calendar, polar, geo,
    // parallel, graph, gauge, timeline, ...) receives its own native defaults,
    // while an explicit option value still wins. Do not post-process the option
    // object here: partial manual overrides are what caused calendar split lines
    // and other non-cartesian components to look inconsistent.
    var DEFAULT_PALETTE = ['#5470C6', '#91CC75', '#FAC858', '#EE6666', '#73C0DE', '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC']
    function axisTheme(surface, splitLine) {
      return {
        axisLine: { lineStyle: { color: surface.axis } },
        axisLabel: { color: surface.muted },
        nameTextStyle: { color: surface.muted },
        splitLine: { lineStyle: { color: splitLine || surface.grid } },
        minorSplitLine: { lineStyle: { color: surface.minorGrid } },
        splitArea: { areaStyle: { color: [surface.background, surface.panel] } },
      }
    }
    function makeEchartsTheme(theme, mode) {
      var surface = surfaceFor(mode)
      var palette = paletteFor(theme, mode) || DEFAULT_PALETTE
      var axis = axisTheme(surface)
      return {
        color: palette,
        backgroundColor: surface.background,
        textStyle: { color: surface.text },
        title: { textStyle: { color: surface.title }, subtextStyle: { color: surface.muted } },
        legend: { textStyle: { color: surface.muted }, pageTextStyle: { color: surface.muted } },
        tooltip: { backgroundColor: surface.tooltip, borderColor: surface.tooltipBorder, textStyle: { color: surface.text } },
        axisPointer: {
          lineStyle: { color: surface.pointer }, crossStyle: { color: surface.pointer },
          label: { color: '#FFFFFF', backgroundColor: surface.pointer },
        },
        toolbox: { iconStyle: { borderColor: surface.muted } },
        dataZoom: {
          borderColor: surface.border, textStyle: { color: surface.muted },
          brushStyle: { color: resolvedMode(mode) === 'dark' ? 'rgba(135,163,206,0.3)' : 'rgba(84,112,198,0.15)' },
          fillerColor: resolvedMode(mode) === 'dark' ? 'rgba(135,163,206,0.2)' : 'rgba(84,112,198,0.12)',
        },
        visualMap: { textStyle: { color: surface.muted } },
        timeline: {
          lineStyle: { color: surface.axis }, label: { color: surface.muted },
          controlStyle: { color: surface.muted, borderColor: surface.muted },
        },
        // CalendarModel defaults are black split lines and white cells. Native
        // theme values keep contribution calendars readable in both modes.
        calendar: {
          itemStyle: { color: surface.panel, borderColor: surface.border },
          splitLine: { lineStyle: { color: surface.border } },
          dayLabel: { color: surface.muted }, monthLabel: { color: surface.muted }, yearLabel: { color: surface.muted },
        },
        categoryAxis: axis,
        valueAxis: axis,
        timeAxis: axis,
        logAxis: axis,
        angleAxis: axis,
        radiusAxis: axis,
        singleAxis: axis,
        parallel: { parallelAxisDefault: axis },
        radar: { axisName: { color: surface.muted }, splitLine: { lineStyle: { color: surface.grid } }, splitArea: { areaStyle: { color: [surface.background, surface.panel] } }, axisLine: { lineStyle: { color: surface.axis } } },
        geo: { itemStyle: { areaColor: surface.panel, borderColor: surface.border }, label: { color: surface.muted } },
        graph: { color: palette, label: { color: surface.text }, lineStyle: { color: surface.grid } },
        gauge: { title: { color: surface.muted }, axisLabel: { color: surface.muted }, detail: { color: surface.title }, axisLine: { lineStyle: { color: [[1, resolvedMode(mode) === 'dark' ? 'rgba(207,212,219,0.2)' : '#E0E6F1']] } } },
        line: { symbol: 'circle' },
      }
    }
    function echartsThemeName(theme, mode) {
      return 'dsh-artifact-' + (theme && theme.id ? theme.id : 'auto') + '-' + resolvedMode(mode)
    }
    function registerEchartsTheme(echarts, theme, mode) {
      var name = echartsThemeName(theme, mode)
      echarts.registerTheme(name, makeEchartsTheme(theme, mode))
      return name
    }
    function registerMaps(echarts, maps) {
      if (!maps || typeof maps !== 'object' || Array.isArray(maps)) return
      Object.keys(maps).forEach(function (name) {
        var map = maps[name]
        // ECharts accepts both GeoJSON objects and SVG source strings here.
        if (typeof name === 'string' && name && map && (typeof map === 'object' || typeof map === 'string')) echarts.registerMap(name, map)
      })
    }

    // ---------- ECharts-GL quality compiler ----------

    // Small, versioned offline resource set. It is deliberately semantic and
    // shared across profiles rather than becoming an unbounded scene library.
    function globeAssets() {
      return {
        earth: assetUrl('globe/world.topo.bathy.200401.jpg'),
        starfield: assetUrl('globe/starfield.jpg'),
        studioHdr: assetUrl('globe/pisa.hdr'),
      }
    }
    function isPlainObject(value) {
      return value && typeof value === 'object' && !Array.isArray(value)
    }
    function mergeMissing(target, defaults) {
      Object.keys(defaults).forEach(function (key) {
        var fallback = defaults[key]
        if (target[key] === undefined) target[key] = fallback
        else if (isPlainObject(target[key]) && isPlainObject(fallback)) mergeMissing(target[key], fallback)
      })
      return target
    }
    function cloneOption(option) {
      // Host-side validation has already guaranteed a JSON-only payload.
      return JSON.parse(JSON.stringify(option))
    }
    function components(value) {
      if (Array.isArray(value)) return value
      return value === undefined ? [] : [value]
    }
    function hasGlSeries(option, types) {
      var series = Array.isArray(option.series) ? option.series : [option.series]
      return series.some(function (item) { return item && types[item.type] })
    }
    var GRID3D_SERIES = { bar3D: true, line3D: true, scatter3D: true, surface: true }
    var GEO3D_SERIES = { map3D: true, lines3D: true, polygons3D: true }

    // This compiler only fills missing values. It is a quality floor for the
    // official ECharts-GL coordinate systems, never a replacement for a model
    // or user-authored option. The selected appearance mode intentionally owns
    // the card background so it remains effective for 3D canvases too.
    function applyGlPalette(option, theme, mode) {
      var palette = paletteFor(theme, mode)
      // A selected appearance palette is an explicit presentation choice. Let
      // ECharts-GL consume it through the same top-level color channel as
      // native ECharts series; per-datum/item colors in the source option keep
      // their semantic meaning and are deliberately not overwritten.
      if (palette) option.color = palette.slice()
      return palette
    }
    function isAutomaticEnvironment(value) {
      // ECharts-GL's `auto` becomes its HDR skybox, which paints above the
      // chart background. Treat it as unset so the appearance mode can own
      // the canvas. A URL, gradient, color, or `none` remains author intent.
      return value === undefined || value === 'auto'
    }
    function applyGlEnvironment(component, surface) {
      if (isPlainObject(component) && isAutomaticEnvironment(component.environment)) {
        component.environment = surface.background
      }
    }
    function forceTextColor(style, color) {
      var next = isPlainObject(style) ? Object.assign({}, style) : {}
      next.color = color
      // Generated titles often use a `rich` fragment with an explicit white
      // foreground. Keep every fragment legible when the card switches mode.
      if (isPlainObject(next.rich)) {
        var rich = {}
        Object.keys(next.rich).forEach(function (key) {
          rich[key] = isPlainObject(next.rich[key]) ? Object.assign({}, next.rich[key], { color: color }) : { color: color }
        })
        next.rich = rich
      }
      return next
    }
    function applyGlTextSurface(option, surface) {
      option.textStyle = forceTextColor(option.textStyle, surface.text)
      components(option.title).forEach(function (title) {
        if (!isPlainObject(title)) return
        title.textStyle = forceTextColor(title.textStyle, surface.title)
        title.subtextStyle = forceTextColor(title.subtextStyle, surface.muted)
      })
      components(option.legend).forEach(function (legend) {
        if (isPlainObject(legend)) legend.textStyle = forceTextColor(legend.textStyle, surface.muted)
      })
      components(option.visualMap).forEach(function (visualMap) {
        if (isPlainObject(visualMap)) visualMap.textStyle = forceTextColor(visualMap.textStyle, surface.muted)
      })
      option.tooltip = isPlainObject(option.tooltip) ? Object.assign({}, option.tooltip) : {}
      option.tooltip.backgroundColor = surface.tooltip
      option.tooltip.borderColor = surface.tooltipBorder
      option.tooltip.textStyle = forceTextColor(option.tooltip.textStyle, surface.text)
    }
    function compileGlOption(option, theme, mode) {
      if (!usesEchartsGl(option)) return option
      var compiled = cloneOption(option)
      var surface = surfaceFor(mode)
      compiled.backgroundColor = surface.background
      var palette = applyGlPalette(compiled, theme, mode)
      applyGlTextSurface(compiled, surface)
      var assets = globeAssets()

      components(compiled.globe).forEach(function (globe) {
        if (!isPlainObject(globe)) return
        mergeMissing(globe, {
          baseTexture: assets.earth,
          heightTexture: assets.earth,
          displacementScale: 0.04,
          shading: 'realistic',
          // The official demo's HDR is useful, but its full-strength specular
          // reflection is far too harsh as a generic default. Keep detail in
          // both the day and night sides of the globe instead of producing a
          // blown-out polar highlight and an unreadable black hemisphere.
          realisticMaterial: { roughness: 0.96, metalness: 0 },
          postEffect: { enable: true, bloom: { enable: false } },
          light: {
            main: { intensity: 1.8, alpha: 35, beta: 20, shadow: false },
            ambientCubemap: {
              texture: assets.studioHdr,
              exposure: 0.8,
              diffuseIntensity: 0.72,
              specularIntensity: 0.18,
            },
          },
          // Do not impose a synthetic camera angle. Globe's official defaults
          // provide the natural whole-earth framing and remain fully draggable.
          viewControl: { panSensitivity: 0 },
        })
        // A globe's `environment: auto` is a skybox that hides the normal
        // ECharts background. Replace only that automatic value with the
        // selected surface; an author-supplied starfield/HDR/gradient is kept.
        applyGlEnvironment(globe, surface)
        // Photorealistic base textures must keep their true geographic colors.
        // A high exponent confines the theme accent to a narrow rim; unlike a
        // low exponent it never overlays the satellite material's broad face.
        // An authored atmosphere remains authoritative.
        if (palette && globe.atmosphere === undefined) {
          globe.atmosphere = { show: true, color: palette[0], offset: 1, glowPower: 12, innerGlowPower: 16 }
        }
      })

      if (compiled.grid3D !== undefined || hasGlSeries(compiled, GRID3D_SERIES)) {
        if (!isPlainObject(compiled.grid3D)) compiled.grid3D = {}
        mergeMissing(compiled.grid3D, {
          boxWidth: 100,
          boxDepth: 80,
          viewControl: { alpha: 25, beta: 40, distance: 180, minDistance: 100, maxDistance: 300 },
          light: { main: { intensity: 1.2, shadow: true }, ambient: { intensity: 0.35 } },
          postEffect: { enable: true, SSAO: { enable: true, radius: 2, intensity: 1.2 } },
          temporalSuperSampling: { enable: true },
        })
        applyGlEnvironment(compiled.grid3D, surface)
      }

      if (compiled.geo3D !== undefined || hasGlSeries(compiled, GEO3D_SERIES)) {
        components(compiled.geo3D).forEach(function (geo) {
          if (!isPlainObject(geo)) return
          mergeMissing(geo, {
            regionHeight: 2,
            itemStyle: { color: surface.panel, borderColor: surface.border },
            label: { show: false, color: surface.text },
            viewControl: { alpha: 35, beta: 0, distance: 120, panSensitivity: 0 },
            light: { main: { intensity: 1.1, shadow: true }, ambient: { intensity: 0.35 } },
            postEffect: { enable: true, SSAO: { enable: true, radius: 2, intensity: 1 } },
          })
          applyGlEnvironment(geo, surface)
        })
      }
      return compiled
    }

    // ---------- engine renderers (each returns a disposer) ----------

    function imageStem(title) {
      var safe = typeof title === 'string' ? title.trim().replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/\s+/g, '-') : ''
      return safe || 'dsh-artifact'
    }
    function imageFilename(title, extension) {
      return imageStem(title) + '.' + (extension || 'png')
    }
    function downloadBlob(blob, filename) {
      var url = URL.createObjectURL(blob)
      var link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
    }
    function dataUrlToBlob(dataUrl) {
      var parts = String(dataUrl).split(',')
      var header = parts[0] || ''
      var body = parts.slice(1).join(',')
      var mime = (header.match(/^data:([^;,]+)/i) || [])[1] || 'application/octet-stream'
      var bytes = atob(body)
      var buffer = new Uint8Array(bytes.length)
      for (var i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i)
      return new Blob([buffer], { type: mime })
    }
    function svgWithInlineStyles(svg, width, height) {
      var clone = svg.cloneNode(true)
      var sourceNodes = [svg].concat(Array.prototype.slice.call(svg.querySelectorAll('*')))
      var cloneNodes = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll('*')))
      sourceNodes.forEach(function (node, index) {
        var target = cloneNodes[index]
        if (!target || !window.getComputedStyle) return
        var style = window.getComputedStyle(node)
        var text = ''
        for (var i = 0; i < style.length; i++) {
          var property = style[i]
          text += property + ':' + style.getPropertyValue(property) + ';'
        }
        if (text) target.setAttribute('style', text)
      })
      // Mermaid 11 still uses foreignObject for a number of labels even with
      // htmlLabels disabled. Browsers treat such SVGs as unsafe canvas input
      // in some embedded WebViews, making toBlob fail. Convert only the export
      // clone to native SVG text so the interactive on-screen diagram remains
      // untouched while its PNG counterpart is safe to encode.
      Array.prototype.slice.call(svg.querySelectorAll('foreignObject')).forEach(function (sourceObject) {
        var index = sourceNodes.indexOf(sourceObject)
        var targetObject = cloneNodes[index]
        if (!targetObject || !targetObject.parentNode) return
        var label = sourceObject.textContent ? sourceObject.textContent.trim().replace(/\s+/g, ' ') : ''
        if (!label) { targetObject.parentNode.removeChild(targetObject); return }
        var x = parseFloat(sourceObject.getAttribute('x') || '0')
        var y = parseFloat(sourceObject.getAttribute('y') || '0')
        var objectWidth = parseFloat(sourceObject.getAttribute('width') || '0')
        var objectHeight = parseFloat(sourceObject.getAttribute('height') || '0')
        var style = window.getComputedStyle ? window.getComputedStyle(sourceObject) : null
        var labelNode = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        labelNode.textContent = label
        labelNode.setAttribute('x', String(x + objectWidth / 2))
        labelNode.setAttribute('y', String(y + objectHeight / 2))
        labelNode.setAttribute('text-anchor', 'middle')
        labelNode.setAttribute('dominant-baseline', 'middle')
        if (sourceObject.getAttribute('transform')) labelNode.setAttribute('transform', sourceObject.getAttribute('transform'))
        if (style) {
          labelNode.setAttribute('fill', style.color || '#172033')
          labelNode.setAttribute('font-family', style.fontFamily || 'sans-serif')
          labelNode.setAttribute('font-size', style.fontSize || '14px')
          labelNode.setAttribute('font-weight', style.fontWeight || '400')
        }
        targetObject.parentNode.replaceChild(labelNode, targetObject)
      })
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
      clone.setAttribute('width', String(width))
      clone.setAttribute('height', String(height))
      if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', '0 0 ' + width + ' ' + height)
      return clone
    }
    function mermaidSvgBlob(svg) {
      var rect = svg.getBoundingClientRect()
      var viewBox = svg.viewBox && svg.viewBox.baseVal
      var width = Math.max(1, Math.round(rect.width || (viewBox && viewBox.width) || 800))
      var height = Math.max(1, Math.round(rect.height || (viewBox && viewBox.height) || 600))
      var source = new XMLSerializer().serializeToString(svgWithInlineStyles(svg, width, height))
      return { width: width, height: height, blob: new Blob(['<?xml version="1.0" encoding="UTF-8"?>' + source], { type: 'image/svg+xml;charset=utf-8' }) }
    }
    function exportMermaidPng(svg, surface) {
      var source = mermaidSvgBlob(svg)
      return new Promise(function (resolve, reject) {
        var image = new Image()
        var url = URL.createObjectURL(source.blob)
        function cleanUp() { URL.revokeObjectURL(url) }
        image.onload = function () {
          try {
            var ratio = Math.min(2, window.devicePixelRatio || 1)
            var canvas = document.createElement('canvas')
            canvas.width = Math.round(source.width * ratio)
            canvas.height = Math.round(source.height * ratio)
            var context = canvas.getContext('2d')
            if (!context) throw new Error('PNG canvas is unavailable')
            context.fillStyle = surface.background
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.drawImage(image, 0, 0, canvas.width, canvas.height)
            cleanUp()
            canvas.toBlob(function (blob) {
              if (!blob) { reject(new Error('PNG encoding failed')); return }
              resolve(blob)
            }, 'image/png')
          } catch (err) { reject(err) }
        }
        image.onerror = function () { cleanUp(); reject(new Error('diagram image conversion failed')) }
        image.src = url
      })
    }
    function exportMermaidSvg(svg) {
      return mermaidSvgBlob(svg).blob
    }
    function exportEchartsSvg(echarts, option, theme, mode, maps, width, height, title) {
      var holder = document.createElement('div')
      holder.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:' + width + 'px;height:' + height + 'px;visibility:hidden;pointer-events:none;'
      document.body.appendChild(holder)
      var svgChart = null
      try {
        registerMaps(echarts, maps)
        svgChart = echarts.init(holder, registerEchartsTheme(echarts, theme, mode), { renderer: 'svg', width: width, height: height })
        svgChart.setOption(option)
        if (typeof svgChart.renderToSVGString !== 'function') throw new Error('SVG export is unavailable for this chart')
        return new Blob([svgChart.renderToSVGString()], { type: 'image/svg+xml;charset=utf-8' })
      } finally {
        if (svgChart) svgChart.dispose()
        document.body.removeChild(holder)
      }
    }
    function renderEcharts(el, echarts, option, theme, mode, maps, onExport) {
      if (!option || typeof option !== 'object') { el.innerHTML = errHtml('invalid echarts option'); return noop }
      var chart = null
      try {
        registerMaps(echarts, maps)
        chart = echarts.init(el, registerEchartsTheme(echarts, theme, mode))
        chart.setOption(compileGlOption(option, theme, mode))
        if (onExport) onExport(function (format) {
          var title = option.title && !Array.isArray(option.title) ? option.title.text : undefined
          if (format === 'svg') return exportEchartsSvg(echarts, option, theme, mode, maps, Math.max(1, el.clientWidth), Math.max(1, el.clientHeight), title)
          return dataUrlToBlob(chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: surfaceFor(mode).background }))
        }, usesEchartsGl(option) ? ['png'] : ['png', 'svg'])
      } catch (e) {
        if (chart) chart.dispose()
        el.innerHTML = errHtml('ECharts render failed: ' + (e && e.message ? e.message : e) + '. Check the ECharts option, required coordinate system/component, and map registration.')
        return noop
      }
      var ro = new ResizeObserver(function () { chart.resize() })
      ro.observe(el)
      return function () { if (onExport) onExport(null); ro.disconnect(); chart.dispose() }
    }

    function normalizeMermaidSource(code) {
      return String(code).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
    }

    // The official Mermaid grammar reserves lowercase `end`. Repair only the
    // exact class-name failure that has an unambiguous replacement; labels and
    // subgraph terminators are intentionally left untouched.
    function repairMermaidReservedClassName(code) {
      if (!/^\s*classDef\s+end(?=\s|,|;|$)/m.test(code)) return { code: code, repaired: false }
      var repaired = code.replace(/^(\s*classDef\s+)end(?=\s|,|;|$)/m, '$1dshTerminal')
      repaired = repaired.replace(/^(\s*class\s+[^\n]*?\s)end(?=\s*(?:;|$))/gm, '$1dshTerminal')
      repaired = repaired.replace(/:::end(?=\W|$)/g, ':::dshTerminal')
      return { code: repaired, repaired: true }
    }

    function mermaidErrorMessage(error, code) {
      var raw = error && error.message ? error.message : String(error || 'unknown parser error')
      var line = raw.match(/line\s+(\d+)/i)
      var location = line ? ' on line ' + line[1] : ''
      if (/got ['"]?end['"]?|classDef\s+end|lowercase [`'"]?end/i.test(raw) || /^\s*classDef\s+end/m.test(code)) {
        return 'Mermaid syntax error' + location + ': lowercase "end" is reserved. Use a safe ID/class such as "terminalNode" or "terminal", and put “End” / “结束” in a quoted label.'
      }
      if (/parse error|expecting/i.test(raw)) {
        return 'Mermaid syntax error' + location + '. Check the diagram type, quoted labels, node IDs, and classDef syntax; Mermaid source must not be wrapped in a Markdown code fence.'
      }
      return 'Mermaid render failed' + location + ': ' + raw
    }

    function renderMermaid(el, mermaid, code, theme, mode, onExport) {
      if (typeof code !== 'string' || code.trim() === '') { el.innerHTML = errHtml('empty mermaid code'); return noop }
      var surface = surfaceFor(mode)
      var themeVariables = mermaidThemeVariables(mode)
      var normalized = normalizeMermaidSource(code)
      var repaired = repairMermaidReservedClassName(normalized)
      var id = 'dsh-mm-' + Math.random().toString(36).slice(2, 10)
      var cancelled = false
      enqueueMermaidRender(function () {
        if (cancelled) return null
        mermaid.initialize({
          startOnLoad: false, securityLevel: 'strict', theme: 'base',
          themeVariables: themeVariables,
          flowchart: { htmlLabels: false },
        })
        return Promise.resolve(mermaid.parse(repaired.code)).then(function () {
          return mermaid.render(id, repaired.code)
        })
      }).then(function (r) {
        if (cancelled) return
        if (!r) return
        el.innerHTML = r.svg
        el.style.overflow = 'auto'
        el.style.display = 'flex'
        el.style.justifyContent = 'center'
        var renderedSvg = el.querySelector('svg')
        if (renderedSvg) {
          renderedSvg.style.backgroundColor = surface.background
          renderedSvg.style.color = surface.text
        }
        if (onExport) onExport(function (format) {
          var svg = el.querySelector('svg')
          if (!svg) throw new Error('diagram is not ready')
          if (format === 'svg') return exportMermaidSvg(svg)
          return exportMermaidPng(svg, surface)
        }, ['png', 'svg'])
      }).catch(function (e) {
        if (!cancelled) el.innerHTML = errHtml(mermaidErrorMessage(e, repaired.code))
      })
      return function () { cancelled = true; if (onExport) onExport(null); el.innerHTML = '' }
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

    function PaletteStrip(props) {
      var palette = paletteFor(props.theme, props.mode) || ['#CBD5E1', '#94A3B8', '#64748B']
      return React.createElement(
        'span',
        { 'aria-hidden': true, style: { display: 'inline-flex', width: 48, height: 8, borderRadius: 99, overflow: 'hidden', flexShrink: 0 } },
        palette.slice(0, 5).map(function (color, index) {
          return React.createElement('span', { key: index, style: { flex: 1, background: color } })
        }),
      )
    }
    function SurfaceSwatch(props) {
      return React.createElement('span', { 'aria-hidden': true, style: { width: 13, height: 13, borderRadius: 99, flexShrink: 0, border: '1px solid ' + props.surface.border, background: props.surface.background } })
    }
    function DownloadIcon() {
      return React.createElement('svg', { 'aria-hidden': true, viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('path', { d: 'M12 3v11' }),
        React.createElement('path', { d: 'm8 10 4 4 4-4' }),
        React.createElement('path', { d: 'M4 20h16' }),
      )
    }
    function filePickerTypes(formats) {
      return formats.map(function (format) {
        return format === 'svg'
          ? { description: 'SVG Vector Image (*.svg)', accept: { 'image/svg+xml': ['.svg'] } }
          : { description: 'PNG Image (*.png)', accept: { 'image/png': ['.png'] } }
      })
    }
    function selectedFileFormat(name, formats) {
      if (/\.svg$/i.test(name) && formats.indexOf('svg') !== -1) return 'svg'
      return formats.indexOf('png') !== -1 ? 'png' : formats[0]
    }
    function DownloadButton(props) {
      var pendingState = React.useState(false)
      var pending = pendingState[0]
      var setPending = pendingState[1]
      var formats = props.formats && props.formats.length ? props.formats : ['png']
      function download() {
        if (!props.onDownload || pending) return
        setPending(true)
        var target = null
        var requested
        if (typeof window.showSaveFilePicker === 'function') {
          requested = window.showSaveFilePicker({
            // Let the operating system append the selected file type. This
            // keeps the editable default name clean and avoids a stale suffix
            // when the user switches PNG ↔ SVG in the native dialog.
            suggestedName: imageStem(props.title),
            types: filePickerTypes(formats),
          }).then(function (handle) {
            target = handle
            return selectedFileFormat(handle.name, formats)
          })
        } else {
          requested = Promise.resolve(formats[0])
        }
        requested.then(function (format) {
          return Promise.resolve(props.onDownload(format)).then(function (blob) {
            if (!(blob instanceof Blob)) throw new Error('image export did not produce a file')
            if (!target) {
              downloadBlob(blob, imageFilename(props.title, format))
              return null
            }
            return target.createWritable().then(function (stream) {
              return stream.write(blob).then(function () { return stream.close() })
            })
          })
        }).catch(function (error) {
          // The user closing the native save dialog is an expected no-op.
          if (!error || error.name !== 'AbortError') console.error('[dsh-artifact] image export failed', error)
        }).then(function () { setPending(false) })
      }
      var disabled = !props.ready || pending
      return React.createElement('button', {
        type: 'button', disabled: disabled, 'aria-label': '下载图片', title: pending ? '正在生成图片' : '下载图片（在另存为窗口选择格式）', onClick: download,
        style: { position: 'absolute', top: 12, right: 12, zIndex: 2147483647, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, minHeight: 32, padding: 0, borderRadius: 7, cursor: disabled ? 'default' : 'pointer', border: '1px solid ' + props.surface.border, background: props.surface.panel, color: props.ready ? props.surface.text : props.surface.muted, opacity: props.ready ? 1 : 0.55, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' },
      }, React.createElement(DownloadIcon, null))
    }

    // A compact, in-canvas menu keeps the chart card quiet until the user
    // needs styling controls. It is intentionally independent of the renderer
    // so the same control works above ECharts-GL's multi-canvas WebGL layers.
    function AppearanceMenu(props) {
      var openState = React.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var menuRef = React.useRef(null)
      var surface = props.surface
      var accent = props.palette && props.palette[0] ? props.palette[0] : (resolvedMode(props.mode) === 'dark' ? '#4992FF' : '#5470C6')

      React.useEffect(function () {
        if (!open || typeof document === 'undefined') return undefined
        function closeOnOutside(e) {
          if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', closeOnOutside)
        return function () { document.removeEventListener('mousedown', closeOnOutside) }
      }, [open])

      function halt(e) {
        if (e && e.stopPropagation) e.stopPropagation()
        if (e && e.preventDefault) e.preventDefault()
      }
      function selectTheme(id, e) { halt(e); props.onTheme(id); setOpen(false) }
      function selectMode(id, e) { halt(e); props.onMode(id) }

      return React.createElement(
        'div',
        {
          ref: menuRef,
          onClick: function (e) { if (e && e.stopPropagation) e.stopPropagation() },
          onKeyDown: function (e) { if (e && e.key === 'Escape') { setOpen(false); if (e.stopPropagation) e.stopPropagation() } },
          // ECharts-GL can create multiple canvas layers. This overlay is a
          // sibling of the renderer and must always win the stacking contest.
          style: { position: 'absolute', top: 12, right: 52, zIndex: 2147483647, isolation: 'isolate', transform: 'translateZ(0)', pointerEvents: 'auto', fontFamily: 'inherit' },
        },
        React.createElement(
          'button',
          {
            type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': open, title: props.showThemes ? '调整图表外观' : '调整背景模式',
            onClick: function (e) { halt(e); setOpen(!open) },
            style: { display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 32, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', border: '1px solid ' + surface.border, background: surface.panel, color: surface.text, boxShadow: open ? '0 6px 18px rgba(0,0,0,0.18)' : '0 1px 3px rgba(0,0,0,0.12)', fontSize: 12, fontWeight: 600 },
          },
          props.showThemes ? React.createElement(PaletteStrip, { theme: props.theme, mode: props.mode }) : React.createElement(SurfaceSwatch, { surface: surface }),
          props.showThemes ? '外观' : '背景',
          React.createElement('span', { 'aria-hidden': true, style: { color: surface.muted, fontSize: 10 } }, open ? '▲' : '▼'),
        ),
        open ? React.createElement(
          'div',
          { role: 'menu', 'aria-label': props.showThemes ? '图表外观' : '背景模式', style: { position: 'absolute', top: 42, right: 0, zIndex: 2147483647, width: 224, padding: 8, borderRadius: 9, border: '1px solid ' + surface.border, background: surface.panel, color: surface.text, boxShadow: '0 12px 28px rgba(0,0,0,0.22)' } },
          React.createElement('div', { style: { padding: '2px 4px 7px', color: surface.muted, fontSize: 11, fontWeight: 600 } }, '显示模式'),
          React.createElement(
            'div',
            { role: 'group', 'aria-label': '显示模式', style: { display: 'flex', gap: 4, marginBottom: props.showThemes ? 8 : 0, padding: 3, borderRadius: 6, background: resolvedMode(props.mode) === 'dark' ? '#0D0A20' : '#F3F5F8' } },
            props.modes.map(function (item) {
              var active = item.id === props.mode.id
              return React.createElement('button', { key: item.id, type: 'button', 'aria-pressed': active, onClick: function (e) { selectMode(item.id, e) }, style: { flex: 1, minHeight: 28, border: 0, borderRadius: 4, cursor: 'pointer', background: active ? surface.panel : 'transparent', color: active ? accent : surface.muted, boxShadow: active ? '0 1px 3px rgba(0,0,0,0.14)' : 'none', fontSize: 11 } }, item.label)
            }),
          ),
          props.showThemes ? React.createElement(
            'div',
            null,
            React.createElement('div', { style: { height: 1, background: surface.border, margin: '3px 0 6px' } }),
            React.createElement('div', { style: { padding: '2px 4px 5px', color: surface.muted, fontSize: 11, fontWeight: 600 } }, props.themeLabel || '配色主题'),
            props.themes.map(function (item) {
              var active = item.id === props.theme.id
              return React.createElement(
                'button',
                { key: item.id, type: 'button', role: 'menuitemradio', 'aria-checked': active, onClick: function (e) { selectTheme(item.id, e) }, style: { display: 'flex', alignItems: 'center', width: '100%', minHeight: 32, gap: 8, padding: '5px 6px', border: 0, borderRadius: 5, cursor: 'pointer', textAlign: 'left', background: active ? surface.selected : 'transparent', color: active ? accent : surface.text, fontSize: 12 } },
                React.createElement(PaletteStrip, { theme: item, mode: props.mode }),
                React.createElement('span', { style: { flex: 1 } }, item.label),
                active ? React.createElement('span', { 'aria-label': '已选择', style: { color: accent, fontWeight: 700 } }, '✓') : null,
              )
            }),
          ) : null,
        ) : null,
      )
    }

    function ArtifactToolView(props) {
      var block = props.block
      var meta = block && 'meta' in block ? block.meta : undefined
      var containerRef = React.useRef(null)
      var exportRef = React.useRef(null)
      var exportState = React.useState(false)
      var exportReady = exportState[0]
      var setExportReady = exportState[1]
      var exportFormatsState = React.useState(['png'])
      var exportFormats = exportFormatsState[0]
      var setExportFormats = exportFormatsState[1]
      var isGlArtifact = !!(meta && usesEchartsGl(meta.payload))
      var isPhotorealisticGlobe = !!(meta && hasGlobeScene(meta.payload))
      var isMermaidArtifact = !!(meta && meta.engine === 'mermaid')
      var showColorThemes = !isMermaidArtifact && !isPhotorealisticGlobe
      var availableThemes = isGlArtifact && showColorThemes ? GL_THEMES : THEMES
      var themeState = React.useState(showColorThemes && meta && typeof meta.theme === 'string' ? themeById(meta.theme, availableThemes) : THEMES[0])
      var theme = themeState[0]
      var setTheme = themeState[1]
      var modeState = React.useState(meta && typeof meta.mode === 'string' ? modeById(meta.mode) : MODES[0])
      var mode = modeState[0]
      var setMode = modeState[1]

      // Reset display preferences when a new result arrives (they are per-card).
      React.useEffect(function () {
        var nextIsGlobe = !!(meta && hasGlobeScene(meta.payload))
        var nextIsMermaid = !!(meta && meta.engine === 'mermaid')
        var nextCanTheme = !nextIsMermaid && !nextIsGlobe
        var nextThemes = meta && usesEchartsGl(meta.payload) && nextCanTheme ? GL_THEMES : THEMES
        setTheme(nextCanTheme && meta && typeof meta.theme === 'string' ? themeById(meta.theme, nextThemes) : THEMES[0])
        setMode(meta && typeof meta.mode === 'string' ? modeById(meta.mode) : MODES[0])
      }, [meta])

      React.useEffect(function () {
        var el = containerRef.current
        if (!el || !meta) return undefined
        var engine = meta.engine === 'mermaid' ? 'mermaid' : 'echarts'
        var cancelled = false
        var dispose = noop
        function setExporter(exporter, formats) {
          exportRef.current = exporter
          setExportReady(typeof exporter === 'function')
          setExportFormats(typeof exporter === 'function' && Array.isArray(formats) && formats.length ? formats : ['png'])
        }
        setExporter(null)
        var promise
        if (engine === 'mermaid') promise = loadAsset('mermaid.min.js', 'mermaid')
        else promise = loadAsset('echarts.min.js', 'echarts')

        promise.then(function (api) {
          if (cancelled || !el) return
          if (engine === 'mermaid') dispose = renderMermaid(el, api, meta.payload, theme, mode, setExporter)
          else if (usesEchartsGl(meta.payload)) {
            loadEchartsGl().then(function () {
              if (!cancelled) dispose = renderEcharts(el, api, meta.payload, theme, mode, meta.maps, setExporter)
            }).catch(function (err) {
              if (!cancelled) el.innerHTML = errHtml('ECharts-GL load failed: ' + (err && err.message ? err.message : err))
            })
          } else dispose = renderEcharts(el, api, meta.payload, theme, mode, meta.maps, setExporter)
        }).catch(function (err) {
          if (!cancelled) el.innerHTML = errHtml('engine load failed: ' + (err && err.message ? err.message : err))
        })

        return function () {
          cancelled = true
          dispose()
          setExporter(null)
        }
      }, [meta, theme, mode, block && block.callId])

      if (!meta || !meta.payload) return toolFallback(TOOL_NAME)
      var height = typeof meta.height === 'number' && meta.height >= 120 ? meta.height : 360
      var surface = surfaceFor(mode)
      var palette = paletteFor(theme, mode)
      return React.createElement(
        'div',
        { 'data-artifact-tool': true, style: { color: surface.text } },
        meta.title ? React.createElement('div', { style: { fontWeight: 600, marginBottom: 8, fontSize: 14 } }, meta.title) : null,
        React.createElement(
          'div',
          { style: { position: 'relative', isolation: 'isolate', width: '100%', height: height + 'px', minHeight: '200px', borderRadius: 8, overflow: 'hidden', background: surface.background, border: '1px solid ' + surface.border } },
          React.createElement('div', { ref: containerRef, style: { position: 'absolute', inset: 0, zIndex: 0, width: '100%', height: '100%' } }),
          React.createElement(DownloadButton, { surface: surface, ready: exportReady, formats: exportFormats, title: meta.title || 'diagram', onDownload: function (format) { return exportRef.current && exportRef.current(format) } }),
          React.createElement(AppearanceMenu, { theme: theme, mode: mode, themes: availableThemes, showThemes: showColorThemes, themeLabel: isGlArtifact ? '3D 单色主题' : '配色主题', modes: MODES, surface: surface, palette: palette, onTheme: function (id) { setTheme(themeById(id, availableThemes)) }, onMode: function (id) { setMode(modeById(id)) } }),
        ),
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
