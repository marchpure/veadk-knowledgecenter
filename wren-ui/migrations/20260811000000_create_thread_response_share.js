/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('thread_response_share', (table) => {
    table.string('token').primary();
    table.integer('thread_id').notNullable();
    table.integer('response_id').notNullable();
    table.integer('project_id').notNullable();
    table.timestamps(true, true);

    table
      .foreign('thread_id')
      .references('id')
      .inTable('thread')
      .onDelete('CASCADE');
    table
      .foreign('response_id')
      .references('id')
      .inTable('thread_response')
      .onDelete('CASCADE');
    table
      .foreign('project_id')
      .references('id')
      .inTable('project')
      .onDelete('CASCADE');

    table.unique(['response_id']);
    table.index(['thread_id']);
    table.index(['project_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('thread_response_share');
};
