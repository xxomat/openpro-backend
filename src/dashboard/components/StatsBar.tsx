/**
 * Composant de barre de statistiques
 */

import React from 'react';
import type { TrafficStats } from '../types';

interface StatsBarProps {
  stats: TrafficStats | null;
}

export function StatsBar({ stats }: StatsBarProps) {
  if (!stats) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading stats...</div>
      </div>
    );
  }

  const errorRatePercent = (stats.errorRate * 100).toFixed(1);

  return (
    <div style={styles.container}>
      <div style={styles.stat}>
        <div style={styles.statLabel}>Total</div>
        <div style={styles.statValue}>{stats.total}</div>
      </div>
      
      <div style={styles.stat}>
        <div style={styles.statLabel}>📥 Incoming</div>
        <div style={styles.statValue}>{stats.byType.incoming}</div>
      </div>
      
      <div style={styles.stat}>
        <div style={styles.statLabel}>📤 OpenPro</div>
        <div style={styles.statValue}>{stats.byType['outgoing-openpro']}</div>
      </div>
      
      <div style={styles.stat}>
        <div style={styles.statLabel}>🤖 AI</div>
        <div style={styles.statValue}>{stats.byType['outgoing-ai']}</div>
      </div>
      
      <div style={styles.stat}>
        <div style={styles.statLabel}>❌ Errors</div>
        <div style={{...styles.statValue, color: stats.errors > 0 ? '#e74c3c' : undefined}}>
          {stats.errors} ({errorRatePercent}%)
        </div>
      </div>
      
      <div style={styles.stat}>
        <div style={styles.statLabel}>⚡ Avg Duration</div>
        <div style={styles.statValue}>{stats.averageDuration}ms</div>
      </div>
      
      <div style={styles.stat}>
        <div style={styles.statLabel}>🐌 Slow (&gt;1s)</div>
        <div style={styles.statValue}>{stats.slowRequests}</div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    flexWrap: 'wrap' as const,
    marginBottom: '16px'
  },
  stat: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px'
  },
  statLabel: {
    fontSize: '12px',
    color: '#6c757d',
    fontWeight: 500
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#212529'
  },
  loading: {
    color: '#6c757d',
    fontStyle: 'italic'
  }
};

