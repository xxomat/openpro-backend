/**
 * Composant pour afficher une trace complète (cascade de requêtes)
 */

import React, { useEffect, useState } from 'react';
import { fetchTrace } from '../api';
import type { TraceTree } from '../types';

interface TraceViewProps {
  traceId: string | null;
  onClose: () => void;
}

export function TraceView({ traceId, onClose }: TraceViewProps) {
  const [trace, setTrace] = useState<TraceTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceId) {
      setTrace(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetchTrace(traceId)
      .then(setTrace)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [traceId]);

  if (!traceId) {
    return null;
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Trace: {traceId}</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <div style={styles.content}>
          {loading && <div>Loading trace...</div>}
          
          {error && <div style={styles.error}>Error: {error}</div>}
          
          {trace && (
            <div>
              <div style={styles.info}>
                Total Duration: <strong>{trace.totalDuration}ms</strong>
              </div>
              
              <div style={styles.tree}>
                <div style={styles.rootEvent}>
                  <div style={styles.eventHeader}>
                    <span style={styles.eventBadge}>ROOT</span>
                    <span>{trace.rootEvent.method} {trace.rootEvent.path}</span>
                  </div>
                  <div style={styles.eventMeta}>
                    {trace.rootEvent.statusCode && (
                      <span>Status: {trace.rootEvent.statusCode}</span>
                    )}
                    {trace.rootEvent.duration && (
                      <span>Duration: {trace.rootEvent.duration}ms</span>
                    )}
                  </div>
                </div>
                
                {trace.childEvents.length > 0 && (
                  <div style={styles.childEvents}>
                    {trace.childEvents.map((child, index) => (
                      <div key={child.id} style={styles.childEvent}>
                        <div style={styles.connector}>↳</div>
                        <div style={styles.childContent}>
                          <div style={styles.eventHeader}>
                            <span style={{
                              ...styles.eventBadge,
                              backgroundColor: child.type === 'outgoing-openpro' ? '#28a745' : '#9b59b6'
                            }}>
                              {child.type === 'outgoing-openpro' ? 'OpenPro' : 'AI'}
                            </span>
                            <span>{child.method} {child.path}</span>
                          </div>
                          <div style={styles.eventMeta}>
                            {child.statusCode && (
                              <span>Status: {child.statusCode}</span>
                            )}
                            {child.duration && (
                              <span>Duration: {child.duration}ms</span>
                            )}
                            {child.error && (
                              <span style={styles.error}>Error: {child.error}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '800px',
    maxHeight: '80vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #dee2e6'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    color: '#212529'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#6c757d',
    padding: '4px 8px'
  },
  content: {
    padding: '24px',
    overflow: 'auto',
    flex: 1
  },
  info: {
    marginBottom: '20px',
    fontSize: '16px',
    color: '#495057'
  },
  tree: {
    fontFamily: 'monospace'
  },
  rootEvent: {
    padding: '12px',
    backgroundColor: '#e3f2fd',
    borderRadius: '8px',
    marginBottom: '12px'
  },
  childEvents: {
    marginLeft: '24px'
  },
  childEvent: {
    display: 'flex',
    gap: '12px',
    marginBottom: '8px'
  },
  connector: {
    color: '#6c757d',
    fontSize: '16px'
  },
  childContent: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px'
  },
  eventHeader: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '8px'
  },
  eventBadge: {
    fontSize: '11px',
    padding: '3px 8px',
    borderRadius: '4px',
    backgroundColor: '#007bff',
    color: '#ffffff',
    fontWeight: 600
  },
  eventMeta: {
    fontSize: '12px',
    color: '#6c757d',
    display: 'flex',
    gap: '16px'
  },
  error: {
    color: '#e74c3c'
  }
};

