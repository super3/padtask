/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('conversations', {
    user_id: {
      type: 'text',
      notNull: false
    }
  });
  pgm.createIndex('conversations', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropIndex('conversations', 'user_id');
  pgm.dropColumn('conversations', 'user_id');
};
