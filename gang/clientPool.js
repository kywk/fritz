var Client = require('../');
var poolModule = require('generic-pool');


module.exports.create = function (auth) {
  var pool = new poolModule.Pool({
    name: 'pomeloClient',
    create: function (callback) {
      var client = new Client();
      client.init(auth.host, auth.port, {}, auth.ssl, function (err, data) {
        return callback(err, client);
      });
    },
    destroy: function (client) {
      client.disconnect();
    },
    max: auth.poolMax ? auth.poolMax : 1,
    idleTimeoutMillis: (auth.idleTimeoutMillis != null ? auth.idleTimeoutMillis : 30000),
    log: (auth.log != null ? auth.log : false)
  });
  return pool;
};
