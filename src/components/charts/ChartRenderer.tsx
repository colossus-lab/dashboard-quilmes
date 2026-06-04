import { ResponsiveBar } from '@nivo/bar';
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveLine } from '@nivo/line';
import { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import type { ChartConfig } from '../../types/report';

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);
  return isMobile;
}

// ═══════════════════════════════════════════════════════════════
// ChartRenderer — Universal chart component (theme-aware)
// ═══════════════════════════════════════════════════════════════

interface ChartRendererProps {
  chart: ChartConfig;
  height?: number;
}

function useChartTheme() {
  const theme = useStore(s => s.theme);
  const isDark = theme === 'dark';

  return {
    theme: {
      text: { fill: isDark ? '#8892A8' : '#4A5170' },
      axis: {
        ticks: { text: { fill: isDark ? '#5A6378' : '#6B7080', fontSize: 11 } },
        legend: { text: { fill: isDark ? '#8892A8' : '#11142E', fontSize: 12, fontWeight: 600 } },
      },
      grid: { line: { stroke: isDark ? 'rgba(232,236,244,0.06)' : 'rgba(17,20,46,0.06)' } },
      tooltip: {
        container: {
          background: isDark ? '#1A2030' : '#FFFFFF',
          color: isDark ? '#E8ECF4' : '#11142E',
          borderRadius: '4px',
          boxShadow: isDark
            ? '0 8px 32px rgba(0,0,0,0.55)'
            : '0 8px 32px rgba(17,20,46,0.10)',
          fontSize: '13px',
          padding: '10px 14px',
          border: isDark ? '1px solid rgba(232,236,244,0.10)' : '1px solid rgba(17,20,46,0.12)',
        },
      },
    },
    labelColor: isDark ? '#FFFFFF' : '#11142E',
    isDark,
  };
}

const COLORS = ['#74ACDF', '#93C5F8', '#6BBF59', '#F6B40E', '#D9534F', '#FFD04A', '#1F4E89', '#4A8ABF', '#C03A18', '#D9A20E'];

export function ChartRenderer({ chart, height = 400 }: ChartRendererProps) {
  switch (chart.type) {
    case 'bar':
      return <BarChartView chart={chart} height={height} />;
    case 'pie':
      return <PieChartView chart={chart} height={height} />;
    case 'line':
      return <LineChartView chart={chart} height={height} />;
    case 'pyramid':
      return <PyramidChartView chart={chart} height={height} />;
    case 'map':
      // El mapa territorial fue reemplazado por un KPI hero a nivel
      // partido (renderizado directamente en ReportView). Los charts
      // con type: 'map' en JSONs heredados se ignoran silenciosamente.
      return null;
    default:
      return <BarChartView chart={chart} height={height} />;
  }
}

