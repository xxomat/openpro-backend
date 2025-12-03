/**
 * Service de parsing iCal
 * 
 * Ce service parse les flux iCal et extrait les événements (réservations).
 */

/**
 * Interface pour un événement iCal parsé
 */
export interface IcalEvent {
  uid: string;
  summary?: string;
  description?: string;
  dtstart: string; // Date de début (YYYY-MM-DD)
  dtend: string;   // Date de fin (YYYY-MM-DD)
  status?: string;
}

/**
 * Parse un flux iCal et extrait les événements
 * 
 * @param icalContent - Contenu du flux iCal
 * @returns Tableau d'événements parsés
 */
export function parseIcal(icalContent: string): IcalEvent[] {
  const events: IcalEvent[] = [];
  const lines = icalContent.split(/\r?\n/);
  
  let currentEvent: Partial<IcalEvent> | null = null;
  let inEvent = false;
  let currentLine = '';
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Gérer les lignes continuées (commencent par un espace ou une tabulation)
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (currentLine) {
        currentLine += line.substring(1);
      }
      continue;
    }
    
    // Traiter la ligne précédente si elle était continuée
    if (currentLine) {
      line = currentLine;
      currentLine = '';
    }
    
    // Détecter le début d'un événement
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {};
      continue;
    }
    
    // Détecter la fin d'un événement
    if (line === 'END:VEVENT') {
      if (currentEvent && currentEvent.uid && currentEvent.dtstart && currentEvent.dtend) {
        events.push({
          uid: currentEvent.uid,
          summary: currentEvent.summary,
          description: currentEvent.description,
          dtstart: currentEvent.dtstart,
          dtend: currentEvent.dtend,
          status: currentEvent.status
        });
      }
      inEvent = false;
      currentEvent = null;
      continue;
    }
    
    // Parser les propriétés de l'événement
    if (inEvent && currentEvent) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).toUpperCase();
        const value = line.substring(colonIndex + 1);
        
        if (key === 'UID') {
          currentEvent.uid = value;
        } else if (key === 'SUMMARY') {
          currentEvent.summary = value;
        } else if (key === 'DESCRIPTION') {
          currentEvent.description = value;
        } else if (key === 'DTSTART' || key.startsWith('DTSTART;')) {
          // Extraire la date (format peut être YYYYMMDD ou YYYYMMDDTHHMMSS)
          const datePart = value.split('T')[0];
          if (datePart.length === 8) {
            currentEvent.dtstart = `${datePart.substring(0, 4)}-${datePart.substring(4, 6)}-${datePart.substring(6, 8)}`;
          }
        } else if (key === 'DTEND' || key.startsWith('DTEND;')) {
          const datePart = value.split('T')[0];
          if (datePart.length === 8) {
            currentEvent.dtend = `${datePart.substring(0, 4)}-${datePart.substring(4, 6)}-${datePart.substring(6, 8)}`;
          }
        } else if (key === 'STATUS') {
          currentEvent.status = value;
        }
      }
    }
  }
  
  return events;
}

