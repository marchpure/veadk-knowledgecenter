import type { NextApiRequest, NextApiResponse } from 'next';
import { runVeadkApplicationAsk } from '@/server/applications/applicationRuntime';
import { ApiError } from '@/apollo/server/utils/apiUtils';

type ApplicationAskRequest = {
  appCode: string;
  projectId: number;
  question: string;
  sampleSize?: number;
  language?: string;
  threadId?: string;
};

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
    const statusCode = error instanceof ApiError ? error.statusCode : 500;
    const message =
      error instanceof Error && error.message?.trim()
        ? error.message
        : 'Application ask failed. The runtime returned an empty error message.';
    const payload: Record<string, unknown> = {
      error: message,
    };
    if (error instanceof ApiError) {
      if (error.code) payload.code = error.code;
      if (error.additionalData) Object.assign(payload, error.additionalData);
    }
    res.status(statusCode).json(payload);
  }
}
