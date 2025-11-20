/**
 * Composant principal du dashboard de monitoring
 */

import React, { useState, useEffect, useCallback } from 'react';
import { StatsBar } from './components/StatsBar';
import { FilterBar } from './components/FilterBar';
import { EventList } from './components/EventList';
import { TraceView } from './components/TraceView';
import { fetchEvents, fetchStats, clearEvents } from './api';
import type { TrafficEvent, TrafficStats, TrafficEventType } from './types';

export function App() {
  const [events, setEvents] = useState<TrafficEvent[]>([]);
  const [stats, setStats] = useState<TrafficStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TrafficEventType | 'all'>('all');
  const [errorFilter, setErrorFilter] = useState(false);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [eventsData, statsData] = await Promise.all([
        fetchEvents({
          limit: 100,
          type: typeFilter === 'all' ? undefined : typeFilter,
          hasError: errorFilter || undefined
        }),
        fetchStats()
      ]);

      setEvents(eventsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, errorFilter]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 2 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadData();
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const handleTraceClick = (traceId: string) => {
    setSelectedTraceId(traceId);
  };

  const handleClearEvents = async () => {
    if (!confirm('Are you sure you want to clear all events? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await clearEvents();
      // Recharger les données après avoir vidé
      await loadData();
    } catch (error) {
      console.error('Error clearing events:', error);
      alert('Failed to clear events. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>🚀 Traffic Monitor</h1>
          <p style={styles.subtitle}>Real-time HTTP traffic monitoring for OpenPro Backend</p>
        </div>
        <div style={styles.headerControls}>
          <label style={styles.autoRefreshLabel}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={styles.checkbox}
            />
            Auto-refresh (2s)
          </label>
          <button
            style={styles.refreshButton}
            onClick={loadData}
            disabled={loading}
          >
            🔄 Refresh
          </button>
          <button
            style={styles.clearButton}
            onClick={handleClearEvents}
            disabled={loading}
            title="Clear all events"
          >
            🗑️ Clear
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <StatsBar stats={stats} />
        
        <FilterBar
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          errorFilter={errorFilter}
          onErrorFilterChange={setErrorFilter}
        />
        
        <EventList
          events={events}
          loading={loading}
          onTraceClick={handleTraceClick}
        />
      </main>

      <TraceView
        traceId={selectedTraceId}
        onClose={() => setSelectedTraceId(null)}
      />
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f0f2f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  },
  header: {
    backgroundColor: '#ffffff',
    padding: '24px 32px',
    borderBottom: '1px solid #dee2e6',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '24px',
    flexWrap: 'wrap' as const
  },
  title: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 700,
    color: '#212529'
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: '14px',
    color: '#6c757d'
  },
  headerControls: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center'
  },
  autoRefreshLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#495057',
    cursor: 'pointer'
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  },
  refreshButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    border: '1px solid #007bff',
    borderRadius: '6px',
    backgroundColor: '#007bff',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  clearButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    border: '1px solid #dc3545',
    borderRadius: '6px',
    backgroundColor: '#dc3545',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  main: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px 32px'
  }
};

