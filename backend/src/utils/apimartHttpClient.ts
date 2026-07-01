import {
  buildToapisUrl,
  getToapisApiKey,
  getToapisProxySummary,
  getToapisProxyUrl,
  toapisRequest,
} from './toapisHttpClient';

/** @deprecated Use toapisRequest */
export const apimartRequest = toapisRequest;

/** @deprecated Use getToapisProxySummary */
export const getApimartProxySummary = getToapisProxySummary;

/** @deprecated Use getToapisProxyUrl */
export const getApimartProxyUrl = getToapisProxyUrl;

export {
  buildToapisUrl,
  formatToapisHttpError,
  getToapisApiKey,
  getToapisOrigin,
  toapisRequest,
} from './toapisHttpClient';