// ─── Bar Chart ───
function BarChartView({ chart, height }: { chart: ChartConfig; height: number }) {
  const { theme, labelColor } = useChartTheme();
  const keys = Object.keys(chart.data[0] || {}).filter(k => k !== (chart.config?.xAxis || 'id'));
  const indexBy = chart.config?.xAxis || Object.keys(chart.data[0] || {})[0] || 'id';
  const isHorizontal = chart.config?.layout === 'horizontal';
  const dataCount = chart.data.length;
  const mobile = useIsMobile();

  // Cap horizontal bar height to fit within the panel (max ~10 items visible)
  const maxItems = mobile ? 8 : 10;
  const cappedHeight = isHorizontal
    ? Math.min(height, Math.max(280, Math.min(dataCount, maxItems) * (mobile ? 28 : 30) + 60))
    : height;

  // Compact formatter for large value-axis numbers (20000 → 20K)
  const compactNum = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(abs / 1_000).toFixed(0)}K`;
    return String(abs);
  };

  // On mobile, rotate labels more and skip some ticks when there are many data points
  const mobileBottomAxis = () => {
    if (isHorizontal) {
      // Eje de valores: limitar cantidad de ticks y compactar números para
      // evitar que se enciman en pantallas angostas.
      return {
        tickSize: 0,
        tickPadding: 5,
        ...(mobile ? { tickValues: 5 } : {}),
        format: compactNum,
      };
    }
    if (mobile) {
      return {
        tickSize: 0,
        tickPadding: 5,
        tickRotation: dataCount > 3 ? -55 : -30,
        // Show every Nth tick on mobile to prevent overlap
        ...(dataCount > 8 ? { tickValues: chart.data.filter((_: unknown, i: number) => i % Math.ceil(dataCount / 6) === 0).map((d: Record<string, unknown>) => d[indexBy]) } : {}),
      };
    }
    return { tickSize: 0, tickPadding: 5, tickRotation: dataCount > 4 ? -40 : 0 };
  };

  return (
    <div style={{ height: cappedHeight }}>
      <ResponsiveBar
        data={chart.data}
        keys={keys}
        indexBy={indexBy}
        margin={{
          top: 10,
          right: mobile ? 10 : 20,
          bottom: isHorizontal ? 40 : (mobile ? 70 : 70),
          left: isHorizontal ? (mobile ? 110 : 160) : (mobile ? 45 : 50),
        }}
        padding={0.3}
        layout={isHorizontal ? 'horizontal' : 'vertical'}
        colors={COLORS}
        borderRadius={3}
        axisBottom={mobileBottomAxis()}
        axisLeft={
          isHorizontal
            ? { tickSize: 0, tickPadding: 8, format: (v: string) => mobile ? (v.length > 14 ? v.slice(0, 12) + '…' : v) : (v.length > 20 ? v.slice(0, 18) + '…' : v) }
            : { tickSize: 0, tickPadding: 5 }
        }
        enableGridX={isHorizontal}
        enableGridY={!isHorizontal}
        groupMode={chart.config?.stacked ? 'stacked' : 'grouped'}
        theme={theme}
        animate={true}
        motionConfig="gentle"
        labelSkipWidth={mobile ? 40 : 30}
        labelSkipHeight={18}
        labelTextColor={labelColor}
      />
    </div>
  );
}

// ─── Pie Chart ───
function PieChartView({ chart, height }: { chart: ChartConfig; height: number }) {
  const { theme, isDark } = useChartTheme();
  const mobile = useIsMobile();
  const dataCount = chart.data.length;

  // Format large numbers in arc labels
  const formatValue = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toString();
  };

  // On mobile: keep legends below in column layout, make container tall enough
  // so the legend doesn't overlap the donut
  const legendRows = dataCount;
  const mobileLegendHeight = legendRows * 20 + 16; // ~20px per legend row + padding
  const mobileHeight = 260 + mobileLegendHeight; // donut area + legend area

  return (
    <div style={{ height: mobile ? mobileHeight : Math.min(height, 380) }}>
      <ResponsivePie
        data={chart.data}
        margin={mobile
          ? { top: 20, right: 20, bottom: mobileLegendHeight + 20, left: 20 }
          : { top: 30, right: 100, bottom: 40, left: 100 }
        }
        innerRadius={0.5}
        padAngle={2}
        cornerRadius={5}
        colors={COLORS}
        borderWidth={0}
        enableArcLinkLabels={!mobile}
        arcLinkLabelsSkipAngle={8}
        arcLinkLabelsTextColor={isDark ? '#94a3b8' : '#334155'}
        arcLinkLabelsColor={{ from: 'color' }}
        arcLinkLabelsThickness={2}
        arcLinkLabelsDiagonalLength={16}
        arcLinkLabelsStraightLength={20}
        arcLabelsSkipAngle={mobile ? 25 : 15}
        arcLabelsTextColor="#ffffff"
        arcLabel={d => formatValue(d.value)}
        theme={theme}
        animate={true}
        motionConfig="gentle"
        tooltip={({ datum }) => (
          <div style={{
            padding: '8px 12px',
            background: isDark ? '#1e293b' : '#fff',
            color: isDark ? '#f1f5f9' : '#0f172a',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: '13px',
            border: `2px solid ${datum.color}`,
            maxWidth: '200px',
          }}>
            <strong>{datum.label}</strong><br />
            {formatValue(datum.value)} ({((datum.arc.endAngle - datum.arc.startAngle) / (2 * Math.PI) * 100).toFixed(1)}%)
          </div>
        )}
        legends={[
          {
            anchor: 'bottom',
            direction: mobile ? 'column' : 'row',
            translateY: mobile ? mobileLegendHeight + 10 : 36,
            itemWidth: mobile ? 200 : 120,
            itemHeight: 20,
            itemTextColor: isDark ? '#94a3b8' : '#475569',
            symbolSize: 10,
            symbolShape: 'circle',
          },
        ]}
      />
    </div>
  );
}

// ─── Line Chart ───
function LineChartView({ chart, height }: { chart: ChartConfig; height: number }) {
  const { theme } = useChartTheme();
  const mobile = useIsMobile();

  // Detectar formato del data:
  //  - Nivo nativo: [{ id, data: [{x, y}, …] }]
  //  - Plano:       [{ <xKey>: ..., <serieKey>: ..., … }]
  const first = chart.data[0] as Record<string, unknown> | undefined;
  const isNivoFormat = !!first && Array.isArray((first as any).data) && 'id' in first;

  type Datum = { x: string | number | Date; y: number | null };
  let lineData: Array<{ id: string; color: string; data: Datum[] }>;
  let dataCount: number;
  let xKey: string;

  if (isNivoFormat) {
    lineData = (chart.data as Array<{ id: string; data: Datum[] }>).map((s, i) => ({
      id: s.id,
      color: COLORS[i % COLORS.length],
      data: s.data,
    }));
    dataCount = lineData[0]?.data.length ?? 0;
    xKey = 'x';
  } else {
    xKey = chart.config?.xAxis || Object.keys(first || {})[0];
    const yKeys = Object.keys(first || {}).filter(k => k !== xKey);
    dataCount = chart.data.length;
    lineData = yKeys.map((key, i) => ({
      id: key,
      color: COLORS[i % COLORS.length],
      data: chart.data.map(d => ({ x: d[xKey] as string | number | Date, y: d[key] as number | null })),
    }));
  }

  // On mobile with many data points, show only every Nth tick to avoid overlap
  const getBottomAxis = () => {
    if (mobile) {
      const step = Math.ceil(dataCount / 6);
      // Get x values from the (possibly transformed) lineData, not the raw chart.data
      const xValues: unknown[] = isNivoFormat
        ? (lineData[0]?.data.map(p => p.x) ?? [])
        : (chart.data as Array<Record<string, unknown>>).map(d => d[xKey]);
      const tickVals = dataCount > 8
        ? xValues.filter((_, i) => i % step === 0 || i === dataCount - 1)
        : undefined;
      return {
        tickSize: 0,
        tickPadding: 6,
        tickRotation: -55,
        ...(tickVals ? { tickValues: tickVals } : {}),
      };
    }
    return { tickSize: 0, tickPadding: 8, tickRotation: dataCount > 10 ? -45 : -35 };
  };

  // Compact Y-axis labels on mobile
  const formatYAxis = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  };

  return (
    <div style={{ height: mobile ? Math.min(height, 320) : height }}>
      <ResponsiveLine
        data={lineData}
        margin={mobile
          ? { top: 15, right: 15, bottom: 65, left: 48 }
          : { top: 20, right: 30, bottom: 60, left: 60 }
        }
        xScale={{ type: 'point' }}
        yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
        curve="monotoneX"
        colors={COLORS}
        pointSize={mobile ? 5 : 8}
        pointColor={{ theme: 'background' }}
        pointBorderWidth={2}
        pointBorderColor={{ from: 'serieColor' }}
        enableArea={true}
        areaOpacity={0.06}
        axisBottom={getBottomAxis()}
        axisLeft={{ tickSize: 0, tickPadding: 6, format: formatYAxis }}
        enableGridX={false}
        theme={theme}
        animate={true}
        motionConfig="gentle"
        useMesh={true}
      />
    </div>
  );
}

// ─── Pyramid Chart (Diverging Horizontal Bar) ───
function PyramidChartView({ chart, height }: { chart: ChartConfig; height: number }) {
  const { theme, isDark } = useChartTheme();
  const mobile = useIsMobile();

  const pyramidData = chart.data.map((d: Record<string, unknown>) => ({
    grupo: String(d.grupo || d.group || d.id || ''),
    Mujeres: Number(d.mujeres || d.Mujeres || 0),
    Varones: -Number(d.varones || d.Varones || 0),
  }));

  const cappedHeight = Math.max(360, Math.min(height, pyramidData.length * (mobile ? 24 : 28) + 80));

  return (
    <div style={{ height: cappedHeight }}>
      <ResponsiveBar
        data={pyramidData}
        keys={['Varones', 'Mujeres']}
        indexBy="grupo"
        layout="horizontal"
        margin={{
          top: 10,
          right: mobile ? 10 : 20,
          bottom: 50,
          left: mobile ? 50 : 60,
        }}
        padding={0.2}
        colors={[isDark ? '#60a5fa' : '#3b82f6', isDark ? '#f472b6' : '#ec4899']}
        borderRadius={2}
        axisBottom={{
          tickSize: 0,
          tickPadding: 5,
          // En mobile el eje de valores (diverging) acumula demasiados ticks y
          // se enciman. Limitamos la cantidad para que respiren.
          tickValues: mobile ? 5 : 7,
          format: (v: number) => {
            const abs = Math.abs(v);
            if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
            if (abs >= 1_000) return `${(abs / 1_000).toFixed(0)}K`;
            return String(abs);
          },
        }}
        axisLeft={{ tickSize: 0, tickPadding: 5 }}
        enableGridX={true}
        enableGridY={false}
        theme={theme}
        animate={true}
        motionConfig="gentle"
        labelSkipWidth={40}
        labelTextColor="#ffffff"
        label={d => {
          const abs = Math.abs(Number(d.value));
          if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
          if (abs >= 1_000) return `${(abs / 1_000).toFixed(0)}K`;
          return String(abs);
        }}
        tooltip={({ id, value, indexValue, color }) => (
          <div style={{
            padding: '8px 12px',
            background: isDark ? '#1e293b' : '#fff',
            color: isDark ? '#f1f5f9' : '#0f172a',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: '13px',
            border: `2px solid ${color}`,
          }}>
            <strong>{String(indexValue)}</strong><br />
            {String(id)}: {Math.abs(Number(value)).toLocaleString('es-AR')}
          </div>
        )}
        legends={[{
          dataFrom: 'keys',
          anchor: 'bottom',
          direction: 'row',
          translateY: 44,
          itemWidth: 100,
          itemHeight: 18,
          itemTextColor: isDark ? '#94a3b8' : '#475569',
          symbolSize: 10,
          symbolShape: 'circle',
          data: [
            { id: 'Varones', label: 'Varones', color: isDark ? '#60a5fa' : '#3b82f6' },
            { id: 'Mujeres', label: 'Mujeres', color: isDark ? '#f472b6' : '#ec4899' },
          ],
        }]}
      />
    </div>
  );
}
