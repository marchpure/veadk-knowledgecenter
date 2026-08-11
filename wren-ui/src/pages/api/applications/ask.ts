import type { NextApiRequest, NextApiResponse } from 'next';
import { runVeadkApplicationAsk } from '@/server/applications/applicationRuntime';
import { ApiError } from '@/apollo/server/utils/apiUtils';
import { VeadkApplicationAskErrorPayload } from '@/lib/veadkApplicationResources';

type ApplicationAskRequest = {
  appCode: string;
  projectId: number;
  question: string;
  sampleSize?: number;
  language?: string;
  threadId?: string;
};

const getErrorField = (error: unknown, field: string) => {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message?.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  return (
    getErrorField(error, 'message') ||
    getErrorField(error, 'error') ||
    getErrorField(error, 'err_msg') ||
    getErrorField(error, 'detail') ||
    getErrorField(error, 'reason') ||
    undefined
  );
};

const getStatusCode = (error: unknown) => {
  if (error instanceof ApiError) return error.statusCode;
  if (!error || typeof error !== 'object') return 500;
  const value = (error as Record<string, unknown>).statusCode;
  return typeof value === 'number' && value >= 400 && value < 600 ? value : 500;
};

const getStage = (error: unknown) =>
  getErrorField(error, 'stage') ||
  (error instanceof ApiError && error.additionalData?.stage
    ? String(error.additionalData.stage)
    : undefined);

const getAdvice = (error: unknown) =>
  getErrorField(error, 'advice') ||
  (error instanceof ApiError && error.additionalData?.advice
    ? String(error.additionalData.advice)
    : undefined);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body as ApplicationAskRequest;
    const result = await runVeadkApplicationAsk({
      appCode: body.appCode,
      projectId: Number(body.projectId),
      question: body.question,
      sampleSize: body.sampleSize,
      language: body.language,
      threadId: body.threadId,
      headers: req.headers as Record<string, string>,
      onRequestClose: (stream) => {
        req.on('close', () => {
          const destroy = (stream as unknown as { destroy?: () => void })
            .destroy;
          if (destroy) destroy.call(stream);
        });
      },
    });
    res.status(200).json(result);
  } catch (error) {
    const statusCode = getStatusCode(error);
    const message =
      getErrorMessage(error) ||
      'Application ask failed before the runtime returned details.';
    const payload: VeadkApplicationAskErrorPayload = {
      error: message,
      message,
    };
    if (error instanceof ApiError) {
      if (error.code) payload.code = error.code;
      if (error.additionalData) Object.assign(payload, error.additionalData);
    }
    const code = getErrorField(error, 'code');
    const stage = getStage(error);
    const advice = getAdvice(error);
    if (code && !payload.code) payload.code = code;
    if (stage && !payload.stage) payload.stage = stage as any;
    if (advice && !payload.advice) payload.advice = advice;
    if (!payload.stage) payload.stage = 'ask';
    if (!payload.advice) {
      payload.advice =
        statusCode >= 500
          ? 'Check the WrenAI service, redeploy the data product, or use a configured recommended question.'
          : 'Modify the question or use one of the configured recommended questions.';
    }
    res.status(statusCode).json(payload);
  }
}
