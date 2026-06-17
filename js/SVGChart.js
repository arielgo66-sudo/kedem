function SVGChart({ data, isUp }) {
  if (!data || data.length < 2) return React.createElement('div', {
    style: { height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5c6480', fontSize: 13 }
  }, 'טוען גרף...');

  const W = 600, H = 140;
  const prices = data.map(d => d.price);
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1;
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((d.price - min) / range) * (H - 20) - 10
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${path} L${W},${H} L0,${H} Z`;
  const color = isUp ? '#00c896' : '#ff4d6d';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '140px' }}>
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#grad)"/>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="4" fill={color}/>
    </svg>
  );
}
