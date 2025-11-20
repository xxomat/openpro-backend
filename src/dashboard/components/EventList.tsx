/**
 * Composant pour afficher la liste des événements
 */

import React from 'react';
import { EventCard } from './EventCard';
import type { TrafficEvent } from '../types';

interface EventListProps {
  events: TrafficEvent[];
  loading: boolean;
  onTraceClick?: (traceId: string) => void;
}

export function EventList({ events, loading, onTraceClick }: EventListProps) {
  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner}></div>
        <div>Loading events...</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>📭</div>
        <div>No events found</div>
        <div style={styles.emptyHint}>
          Make some API calls to see traffic here
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>Recent Events ({events.length})</div>
      </div>
      <div style={styles.list}>
        {events.map(event => (
          <EventCard
            key={event.id}
            event={event}
            onTraceClick={onTraceClick}
          />
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#212529'
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const
  },
  loading: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px',
    gap: '16px',
    color: '#6c757d'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #007bff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px',
    gap: '12px',
    color: '#6c757d'
  },
  emptyIcon: {
    fontSize: '48px'
  },
  emptyHint: {
    fontSize: '14px',
    color: '#adb5bd'
  }
};

