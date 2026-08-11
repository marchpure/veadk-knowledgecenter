import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';

export interface ApplicationResultShare {
  token: string;
  apiHistoryId: string;
  appCode: string;
  projectId: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface IApplicationResultShareRepository
  extends IBasicRepository<ApplicationResultShare> {
  upsertForApiHistory(
    data: ApplicationResultShare,
  ): Promise<ApplicationResultShare>;
}

export class ApplicationResultShareRepository
  extends BaseRepository<ApplicationResultShare>
  implements IApplicationResultShareRepository
{
  constructor(knexPg: Knex) {
    super({ knexPg, tableName: 'application_result_share' });
  }

  public async upsertForApiHistory(data: ApplicationResultShare) {
    const existing = await this.findOneBy({ apiHistoryId: data.apiHistoryId });
    if (existing) return existing;
    return this.createOne(data);
  }
}
