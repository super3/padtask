/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('conversations', {
    session_id: {
      type: 'text',
      primaryKey: true
    },
    messages: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'[]'::jsonb")
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('NOW()')
    }
  });
};

exports.down = (pgm) => {
  pgm.dropTable('conversations');
};
