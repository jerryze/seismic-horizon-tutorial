/* ==========================================================================
   地震层位解释 · 教学讲义交互组件
   唯一的功能：在真实 F3 剖面上点击选择种子点，观察沿同相轴的追踪结果。
   数据来自 assets/js/section_history.js（由 tools/export_demo_section.py 生成）。
   ========================================================================== */
(function () {
  'use strict';

  var D = window.SECTION_DEMO;
  if (!D) return;                                  // 数据缺失时不显示任何交互

  /* ------------------------------------------------------------- 参数 */
  var WIN = 5;          // 匹配时窗半径：±5 个样点 = ±40 ms
  var MAX_STEP = 2;     // 相邻道之间允许的最大时间跳跃：±2 个样点 = ±16 ms
  var TRACK_AVG = 3;    // 每追踪若干道更新一次模板

  /* ------------------------------------------------------------- 工具 */

  function $(sel, root) { return (root || document).querySelector(sel); }

  function makeSurface(canvas, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // matplotlib gray_r 的 8 个锚点，让网页与插图配色一致
  var GRAY = (function () {
    var g = [255, 219, 183, 146, 110, 73, 37, 0];
    var t = [0, 36.43, 72.86, 109.29, 145.71, 182.14, 218.57, 255];
    var lut = new Uint8ClampedArray(256);
    for (var i = 0; i < 256; i++) {
      var k = 0;
      while (k < 6 && t[k + 1] < i) k++;
      var f = (i - t[k]) / (t[k + 1] - t[k]);
      lut[i] = Math.round(g[k] + f * (g[k + 1] - g[k]));
    }
    return lut;
  })();

  /* ------------------------------------------------- 数据解析为列优先数组 */

  var nts = D.nts, nxl = D.nxl;
  var amp = new Int16Array(nts * nxl);             // amp[col * nts + row]
  for (var j = 0; j < nxl; j++) {
    var parts = D.amp[j].split(',');
    for (var i = 0; i < nts; i++) amp[j * nts + i] = parseInt(parts[i], 10);
  }

  // 使用对称的显示范围：负振幅为浅色，零振幅为中灰，正振幅为深色。
  // 范围外的振幅饱和为黑或白，提高反射条纹的显示对比度。
  var GMAX = D.qscale * 0.65;

  // 真实解释成果（参考）。绘图统一用“行号”，因此这里先把时间换算成行号。
  var ref = new Float32Array(nxl);
  for (var j2 = 0; j2 < nxl; j2++) {
    var v = D.horizons.H2[j2];
    ref[j2] = (v === null || v === undefined) ? NaN : (v - D.t0) / D.dt;
  }

  /* ------------------------------------------------------------- 追踪算法 */

  // 在 col 道、以 rowC 为中心取窗，返回去均值后的窗口与模长
  function window_(col, rowC) {
    var v = new Float64Array(2 * WIN + 1), m = 0, i, r;
    for (i = 0; i < v.length; i++) {
      r = rowC - WIN + i;
      v[i] = (r >= 0 && r < nts) ? amp[col * nts + r] : 0;
      m += v[i];
    }
    m /= v.length;
    var nn = 0;
    for (i = 0; i < v.length; i++) { v[i] -= m; nn += v[i] * v[i]; }
    return { v: v, norm: Math.sqrt(nn) };
  }

  // 用模板在 col 道的 ±MAX_STEP 范围内搜索归一化互相关最大的位置
  function bestRow(tpl, col, rowC) {
    var best = rowC, bestScore = -Infinity;
    for (var s = -MAX_STEP; s <= MAX_STEP; s++) {
      var candidate = rowC + s;
      if (candidate < 0 || candidate >= nts) continue;
      var w = window_(col, candidate);
      if (w.norm <= 0 || tpl.norm <= 0) continue;
      var dot = 0;
      for (var i = 0; i < w.v.length; i++) dot += w.v[i] * tpl.v[i];
      var score = dot / (w.norm * tpl.norm);
      if (score > bestScore) { bestScore = score; best = candidate; }
    }
    return best;
  }

  // 从种子点向两侧逐道追踪
  function track(seedCol, seedRow) {
    var rows = new Float32Array(nxl).fill(NaN);
    rows[seedCol] = seedRow;

    function walk(from, to, step) {
      var row = seedRow;
      var tpl = window_(seedCol, row);
      var sum = new Float64Array(2 * WIN + 1), nAvg = 0;
      for (var c = from; step > 0 ? c < to : c >= to; c += step) {
        row = bestRow(tpl, c, row);
        rows[c] = row;
        var w = window_(c, row);
        for (var i = 0; i < w.v.length; i++) sum[i] += w.v[i];
        nAvg++;
        // 累积若干道后更新模板：兼顾抗噪与适应波组横向变化
        if (nAvg >= TRACK_AVG) {
          var m = 0, k;
          for (k = 0; k < sum.length; k++) { sum[k] /= nAvg; m += sum[k]; }
          m /= sum.length;
          var nn = 0, tv = new Float64Array(sum.length);
          for (k = 0; k < sum.length; k++) { tv[k] = sum[k] - m; nn += tv[k] * tv[k]; }
          tpl = { v: tv, norm: Math.sqrt(nn) };
          sum = new Float64Array(2 * WIN + 1);
          nAvg = 0;
        }
      }
    }
    walk(seedCol + 1, nxl, 1);
    walk(seedCol - 1, -1, -1);
    return rows;
  }

  /* --------------------------------------------------------------- 主程序 */

  function main() {
    var root = document.querySelector('[data-widget=tracker]');
    if (!root) return;
    var canvas = $('canvas', root);
    var runBtn = $('button[data-role=run]', root);
    var clearBtn = $('button[data-role=clear]', root);
    var exampleBtn = $('button[data-role=example]', root);
    var autoToggle = $('input[data-role=auto]', root);
    var refToggle = $('input[data-role=ref]', root);
    var readout = $('[data-role=readout]', root);
    var report = $('[data-role=report]', root);

    var W, H, box, ctx;

    var seed = null, autoRows = null, hover = null, stat = null;

    // 预渲染地震剖面（正值深色）
    var off = document.createElement('canvas');
    off.width = nxl; off.height = nts;
    (function paint() {
      var octx = off.getContext('2d');
      var img = octx.createImageData(nxl, nts);
      var d = img.data, k = 255 / GMAX;
      for (var j = 0; j < nxl; j++) {
        for (var i = 0; i < nts; i++) {
          var v = 127.5 + amp[j * nts + i] * k / 2;
          if (v > 255) v = 255; else if (v < 0) v = 0;
          var g = GRAY[v | 0], p = (i * nxl + j) * 4;
          d[p] = g; d[p + 1] = g; d[p + 2] = g; d[p + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);
    })();

    function resize() {
      var width = Math.max(280, Math.round(canvas.parentElement.clientWidth));
      if (width === W && ctx) return;
      W = width;
      H = Math.max(300, Math.round(W / 2));
      var pad = { l: W < 500 ? 56 : 74, r: 26, t: 16, b: 54 };
      box = { x: pad.l, y: pad.t, w: W - pad.l - pad.r, h: H - pad.t - pad.b };
      ctx = makeSurface(canvas, W, H);
      draw();
    }

    function xOf(col) { return box.x + (col + 0.5) * box.w / nxl; }
    function yOf(row) { return box.y + (row + 0.5) * box.h / nts; }
    function timeOf(row) { return D.t0 + row * D.dt; }
    function xlOf(col) { return D.xl0 + col * D.xl_step; }

    function draw() {
      runBtn.disabled = !seed;
      clearBtn.disabled = !seed;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, box.x, box.y, box.w, box.h);

      ctx.font = '12px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (var t = 200; t <= 1200; t += 200) {
        var y = yOf((t - D.t0) / D.dt);
        if (y < box.y || y > box.y + box.h) continue;
        ctx.strokeStyle = 'rgba(31,78,121,0.16)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
        ctx.fillStyle = '#5b6b7c'; ctx.fillText(t, box.x - 8, y);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      var ticks = W < 600 ? 4 : 8;
      for (var c = 0; c <= ticks; c++) {
        var f = c / ticks, x = box.x + f * box.w;
        ctx.strokeStyle = 'rgba(31,78,121,0.16)';
        ctx.beginPath(); ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.h); ctx.stroke();
        ctx.fillStyle = '#5b6b7c';
        ctx.fillText(String(D.xl0 + Math.round(f * (nxl - 1)) * D.xl_step),
          x, box.y + box.h + 8);
      }
      ctx.save();
      ctx.translate(20, box.y + box.h / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#3c4a58';
      ctx.font = '13px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText('双程旅行时 (ms)', 0, 0);
      ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#3c4a58';
      ctx.fillText('Crossline', box.x + box.w / 2, box.y + box.h + 29);
      ctx.strokeStyle = '#8b98a5'; ctx.lineWidth = 1;
      ctx.strokeRect(box.x, box.y, box.w, box.h);

      if (refToggle.checked) line(ref, '#2e7d5b', 1.6, [7, 5]);
      if (autoToggle.checked && autoRows) line(autoRows, '#c0392b', 2.1, []);

      if (seed) {
        var sx = xOf(seed.col), sy = yOf(seed.row);
        ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = '#1f4e79'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      }
      if (hover) {
        ctx.save();
        ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(31,78,121,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hover.x, box.y); ctx.lineTo(hover.x, box.y + box.h);
        ctx.moveTo(box.x, hover.y); ctx.lineTo(box.x + box.w, hover.y);
        ctx.stroke(); ctx.restore();
      }
      hint();
    }

    // 画一条层位线；数组元素为 NaN 处断开
    function line(arr, color, w, dash) {
      ctx.save();
      ctx.beginPath();
      var started = false;
      for (var j = 0; j < nxl; j++) {
        var v = arr[j];
        if (!isFinite(v)) { started = false; continue; }
        var x = xOf(j), y = yOf(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.setLineDash(dash); ctx.lineJoin = 'round';
      ctx.lineWidth = w + 2.4; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
      ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke();
      ctx.restore();
    }

    function hint() {
      if (hover) {
        var a = amp[hover.col * nts + hover.row] * (D.amax / D.qscale);
        readout.textContent = 'Crossline ' + xlOf(hover.col) +
          '　t = ' + timeOf(hover.row).toFixed(0) + ' ms' +
          '　振幅 ' + a.toFixed(0);
      } else if (!seed) {
        readout.textContent = '先在 H2 对应的反射上选点，或载入示例点，再点击“开始追踪”';
      } else if (!autoRows) {
        readout.textContent = '已选种子点（Crossline ' + xlOf(seed.col) +
          '，t = ' + timeOf(seed.row).toFixed(0) + ' ms），点击“开始追踪”';
      } else {
        readout.textContent = '已完成追踪。对照绿色参考线和下方时间偏差，检查目标是否一致。';
      }
    }

    function locate(evt) {
      var rect = canvas.getBoundingClientRect();
      // Map responsive display coordinates back to the drawing coordinates.
      var mx = (evt.clientX - rect.left) * W / rect.width;
      var my = (evt.clientY - rect.top) * H / rect.height;
      if (mx < box.x || mx > box.x + box.w || my < box.y || my > box.y + box.h) return null;
      var col = Math.max(0, Math.min(nxl - 1, Math.floor((mx - box.x) / box.w * nxl)));
      var row = Math.max(0, Math.min(nts - 1, Math.floor((my - box.y) / box.h * nts)));
      return { col: col, row: row };
    }

    function chooseSeed(point) {
      seed = point;
      autoRows = null; stat = null; hover = null;
      report.textContent = '';
      draw();
    }

    canvas.addEventListener('mousemove', function (e) {
      hover = locate(e);
      draw();
    });
    canvas.addEventListener('mouseleave', function () { hover = null; draw(); });

    canvas.addEventListener('click', function (e) {
      var p = locate(e);
      if (!p) return;
      chooseSeed(p);
    });

    exampleBtn.addEventListener('click', function () {
      chooseSeed({
        col: Math.max(0, Math.min(nxl - 1, Math.round((Number(exampleBtn.getAttribute('data-crossline')) - D.xl0) / D.xl_step))),
        row: Math.max(0, Math.min(nts - 1, Math.round((Number(exampleBtn.getAttribute('data-time')) - D.t0) / D.dt)))
      });
    });

    canvas.addEventListener('keydown', function (e) {
      var move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (move) {
        e.preventDefault();
        var current = seed || { col: Math.floor(nxl / 2), row: Math.floor(nts / 2) };
        chooseSeed({
          col: Math.max(0, Math.min(nxl - 1, current.col + move[0])),
          row: Math.max(0, Math.min(nts - 1, current.row + move[1]))
        });
      } else if (e.key === 'Enter' && seed) {
        e.preventDefault();
        runBtn.click();
      }
    });

    runBtn.addEventListener('click', function () {
      if (!seed) { readout.textContent = '请先在剖面上单击，选择一个种子点'; return; }
      autoRows = track(seed.col, seed.row);
      autoToggle.checked = true;
      hover = null;
      stat = evaluate(autoRows);
      draw();
      showReport();
    });

    clearBtn.addEventListener('click', function () {
      seed = null; autoRows = null; stat = null; hover = null;
      report.textContent = '';
      draw();
    });

    autoToggle.addEventListener('change', draw);
    refToggle.addEventListener('change', draw);

    function evaluate(rows) {
      var n = 0, sum = 0, max = 0, bad = 0;
      for (var j = 0; j < nxl; j++) {
        if (!isFinite(ref[j]) || !isFinite(rows[j])) continue;
        var d = Math.abs((rows[j] - ref[j]) * D.dt);
        sum += d; n++;
        if (d > max) max = d;
        if (d > 24) bad++;
      }
      return n ? { mean: sum / n, max: max, bad: bad, n: n } : null;
    }

    function showReport() {
      if (!stat) { report.textContent = ''; return; }
      report.innerHTML =
        '<b>与参考层位 H2（绿色虚线）逐道比较：</b>　' +
        '平均偏差 <span class="readout">' + stat.mean.toFixed(1) + ' ms</span>　' +
        '最大偏差 <span class="readout">' + stat.max.toFixed(0) + ' ms</span>　' +
        '偏差大于 24 ms 的道占 <span class="readout">' +
        (100 * stat.bad / stat.n).toFixed(1) + '%</span>';
    }

    resize();
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(resize).observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', resize);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
