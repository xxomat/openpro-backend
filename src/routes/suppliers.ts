/**
 * Routes pour les fournisseurs
 * 
 * Ce fichier contient toutes les routes API REST pour les données des fournisseurs :
 * hébergements, tarifs, stock, types de tarifs, et données complètes.
 */

import type { FastifyInstance } from 'fastify';
import { getAccommodations } from '../services/openpro/accommodationService.js';
import { getSupplierData } from '../services/openpro/supplierDataService.js';
import { loadRatesForAccommodation } from '../services/openpro/rateService.js';
import { loadStockForAccommodation } from '../services/openpro/stockService.js';
import { loadRateTypes, buildRateTypesList } from '../services/openpro/rateTypeService.js';
import { transformBulkToOpenProFormat, type BulkUpdateRequest } from '../services/openpro/bulkUpdateService.js';
import { openProClient } from '../services/openProClient.js';

/**
 * Enregistre les routes des fournisseurs
 * 
 * @param fastify - Instance Fastify
 */
export async function suppliersRoutes(fastify: FastifyInstance) {
  // GET /api/suppliers/:idFournisseur/accommodations
  fastify.get<{
    Params: { idFournisseur: string }
  }>('/:idFournisseur/accommodations', async (request, reply) => {
    const idFournisseur = parseInt(request.params.idFournisseur, 10);
    
    if (isNaN(idFournisseur)) {
      return reply.status(400).send({ 
        error: 'Invalid idFournisseur',
        message: 'idFournisseur must be a number'
      });
    }
    
    try {
      const accommodations = await getAccommodations(idFournisseur);
      return accommodations;
    } catch (error) {
      fastify.log.error({ error }, 'Error fetching accommodations');
      reply.status(500).send({ 
        error: 'Failed to fetch accommodations',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/rates
  fastify.get<{
    Params: { idFournisseur: string; idHebergement: string };
    Querystring: { debut: string; fin: string }
  }>('/:idFournisseur/accommodations/:idHebergement/rates', async (request, reply) => {
    const idFournisseur = parseInt(request.params.idFournisseur, 10);
    const idHebergement = parseInt(request.params.idHebergement, 10);
    const { debut, fin } = request.query;
    
    if (isNaN(idFournisseur) || isNaN(idHebergement)) {
      return reply.status(400).send({ 
        error: 'Invalid parameters',
        message: 'idFournisseur and idHebergement must be numbers'
      });
    }
    
    if (!debut || !fin) {
      return reply.status(400).send({ 
        error: 'Missing required query parameters',
        message: 'debut and fin are required (format: YYYY-MM-DD)'
      });
    }
    
    try {
      const discoveredRateTypes = new Map();
      const ratesData = await loadRatesForAccommodation(
        idFournisseur,
        idHebergement,
        debut,
        fin,
        discoveredRateTypes
      );
      return ratesData;
    } catch (error) {
      fastify.log.error({ error }, 'Error fetching rates');
      reply.status(500).send({ 
        error: 'Failed to fetch rates',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock
  fastify.get<{
    Params: { idFournisseur: string; idHebergement: string };
    Querystring: { debut: string; fin: string }
  }>('/:idFournisseur/accommodations/:idHebergement/stock', async (request, reply) => {
    const idFournisseur = parseInt(request.params.idFournisseur, 10);
    const idHebergement = parseInt(request.params.idHebergement, 10);
    const { debut, fin } = request.query;
    
    if (isNaN(idFournisseur) || isNaN(idHebergement)) {
      return reply.status(400).send({ 
        error: 'Invalid parameters',
        message: 'idFournisseur and idHebergement must be numbers'
      });
    }
    
    if (!debut || !fin) {
      return reply.status(400).send({ 
        error: 'Missing required query parameters',
        message: 'debut and fin are required (format: YYYY-MM-DD)'
      });
    }
    
    try {
      const stock = await loadStockForAccommodation(idFournisseur, idHebergement, debut, fin);
      return stock;
    } catch (error) {
      fastify.log.error({ error }, 'Error fetching stock');
      reply.status(500).send({ 
        error: 'Failed to fetch stock',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/suppliers/:idFournisseur/rate-types
  fastify.get<{
    Params: { idFournisseur: string }
  }>('/:idFournisseur/rate-types', async (request, reply) => {
    const idFournisseur = parseInt(request.params.idFournisseur, 10);
    
    if (isNaN(idFournisseur)) {
      return reply.status(400).send({ 
        error: 'Invalid idFournisseur',
        message: 'idFournisseur must be a number'
      });
    }
    
    try {
      // Charger les hébergements pour obtenir les types de tarifs liés
      const accommodations = await getAccommodations(idFournisseur);
      const discoveredRateTypes = await loadRateTypes(idFournisseur, accommodations);
      const { rateTypeLabels, rateTypesList } = buildRateTypesList(discoveredRateTypes);
      
      return {
        rateTypeLabels,
        rateTypesList
      };
    } catch (error) {
      fastify.log.error({ error }, 'Error fetching rate types');
      reply.status(500).send({ 
        error: 'Failed to fetch rate types',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/suppliers/:idFournisseur/supplier-data
  fastify.get<{
    Params: { idFournisseur: string };
    Querystring: { debut: string; fin: string }
  }>('/:idFournisseur/supplier-data', async (request, reply) => {
    const idFournisseur = parseInt(request.params.idFournisseur, 10);
    const { debut, fin } = request.query;
    
    if (isNaN(idFournisseur)) {
      return reply.status(400).send({ 
        error: 'Invalid idFournisseur',
        message: 'idFournisseur must be a number'
      });
    }
    
    if (!debut || !fin) {
      return reply.status(400).send({ 
        error: 'Missing required query parameters',
        message: 'debut and fin are required (format: YYYY-MM-DD)'
      });
    }
    
    try {
      // Charger les hébergements
      const accommodations = await getAccommodations(idFournisseur);
      
      // Charger toutes les données
      const startDate = new Date(debut + 'T00:00:00');
      const endDate = new Date(fin + 'T23:59:59');
      
      const data = await getSupplierData(idFournisseur, accommodations, startDate, endDate);
      return data;
    } catch (error) {
      fastify.log.error({ error }, 'Error fetching supplier data');
      reply.status(500).send({ 
        error: 'Failed to fetch supplier data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /api/suppliers/:idFournisseur/bulk-update
  fastify.post<{
    Params: { idFournisseur: string };
    Body: BulkUpdateRequest;
  }>('/:idFournisseur/bulk-update', async (request, reply) => {
    const idFournisseur = parseInt(request.params.idFournisseur, 10);
    const bulkData = request.body;
    
    if (isNaN(idFournisseur)) {
      return reply.status(400).send({ 
        error: 'Invalid idFournisseur',
        message: 'idFournisseur must be a number'
      });
    }
    
    if (!bulkData || !Array.isArray(bulkData.accommodations)) {
      return reply.status(400).send({ 
        error: 'Invalid request body',
        message: 'Request body must contain an accommodations array'
      });
    }
    
    try {
      fastify.log.info({ bulkData }, 'Received bulk update request');
      
      // Traiter chaque hébergement
      for (const accommodation of bulkData.accommodations) {
        fastify.log.info({ 
          accommodationId: accommodation.idHebergement,
          datesCount: accommodation.dates.length,
          dates: accommodation.dates
        }, 'Processing accommodation');
        
        // Transformer les modifications en format OpenPro
        const requeteTarif = transformBulkToOpenProFormat(accommodation);
        
        fastify.log.info({ 
          accommodationId: accommodation.idHebergement,
          requeteTarif: requeteTarif,
          hasTarifs: requeteTarif !== null && requeteTarif.tarifs.length > 0
        }, 'Transformation result');
        
        if (requeteTarif !== null && requeteTarif.tarifs.length > 0) {
          fastify.log.info({ 
            accommodationId: accommodation.idHebergement,
            tarifsCount: requeteTarif.tarifs.length,
            tarifs: requeteTarif.tarifs
          }, 'Calling OpenPro API setRates');
          
          // Appeler l'API OpenPro pour mettre à jour les tarifs
          await openProClient.setRates(
            idFournisseur,
            accommodation.idHebergement,
            requeteTarif
          );
          
          fastify.log.info({ 
            accommodationId: accommodation.idHebergement
          }, 'Successfully called OpenPro API setRates');
        } else {
          fastify.log.warn({ 
            accommodationId: accommodation.idHebergement,
            requeteTarif: requeteTarif
          }, 'Skipping accommodation: no valid tarifs to update');
        }
      }
      
      return { success: true };
    } catch (error) {
      fastify.log.error({ error, stack: error instanceof Error ? error.stack : undefined }, 'Error saving bulk updates');
      reply.status(500).send({ 
        error: 'Failed to save bulk updates',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

