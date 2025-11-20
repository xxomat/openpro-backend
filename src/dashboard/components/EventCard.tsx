/**
 * Composant pour afficher un événement de trafic
 */

import React, { useState } from 'react';
import type { TrafficEvent } from '../types';

interface EventCardProps {
  event: TrafficEvent;
  onTraceClick?: (traceId: string) => void;
}

export function EventCard({ event, onTraceClick }: EventCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  const typeColors = {
    incoming: '#007bff',
    'outgoing-openpro': '#28a745',
    'outgoing-ai': '#9b59b6'
  };
  
  const typeLabels = {
    incoming: '📥 Incoming',
    'outgoing-openpro': '📤 OpenPro',
    'outgoing-ai': '🤖 AI'
  };
  
  const isError = !!event.error || (event.statusCode && event.statusCode >= 400);
  const isSlow = (event.duration || 0) > 1000;
  
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
  };
  
  return (
    <div style={{
      ...styles.container,
      borderLeftColor: isError ? '#e74c3c' : typeColors[event.type]
    }}>
      <div style={styles.header} onClick={() => setExpanded(!expanded)}>
        <div style={styles.headerLeft}>
          <span style={{...styles.type, backgroundColor: typeColors[event.type]}}>
            {typeLabels[event.type]}
          </span>
          <span style={styles.method}>{event.method}</span>
          <span style={styles.path}>{event.path}</span>
        </div>
        
        <div style={styles.headerRight}>
          {event.statusCode && (
            <span style={{
              ...styles.status,
              color: isError ? '#e74c3c' : '#28a745'
            }}>
              {event.statusCode}
            </span>
          )}
          {event.duration !== undefined && (
            <span style={{
              ...styles.duration,
              color: isSlow ? '#f39c12' : undefined
            }}>
              {event.duration}ms
            </span>
          )}
          <span style={styles.timestamp}>{formatTimestamp(event.timestamp)}</span>
          <button
            style={styles.expandButton}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? '▼' : '▶'}
          </button>
        </div>
      </div>
      
      {expanded && (
        <div style={styles.details}>
          <div style={styles.detailRow}>
            <strong>Trace ID:</strong>
            <span
              style={styles.traceId}
              onClick={() => onTraceClick?.(event.traceId)}
              title="Click to filter by this trace"
            >
              {event.traceId}
            </span>
          </div>
          
          {event.error && (
            <div style={styles.detailRow}>
              <strong>Error:</strong>
              <span style={styles.error}>{event.error}</span>
            </div>
          )}
          
          {event.metadata?.userAgent && (
            <div style={styles.detailRow}>
              <strong>User Agent:</strong>
              <span>{event.metadata.userAgent}</span>
            </div>
          )}
          
          {event.metadata?.openpro && (
            <div style={styles.detailRow}>
              <strong>OpenPro:</strong>
              <span>
                {event.metadata.openpro.endpoint}
                {event.metadata.openpro.idFournisseur && ` (Fournisseur: ${event.metadata.openpro.idFournisseur})`}
                {event.metadata.openpro.idHebergement && `, Hebergement: ${event.metadata.openpro.idHebergement}`}
              </span>
            </div>
          )}
          
          {event.metadata?.ai && (
            <div style={styles.detailRow}>
              <strong>AI:</strong>
              <span>
                {event.metadata.ai.provider} / {event.metadata.ai.model}
                {event.metadata.ai.tokensUsed && ` (${event.metadata.ai.tokensUsed} tokens)`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    borderLeft: '4px solid',
    marginBottom: '8px',
    overflow: 'hidden',
    transition: 'box-shadow 0.2s',
    cursor: 'pointer'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    gap: '12px'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    minWidth: 0
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  type: {
    fontSize: '12px',
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#ffffff',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const
  },
  method: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#495057',
    fontFamily: 'monospace'
  },
  path: {
    fontSize: '14px',
    color: '#212529',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const
  },
  status: {
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'monospace'
  },
  duration: {
    fontSize: '14px',
    fontFamily: 'monospace',
    color: '#6c757d'
  },
  timestamp: {
    fontSize: '12px',
    color: '#6c757d',
    fontFamily: 'monospace'
  },
  expandButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#6c757d',
    padding: '4px'
  },
  details: {
    padding: '12px 16px',
    backgroundColor: '#f8f9fa',
    borderTop: '1px solid #dee2e6',
    fontSize: '14px'
  },
  detailRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
    alignItems: 'flex-start'
  },
  traceId: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#007bff',
    cursor: 'pointer',
    textDecoration: 'underline'
  },
  error: {
    color: '#e74c3c',
    fontFamily: 'monospace',
    fontSize: '13px'
  }
};

