/**
 * Utilitaires pour la gestion CORS dans Workers
 */

/**
 * Headers CORS par défaut
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400' // 24 heures
};

/**
 * Gère les requêtes OPTIONS pour CORS preflight
 */
export function handleCors(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

/**
 * Ajoute les headers CORS à une réponse
 */
export function addCorsHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

/**
 * Crée une réponse JSON avec CORS
 */
export function jsonResponse(data: any, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    }
  );
}

/**
 * Crée une réponse d'erreur JSON avec CORS
 */
export function errorResponse(message: string, status: number = 500, details?: any): Response {
  return jsonResponse(
    {
      error: message,
      ...(details && { details })
    },
    status
  );
}

