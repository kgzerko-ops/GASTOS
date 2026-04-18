// ═══════════════════════════════════════════════════════════════
// CHART.JS wrapper
// ═══════════════════════════════════════════════════════════════

let chartLoaded = null;

export async function ensureChart() {
  if (chartLoaded) return chartLoaded;
  chartLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return chartLoaded;
}

const activeCharts = new WeakMap();

export async function renderBarChart(canvas, { labels, datasets, stacked = false }) {
  const Chart = await ensureChart();
  if (activeCharts.has(canvas)) activeCharts.get(canvas).destroy();

  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      scales: {
        x: { stacked, grid: { display: false } },
        y: {
          stacked,
          beginAtZero: true,
          ticks: { callback: (v) => v + ' €' }
        }
      }
    }
  });
  activeCharts.set(canvas, chart);
  return chart;
}

export async function renderPieChart(canvas, { labels, values, colors }) {
  const Chart = await ensureChart();
  if (activeCharts.has(canvas)) activeCharts.get(canvas).destroy();

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors || defaultPalette(values.length)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round((ctx.parsed / total) * 100) : 0;
              return `${ctx.label}: ${ctx.parsed.toFixed(2)} € (${pct}%)`;
            }
          }
        }
      }
    }
  });
  activeCharts.set(canvas, chart);
  return chart;
}

function defaultPalette(n) {
  const base = ['#1e40af', '#4338ca', '#7c3aed', '#a855f7', '#d946ef',
                '#ec4899', '#f43f5e', '#f97316', '#eab308', '#84cc16', '#22c55e', '#0ea5e9'];
  const out = [];
  for (let i = 0; i < n; i++) out.push(base[i % base.length]);
  return out;
}
