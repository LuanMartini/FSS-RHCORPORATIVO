import { getEsocialRuntimeConfig, EsocialClient } from './esocialClient.js';
import {
  assignEventId,
  claimNextEsocialEvent,
  markEsocialAccepted,
  markEsocialQueryPending,
  markEsocialRejected,
  markEsocialSubmitted,
  releaseEsocialAfterFailure,
} from './esocialRepository.js';
import { buildEsocialEventId } from './esocialXml.js';
import type { EsocialClientPort, EsocialOutboxEvent, EsocialQueryResult, EsocialSubmissionResult } from './esocialTypes.js';

export interface EsocialWorkerRepository {
  claim(): Promise<EsocialOutboxEvent | null>;
  assignId(id: string, eventId: string): Promise<void>;
  submitted(event: EsocialOutboxEvent, result: EsocialSubmissionResult): Promise<void>;
  queryPending(event: EsocialOutboxEvent, result: EsocialQueryResult, pollingIntervalMs: number): Promise<void>;
  accepted(event: EsocialOutboxEvent, result: EsocialQueryResult): Promise<void>;
  rejected(
    event: EsocialOutboxEvent,
    result: Pick<EsocialSubmissionResult | EsocialQueryResult, 'responseCode' | 'description' | 'occurrences'>,
  ): Promise<void>;
  failed(event: EsocialOutboxEvent, error: unknown): Promise<void>;
}

const defaultRepository: EsocialWorkerRepository = {
  claim: claimNextEsocialEvent,
  assignId: assignEventId,
  submitted: markEsocialSubmitted,
  queryPending: markEsocialQueryPending,
  accepted: markEsocialAccepted,
  rejected: markEsocialRejected,
  failed: releaseEsocialAfterFailure,
};

export interface EsocialProcessorDependencies {
  client?: EsocialClientPort;
  repository?: EsocialWorkerRepository;
  eventIdFactory?: (event: EsocialOutboxEvent) => string;
  pollingIntervalMs?: number;
}

function permanent(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'permanent' in error && (error as { permanent?: unknown }).permanent);
}

export async function processNextEsocialEvent(dependencies: EsocialProcessorDependencies = {}): Promise<boolean> {
  const repository = dependencies.repository ?? defaultRepository;
  const event = await repository.claim();
  if (!event) return false;
  try {
    const config = dependencies.client && dependencies.eventIdFactory && dependencies.pollingIntervalMs
      ? null
      : getEsocialRuntimeConfig();
    const client = dependencies.client ?? new EsocialClient({ config: config! });
    const eventId = event.event_id ?? (dependencies.eventIdFactory
      ? dependencies.eventIdFactory(event)
      : buildEsocialEventId(config!.employer, event.criado_em, event.id));
    if (!event.event_id) {
      await repository.assignId(event.id, eventId);
      event.event_id = eventId;
    }

    if (event.status === 'PRONTO_ENVIO') {
      const result = await client.submit(event);
      if (result.accepted && result.protocol) await repository.submitted(event, result);
      else await repository.rejected(event, result);
      return true;
    }

    if (!event.protocolo) {
      await repository.rejected(event, {
        responseCode: 'LOCAL_PROTOCOL_MISSING',
        description: 'Evento marcado como ENVIANDO sem protocolo de lote.',
        occurrences: [],
      });
      return true;
    }
    const result = await client.query(event.protocolo, eventId);
    if (!result.processed) {
      await repository.queryPending(event, result, dependencies.pollingIntervalMs ?? config!.pollingIntervalMs);
    } else if (result.accepted && result.receipt) {
      await repository.accepted(event, result);
    } else {
      await repository.rejected(event, result);
    }
    return true;
  } catch (error) {
    if (permanent(error)) {
      await repository.rejected(event, {
        responseCode: String((error as { code?: unknown }).code ?? 'LOCAL_VALIDATION_ERROR'),
        description: error instanceof Error ? error.message : String(error),
        occurrences: [],
      });
    } else {
      await repository.failed(event, error);
    }
    return true;
  }
}
