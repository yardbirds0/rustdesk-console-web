import { CloseOutlined } from '@ant-design/icons';
import React from 'react';
import type { QualityReading } from '@/features/web-client/media/quality-metrics';
import type { RemoteDisplay } from '@/features/web-client/input/input';
import styles from './index.less';

export function QualityMonitor({
  reading,
  display,
  ready,
  onClose,
  text,
}: {
  reading: QualityReading;
  display?: RemoteDisplay;
  ready: boolean;
  onClose: () => void;
  text: (key: string, fallback: string) => string;
}) {
  const rate = reading.videoBitrate;
  const bitrate =
    rate === undefined
      ? '—'
      : rate >= 1_000_000
        ? `${(rate / 1_000_000).toFixed(2)} Mbps`
        : `${(rate / 1000).toFixed(1)} Kbps`;
  return (
    <aside
      className={styles.qualityMonitor}
      data-quality-monitor
      aria-label={text('qualityMonitor', 'Quality monitor')}
    >
      <div className={styles.qualityHeader}>
        <strong>{text('qualityMonitor', 'Quality monitor')}</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label={text('qualityClose', 'Close quality monitor')}
        >
          <CloseOutlined />
        </button>
      </div>
      <dl>
        <dt>{text('qualityFps', 'Frame rate')}</dt>
        <dd>
          {reading.fps === undefined ? '—' : `${reading.fps.toFixed(1)} FPS`}
        </dd>
        <dt>{text('qualityBitrate', 'Video bitrate')}</dt>
        <dd>{bitrate}</dd>
        <dt>{text('qualityDelay', 'Network round trip')}</dt>
        <dd>{reading.delay === undefined ? '—' : `${reading.delay} ms`}</dd>
        <dt>{text('qualityResolution', 'Resolution')}</dt>
        <dd>
          {display && ready ? `${display.width} × ${display.height}` : '—'}
        </dd>
        <dt>{text('qualityCodec', 'Codec')}</dt>
        <dd>{ready ? 'VP9' : '—'}</dd>
      </dl>
    </aside>
  );
}
