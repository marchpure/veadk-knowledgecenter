import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';

export interface ThreadResponseShare {
  token: string;
  threadId: number;
  responseId: number;
  projectId: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface IThreadResponseShareRepository
  extends IBasicRepository<ThreadResponseShare> {
  upsertForResponse(data: ThreadResponseShare): Promise<ThreadResponseShare>;
}

export class ThreadResponseShareRepository
  extends BaseRepository<ThreadResponseShare>
  implements IThreadResponseShareRepository
{
  constructor(knexPg: Knex) {
    super({ knexPg, tableName: 'thread_response_share' });
  }

  public async upsertForResponse(data: ThreadResponseShare) {
    const existing = await this.findOneBy({ responseId: data.responseId });
    if (existing) return existing;
    return this.createOne(data);
  }
}
