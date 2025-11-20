/**
 * Composant de barre de filtres
 */

import React from 'react';
import type { TrafficEventType } from '../types';

interface FilterBarProps {
  typeFilter: TrafficEventType | 'all';
  onTypeFilterChange: (type: TrafficEventType | 'all') => void;
  errorFilter: boolean;
  onErrorFilterChange: (showErrors: boolean) => void;
}

export function FilterBar({
  typeFilter,
  onTypeFilterChange,
  errorFilter,
  onErrorFilterChange
}: FilterBarProps) {
  return (
    <div style={styles.container}>
      <div style={styles.group}>
        <label style={styles.label}>Filter by type:</label>
        <div style={styles.buttons}>
          <button
            style={{...styles.button, ...(typeFilter === 'all' ? styles.buttonActive : {})}}
            onClick={() => onTypeFilterChange('all')}
          >
            All
          </button>
          <button
            style={{...styles.button, ...(typeFilter === 'incoming' ? styles.buttonActive : {})}}
            onClick={() => onTypeFilterChange('incoming')}
          >
            📥 Incoming
          </button>
          <button
            style={{...styles.button, ...(typeFilter === 'outgoing-openpro' ? styles.buttonActive : {})}}
            onClick={() => onTypeFilterChange('outgoing-openpro')}
          >
            📤 OpenPro
          </button>
          <button
            style={{...styles.button, ...(typeFilter === 'outgoing-ai' ? styles.buttonActive : {})}}
            onClick={() => onTypeFilterChange('outgoing-ai')}
          >
            🤖 AI
          </button>
        </div>
      </div>
      
      <div style={styles.group}>
        <label style={styles.label}>
          <input
            type="checkbox"
            checked={errorFilter}
            onChange={(e) => onErrorFilterChange(e.target.checked)}
            style={styles.checkbox}
          />
          Errors only
        </label>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    gap: '24px',
    padding: '12px 16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    marginBottom: '16px',
    alignItems: 'center'
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#495057',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  buttons: {
    display: 'flex',
    gap: '4px'
  },
  button: {
    padding: '6px 12px',
    fontSize: '14px',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontWeight: 500,
    color: '#495057'
  },
  buttonActive: {
    backgroundColor: '#007bff',
    color: '#ffffff',
    borderColor: '#007bff'
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  }
};

