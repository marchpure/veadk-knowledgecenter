/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('application_result_share', (table) => {
    table.string('token').primary();
    table.string('api_history_id').notNullable();
    table.string('app_code').notNullable();
    table.integer('project_id').notNullable();
    table.timestamps(true, true);

    table
      .foreign('api_history_id')
      .references('id')
      .inTable('api_history')
      .onDelete('CASCADE');
    table
      .foreign('project_id')
      .references('id')
      .inTable('project')
      .onDelete('CASCADE');

    table.unique(['api_history_id']);
    table.index(['app_code']);
    table.index(['project_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('application_result_share');
};
