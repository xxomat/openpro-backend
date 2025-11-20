/**
 * Routes API pour le monitoring du trafic
 * 
 * Ce fichier expose les endpoints REST pour accéder aux données
 * de monitoring du trafic HTTP (événements, statistiques, traces).
 */

import type { FastifyInstance } from 'fastify';
import { trafficMonitor } from '../services/trafficMonitor.js';
import type { TrafficEventType } from '../types/traffic.js';

/**
 * Enregistre les routes de monitoring du trafic
 * 
 * @param fastify - Instance Fastify
 */
export async function trafficRoutes(fastify: FastifyInstance) {
  // GET /api/traffic/events - Liste des événements récents
  fastify.get<{
    Querystring: {
      limit?: string;
      type?: TrafficEventType;
      traceId?: string;
      minDuration?: string;
      hasError?: string;
    }
  }>('/events', async (request, reply) => {
    const {
      limit = '50',
      type,
      traceId,
      minDuration,
      hasError
    } = request.query;

    try {
      const limitNum = parseInt(limit, 10);
      if (isNaN(limitNum) || limitNum <= 0 || limitNum > 500) {
        return reply.status(400).send({
          error: 'Invalid limit',
          message: 'limit must be a number between 1 and 500'
        });
      }

      const filter: {
        type?: TrafficEventType;
        traceId?: string;
        minDuration?: number;
        hasError?: boolean;
      } = {};

      if (type) {
        if (!['incoming', 'outgoing-openpro', 'outgoing-ai'].includes(type)) {
          return reply.status(400).send({
            error: 'Invalid type',
            message: 'type must be "incoming", "outgoing-openpro", or "outgoing-ai"'
          });
        }
        filter.type = type;
      }

      if (traceId) {
        filter.traceId = traceId;
      }

      if (minDuration) {
        const minDurationNum = parseInt(minDuration, 10);
        if (!isNaN(minDurationNum)) {
          filter.minDuration = minDurationNum;
        }
      }

      if (hasError !== undefined) {
        filter.hasError = hasError === 'true';
      }

      const events = trafficMonitor.getEvents(limitNum, filter);

      return {
        events,
        count: events.length,
        limit: limitNum
      };
    } catch (error) {
      fastify.log.error({ error }, 'Error fetching traffic events');
      reply.status(500).send({
        error: 'Failed to fetch traffic events',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/traffic/stats - Statistiques du trafic
  fastify.get('/stats', async (request, reply) => {
    try {
      const stats = trafficMonitor.getStats();
      return stats;
    } catch (error) {
      fastify.log.error({ error }, 'Error fetching traffic stats');
      reply.status(500).send({
        error: 'Failed to fetch traffic stats',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/traffic/trace/:traceId - Tous les événements d'une trace
  fastify.get<{
    Params: { traceId: string }
  }>('/trace/:traceId', async (request, reply) => {
    const { traceId } = request.params;

    try {
      const trace = trafficMonitor.getTrace(traceId);

      if (!trace) {
        return reply.status(404).send({
          error: 'Trace not found',
          message: `No events found for traceId: ${traceId}`
        });
      }

      return trace;
    } catch (error) {
      fastify.log.error({ error }, 'Error fetching trace');
      reply.status(500).send({
        error: 'Failed to fetch trace',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // DELETE /api/traffic/events - Vider la liste des événements
  fastify.delete('/events', async (request, reply) => {
    try {
      trafficMonitor.clear();
      return { 
        success: true, 
        message: 'All events cleared' 
      };
    } catch (error) {
      fastify.log.error({ error }, 'Error clearing events');
      reply.status(500).send({
        error: 'Failed to clear events',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

